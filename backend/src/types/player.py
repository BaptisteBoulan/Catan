from .enum import Resource, DevelopmentCard

class Player:
    def __init__(self, name: str):
        self.name = name
        self.points = 0
        self.ressources: list[Resource] = []
        self.cards: list[DevelopmentCard] = []
        