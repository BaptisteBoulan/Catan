import random
import unittest

from backend.src.types.enum import BuildingType
from backend.src.types.game import Game


class InitialRoadTests(unittest.TestCase):
    def test_each_starting_building_has_one_owned_road(self):
        randomState = random.getstate()
        self.addCleanup(random.setstate, randomState)
        for playerCount in range(2, 6):
            for seed in range(20):
                with self.subTest(players=playerCount, seed=seed):
                    random.seed(seed)
                    game = Game(playerCount=playerCount)
                    roads = [edge for edge in game.board.edges if edge.owner is not None]
                    self.assertEqual(len(roads), 2 * playerCount)
                    for player in game.players:
                        ownedRoads = [edge for edge in roads if edge.owner is player]
                        self.assertEqual(len(ownedRoads), 2)
                        self.assertEqual(player.points, 3)
                        buildings = [node for node in game.board.nodes if node.owner is player]
                        self.assertEqual(
                            {node.building for node in buildings},
                            {BuildingType.SETTLEMENT, BuildingType.CITY},
                        )
                        for node in buildings:
                            self.assertEqual(
                                sum(edge.node1 is node or edge.node2 is node for edge in ownedRoads),
                                1,
                            )
                    serialized = game.serialize()
                    for index in range(playerCount):
                        self.assertEqual(
                            sum(edge["owner"] == index for edge in serialized["board"]["edges"]),
                            2,
                        )


if __name__ == "__main__":
    unittest.main()
