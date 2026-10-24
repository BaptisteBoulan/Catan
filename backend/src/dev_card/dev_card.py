from __future__ import annotations

import abc
from typing import TYPE_CHECKING

from ..resource import Resource

if TYPE_CHECKING:
    from ..game.game import Game
    from ..player.player import Player


class DevCard(abc.ABC):
    name: str
    color: str

    def __init__(self):
        self.acquiredTurn = -1
        self.used = False

    @abc.abstractmethod
    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        pass
