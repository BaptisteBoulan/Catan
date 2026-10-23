from collections import Counter
import random
import unittest
from unittest.mock import patch

from backend.src.types.enum import BuildingType, Landscape, Resource
from backend.src.types.game import Game, GameRuleError


class ThiefTests(unittest.TestCase):
    def normalGame(self, playerCount: int = 2) -> Game:
        game = Game(playerCount)
        game.start()
        with patch.object(game, "throwDice", return_value=8):
            while game.setupStep is not None:
                kind = game.setupKind
                game.buildAt(game.currentPlayer, kind, game.buildTargets(game.currentPlayer, kind)[0])
        return game

    def rollSeven(self, game: Game):
        with patch.object(game, "throwDice", return_value=7):
            game.endTurn(game.currentPlayer)
        self.assertTrue(game.thiefMovePending)
        self.assertTrue(game.serializeTurn()["thiefMovePending"])

    def test_starts_on_desert_and_only_moves_after_seven(self):
        game = Game()
        occupied = [tile for tile in game.board.tiles if tile.isOccupiedByThief]
        self.assertEqual(len(occupied), 1)
        self.assertEqual(occupied[0].landscape, Landscape.DESERT)
        for operation in (lambda: game.thiefTargets(0), lambda: game.moveThief(0, 0)):
            with self.assertRaises(GameRuleError):
                operation()
        game.start()
        with self.assertRaises(GameRuleError):
            game.thiefTargets(0)
        game = self.normalGame()
        with self.assertRaises(GameRuleError):
            game.thiefTargets(0)
        self.rollSeven(game)
        player = game.currentPlayer
        old = next(i for i, tile in enumerate(game.board.tiles) if tile.isOccupiedByThief)
        targets = game.thiefTargets(player)
        self.assertNotIn(old, targets)
        self.assertEqual(len(targets), len(game.board.tiles) - 1)
        for operation in (
            lambda: game.thiefTargets(1 - player),
            lambda: game.moveThief(1 - player, targets[0]),
            lambda: game.moveThief(player, old),
            lambda: game.moveThief(player, -1),
            lambda: game.moveThief(player, len(game.board.tiles)),
            lambda: game.buildTargets(player, "road"),
            lambda: game.buildAt(player, "settlement", 0),
            lambda: game.buyDevCard(player),
            lambda: game.trade(player, Resource.WOOD, Resource.ORE),
            lambda: game.endTurn(player),
            lambda: game.rollDice(player),
        ):
            with self.assertRaises(GameRuleError):
                operation()
            self.assertTrue(game.thiefMovePending)
            self.assertTrue(game.board.tiles[old].isOccupiedByThief)
        game.moveThief(player, targets[0])
        self.assertFalse(game.thiefMovePending)
        self.assertEqual(sum(tile.isOccupiedByThief for tile in game.board.tiles), 1)
        self.assertTrue(game.board.tiles[targets[0]].isOccupiedByThief)
        with self.assertRaises(GameRuleError):
            game.moveThief(player, old)
        with patch.object(game, "throwDice", return_value=8):
            game.endTurn(player)
        self.assertFalse(game.thiefMovePending)

    def test_random_half_only_for_attacked_players_over_seven_once_each(self):
        game = self.normalGame(5)
        self.rollSeven(game)
        destination = game.thiefTargets(game.currentPlayer)[0]
        tile = game.board.tiles[destination]
        for node in game.board.nodes:
            node.owner = None
            node.building = BuildingType.NONE
        # Two buildings for player 0 must still cause just one discard.
        for node, owner in zip(tile.nodes, (0, 0, 1, 2, 3, 3)):
            node.owner = game.players[owner]
            node.building = BuildingType.CITY if owner == 1 else BuildingType.SETTLEMENT
        hands = [
            [Resource.WOOD] * 4 + [Resource.ORE] * 4,
            [Resource.SHEEP] * 5 + [Resource.BRICK] * 4,
            [Resource.WHEAT] * 7,
            [],
            [Resource.ORE] * 12,
        ]
        for player, hand in zip(game.players, hands):
            player.resources = hand.copy()
        rng = random.Random(42)
        with patch("backend.src.types.game.random.sample", side_effect=rng.sample) as sample:
            game.moveThief(game.currentPlayer, destination)
            self.assertEqual(sample.call_count, 2)
            self.assertEqual([call.args[1] for call in sample.call_args_list], [4, 4])
        self.assertEqual([len(player.resources) for player in game.players], [4, 5, 7, 0, 12])
        self.assertEqual(game.players[2].resources, hands[2])
        self.assertEqual(game.players[4].resources, hands[4])
        for player, hand in zip(game.players, hands):
            self.assertFalse(Counter(player.resources) - Counter(hand))
        self.assertGreater(len(set(game.players[0].resources)), 1)

    def test_occupied_tile_blocks_production_and_old_tile_resumes(self):
        game = self.normalGame(1)
        old = next(tile for tile in game.board.tiles if tile.isOccupiedByThief)
        old.landscape = Landscape.FOREST
        old.diceNumber = 6
        destination = next(i for i, tile in enumerate(game.board.tiles)
                           if tile is not old and not set(tile.nodes).intersection(old.nodes))
        tile = game.board.tiles[destination]
        tile.landscape = Landscape.MOUNTAINS
        for other in game.board.tiles:
            if other is not old:
                other.diceNumber = 8
        tile.diceNumber = 6
        for node in game.board.nodes:
            node.owner = None
            node.building = BuildingType.NONE
        for node in (old.nodes[0], tile.nodes[0]):
            node.owner = game.players[0]
            node.building = BuildingType.CITY
        self.rollSeven(game)
        game.moveThief(0, destination)
        game.players[0].resources = []
        with patch("backend.src.types.game.random.randint", return_value=3):
            game.endTurn(0)
        self.assertEqual(game.players[0].resources, [Resource.WOOD] * 2)


if __name__ == "__main__":
    unittest.main()
