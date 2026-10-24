from __future__ import annotations

from typing import TYPE_CHECKING

from .building_type import BuildingType

if TYPE_CHECKING:
    from ..player.player import Player
    from .edge import Edge


class Node:
    """Represents a vertex where settlements or cities can be built."""
    def __init__(self, id: int, x: float, y: float):
        self.id = id
        self.x = x
        self.y = y
        self.building: BuildingType = BuildingType.NONE
        self.owner: Player | None = None
        self.neighbors: set["Node"] = set()
        self.edges: set["Edge"] = set()

    def __repr__(self):
        b_str = f"{self.building.name}" if self.building != BuildingType.NONE else "Empty"
        return f"Node({b_str}) at ({self.x:.2f}, {self.y:.2f})"
