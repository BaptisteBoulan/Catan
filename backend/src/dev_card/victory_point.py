from __future__ import annotations

from typing import TYPE_CHECKING

from ..resource import Resource
from .dev_card import DevCard

if TYPE_CHECKING:
    from ..game.game import Game
    from ..player.player import Player


class VictoryPoint(DevCard):
    name = "Victory Point"
    color = "#ef4444"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        player.points += 1
