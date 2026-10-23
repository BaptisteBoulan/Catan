from __future__ import annotations

import abc
from typing import TYPE_CHECKING

from .enum import Resource

if TYPE_CHECKING:
    from .game import Game
    from .player import Player

class DevCard(abc.ABC):
    name: str
    color: str

    def __init__(self):
        self.acquiredTurn = -1
        self.used = False

    @abc.abstractmethod
    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        pass

class Knight(DevCard):
    name = "Knight"
    color = "#3b82f6"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        game.thiefMovePending = True

class RoadBuilding(DevCard):
    name = "Road Building"
    color = "#22c55e"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        game.freeRoadsRemaining = 2

class YearOfPlenty(DevCard):
    name = "Year of Plenty"
    color = "#eab308"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        player.resources.extend(resources)

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

class VictoryPoint(DevCard):
    name = "Victory Point"
    color = "#ef4444"

    def play(self, player: Player, game: Game, resources: list[Resource]) -> None:
        player.points += 1