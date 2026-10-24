from __future__ import annotations

from ..resource import Resource
from ..board.building_type import BuildingType
from ..board.node import Node
from .targeted_action import TargetedAction


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
