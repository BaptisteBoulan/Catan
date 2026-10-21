from .enum import Resource, DevelopmentCard, Color

class Player:
    def __init__(self, name: str, color: Color):
        self.name = name
        self.points = 0
        self.ressources: list[Resource] = []
        self.cards: list[DevelopmentCard] = []
        self.color: Color = color
        