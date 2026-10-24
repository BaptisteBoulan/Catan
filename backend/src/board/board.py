import math
import random

from ..resource import Resource
from .edge import Edge
from .landscape import Landscape
from .node import Node
from .port import Port
from .tile import Tile


class Board:
    def __init__(self, boardSize: int = 3):
        self.boardSize = boardSize
        self.tiles: list[Tile] = []
        self.nodesMap: dict[tuple[float, float], Node] = {}
        self.edges: list[Edge] = []
        self.ports: list[Port] = []
        self.buildBoard()
        self.buildPorts()

    def buildPorts(self) -> None:
        edgeCounts: dict[Edge, int] = {}
        for tile in self.tiles:
            for edge in tile.edges:
                edgeCounts[edge] = edgeCounts.get(edge, 0) + 1
        shore = sorted(
            (edge for edge, count in edgeCounts.items() if count == 1),
            key=lambda edge: math.atan2(edge.node1.y + edge.node2.y,
                                        edge.node1.x + edge.node2.x),
        )
        # Leave at least two shore edges between ports, including around the seam.
        count = min(9, len(shore) // 3)
        if count == 0:
            return
        gaps = [3] * count
        for _ in range(len(shore) - sum(gaps)):
            gaps[random.randrange(count)] += 1
        resources: list[Resource | None] = list(Resource) + [None] * 4
        random.shuffle(resources)
        index = random.randrange(len(shore))
        for resource, gap in zip(resources[:count], gaps):
            self.ports.append(Port(shore[index], resource))
            index = (index + gap) % len(shore)

    def getOrCreateNode(self, x: float, y: float, tolerance: float = 1e-2) -> Node:
        """Ensures nodes that touch multiple tiles are shared instances."""
        for (nx, ny), node in self.nodesMap.items():
            if math.hypot(nx - x, ny - y) < tolerance:
                return node
        newNode = Node(len(self.nodesMap), x, y)
        self.nodesMap[(x, y)] = newNode
        return newNode

    @property
    def nodes(self) -> list[Node]:
        return list(self.nodesMap.values())

    def getOrCreateEdge(self, node1: Node, node2: Node) -> Edge:
        """Ensures edges are shared between adjacent tiles."""
        for edge in self.edges:
            if {edge.node1, edge.node2} == {node1, node2}:
                return edge
        newEdge = Edge(node1, node2)
        node1.neighbors.add(node2)
        node2.neighbors.add(node1)
        node1.edges.add(newEdge)
        node2.edges.add(newEdge)
        self.edges.append(newEdge)
        return newEdge

    def buildBoard(self):
        landscapes = [
            Landscape.FOREST, Landscape.FOREST, Landscape.FOREST, Landscape.FOREST,
            Landscape.PASTURE, Landscape.PASTURE, Landscape.PASTURE, Landscape.PASTURE,
            Landscape.FIELDS, Landscape.FIELDS, Landscape.FIELDS, Landscape.FIELDS,
            Landscape.HILLS, Landscape.HILLS, Landscape.HILLS,
            Landscape.MOUNTAINS, Landscape.MOUNTAINS, Landscape.MOUNTAINS,
            Landscape.DESERT
        ]
        for i in range(len(landscapes)):
            j: int = random.randint(0, len(landscapes) - 1)
            landscapes[i], landscapes[j] = landscapes[j], landscapes[i]
        diceNumbers = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11]

        # Generate axial coordinates for the board
        tileCoords: list[tuple[int, int]] = []
        for i in range(-self.boardSize + 1, self.boardSize):
            for j in range(max(-self.boardSize + 1, -self.boardSize - i + 1), min(self.boardSize - i, self.boardSize)):
                tileCoords.append((i, j))

        lsIdx = 0
        diceIdx = 0

        for i, j in tileCoords:
            ls = landscapes[lsIdx % len(landscapes)]
            lsIdx += 1
            
            num = None if ls == Landscape.DESERT else diceNumbers[diceIdx % len(diceNumbers)]
            if num is not None:
                diceIdx += 1

            tile = Tile(i, j, ls, num)
            
            # Calculate the 6 corner nodes of the hexagon based on its center (cx, cy)
            cx, cy = tile.getActualCoordinates()
            hex_radius = 1.0
            tileNodes: list[Node] = []
            
            for k in range(6):
                angle_deg = 60 * k  # Flat-topped hexagon angles
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

        self.improveTileDistribution()

    def improveTileDistribution(self) -> None:
        """Make up to 20 improving swaps between different clustered tile types."""
        neighbors = {
            tile: [other for other in self.tiles
                   if other is not tile and any(edge in other.edges for edge in tile.edges)]
            for tile in self.tiles
        }
        for _ in range(20):
            conflicts = {
                tile: sum(other.landscape == tile.landscape for other in adjacent)
                for tile, adjacent in neighbors.items()
            }
            clustered = [tile for tile in self.tiles if conflicts[tile]]
            swaps: list[tuple[Tile, Tile]] = []
            for index, first in enumerate(clustered):
                for second in clustered[index + 1:]:
                    if first.landscape == second.landscape:
                        continue
                    after = sum(other.landscape == second.landscape
                                for other in neighbors[first] if other is not second)
                    after += sum(other.landscape == first.landscape
                                 for other in neighbors[second] if other is not first)
                    if after < conflicts[first] + conflicts[second]:
                        swaps.append((first, second))
            if not swaps:
                break
            first, second = random.choice(swaps)
            first.landscape, second.landscape = second.landscape, first.landscape
            first.diceNumber, second.diceNumber = second.diceNumber, first.diceNumber
            first.isOccupiedByThief, second.isOccupiedByThief = (
                second.isOccupiedByThief, first.isOccupiedByThief
            )
