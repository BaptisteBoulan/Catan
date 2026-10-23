from __future__ import annotations

import abc
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .game import Game
    from .player import Player

class DevCard(abc.ABC):
    name: str
    color: str

    @abc.abstractmethod
    def play(self, player: Player, game: Game) -> bool:
        return False

class Knight(DevCard):
    name = "Knight"
    color = "#3b82f6"

    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Knight card")
        # Implement the logic for playing a Knight card
        return True

class RoadBuilding(DevCard):
    name = "Road Building"
    color = "#22c55e"

    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Road Building card")
        # Implement the logic for playing a Road Building card
        return True

class YearOfPlenty(DevCard):
    name = "Year of Plenty"
    color = "#eab308"

    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Year of Plenty card")
        # Implement the logic for playing a Year of Plenty card
        return True

class Monopoly(DevCard):
    name = "Monopoly"
    color = "#a855f7"

    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Monopoly card")
        # Implement the logic for playing a Monopoly card
        return True

class VictoryPoint(DevCard):
    name = "Victory Point"
    color = "#ef4444"

    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Victory Point card")
        # Implement the logic for playing a Victory Point card
        return True