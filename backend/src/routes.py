from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder as encoder

from .types.board import Board

app = FastAPI()

board = Board()

def serializeBoard(board: Board):
	return encoder({
		"boardSize": board.boardSize,
		"tiles": board.tiles,
		"nodes": list(board.nodesMap.values()),
		"edges": board.edges,
	})

@app.get("/board")
def getBoard():
	return serializeBoard(board)

@app.post("/new-board")
def newBoard():
	global board
	board = Board()
	return serializeBoard(board)
