from __future__ import annotations

import abc
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .game import Game
    from .player import Player

class DevCard(abc.ABC):
    @abc.abstractmethod
    def play(self, player: Player, game: Game) -> bool:
        return False

class Knight(DevCard):
    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Knight card")
        # Implement the logic for playing a Knight card
        return True

class RoadBuilding(DevCard):
    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Road Building card")
        # Implement the logic for playing a Road Building card
        return True

class YearOfPlenty(DevCard):
    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Year of Plenty card")
        # Implement the logic for playing a Year of Plenty card
        return True

class Monopoly(DevCard):
    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Monopoly card")
        # Implement the logic for playing a Monopoly card
        return True

class VictoryPoint(DevCard):
    def play(self, player: Player, game: Game) -> bool:
        print(f"{player} plays a Victory Point card")
        # Implement the logic for playing a Victory Point card
        return True