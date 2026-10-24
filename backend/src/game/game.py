import random
from datetime import datetime, timezone

from ..board.building_type import BuildingType
from ..resource import Resource
from ..dev_card import DevCard, Knight, RoadBuilding, YearOfPlenty, Monopoly, VictoryPoint
from ..action import (
    BankTrade, BuildCity, BuildRoad, BuildSettlement, DrawDevCard, FreeRoad, SetupRoad, SetupSettlement,
    Target, TargetedAction,
)
from ..board import Board, Edge, Node
from ..player.color import Color
from ..player import AiPlayer, HumanPlayer, Player


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
            HumanPlayer(f"Player {k + 1}", colors[k]) for k in range(playerCount)
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
        self.longestRoadHolder: Player | None = None
        self.longestRoadLength = 0
        self.largestArmyHolder: Player | None = None
        self.chat: list[dict[str, object]] = []
        self.advancingAiPlayers = False
        self.observationMode = False

    def logAction(self, player: Player, description: str):
        self.chat.append({
            "id": len(self.chat),
            "kind": "action",
            "senderId": self.players.index(player),
            "recipientId": None,
            "text": f"{player.name} {description}.",
            "give": None,
            "giveCount": 0,
            "receive": None,
            "receiveCount": 0,
            "status": None,
            "createdAt": datetime.now(timezone.utc),
        })

    def start(self, observationMode: bool = False):
        if self.started:
            raise GameRuleError("The game has already started.")
        if all(player.isAi for player in self.players):
            raise GameRuleError("At least one human player is required.")
        self.started = True
        self.currentPlayer = 0
        self.setupStep = 0
        self.diceRoll = None
        self.observationMode = observationMode
        if self.observationMode:
            while self.setupStep is not None:
                self.players[self.currentPlayer].playTurn(self)
        self.advanceAiPlayers()

    def fillAiPlayers(self, humanPlayerIds: set[int]) -> None:
        if self.started:
            raise GameRuleError("The game has already started.")
        takenNames = {player.name.casefold() for player in self.players}
        names = [name for name in AiPlayer.NAMES if name.casefold() not in takenNames]
        random.shuffle(names)
        for index, player in enumerate(self.players):
            if index not in humanPlayerIds and not player.isAi:
                self.players[index] = AiPlayer(names.pop(), player.color)

    def advanceAiPlayers(self) -> None:
        # AI actions use the same transitions as human actions, without nesting dispatch.
        if self.advancingAiPlayers or self.observationMode:
            return
        self.advancingAiPlayers = True
        try:
            while self.started and self.winner is None and self.players[self.currentPlayer].isAi:
                self.players[self.currentPlayer].playTurn(self)
        finally:
            self.advancingAiPlayers = False

    def nextObservedTurn(self) -> None:
        if not self.observationMode:
            raise GameRuleError("Observation mode is not enabled.")
        self.requireTurn(self.currentPlayer)
        self.players[self.currentPlayer].playTurn(self)

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
        action = BankTrade(self.players[playerIndex], self, give, receive)
        if not action.execute():
            raise GameRuleError(f"Not enough resources (needs {action.cost[give]} {give.value}).")

    def tradeRate(self, player: Player, resource: Resource) -> int:
        return min(
            (3 if port.resource is None else 2
             for port in self.board.ports
             if port.owner is player and port.resource in (None, resource)),
            default=4,
        )

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
        choices = f" ({', '.join(resource.value for resource in resources)})" if resources else ""
        self.logAction(player, f"played {card.name}{choices}")
        if isinstance(card, Knight):
            self.updateLargestArmy(player)
        if not isinstance(card, VictoryPoint):
            self.devCardPlayed = True
        self.checkVictory(player)

    def updateLargestArmy(self, player: Player):
        holder = self.largestArmyHolder
        if player.knightsPlayed < 3 or holder is player:
            return
        if holder is not None and player.knightsPlayed <= holder.knightsPlayed:
            return
        if holder is not None:
            holder.points -= 2
        self.largestArmyHolder = player
        player.points += 2
        self.logAction(player, "was awarded Largest Army (+2 victory points)"
                       + (f", taking it from {holder.name}" if holder is not None else ""))
        self.checkVictory(player)

    def checkVictory(self, player: Player):
        if self.winner is None and player.points >= WINNING_POINTS:
            self.winner = self.players.index(player)

    def longestRoadThrough(self, road: Edge) -> int:
        player = road.owner
        if player is None:
            return 0
        seen = {road}

        def extend(node: Node, otherEnd: Node | None = None) -> int:
            longest = extend(otherEnd) if otherEnd is not None else 0
            if node.owner is not None and node.owner is not player:
                return longest
            for edge in node.edges:
                if edge.owner is not player or edge in seen:
                    continue
                seen.add(edge)
                neighbor = edge.node2 if edge.node1 is node else edge.node1
                longest = max(longest, 1 + extend(neighbor, otherEnd))
                seen.remove(edge)
            return longest

        return 1 + extend(road.node1, road.node2)

    def updateLongestRoad(self, road: Edge):
        player = road.owner
        length = self.longestRoadThrough(road)
        if player is None or length < 5 or length <= self.longestRoadLength:
            return
        self.setLongestRoadHolder(player, length)

    def setLongestRoadHolder(self, player: Player | None, length: int):
        if self.longestRoadHolder is not player:
            previous = self.longestRoadHolder
            if previous is not None:
                previous.points -= 2
            self.longestRoadHolder = player
            if player is not None:
                player.points += 2
                self.logAction(player, "was awarded Longest Road (+2 victory points)"
                               + (f", taking it from {previous.name}" if previous is not None else ""))
            elif previous is not None:
                self.logAction(previous, "lost Longest Road (-2 victory points)")
        self.longestRoadLength = length
        if player is not None:
            self.checkVictory(player)

    def checkBrokenRoad(self, node: Node):
        holder = self.longestRoadHolder
        affected = {edge.owner for edge in node.edges
                    if edge.owner is not None and edge.owner is not node.owner}
        if not affected or (holder is not None and holder not in affected):
            return
        lengths = {player: max((self.longestRoadThrough(edge)
                                for edge in self.board.edges if edge.owner is player), default=0)
                   for player in self.players}
        longest = max(lengths.values())
        leaders = [player for player, length in lengths.items() if length == longest]
        nextHolder = None
        if longest >= 5:
            if holder in leaders:
                nextHolder = holder
            elif len(leaders) == 1:
                nextHolder = leaders[0]
        self.setLongestRoadHolder(nextHolder, longest)

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
        self.advanceAiPlayers()

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
        self.advanceAiPlayers()

    def serializeTurn(self) -> dict[str, object]:
        return {
            "started": self.started,
            "observationMode": self.observationMode,
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
            Knight() for _ in range(14)
        ] + [
            cardType()
            for _ in range(2)
            for cardType in (RoadBuilding, YearOfPlenty, Monopoly, VictoryPoint)
        ]
        random.shuffle(self.devCardDeck)

    def build(self, player: Player, node: Node, buildingType: BuildingType):
        node.building = buildingType
        node.owner = player
        for port in self.board.ports:
            if port.owner is None and node in (port.edge.node1, port.edge.node2):
                port.owner = player
        player.points += BUILDING_POINTS[buildingType]
        self.logAction(player, f"built a {buildingType.value}")
        if buildingType == BuildingType.SETTLEMENT:
            self.checkBrokenRoad(node)
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
        finalTurn = self.turnNumber + roundCount * len(self.players)
        while self.turnNumber < finalTurn:
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
                "ports": [
                    {
                        "node1": port.edge.node1.id,
                        "node2": port.edge.node2.id,
                        "resource": None if port.resource is None else port.resource.value,
                        "owner": ownerIndex(port.owner),
                    }
                    for port in self.board.ports
                ],
            },
        }
