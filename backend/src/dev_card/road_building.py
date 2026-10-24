from __future__ import annotations

from typing import TYPE_CHECKING

from ..resource import Resource
from .dev_card import DevCard

if TYPE_CHECKING:
    from ..game.game import Game
    from ..player.player import Player


class RoadBuilding(DevCard):
    name = "Road Building"
    color = "#22c55e"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        game.freeRoadsRemaining = 2
