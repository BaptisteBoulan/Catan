import random

from .enum import BuildingType, Resource
from .devCard import DevCard, Knight, RoadBuilding, YearOfPlenty, Monopoly, VictoryPoint

from .action import Action, BuildCity, BuildRoad, BuildSettlement
from .board import Board, Node
from .enum import Color
from .player import Player

MIN_PLAYERS = 2
MAX_PLAYERS = 5

BUILDING_POINTS = {
    BuildingType.SETTLEMENT: 1,
    BuildingType.CITY: 2,
}

INLAND_START_ONLY = True
def inlandNodes(board: Board) -> list[Node]:
    tileCount: dict[Node, int] = {}
    for tile in board.tiles:
        for node in tile.nodes:
            tileCount[node] = tileCount.get(node, 0) + 1
    return [node for node in board.nodes if tileCount.get(node, 0) == 3]


def pickSpacedNodes(candidates: list[Node], count: int) -> list[Node] | None:
    available = set(candidates)
    chosen: list[Node] = []
    for _ in range(count):
        if not available:
            return None
        node = random.choice(sorted(available, key=lambda n: n.id))
        chosen.append(node)
        available.discard(node)
        available -= node.neighbors
    return chosen


class Game:
    def __init__(self, playerCount: int = 4, boardSize: int = 3):
        if not MIN_PLAYERS <= playerCount <= MAX_PLAYERS:
            raise ValueError(f"playerCount must be between {MIN_PLAYERS} and {MAX_PLAYERS}")
        colors = list(Color)
        self.players: list[Player] = [
            Player(f"Player {k + 1}", colors[k]) for k in range(playerCount)
        ]
        self.board = Board(boardSize)
        self.placeInitialBuildings()
        self.setDevCardDeck()

    def placeInitialBuildings(self, maxAttempts: int = 100):
        candidates = self.board.nodes
        if INLAND_START_ONLY:
            candidates = inlandNodes(self.board)

        buildCount = 2 * len(self.players)
        for _ in range(maxAttempts):
            chosen = pickSpacedNodes(candidates, buildCount)
            if chosen is not None:
                break
        else:
            raise RuntimeError("Could not find enough free nodes to place initial buildings")

        for k, player in enumerate(self.players):
            for node, buildingType in (
                (chosen[2 * k], BuildingType.SETTLEMENT),
                (chosen[2 * k + 1], BuildingType.CITY),
            ):
                self.build(player, node, buildingType)
                availableEdges = [
                    edge for edge in self.board.edges
                    if edge.owner is None and (edge.node1 is node or edge.node2 is node)
                ]
                if not availableEdges:
                    raise RuntimeError(f"No free edge for a starting road at node {node.id}")
                random.choice(availableEdges).owner = player

    def setDevCardDeck(self):
        self.devCardDeck: list[DevCard] = [
            Knight(),
            RoadBuilding(),
            YearOfPlenty(),
            Monopoly(),
            VictoryPoint(),
        ] * 2   
        random.shuffle(self.devCardDeck)

    def build(self, player: Player, node: Node, buildingType: BuildingType):
        node.building = buildingType
        node.owner = player
        player.points += BUILDING_POINTS[buildingType]
        
    def runTurn(self, player: Player):
        self.throwDice()

    def runRandomTurn(self, player: Player):
        """Throws the dice, then plays random actions until none can be executed."""
        self.runTurn(player)
        while True:
            actions: list[Action] = [
                *(BuildRoad(player, edge, self) for edge in self.board.edges),
                *(BuildSettlement(player, node, self) for node in self.board.nodes),
                *(BuildCity(player, node, self) for node in self.board.nodes),
            ]
            random.shuffle(actions)
            for action in actions:
                if action.execute():
                    print(f"{player.name} {action.description()}")
                    break
            else:
                break

    def runRandomRounds(self, roundCount: int):
        for _ in range(roundCount):
            for player in self.players:
                self.runRandomTurn(player)
    
    def throwDice(self):
        diceResult: int = random.randint(1, 6) + random.randint(1, 6)
        
        for tile in self.board.tiles:
            if tile.diceNumber == diceResult and not tile.isOccupiedByThief:
                for node in tile.nodes:
                    if node.owner is not None:
                        player: Player = node.owner
                        resource: Resource | None = tile.landscape.resource
                        if resource is not None:
                            player.resources.append(resource)
                            if node.building == BuildingType.CITY:
                                player.resources.append(resource)

    def serialize(self) -> dict[str, object]:
        playerIndex = {id(p): k for k, p in enumerate(self.players)}

        def ownerIndex(owner: Player | None) -> int | None:
            return None if owner is None else playerIndex[id(owner)]

        return {
            "players": [
                {"id": k, **p.serialize()}
                for k, p in enumerate(self.players)
            ],
            "board": {
                "boardSize": self.board.boardSize,
                "tiles": [
                    {
                        "i": t.i,
                        "j": t.j,
                        "landscape": t.landscape.value,
                        "diceNumber": t.diceNumber,
                        "isOccupiedByThief": t.isOccupiedByThief,
                        "nodes": [n.id for n in t.nodes],
                    }
                    for t in self.board.tiles
                ],
                "nodes": [
                    {
                        "id": n.id,
                        "x": n.x,
                        "y": n.y,
                        "building": n.building.value,
                        "owner": ownerIndex(n.owner),
                    }
                    for n in self.board.nodes
                ],
                "edges": [
                    {
                        "node1": e.node1.id,
                        "node2": e.node2.id,
                        "owner": ownerIndex(e.owner),
                    }
                    for e in self.board.edges
                ],
            },
        }
