from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .devCard import DevCard
    from .game import Game

from .enum import Resource, Color

class Player:
    def __init__(self, name: str, color: Color):
        self.name = name
        self.points = 0
        self.resources: list[Resource] = []
        self.devCards: list[DevCard] = []
        self.color: Color = color
        
    def getResourceCount(self, resource: Resource) -> int:
        return sum(1 for r in self.resources if r == resource)
    
    def payResource(self, resource: Resource, count:int = 1) -> bool:
        if self.getResourceCount(resource) < count:
            return False
        for _ in range(count):
            self.resources.remove(resource)
        return True
    
    def canPayResources(self, resources: dict[Resource, int]) -> bool:
        for resource, count in resources.items():
            if self.getResourceCount(resource) < count:
                return False
        return True
    
    def payResources(self, resources: dict[Resource, int]):
        for resource, count in resources.items():
            for _ in range(count):
                self.resources.remove(resource)

    def serialize(self, game: Game | None = None) -> dict[str, object]:
        return {
            "name": self.name,
            "color": self.color.value,
            "points": self.points,
            "resources": [resource.value for resource in self.resources],
            "devCards": [
                {
                    "name": card.name, "color": card.color, "used": card.used,
                    "acquiredTurn": card.acquiredTurn,
                    "unavailableReason": game.devCardUnavailableReason(game.players.index(self), card)
                    if game is not None else "No active game.",
                }
                for card in self.devCards
            ],
        }
        