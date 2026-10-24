from __future__ import annotations

from typing import TYPE_CHECKING

from ..resource import Resource
from .dev_card import DevCard

if TYPE_CHECKING:
    from ..game.game import Game
    from ..player.player import Player


class Monopoly(DevCard):
    name = "Monopoly"
    color = "#a855f7"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        resource = resources[0]
        for opponent in game.players:
            if opponent is not player:
                count = opponent.getResourceCount(resource)
                opponent.payResource(resource, count)
                player.resources.extend([resource] * count)
