from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..player.player import Player
    from .node import Node


class Edge:
    """Represents an edge between two nodes where roads can be built."""
    def __init__(self, node1: Node, node2: Node):
        self.node1 = node1
        self.node2 = node2
        self.owner: Player | None = None

    def __repr__(self):
        status = f"Road ({self.owner.name})" if self.owner else "Empty"
        return f"Edge [{status}] between ({self.node1.x:.2f}, {self.node1.y:.2f}) and ({self.node2.x:.2f}, {self.node2.y:.2f})"
