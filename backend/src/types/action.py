from __future__ import annotations

import abc
from typing import TYPE_CHECKING, Generic, TypeVar

from .enum import BuildingType, Resource
from .board import Edge, Node
from .player import Player

if TYPE_CHECKING:
    from .game import Game

Target = TypeVar("Target", Node, Edge)

class Action(abc.ABC):
    cost: dict[Resource, int]

    def __init__(self, player: Player, game: Game):
        self.player = player
        self.game = game

    @abc.abstractmethod
    def execute(self) -> bool:
        return False

    def canBeExecuted(self) -> bool:
        return self.player.canPayResources(self.cost)
    
    def chooseTarget(self) -> bool:
        return True

    @abc.abstractmethod
    def description(self) -> str:
        pass

class TargetedAction(Action, Generic[Target]):
    def __init__(self, player: Player, game: Game, target: Target | None = None):
        super().__init__(player, game)
        self.target: Target | None = target

    @abc.abstractmethod
    def getValidTargets(self) -> list[Target]:
        pass

    def canBeExecuted(self) -> bool:
        if not super().canBeExecuted():
            return False
        targets = self.getValidTargets()
        return self.target in targets if self.target is not None else bool(targets)

    def chooseTarget(self, target: Target | None = None) -> bool:
        if not super().canBeExecuted():
            return False
        targets = self.getValidTargets()
        if not targets:
            return False
        if target is not None:
            if target not in targets:
                return False
            self.target = target
            return True

        for index, option in enumerate(targets, start=1):
            label = (f"node {option.id}" if isinstance(option, Node)
                     else f"edge {option.node1.id}-{option.node2.id}")
        while True:
            try:
                choice = input("Choose a target number (Enter to cancel): ").strip()
            except EOFError:
                return False
            if not choice:
                return False
            try:
                index = int(choice) - 1
            except ValueError:
                continue
            if 0 <= index < len(targets):
                self.target = targets[index]
                return True

class BuildRoad(TargetedAction[Edge]):
    cost = {Resource.WOOD: 1, Resource.BRICK: 1}

    def description(self) -> str:
        if self.target is None:
            return "build a road"
        return "built a road"

    def isConnected(self, node: Node) -> bool:
        if node.owner is self.player:
            return True
        # Another player's building cuts the road network
        if node.owner is not None:
            return False
        return any(edge.owner is self.player for edge in node.edges)

    def getValidTargets(self) -> list[Edge]:
        return [edge for edge in self.game.board.edges
                if edge.owner is None
                and (self.isConnected(edge.node1) or self.isConnected(edge.node2))]

    def execute(self) -> bool:
        if self.target is None or not self.canBeExecuted():
            return False
        self.player.payResources(self.cost)
        self.target.owner = self.player
        self.game.logAction(self.player, self.description())
        self.game.updateLongestRoad(self.target)
        return True

class BuildSettlement(TargetedAction[Node]):
    cost = {Resource.WOOD: 1, Resource.BRICK: 1, Resource.SHEEP: 1, Resource.WHEAT: 1}
    def description(self) -> str:
        if self.target is None:
            return "build a settlement"
        return "built a settlement"

    def getAvailableNodes(self) -> list[Node]:
        return [node for node in self.game.board.nodes
                if node.owner is None
                and not any(neighbor.owner is not None for neighbor in node.neighbors)]

    def getValidTargets(self) -> list[Node]:
        return [node for node in self.getAvailableNodes()
                if any(edge.owner is self.player for edge in node.edges)]

    def execute(self) -> bool:
        if self.target is None or not self.canBeExecuted():
            return False
        self.player.payResources(self.cost)
        self.game.build(self.player, self.target, BuildingType.SETTLEMENT)
        return True

class SetupSettlement(BuildSettlement):
    cost: dict[Resource, int] = {}

    def getValidTargets(self) -> list[Node]:
        return self.getAvailableNodes()

class FreeRoad(BuildRoad):
    cost: dict[Resource, int] = {}

class SetupRoad(FreeRoad):
    def getValidTargets(self) -> list[Edge]:
        return [edge for edge in super().getValidTargets()
                if self.game.setupNode in (edge.node1, edge.node2)]

class BuildCity(TargetedAction[Node]):
    cost = {Resource.ORE: 3, Resource.WHEAT: 2}

    def description(self) -> str:
        if self.target is None:
            return "upgrade a settlement to a city"
        return "upgraded a settlement to a city"

    def getValidTargets(self) -> list[Node]:
        return [node for node in self.game.board.nodes
                if node.owner is self.player and node.building == BuildingType.SETTLEMENT]

    def execute(self) -> bool:
        if self.target is None or not self.canBeExecuted():
            return False
        self.player.payResources(self.cost)
        # The settlement's point is already counted
        self.player.points -= 1
        self.game.build(self.player, self.target, BuildingType.CITY)
        return True

class BankTrade(Action):
    def __init__(self, player: Player, game: Game, give: Resource, receive: Resource):
        super().__init__(player, game)
        self.cost = {give: game.tradeRate(player, give)}
        self.give = give
        self.receive = receive

    def description(self) -> str:
        return f"traded {self.cost[self.give]} {self.give.value} for 1 {self.receive.value}"

    def canBeExecuted(self) -> bool:
        return self.give != self.receive and super().canBeExecuted()

    def execute(self) -> bool:
        if not self.canBeExecuted():
            return False
        self.player.payResources(self.cost)
        self.player.resources.append(self.receive)
        self.game.logAction(self.player, self.description() + " with the bank")
        return True

class DrawDevCard(Action):
    cost = {Resource.SHEEP: 1, Resource.WHEAT: 1, Resource.ORE: 1}

    def description(self) -> str:
        return "drew a development card"

    def canBeExecuted(self) -> bool:
        return super().canBeExecuted() and bool(self.game.devCardDeck)

    def execute(self) -> bool:
        if not self.canBeExecuted():
            return False
        self.player.payResources(self.cost)
        devCard = self.game.devCardDeck.pop()
        devCard.acquiredTurn = self.game.turnNumber
        self.player.devCards.append(devCard)
        self.game.logAction(self.player, self.description())
        return True
