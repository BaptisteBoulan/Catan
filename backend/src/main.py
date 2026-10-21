from types.board import Board

if __name__ == "__main__":
    board = Board(boardSize=3)
    print(f"Generated {len(board.tiles)} tiles, {len(board.nodesMap)} unique nodes, and {len(board.edges)} unique edges.\n")
    for tile in board.tiles[:3]:
        print(tile)
        print("  Nodes:")
        for node in tile.nodes:
            print(f"    {node}")
        print("  Edges:")
        for edge in tile.edges:
            print(f"    {edge}")