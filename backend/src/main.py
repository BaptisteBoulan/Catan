from dataclasses import dataclass, field
from datetime import datetime, timezone
import secrets
from threading import RLock
from time import monotonic
from typing import Callable, Literal, TypeVar

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from .types.game import MAX_PLAYERS, MIN_PLAYERS, Game, GameRuleError
from .types.enum import Resource

app = FastAPI()

PRESENCE_TIMEOUT = 15
HOST_PLAYER_ID = 0

BuildKind = Literal["road", "settlement", "city"]
T = TypeVar("T")


@dataclass
class GameSession:
    game: Game
    createdAt: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    lastSeen: dict[int, float] = field(default_factory=dict[int, float])

    def players(self) -> list[dict[str, object]]:
        now = monotonic()
        return [
            {
                "id": index,
                **self.game.players[index].serialize(self.game),
                "connected": now - lastSeen < PRESENCE_TIMEOUT,
            }
            for index, lastSeen in self.lastSeen.items()
        ]


games: dict[str, GameSession] = {}
gamesLock = RLock()


class JoinGameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)

    @field_validator("name", mode="before")
    @classmethod
    def stripName(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class NewBoardRequest(BaseModel):
    playerCount: int = Field(default=4, ge=MIN_PLAYERS, le=MAX_PLAYERS)


class CreateGameRequest(JoinGameRequest, NewBoardRequest):
    pass


class DemoGameRequest(NewBoardRequest):
    roundCount: int = Field(default=5, ge=0, le=100)


class BuildRequest(BaseModel):
    target: int


class TradeRequest(BaseModel):
    give: Resource
    receive: Resource


class PlayDevCardRequest(BaseModel):
    resources: list[Resource] = Field(default_factory=list, max_length=2)


def getSession(gameId: str) -> GameSession:
    session = games.get(gameId)
    if session is None:
        raise HTTPException(status_code=404, detail="Game not found.")
    return session


def requirePlayer(session: GameSession, playerId: int) -> None:
    if playerId not in session.lastSeen:
        raise HTTPException(status_code=404, detail="Player not found in this game.")


def claimPlayer(session: GameSession, name: str) -> int:
    if any(session.game.players[index].name.casefold() == name.casefold()
           for index in session.lastSeen):
        raise HTTPException(status_code=409, detail="This name is already taken in this game.")
    if len(session.lastSeen) >= len(session.game.players):
        raise HTTPException(status_code=409, detail="This game is full.")
    playerId = len(session.lastSeen)
    session.game.players[playerId].name = name
    session.lastSeen[playerId] = monotonic()
    return playerId


@app.post("/reset")
def resetGames():
    with gamesLock:
        games.clear()
    return {"status": "ok"}

@app.post("/games", status_code=201)
def createGame(request: CreateGameRequest) -> dict[str, object]:
    with gamesLock:
        availableIds = [str(number) for number in range(1000, 10000) if str(number) not in games]
        if not availableIds:
            raise HTTPException(status_code=503, detail="No game IDs available.")
        gameId = secrets.choice(availableIds)
        session = GameSession(Game(playerCount=request.playerCount))
        playerId = claimPlayer(session, request.name)
        games[gameId] = session
        return {"gameId": gameId, "playerId": playerId, "createdAt": session.createdAt}


@app.post("/games/{gameId}/players", status_code=201)
def joinGame(gameId: str, request: JoinGameRequest) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        playerId = claimPlayer(session, request.name)
        return {"gameId": gameId, "playerId": playerId, "createdAt": session.createdAt}


@app.get("/games/{gameId}")
def getGame(gameId: str, playerId: int) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        return sessionState(gameId, session)


def sessionState(gameId: str, session: GameSession) -> dict[str, object]:
    return {
        **session.game.serialize(),
        "gameId": gameId,
        "createdAt": session.createdAt,
        "joinedPlayers": session.players(),
    }


@app.post("/games/{gameId}/players/{playerId}/heartbeat")
def heartbeat(gameId: str, playerId: int) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        session.lastSeen[playerId] = monotonic()
        return {
            "players": session.players(),
            "turn": session.game.serializeTurn(),
            "state": sessionState(gameId, session),
        }


def applyRule(action: Callable[[], T]) -> T:
    try:
        return action()
    except GameRuleError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/games/{gameId}/start")
def startGame(gameId: str, playerId: int):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        if playerId != HOST_PLAYER_ID:
            raise HTTPException(status_code=403, detail="Only the host can start the game.")
        if len(session.lastSeen) < len(session.game.players):
            raise HTTPException(status_code=409, detail="Waiting for all players to join.")
        applyRule(session.game.start)
        return sessionState(gameId, session)


@app.post("/games/{gameId}/roll")
def rollDice(gameId: str, playerId: int):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        applyRule(lambda: session.game.rollDice(playerId))
        return sessionState(gameId, session)


@app.post("/games/{gameId}/dev-card")
def buyDevCard(gameId: str, playerId: int):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        applyRule(lambda: session.game.buyDevCard(playerId))
        return sessionState(gameId, session)


@app.post("/games/{gameId}/trade")
def trade(gameId: str, playerId: int, request: TradeRequest):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        applyRule(lambda: session.game.trade(playerId, request.give, request.receive))
        return sessionState(gameId, session)


@app.post("/games/{gameId}/dev-card/{cardIndex}/play")
def playDevCard(gameId: str, cardIndex: int, playerId: int, request: PlayDevCardRequest):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        applyRule(lambda: session.game.playDevCard(playerId, cardIndex, request.resources))
        return sessionState(gameId, session)


@app.get("/games/{gameId}/build/{kind}/targets")
def buildTargets(gameId: str, kind: BuildKind, playerId: int) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        return {"targets": applyRule(lambda: session.game.buildTargets(playerId, kind))}


@app.post("/games/{gameId}/build/{kind}")
def build(gameId: str, kind: BuildKind, playerId: int, request: BuildRequest):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        applyRule(lambda: session.game.buildAt(playerId, kind, request.target))
        return sessionState(gameId, session)


@app.post("/games/{gameId}/end-turn")
def endTurn(gameId: str, playerId: int):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        applyRule(lambda: session.game.endTurn(playerId))
        return sessionState(gameId, session)


@app.get("/games/{gameId}/thief/targets")
def thiefTargets(gameId: str, playerId: int) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        return {"targets": applyRule(lambda: session.game.thiefTargets(playerId))}


@app.post("/games/{gameId}/thief")
def moveThief(gameId: str, playerId: int, request: BuildRequest):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        applyRule(lambda: session.game.moveThief(playerId, request.target))
        return sessionState(gameId, session)


def replaceBoard(session: GameSession, request: NewBoardRequest) -> None:
    if session.game.started:
        raise HTTPException(status_code=409, detail="Cannot replace the board after the game started.")
    if request.playerCount < len(session.lastSeen):
        raise HTTPException(status_code=409, detail="Cannot remove joined players.")
    game = Game(playerCount=request.playerCount)
    for index in session.lastSeen:
        game.players[index].name = session.game.players[index].name
    session.game = game


@app.post("/games/{gameId}/new-board")
def newBoard(gameId: str, playerId: int, request: NewBoardRequest):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        replaceBoard(session, request)
        return session.game.serialize()


@app.post("/games/{gameId}/demo-game")
def demoGame(gameId: str, playerId: int, request: DemoGameRequest):
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        replaceBoard(session, request)
        session.game.runRandomRounds(request.roundCount)
        return session.game.serialize()
