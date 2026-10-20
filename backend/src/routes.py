from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder as encoder

from .types.board import Board

app = FastAPI()

@app.post("/new-board")
def newBoard():
	board = Board()
	return encoder({
		"boardSize": board.boardSize,
		"tiles": board.tiles,
		"nodes": list(board.nodesMap.values()),
		"edges": board.edges,
	})