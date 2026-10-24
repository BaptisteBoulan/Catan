from __future__ import annotations

from ..resource import Resource
from ..board.edge import Edge
from ..board.node import Node
from .targeted_action import TargetedAction


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
