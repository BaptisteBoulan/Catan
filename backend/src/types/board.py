from enum import Enum, auto
import math

SQRT3: float = 3 ** 0.5

class Landscape(Enum):
    FOREST = auto()     # Wood / Lumber
    HILLS = auto()      # Brick / Clay
    PASTURE = auto()    # Wool / Sheep
    FIELDS = auto()     # Grain / Wheat
    MOUNTAINS = auto()  # Ore / Stone
    DESERT = auto()     # Desert (no resources/number)

class BuildingType(Enum):
    NONE = auto()
    SETTLEMENT = auto()
    CITY = auto()

class Player:
    def __init__(self, name: str, color: str):
        self.name = name
        self.color = color

class Node:
    """Represents a vertex where settlements or cities can be built."""
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y
        self.building: BuildingType = BuildingType.NONE
        self.owner: Player | None = None

    def __repr__(self):
        b_str = f"{self.building.name}" if self.building != BuildingType.NONE else "Empty"
        return f"Node({b_str}) at ({self.x:.2f}, {self.y:.2f})"

class Edge:
    """Represents an edge between two nodes where roads can be built."""
    def __init__(self, node1: Node, node2: Node):
        self.node1 = node1
        self.node2 = node2
        self.owner: Player | None = None

    def __repr__(self):
        status = f"Road ({self.owner.name})" if self.owner else "Empty"
        return f"Edge [{status}] between ({self.node1.x:.2f}, {self.node1.y:.2f}) and ({self.node2.x:.2f}, {self.node2.y:.2f})"

class Tile:
    def __init__(self, i: int, j: int, landscape: Landscape, dice_number: int | None = None):
        self.i = i
        self.j = j
        self.landscape = landscape
        self.dice_number = dice_number
        self.is_occupied_by_thief: bool = (landscape == Landscape.DESERT)
        self.nodes: list[Node] = []
        self.edges: list[Edge] = []
    
    def getActualCoordinates(self) -> tuple[float, float]:
        x: float = self.i * 0.75
        y: float = (self.j + 0.5) * (SQRT3 / 2)
        return (x, y)
    
    def __repr__(self):
        x, y = self.getActualCoordinates()
        thief_str = " [THIEF]" if self.is_occupied_by_thief else ""
        num_str = f" (Dice: {self.dice_number})" if self.dice_number else ""
        return f"Tile({self.landscape.name}{num_str}){thief_str} at ({x:.2f}, {y:.2f})"

class Board:
    def __init__(self, board_size: int = 3):
        self.board_size = board_size
        self.tiles: list[Tile] = []
        self.nodes_map: dict[tuple[float, float], Node] = {}
        self.edges: list[Edge] = []
        self.buildBoard()

    def getOrCreateNode(self, x: float, y: float, tolerance: float = 1e-2) -> Node:
        """Ensures nodes that touch multiple tiles are shared instances."""
        for (nx, ny), node in self.nodes_map.items():
            if math.hypot(nx - x, ny - y) < tolerance:
                return node
        new_node = Node(x, y)
        self.nodes_map[(x, y)] = new_node
        return new_node

    def getOrCreateEdge(self, node1: Node, node2: Node) -> Edge:
        """Ensures edges are shared between adjacent tiles."""
        for edge in self.edges:
            if {edge.node1, edge.node2} == {node1, node2}:
                return edge
        new_edge = Edge(node1, node2)
        self.edges.append(new_edge)
        return new_edge

    def buildBoard(self):
        # Standard Catan resource distribution (19 tiles total)
        landscapes = [
            Landscape.FOREST, Landscape.FOREST, Landscape.FOREST, Landscape.FOREST,
            Landscape.PASTURE, Landscape.PASTURE, Landscape.PASTURE, Landscape.PASTURE,
            Landscape.FIELDS, Landscape.FIELDS, Landscape.FIELDS, Landscape.FIELDS,
            Landscape.HILLS, Landscape.HILLS, Landscape.HILLS,
            Landscape.MOUNTAINS, Landscape.MOUNTAINS, Landscape.MOUNTAINS,
            Landscape.DESERT
        ]
        diceNumbers = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11]

        # Generate axial coordinates for the board
        tileCoords: list[tuple[int, int]] = []
        for i in range(-self.board_size + 1, self.board_size):
            for j in range(max(-self.board_size + 1, -self.board_size - i + 1), min(self.board_size - i, self.board_size)):
                tileCoords.append((i, j))

        ls_idx = 0
        dice_idx = 0

        for i, j in tileCoords:
            ls = landscapes[ls_idx % len(landscapes)]
            ls_idx += 1
            
            num = None if ls == Landscape.DESERT else diceNumbers[dice_idx % len(diceNumbers)]
            if num is not None:
                dice_idx += 1

            tile = Tile(i, j, ls, num)
            
            # Calculate the 6 corner nodes of the hexagon based on its center (cx, cy)
            cx, cy = tile.getActualCoordinates()
            hex_radius = 1.0 / SQRT3  # Standard outer radius for this grid scale
            tileNodes: list[Node] = []
            
            for k in range(6):
                angle_deg = 60 * k - 30  # Pointy-topped hexagon angles
                angle_rad = math.radians(angle_deg)
                nx = cx + hex_radius * math.cos(angle_rad)
                ny = cy + hex_radius * math.sin(angle_rad)
                node = self.getOrCreateNode(nx, ny)
                tileNodes.append(node)
            
            tile.nodes = tileNodes
            
            # Create the 6 edges surrounding the tile
            for k in range(6):
                n1 = tileNodes[k]
                n2 = tileNodes[(k + 1) % 6]
                edge = self.getOrCreateEdge(n1, n2)
                tile.edges.append(edge)

            self.tiles.append(tile)
