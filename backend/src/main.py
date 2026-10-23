from dataclasses import dataclass, field
from datetime import datetime, timezone
import secrets
from threading import RLock
from time import monotonic
from typing import Callable, Literal, TypeVar

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

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
    chat: list[dict[str, object]] = field(default_factory=list)
    replayLobby: bool = False

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


class ChatRequest(BaseModel):
    text: str | None = Field(default=None, max_length=500)
    recipientId: int | None = None
    give: Resource | None = None
    giveCount: int = Field(default=1, ge=1, le=19)
    receive: Resource | None = None
    receiveCount: int = Field(default=1, ge=1, le=19)

    @field_validator("text")
    @classmethod
    def stripText(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def validateMessage(self):
        isOffer = self.recipientId is not None or self.give is not None or self.receive is not None
        if isOffer:
            if self.recipientId is None or self.give is None or self.receive is None or self.text:
                raise ValueError("A trade offer needs a recipient and two resource types, not a message.")
            if self.give == self.receive:
                raise ValueError("Choose different resources for a trade offer.")
        elif not self.text:
            raise ValueError("Enter a message.")
        return self


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
        session.replayLobby = False
        return sessionState(gameId, session)


@app.post("/games/{gameId}/play-again")
def playAgain(gameId: str, playerId: int) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        if session.game.winner is None:
            if session.replayLobby and not session.game.started:
                return sessionState(gameId, session)
            raise HTTPException(status_code=409, detail="The game is not over yet.")
        game = Game(playerCount=len(session.game.players),
                    boardSize=session.game.board.boardSize)
        for index in session.lastSeen:
            game.players[index].name = session.game.players[index].name
        session.game = game
        session.chat.clear()
        session.replayLobby = True
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


@app.get("/games/{gameId}/chat")
def getChat(gameId: str, playerId: int) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        return {"messages": session.chat}


@app.post("/games/{gameId}/chat", status_code=201)
def sendChat(gameId: str, playerId: int, request: ChatRequest) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        message: dict[str, object] = {
            "id": len(session.chat),
            "senderId": playerId,
            "recipientId": request.recipientId,
            "text": request.text,
            "give": request.give.value if request.give else None,
            "giveCount": request.giveCount,
            "receive": request.receive.value if request.receive else None,
            "receiveCount": request.receiveCount,
            "status": "pending" if request.recipientId is not None else None,
            "createdAt": datetime.now(timezone.utc),
        }
        if request.recipientId is not None and request.recipientId not in session.lastSeen:
            raise HTTPException(status_code=404, detail="Trade recipient not found.")
        if request.recipientId == playerId:
            raise HTTPException(status_code=422, detail="You cannot send a trade offer to yourself.")
        if request.recipientId is not None:
            applyRule(lambda: session.game.requireNormalTurn(playerId))
            if session.game.diceRoll is None:
                raise HTTPException(status_code=409, detail="The dice must be rolled before trading.")
            if request.give is None or (
                session.game.players[playerId].resources.count(request.give) < request.giveCount
            ):
                raise HTTPException(status_code=409, detail="You do not have enough resources for this offer.")
        session.chat.append(message)
        return {"messages": session.chat}


@app.post("/games/{gameId}/chat/{messageId}/{decision}")
def decideTradeOffer(
    gameId: str, messageId: int, decision: Literal["accept", "decline"], playerId: int,
) -> dict[str, object]:
    with gamesLock:
        session = getSession(gameId)
        requirePlayer(session, playerId)
        if not 0 <= messageId < len(session.chat):
            raise HTTPException(status_code=404, detail="Trade offer not found.")
        offer = session.chat[messageId]
        if offer["recipientId"] != playerId or offer["status"] != "pending":
            raise HTTPException(status_code=409, detail="This trade offer is no longer available.")
        if decision == "accept":
            senderId = int(offer["senderId"])
            game = session.game
            applyRule(lambda: game.requireNormalTurn(senderId))
            if game.diceRoll is None:
                raise HTTPException(status_code=409, detail="The dice must be rolled before trading.")
            give = Resource(str(offer["give"]))
            receive = Resource(str(offer["receive"]))
            sender = game.players[senderId]
            recipient = game.players[playerId]
            giveCount = int(offer["giveCount"])
            receiveCount = int(offer["receiveCount"])
            if sender.resources.count(give) < giveCount or recipient.resources.count(receive) < receiveCount:
                raise HTTPException(status_code=409, detail="A player no longer has the offered resources.")
            for _ in range(giveCount):
                sender.resources.remove(give)
            for _ in range(receiveCount):
                recipient.resources.remove(receive)
            sender.resources.extend([receive] * receiveCount)
            recipient.resources.extend([give] * giveCount)
        offer["status"] = "accepted" if decision == "accept" else "declined"
        return {"messages": session.chat, "state": sessionState(gameId, session)}


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
        for message in session.chat:
            if message["senderId"] == playerId and message["status"] == "pending":
                message["status"] = "expired"
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
