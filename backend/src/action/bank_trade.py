from __future__ import annotations

from typing import TYPE_CHECKING

from ..resource import Resource
from ..player.player import Player
from .action import Action

if TYPE_CHECKING:
    from ..game.game import Game


class BankTrade(Action):
    def __init__(self, player: Player, game: Game, give: Resource, receive: Resource):
        super().__init__(player, game)
        self.cost = {give: game.tradeRate(player, give)}
        self.give = give
        self.receive = receive

    def description(self) -> str:
        return f"traded {self.cost[self.give]} {self.give.value} for 1 {self.receive.value}"

    def canBeExecuted(self) -> bool:
        return self.give != self.receive and super().canBeExecuted()

    def execute(self) -> bool:
        if not self.canBeExecuted():
            return False
        self.player.payResources(self.cost)
        self.player.resources.append(self.receive)
        self.game.logAction(self.player, self.description() + " with the bank")
        return True
