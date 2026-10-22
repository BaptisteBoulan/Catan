import abc
from backend.src.types.enum import BuildingType, Resource
from backend.src.types.game import Game
from .board import Edge, Node
from .player import Player

class Action(abc.ABC):
    @abc.abstractmethod
    def execute(self) -> bool:
        return False

class BuildRoad(Action):
    def __init__(self, player: Player, edge: Edge, game: Game):
        self.player = player
        self.edge = edge
        self.game = game

    def execute(self) -> bool:
        if self.edge.owner is not None:
            return False
        if self.edge.node1.owner is not self.player and self.edge.node2.owner is not self.player:
            return False
        if not self.player.payResources({Resource.WOOD: 1, Resource.BRICK: 1}):
            return False
        self.edge.owner = self.player
        return True
    
class BuildSettlement(Action):
    def __init__(self, player: Player, node: Node, game: Game):
        self.player = player
        self.node = node
        self.game = game

    def execute(self) -> bool:
        if self.node.owner is not None:
            return False
        if not self.player.payResources({Resource.WOOD: 1, Resource.BRICK: 1, Resource.SHEEP: 1, Resource.WHEAT: 1}):
            return False
        self.node.owner = self.player
        self.node.building = BuildingType.SETTLEMENT
        return True

class BuildCity(Action):
    def __init__(self, player: Player, node: Node, game: Game):
        self.player = player
        self.node = node
        self.game = game

    def execute(self) -> bool:
        if self.node.owner is not self.player:
            return False
        if self.node.building != BuildingType.SETTLEMENT:
            return False
        if not self.player.payResources({Resource.ORE: 3, Resource.WHEAT: 2}):
            return False
        self.node.building = BuildingType.CITY
        return True

class DrawDevCard(Action):
    def __init__(self, player: Player, game: Game):
        self.player = player
        self.game = game

    def execute(self) -> bool:
        if not self.player.payResources({Resource.SHEEP: 1, Resource.WHEAT: 1, Resource.ORE: 1}):
            return False
        
        devCard = self.game.devCardDeck.pop()
        self.player.devCards.add(devCard)
        return True