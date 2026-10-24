from __future__ import annotations

from abc import ABC, abstractmethod
import random
from typing import TYPE_CHECKING

from ..board.building_type import BuildingType
from ..dev_card.knight import Knight
from ..resource import Resource
from .color import Color

if TYPE_CHECKING:
    from ..board.edge import Edge
    from ..board.node import Node
    from ..dev_card.dev_card import DevCard
    from ..game.game import Game


PORT_VALUE = 0.08


class Player(ABC):
    isAi = False

    def __init__(self, name: str, color: Color):
        self.name = name
        self.points = 0
        self.resources: list[Resource] = []
        self.devCards: list[DevCard] = []
        self.color: Color = color
        self.settlementObjective: Node | None = None

    @abstractmethod
    def playTurn(self, game: Game) -> None:
        pass

    @property
    def knightsPlayed(self) -> int:
        return sum(isinstance(card, Knight) and card.used for card in self.devCards)
        
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

    def resourceProductionValue(self, game: Game, node: Node) -> float:
        return sum(
            (6 - abs(7 - tile.diceNumber)) / 36
            for tile in game.board.tiles
            if node in tile.nodes and tile.landscape.resource is not None
            and tile.diceNumber is not None and tile.diceNumber != 7
        )

    def nodeValue(self, game: Game, node: Node) -> float:
        portValue = sum(
            PORT_VALUE
            for port in game.board.ports
            if port.owner is None and node in (port.edge.node1, port.edge.node2)
        )
        return self.resourceProductionValue(game, node) + portValue

    def hasResourceCoverage(self, game: Game) -> bool:
        coveredResources = {
            tile.landscape.resource
            for tile in game.board.tiles
            if tile.landscape.resource is not None
            and any(node.owner is self for node in tile.nodes)
        }
        return all(resource in coveredResources for resource in Resource)

    def resourceProductionRate(self, game: Game, resource: Resource) -> float:
        return sum(
            (6 - abs(7 - tile.diceNumber)) / 36
            * sum(2 if node.building == BuildingType.CITY else 1
                  for node in tile.nodes if node.owner is self)
            for tile in game.board.tiles
            if tile.landscape.resource == resource
            and tile.diceNumber is not None
            and not tile.isOccupiedByThief
        )

    def acceptsTradeOffer(
        self,
        game: Game,
        incomingResource: Resource,
        incomingCount: int,
        outgoingResource: Resource,
        outgoingCount: int,
    ) -> bool:
        if self.getResourceCount(outgoingResource) < outgoingCount:
            return False

        incomingRate = self.resourceProductionRate(game, incomingResource)
        outgoingRate = self.resourceProductionRate(game, outgoingResource)
        if incomingRate == 0:
            if outgoingRate == 0:
                return False
            maxPaymentPerCard = max(1, game.tradeRate(self, incomingResource) - 1)
            return outgoingCount <= incomingCount * maxPaymentPerCard
        if outgoingRate == 0:
            maxPaymentPerCard = max(1, game.tradeRate(self, outgoingResource) - 1)
            return incomingCount * maxPaymentPerCard >= outgoingCount
        return incomingCount / incomingRate >= outgoingCount / outgoingRate

    def bestCityUpgrade(self, game: Game) -> Node | None:
        if not self.hasResourceCoverage(game):
            return None
        return max(
            (node for node in game.board.nodes
             if node.owner is self and node.building == BuildingType.SETTLEMENT),
            key=lambda node: (self.resourceProductionValue(game, node), -node.id),
            default=None,
        )

    def settlementPlans(self, game: Game) -> dict[Node, tuple[Edge, ...]]:
        from ..action import BuildSettlement

        available = set(BuildSettlement(self, game).getAvailableNodes())
        plans: dict[Node, tuple[Edge, ...]] = {}
        edgeIds = {edge: index for index, edge in enumerate(game.board.edges)}

        def pathKey(path: tuple[Edge, ...]) -> tuple[int, tuple[int, ...]]:
            return sum(edge.owner is None for edge in path), tuple(edgeIds[edge] for edge in path)

        def visit(node: Node, path: tuple[Edge, ...], seen: set[Node]) -> None:
            if node in available and (node not in plans or pathKey(path) < pathKey(plans[node])):
                plans[node] = path
            if len(path) == 2:
                return
            for edge in sorted(node.edges, key=edgeIds.__getitem__):
                neighbor = edge.node2 if edge.node1 is node else edge.node1
                if neighbor in seen or edge.owner not in (None, self):
                    continue
                if neighbor.owner not in (None, self):
                    continue
                visit(neighbor, (*path, edge), seen | {neighbor})

        for node in game.board.nodes:
            if node.owner is self:
                visit(node, (), {node})
        return plans

    def chooseSettlementPlan(self, game: Game) -> tuple[Edge, ...] | None:
        plans = self.settlementPlans(game)
        if self.settlementObjective not in plans:
            self.settlementObjective = max(
                plans, key=lambda node: (self.nodeValue(game, node), -node.id), default=None,
            )
            if self.settlementObjective is not None:
                game.logAction(self, f"plans a settlement at node {self.settlementObjective.id}"
                               f" ({self.nodeValue(game, self.settlementObjective):.3f} resources/turn)")
        return plans.get(self.settlementObjective) if self.settlementObjective is not None else None

    def tradeFor(self, game: Game, cost: dict[Resource, int]) -> bool:
        counts = {resource: self.getResourceCount(resource) for resource in Resource}
        missing = [resource for resource, count in cost.items()
                   for _ in range(max(0, count - counts[resource]))]
        donors = [
            resource
            for resource in sorted(Resource, key=lambda resource: game.tradeRate(self, resource))
            for _ in range(max(0, counts[resource] - cost.get(resource, 0))
                           // game.tradeRate(self, resource))
        ]
        # Do not spend reserves on partial trades that cannot fund the next build.
        if len(donors) < len(missing):
            return False
        for give, receive in zip(donors, missing):
            game.trade(game.players.index(self), give, receive)
        return True

    def playAutomatedTurn(self, game: Game) -> None:
        from ..action import BuildCity, BuildRoad, BuildSettlement, FreeRoad

        playerIndex = game.players.index(self)
        game.requireTurn(playerIndex)
        if game.setupStep is not None:
            kind = game.setupKind
            targets = game.buildTargets(playerIndex, kind)
            if kind == "settlement":
                node = max((node for node in game.board.nodes if node.id in targets),
                           key=lambda node: (self.nodeValue(game, node), -node.id))
                target = node.id
            else:
                path = self.chooseSettlementPlan(game)
                target = next((game.targetId(edge) for edge in path or ()
                               if game.targetId(edge) in targets), targets[0])
            game.buildAt(playerIndex, kind, target)
            return
        if game.diceRoll is None:
            game.rollDice(playerIndex)
        if game.thiefMovePending:
            game.moveThief(playerIndex, random.choice(game.thiefTargets(playerIndex)))
        while game.winner is None:
            path = self.chooseSettlementPlan(game)
            city = self.bestCityUpgrade(game)
            settlementValue = (
                self.nodeValue(game, self.settlementObjective)
                if self.settlementObjective is not None else 0
            )
            if (city is not None
                    and self.resourceProductionValue(game, city) > settlementValue
                    and self.tradeFor(game, BuildCity.cost)):
                game.buildAt(playerIndex, "city", city.id)
                continue
            road = next((edge for edge in path or () if edge.owner is None), None)
            if game.freeRoadsRemaining:
                targets = FreeRoad(self, game).getValidTargets()
                if not targets:
                    game.freeRoadsRemaining = 0
                    continue
                road = road if road in targets else targets[0]
                game.buildAt(playerIndex, "road", game.targetId(road))
            elif path is None:
                break
            elif road is not None:
                if not self.tradeFor(game, BuildRoad.cost):
                    break
                game.buildAt(playerIndex, "road", game.targetId(road))
            else:
                if not self.tradeFor(game, BuildSettlement.cost):
                    break
                assert self.settlementObjective is not None
                game.buildAt(playerIndex, "settlement", self.settlementObjective.id)
                self.settlementObjective = None
        if game.winner is None:
            game.endTurn(playerIndex)

    def serialize(self, game: Game | None = None) -> dict[str, object]:
        return {
            "name": self.name,
            "color": self.color.value,
            "isAi": self.isAi,
            "points": self.points,
            "settlementObjective": None if self.settlementObjective is None or game is None else {
                "nodeId": self.settlementObjective.id,
                "expectedResourcesPerTurn": self.nodeValue(game, self.settlementObjective),
            },
            "hasLongestRoad": game is not None and game.longestRoadHolder is self,
            "hasLargestArmy": game is not None and game.largestArmyHolder is self,
            "knightsPlayed": self.knightsPlayed,
            "resources": [resource.value for resource in self.resources],
            "tradeRates": {
                resource.value: game.tradeRate(self, resource) if game is not None else 4
                for resource in Resource
            },
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
