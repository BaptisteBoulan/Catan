from fastapi import FastAPI
from pydantic import BaseModel, Field

from .types.game import MAX_PLAYERS, MIN_PLAYERS, Game

app = FastAPI()

game = Game()


class NewBoardRequest(BaseModel):
	playerCount: int = Field(default=4, ge=MIN_PLAYERS, le=MAX_PLAYERS)


@app.get("/board")
def getBoard():
	return game.serialize()

@app.post("/new-board")
def newBoard(request: NewBoardRequest):
	global game
	game = Game(playerCount=request.playerCount)
	return game.serialize()


class DemoGameRequest(NewBoardRequest):
	roundCount: int = Field(default=5, ge=0, le=100)


@app.post("/demo-game")
def demoGame(request: DemoGameRequest):
	global game
	game = Game(playerCount=request.playerCount)
	game.runRandomRounds(request.roundCount)
	return game.serialize()
