from __future__ import annotations

from typing import TYPE_CHECKING

from .player import Player

if TYPE_CHECKING:
    from ..game.game import Game


class AiPlayer(Player):
    isAi = True
    NAMES = (
        "Arya Stark", "Jon Snow", "Sansa Stark", "Bran Stark", "Ned Stark",
        "Tyrion Lannister", "Jaime Lannister", "Cersei Lannister",
        "Daenerys Targaryen", "Brienne of Tarth", "Davos Seaworth",
        "Samwell Tarly", "Ygritte", "Theon Greyjoy", "Oberyn Martell",
    )

    def playTurn(self, game: Game) -> None:
        self.playAutomatedTurn(game)
