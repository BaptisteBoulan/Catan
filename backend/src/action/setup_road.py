from __future__ import annotations

from ..board.edge import Edge
from .free_road import FreeRoad


class SetupRoad(FreeRoad):
    def getValidTargets(self) -> list[Edge]:
        return [edge for edge in super().getValidTargets()
                if self.game.setupNode in (edge.node1, edge.node2)]
