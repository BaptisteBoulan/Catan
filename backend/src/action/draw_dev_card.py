from __future__ import annotations

from ..resource import Resource
from .action import Action


class DrawDevCard(Action):
    cost = {Resource.SHEEP: 1, Resource.WHEAT: 1, Resource.ORE: 1}

    def description(self) -> str:
        return "drew a development card"

    def canBeExecuted(self) -> bool:
        return super().canBeExecuted() and bool(self.game.devCardDeck)

    def execute(self) -> bool:
        if not self.canBeExecuted():
            return False
        self.player.payResources(self.cost)
        devCard = self.game.devCardDeck.pop()
        devCard.acquiredTurn = self.game.turnNumber
        self.player.devCards.append(devCard)
        self.game.logAction(self.player, self.description())
        return True
