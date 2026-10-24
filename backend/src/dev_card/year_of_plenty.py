from __future__ import annotations

from typing import TYPE_CHECKING

from ..resource import Resource
from .dev_card import DevCard

if TYPE_CHECKING:
    from ..game.game import Game
    from ..player.player import Player


class YearOfPlenty(DevCard):
    name = "Year of Plenty"
    color = "#eab308"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        player.resources.extend(resources)
