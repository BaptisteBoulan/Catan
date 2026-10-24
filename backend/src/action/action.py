from __future__ import annotations

import abc
from typing import TYPE_CHECKING

from ..resource import Resource
from ..player.player import Player

if TYPE_CHECKING:
    from ..game.game import Game


class Action(abc.ABC):
    cost: dict[Resource, int]

    def __init__(self, player: Player, game: Game):
        self.player = player
        self.game = game

    @abc.abstractmethod
    def execute(self) -> bool:
        return False

    def canBeExecuted(self) -> bool:
        return self.player.canPayResources(self.cost)
    
    def chooseTarget(self) -> bool:
        return True

    @abc.abstractmethod
    def description(self) -> str:
        pass
