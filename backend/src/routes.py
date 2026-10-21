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
