import random

from .enum import BuildingType, Resource
from .devCard import DevCard, Knight, RoadBuilding, YearOfPlenty, Monopoly, VictoryPoint

from .action import BuildCity, BuildRoad, BuildSettlement, DrawDevCard, Target, TargetedAction
from .board import Board, Edge, Node
from .enum import Color
from .player import Player

MIN_PLAYERS = 1
MAX_PLAYERS = 5


class GameRuleError(ValueError):
    pass

BUILDING_POINTS = {
    BuildingType.SETTLEMENT: 1,
    BuildingType.CITY: 2,
}

BUILD_ACTIONS: dict[str, type[BuildRoad] | type[BuildSettlement] | type[BuildCity]] = {
    "road": BuildRoad,
    "settlement": BuildSettlement,
    "city": BuildCity,
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
        self.started = False
        self.currentPlayer = 0
        self.turnNumber = 0
        self.diceRoll: int | None = None

    def start(self):
        if self.started:
            raise GameRuleError("The game has already started.")
        self.started = True
        self.currentPlayer = 0
        self.turnNumber = 1
        self.diceRoll = None

    def requireTurn(self, playerIndex: int):
        if not self.started:
            raise GameRuleError("The game has not started yet.")
        if playerIndex != self.currentPlayer:
            raise GameRuleError("It is not your turn.")

    def rollDice(self, playerIndex: int) -> int:
        self.requireTurn(playerIndex)
        if self.diceRoll is not None:
            raise GameRuleError("You already rolled the dice this turn.")
        self.diceRoll = self.throwDice()
        return self.diceRoll

    def buyDevCard(self, playerIndex: int):
        self.requireTurn(playerIndex)
        if self.diceRoll is None:
            raise GameRuleError("Roll the dice first.")
        if not self.devCardDeck:
            raise GameRuleError("No development cards left.")
        if not DrawDevCard(self.players[playerIndex], self).execute():
            raise GameRuleError("Not enough resources (needs sheep, wheat and ore).")

    def buildAction(self, playerIndex: int, kind: str) -> BuildRoad | BuildSettlement | BuildCity:
        self.requireTurn(playerIndex)
        if self.diceRoll is None:
            raise GameRuleError("Roll the dice first.")
        actionType = BUILD_ACTIONS.get(kind)
        if actionType is None:
            raise GameRuleError(f"Unknown building: {kind}.")
        action = actionType(self.players[playerIndex], self)
        if not self.players[playerIndex].canPayResources(action.cost):
            raise GameRuleError("Not enough resources.")
        return action

    def targetId(self, target: Node | Edge) -> int:
        """Nodes are identified by their id, edges by their index in the board's edge list."""
        return target.id if isinstance(target, Node) else self.board.edges.index(target)

    def buildTargets(self, playerIndex: int, kind: str) -> list[int]:
        targets = [self.targetId(target)
                   for target in self.buildAction(playerIndex, kind).getValidTargets()]
        if not targets:
            raise GameRuleError("There is no place available to build this.")
        return targets

    def buildAt(self, playerIndex: int, kind: str, targetId: int):
        if not self.executeOn(self.buildAction(playerIndex, kind), targetId):
            raise GameRuleError("You cannot build there.")

    def executeOn(self, action: TargetedAction[Target], targetId: int) -> bool:
        target = next((target for target in action.getValidTargets()
                       if self.targetId(target) == targetId), None)
        return target is not None and action.chooseTarget(target) and action.execute()

    def endTurn(self, playerIndex: int):
        self.requireTurn(playerIndex)
        if self.diceRoll is None:
            raise GameRuleError("Roll the dice before ending your turn.")
        self.currentPlayer = (self.currentPlayer + 1) % len(self.players)
        self.turnNumber += 1
        self.diceRoll = None

    def serializeTurn(self) -> dict[str, object]:
        return {
            "started": self.started,
            "currentPlayer": self.currentPlayer,
            "turnNumber": self.turnNumber,
            "diceRoll": self.diceRoll,
        }

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
            actions: list[BuildRoad | BuildSettlement | BuildCity] = [
                BuildRoad(player, self),
                BuildSettlement(player, self),
                BuildCity(player, self),
            ]
            random.shuffle(actions)
            for action in actions:
                if not action.canBeExecuted():
                    continue
                if isinstance(action, BuildRoad):
                    selected = action.chooseTarget(random.choice(action.getValidTargets()))
                else:
                    selected = action.chooseTarget(random.choice(action.getValidTargets()))
                if selected and action.execute():
                    print(f"{player.name} {action.description()}")
                    break
            else:
                break

    def runRandomRounds(self, roundCount: int):
        for _ in range(roundCount):
            for player in self.players:
                self.runRandomTurn(player)
    
    def throwDice(self) -> int:
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
        return diceResult

    def serialize(self) -> dict[str, object]:
        playerIndex = {id(p): k for k, p in enumerate(self.players)}

        def ownerIndex(owner: Player | None) -> int | None:
            return None if owner is None else playerIndex[id(owner)]

        return {
            "players": [
                {"id": k, **p.serialize()}
                for k, p in enumerate(self.players)
            ],
            "turn": self.serializeTurn(),
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
