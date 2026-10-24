from __future__ import annotations

from ..resource import Resource
from ..board.node import Node
from .build_settlement import BuildSettlement


class SetupSettlement(BuildSettlement):
    cost: dict[Resource, int] = {}

    def getValidTargets(self) -> list[Node]:
        return self.getAvailableNodes()
