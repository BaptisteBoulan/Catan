from .edge import Edge
from .landscape import Landscape
from .node import Node


SQRT3: float = 3 ** 0.5


class Tile:
    def __init__(self, i: int, j: int, landscape: Landscape, diceNumber: int | None = None):
        self.i = i
        self.j = j
        self.landscape = landscape
        self.diceNumber = diceNumber
        self.isOccupiedByThief: bool = (landscape == Landscape.DESERT)
        self.nodes: list[Node] = []
        self.edges: list[Edge] = []
    
    def getActualCoordinates(self) -> tuple[float, float]:
        # Flat-topped axial layout with unit radius (matches the frontend renderer).
        x: float = self.i * 1.5
        y: float = (self.j + self.i / 2) * SQRT3
        return (x, y)
    
    def __repr__(self):
        x, y = self.getActualCoordinates()
        thiefStr = " [THIEF]" if self.isOccupiedByThief else ""
        numStr = f" (Dice: {self.diceNumber})" if self.diceNumber else ""
        return f"Tile({self.landscape.name}{numStr}){thiefStr} at ({x:.2f}, {y:.2f})"
