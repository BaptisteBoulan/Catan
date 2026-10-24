from __future__ import annotations

from typing import TYPE_CHECKING

from ..resource import Resource

if TYPE_CHECKING:
    from ..player.player import Player
    from .edge import Edge


class Port:
    def __init__(self, edge: Edge, resource: Resource | None):
        self.edge = edge
        self.resource = resource
        self.owner: Player | None = None
