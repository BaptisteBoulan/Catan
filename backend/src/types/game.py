import random

from .enum import BuildingType, Resource
from .devCard import DevCard, Knight, RoadBuilding, YearOfPlenty, Monopoly, VictoryPoint

from .action import (
    BankTrade, BuildCity, BuildRoad, BuildSettlement, DrawDevCard, FreeRoad, SetupRoad, SetupSettlement,
    Target, TargetedAction,
)
from .board import Board, Edge, Node
from .enum import Color
from .player import Player

MIN_PLAYERS = 1
MAX_PLAYERS = 5
WINNING_POINTS = 7


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

class Game:
    def __init__(self, playerCount: int = 4, boardSize: int = 3):
        if not MIN_PLAYERS <= playerCount <= MAX_PLAYERS:
            raise ValueError(f"playerCount must be between {MIN_PLAYERS} and {MAX_PLAYERS}")
        colors = list(Color)
        self.players: list[Player] = [
            Player(f"Player {k + 1}", colors[k]) for k in range(playerCount)
        ]
        self.board = Board(boardSize)
        self.setDevCardDeck()
        self.started = False
        self.currentPlayer = 0
        self.turnNumber = 0
        self.diceRoll: int | None = None
        self.diceValues: tuple[int, int] | None = None
        self.winner: int | None = None
        self.thiefMovePending = False
        self.freeRoadsRemaining = 0
        self.devCardPlayed = False
        self.setupStep: int | None = None
        self.setupNode: Node | None = None

    def start(self):
        if self.started:
            raise GameRuleError("The game has already started.")
        self.started = True
        self.currentPlayer = 0
        self.setupStep = 0
        self.diceRoll = None

    def requireTurn(self, playerIndex: int):
        if self.winner is not None:
            raise GameRuleError("The game is over.")
        if not self.started:
            raise GameRuleError("The game has not started yet.")
        if playerIndex != self.currentPlayer:
            raise GameRuleError("It is not your turn.")

    @property
    def setupKind(self) -> str:
        return "settlement" if self.setupNode is None else "road"

    def requireNormalTurn(self, playerIndex: int):
        self.requireTurn(playerIndex)
        if self.setupStep is not None:
            raise GameRuleError("Finish placing the starting settlements and roads first.")
        if self.thiefMovePending:
            raise GameRuleError("Move the thief first.")
        if self.freeRoadsRemaining:
            raise GameRuleError("Finish placing your free roads first.")

    def rollDice(self, playerIndex: int) -> int:
        self.requireNormalTurn(playerIndex)
        if self.diceRoll is not None:
            raise GameRuleError("You already rolled the dice this turn.")
        self.diceRoll = self.throwDice()
        self.thiefMovePending = self.diceRoll == 7
        return self.diceRoll

    def thiefTargets(self, playerIndex: int) -> list[int]:
        self.requireTurn(playerIndex)
        if not self.thiefMovePending:
            raise GameRuleError("The thief can only move after rolling a seven or playing a Knight.")
        return [index for index, tile in enumerate(self.board.tiles)
                if not tile.isOccupiedByThief]

    def moveThief(self, playerIndex: int, targetId: int):
        if targetId not in self.thiefTargets(playerIndex):
            raise GameRuleError("Move the thief to a different tile.")
        destination = self.board.tiles[targetId]
        for tile in self.board.tiles:
            tile.isOccupiedByThief = tile is destination
        attacked = {node.owner for node in destination.nodes
                    if node.owner is not None and node.building != BuildingType.NONE}
        for player in self.players:
            if player in attacked and len(player.resources) > 7:
                discarded = set(random.sample(range(len(player.resources)),
                                              len(player.resources) // 2))
                player.resources[:] = [card for index, card in enumerate(player.resources)
                                       if index not in discarded]
        self.thiefMovePending = False

    def buyDevCard(self, playerIndex: int):
        self.requireNormalTurn(playerIndex)
        if self.diceRoll is None:
            raise GameRuleError("Roll the dice first.")
        if not self.devCardDeck:
            raise GameRuleError("No development cards left.")
        if not DrawDevCard(self.players[playerIndex], self).execute():
            raise GameRuleError("Not enough resources (needs sheep, wheat and ore).")

    def trade(self, playerIndex: int, give: Resource, receive: Resource):
        self.requireNormalTurn(playerIndex)
        if self.diceRoll is None:
            raise GameRuleError("The turn's dice have not been rolled yet.")
        if give == receive:
            raise GameRuleError("Choose a different resource to receive.")
        if not BankTrade(self.players[playerIndex], self, give, receive).execute():
            raise GameRuleError(f"Not enough resources (needs 4 {give.value}).")

    def devCardUnavailableReason(self, playerIndex: int, card: DevCard) -> str | None:
        if card.used:
            return "Already used."
        if self.winner is not None:
            return "The game is over."
        if not self.started or self.setupStep is not None:
            return "Finish setup first."
        if playerIndex != self.currentPlayer:
            return "Wait for your turn."
        if self.thiefMovePending:
            return "Move the thief first."
        if self.freeRoadsRemaining:
            return "Finish placing your free roads first."
        if self.diceRoll is None:
            return "Roll the dice first."
        if not isinstance(card, VictoryPoint):
            if card.acquiredTurn >= self.turnNumber:
                return "Available starting your next turn."
            if self.devCardPlayed:
                return "Only one action development card can be played per turn."
        if isinstance(card, RoadBuilding) and not FreeRoad(self.players[playerIndex], self).getValidTargets():
            return "There is no place available to build a road."
        return None

    def playDevCard(self, playerIndex: int, cardIndex: int, resources: list[Resource]):
        self.requireNormalTurn(playerIndex)
        player = self.players[playerIndex]
        if not 0 <= cardIndex < len(player.devCards):
            raise GameRuleError("Development card not found.")
        card = player.devCards[cardIndex]
        reason = self.devCardUnavailableReason(playerIndex, card)
        if reason:
            raise GameRuleError(reason)
        expected = 1 if isinstance(card, Monopoly) else 2 if isinstance(card, YearOfPlenty) else 0
        if len(resources) != expected or any(not isinstance(resource, Resource) for resource in resources):
            raise GameRuleError(f"{card.name} requires exactly {expected} resource choices.")
        card.play(player, self, resources)
        card.used = True
        if not isinstance(card, VictoryPoint):
            self.devCardPlayed = True
        self.checkVictory(player)

    def checkVictory(self, player: Player):
        if self.winner is None and player.points >= WINNING_POINTS:
            self.winner = self.players.index(player)

    def buildAction(self, playerIndex: int, kind: str) -> BuildRoad | BuildSettlement | BuildCity:
        self.requireTurn(playerIndex)
        if self.setupStep is not None:
            if kind != self.setupKind:
                raise GameRuleError(f"Place your starting {self.setupKind} first.")
            setupActionType = SetupSettlement if kind == "settlement" else SetupRoad
            return setupActionType(self.players[playerIndex], self)
        if self.freeRoadsRemaining:
            if kind != "road":
                raise GameRuleError("Finish placing your free roads first.")
            return FreeRoad(self.players[playerIndex], self)
        self.requireNormalTurn(playerIndex)
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
        if self.freeRoadsRemaining:
            self.freeRoadsRemaining -= 1
            if not FreeRoad(self.players[playerIndex], self).getValidTargets():
                self.freeRoadsRemaining = 0
        if self.setupStep is not None:
            if kind == "settlement":
                self.setupNode = next(node for node in self.board.nodes if node.id == targetId)
            else:
                self.setupNode = None
                self.setupStep += 1
                playerCount = len(self.players)
                if self.setupStep == 2 * playerCount:
                    self.setupStep = None
                    self.currentPlayer = 0
                    self.turnNumber = 1
                    self.rollDice(self.currentPlayer)
                else:
                    self.currentPlayer = (
                        self.setupStep if self.setupStep < playerCount
                        else 2 * playerCount - 1 - self.setupStep
                    )

    def executeOn(self, action: TargetedAction[Target], targetId: int) -> bool:
        target = next((target for target in action.getValidTargets()
                       if self.targetId(target) == targetId), None)
        return target is not None and action.chooseTarget(target) and action.execute()

    def endTurn(self, playerIndex: int):
        self.requireNormalTurn(playerIndex)
        if self.diceRoll is None:
            raise GameRuleError("Roll the dice before ending your turn.")
        self.currentPlayer = (self.currentPlayer + 1) % len(self.players)
        self.turnNumber += 1
        self.devCardPlayed = False
        self.diceRoll = None
        self.rollDice(self.currentPlayer)

    def serializeTurn(self) -> dict[str, object]:
        return {
            "started": self.started,
            "currentPlayer": self.currentPlayer,
            "turnNumber": self.turnNumber,
            "diceRoll": self.diceRoll,
            "diceValues": self.diceValues,
            "winner": self.winner,
            "winningPoints": WINNING_POINTS,
            "thiefMovePending": self.thiefMovePending,
            "freeRoadsRemaining": self.freeRoadsRemaining,
            "devCardPlayed": self.devCardPlayed,
            "setup": None if self.setupStep is None else {
                "round": 1 if self.setupStep < len(self.players) else 2,
                "kind": self.setupKind,
            },
        }

    def setDevCardDeck(self):
        self.devCardDeck: list[DevCard] = [
            cardType()
            for _ in range(2)
            for cardType in (Knight, RoadBuilding, YearOfPlenty, Monopoly, VictoryPoint)
        ]
        random.shuffle(self.devCardDeck)

    def build(self, player: Player, node: Node, buildingType: BuildingType):
        node.building = buildingType
        node.owner = player
        player.points += BUILDING_POINTS[buildingType]
        self.checkVictory(player)
        
    def runTurn(self, player: Player):
        self.requireNormalTurn(self.players.index(player))
        if self.diceRoll is None:
            self.rollDice(self.currentPlayer)

    def runRandomTurn(self, player: Player):
        """Plays the current turn until no more building actions can be executed."""
        if self.thiefMovePending:
            self.moveThief(self.players.index(player),
                           random.choice(self.thiefTargets(self.players.index(player))))
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
                    if self.winner is not None:
                        return
                    break
            else:
                break

    def runRandomRounds(self, roundCount: int):
        if not self.started:
            self.start()
        while self.setupStep is not None:
            kind = self.setupKind
            targets = self.buildTargets(self.currentPlayer, kind)
            self.buildAt(self.currentPlayer, kind, random.choice(targets))
        for _ in range(roundCount):
            for _ in self.players:
                self.runRandomTurn(self.players[self.currentPlayer])
                if self.winner is not None:
                    return
                self.endTurn(self.currentPlayer)
    
    def throwDice(self) -> int:
        self.diceValues = (random.randint(1, 6), random.randint(1, 6))
        diceResult = sum(self.diceValues)
        
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
                {"id": k, **p.serialize(self)}
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
