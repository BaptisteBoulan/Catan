from __future__ import annotations

from ..resource import Resource
from ..board.building_type import BuildingType
from ..board.node import Node
from .targeted_action import TargetedAction


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
