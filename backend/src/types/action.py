from __future__ import annotations

import abc
from typing import TYPE_CHECKING

from .enum import BuildingType, Resource
from .board import Edge, Node
from .player import Player

if TYPE_CHECKING:
    from .game import Game

class Action(abc.ABC):
    @abc.abstractmethod
    def execute(self) -> bool:
        return False

    @abc.abstractmethod
    def description(self) -> str:
        pass

class BuildRoad(Action):
    def __init__(self, player: Player, edge: Edge, game: Game):
        self.player = player
        self.edge = edge
        self.game = game

    def description(self) -> str:
        return f"built a road between nodes {self.edge.node1.id} and {self.edge.node2.id}"

    def isConnected(self, node: Node) -> bool:
        if node.owner is self.player:
            return True
        # Another player's building cuts the road network
        if node.owner is not None:
            return False
        return any(edge.owner is self.player for edge in node.edges if edge is not self.edge)

    def execute(self) -> bool:
        if self.edge.owner is not None:
            return False
        if not self.isConnected(self.edge.node1) and not self.isConnected(self.edge.node2):
            return False
        if not self.player.payResources({Resource.WOOD: 1, Resource.BRICK: 1}):
            return False
        self.edge.owner = self.player
        return True

class BuildSettlement(Action):
    def __init__(self, player: Player, node: Node, game: Game):
        self.player = player
        self.node = node
        self.game = game

    def description(self) -> str:
        return f"built a settlement at node {self.node.id}"

    def execute(self) -> bool:
        if self.node.owner is not None:
            return False
        if any(neighbor.owner is not None for neighbor in self.node.neighbors):
            return False
        if not any(edge.owner is self.player for edge in self.node.edges):
            return False
        if not self.player.payResources({Resource.WOOD: 1, Resource.BRICK: 1, Resource.SHEEP: 1, Resource.WHEAT: 1}):
            return False
        self.game.build(self.player, self.node, BuildingType.SETTLEMENT)
        return True

class BuildCity(Action):
    def __init__(self, player: Player, node: Node, game: Game):
        self.player = player
        self.node = node
        self.game = game

    def description(self) -> str:
        return f"upgraded the settlement at node {self.node.id} to a city"

    def execute(self) -> bool:
        if self.node.owner is not self.player:
            return False
        if self.node.building != BuildingType.SETTLEMENT:
            return False
        if not self.player.payResources({Resource.ORE: 3, Resource.WHEAT: 2}):
            return False
        # The settlement's point is already counted
        self.player.points -= 1
        self.game.build(self.player, self.node, BuildingType.CITY)
        return True

class DrawDevCard(Action):
    def __init__(self, player: Player, game: Game):
        self.player = player
        self.game = game

    def description(self) -> str:
        return "drew a development card"

    def execute(self) -> bool:
        if not self.game.devCardDeck:
            return False
        if not self.player.payResources({Resource.SHEEP: 1, Resource.WHEAT: 1, Resource.ORE: 1}):
            return False

        devCard = self.game.devCardDeck.pop()
        self.player.devCards.append(devCard)
        return True
