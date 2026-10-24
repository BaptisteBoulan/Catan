from __future__ import annotations

from typing import TYPE_CHECKING

from .player import Player

if TYPE_CHECKING:
    from ..game.game import Game


class HumanPlayer(Player):
    def playTurn(self, game: Game) -> None:
        self.playAutomatedTurn(game)
