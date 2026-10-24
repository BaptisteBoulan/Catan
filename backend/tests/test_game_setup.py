import random
import unittest
from unittest.mock import patch

from backend.src.types.enum import BuildingType, Resource
from backend.src.types.game import Game, GameRuleError


class GameSetupTests(unittest.TestCase):
    def completeSetup(self, game: Game) -> list[int]:
        order = []
        while game.setupStep is not None:
            player = game.currentPlayer
            order.append(player)
            settlement = game.buildTargets(player, "settlement")[0]
            game.buildAt(player, "settlement", settlement)
            node = next(node for node in game.board.nodes if node.id == settlement)
            roads = game.buildTargets(player, "road")
            self.assertTrue(roads)
            self.assertTrue(all(node in (game.board.edges[i].node1, game.board.edges[i].node2)
                                for i in roads))
            self.assertEqual(game.currentPlayer, player)
            game.buildAt(player, "road", roads[0])
        if game.thiefMovePending:
            game.moveThief(game.currentPlayer, game.thiefTargets(game.currentPlayer)[0])
        return order

    def test_empty_lobby_and_snake_order_for_all_player_counts(self):
        for count in range(1, 6):
            with self.subTest(players=count):
                game = Game(count)
                self.assertTrue(all(node.owner is None for node in game.board.nodes))
                self.assertTrue(all(edge.owner is None for edge in game.board.edges))
                game.start()
                self.assertEqual(game.turnNumber, 0)
                with patch.object(game, "throwDice", return_value=7) as throw:
                    self.assertEqual(self.completeSetup(game),
                                     list(range(count)) + list(reversed(range(count))))
                    throw.assert_called_once_with()
                self.assertEqual(game.currentPlayer, 0)
                self.assertEqual(game.turnNumber, 1)
                self.assertEqual(game.diceRoll, 7)
                self.assertIsNone(game.serializeTurn()["setup"])
                for player in game.players:
                    nodes = [node for node in game.board.nodes if node.owner is player]
                    self.assertEqual(len(nodes), 2)
                    self.assertTrue(all(node.building == BuildingType.SETTLEMENT for node in nodes))
                    self.assertEqual(sum(edge.owner is player for edge in game.board.edges), 2)
                    self.assertEqual(player.points, 2)
                    self.assertEqual(player.resources, [])
                with self.assertRaises(GameRuleError):
                    game.rollDice(0)
                with patch.object(game, "throwDice", return_value=8) as throw:
                    game.endTurn(0)
                    throw.assert_called_once_with()
                self.assertEqual(game.currentPlayer, 1 % count)
                self.assertEqual(game.diceRoll, 8)
                self.assertEqual(game.turnNumber, 2)

    def test_setup_rejects_wrong_player_kind_and_normal_actions(self):
        game = Game(2)
        with self.assertRaises(GameRuleError):
            game.buildTargets(0, "settlement")
        game.start()
        for operation in (
            lambda: game.start(),
            lambda: game.buildTargets(1, "settlement"),
            lambda: game.buildTargets(0, "road"),
            lambda: game.buildTargets(0, "city"),
            lambda: game.rollDice(0),
            lambda: game.buyDevCard(0),
            lambda: game.endTurn(0),
            lambda: game.buildAt(0, "settlement", -1),
        ):
            with self.assertRaises(GameRuleError):
                operation()
        self.assertEqual(game.setupStep, 0)
        self.assertEqual(game.setupKind, "settlement")

    def test_spacing_and_road_must_touch_latest_settlement(self):
        game = Game(1)
        game.start()
        first = game.buildTargets(0, "settlement")[0]
        game.buildAt(0, "settlement", first)
        with self.assertRaises(GameRuleError):
            game.buildTargets(0, "settlement")
        firstRoad = game.buildTargets(0, "road")[0]
        game.buildAt(0, "road", firstRoad)
        node = next(node for node in game.board.nodes if node.id == first)
        targets = game.buildTargets(0, "settlement")
        self.assertNotIn(first, targets)
        self.assertTrue(all(neighbor.id not in targets for neighbor in node.neighbors))
        self.assertEqual(game.serializeTurn()["setup"], {"round": 2, "kind": "settlement"})
        game.buildAt(0, "settlement", targets[0])
        roads = game.buildTargets(0, "road")
        unrelated = next(i for i, edge in enumerate(game.board.edges)
                         if edge.owner is None and i not in roads)
        with self.assertRaises(GameRuleError):
            game.buildAt(0, "road", unrelated)
        with self.assertRaises(GameRuleError):
            game.buildAt(0, "road", firstRoad)
        self.assertEqual(game.setupKind, "road")
        game.buildAt(0, "road", roads[0])

    def test_paid_builds_keep_their_normal_costs_and_rules(self):
        game = Game(1)
        game.start()
        self.completeSetup(game)
        player = game.players[0]
        player.resources = []
        with self.assertRaises(GameRuleError):
            game.buildTargets(0, "road")
        player.resources = [Resource.WOOD, Resource.BRICK]
        game.buildAt(0, "road", game.buildTargets(0, "road")[0])
        self.assertEqual(player.resources, [])
        player.resources = [Resource.ORE] * 3 + [Resource.WHEAT] * 2
        game.buildAt(0, "city", game.buildTargets(0, "city")[0])
        self.assertEqual(player.resources, [])
        self.assertEqual(player.points, 3)

    def test_automatic_roll_distributes_resources_once_and_reads_do_not_roll(self):
        game = Game(2)
        game.start()
        with patch.object(game, "throwDice", return_value=7):
            self.completeSetup(game)
        node = next(node for node in game.board.nodes if node.owner is game.players[0])
        tile = next(tile for tile in game.board.tiles
                    if node in tile.nodes and tile.landscape.resource is not None)
        tile.isOccupiedByThief = False
        tile.diceNumber = 6
        with patch("backend.src.types.game.random.randint", return_value=3) as dice:
            game.endTurn(0)
            self.assertEqual(dice.call_count, 2)
            self.assertEqual(game.diceRoll, 6)
            self.assertIn(tile.landscape.resource, game.players[0].resources)
            resources = [list(player.resources) for player in game.players]
            game.serialize()
            game.serializeTurn()
            with self.assertRaises(GameRuleError):
                game.rollDice(1)
            self.assertEqual(dice.call_count, 2)
            self.assertEqual([player.resources for player in game.players], resources)

    def test_trade_all_resource_pairs_and_repeat_trades(self):
        game = Game(1)
        game.start()
        self.completeSetup(game)
        for port in game.board.ports:
            port.owner = None
        player = game.players[0]
        for give in Resource:
            for receive in Resource:
                if give == receive:
                    continue
                with self.subTest(give=give, receive=receive):
                    player.resources = [give] * 8 + [receive]
                    game.trade(0, give, receive)
                    self.assertEqual(player.resources.count(give), 4)
                    self.assertEqual(player.resources.count(receive), 2)
                    game.trade(0, give, receive)
                    self.assertEqual(player.resources, [receive] * 3)

    def test_invalid_trades_preserve_resources(self):
        game = Game(2)
        player = game.players[0]
        player.resources = [Resource.WOOD] * 4
        with self.assertRaises(GameRuleError):
            game.trade(0, Resource.WOOD, Resource.ORE)
        game.start()
        with self.assertRaises(GameRuleError):
            game.trade(0, Resource.WOOD, Resource.ORE)
        with patch.object(game, "throwDice", return_value=7):
            self.completeSetup(game)
        for port in game.board.ports:
            port.owner = None
        for operation in (
            lambda: game.trade(1, Resource.WOOD, Resource.ORE),
            lambda: game.trade(0, Resource.WOOD, Resource.WOOD),
            lambda: game.trade(0, Resource.BRICK, Resource.ORE),
        ):
            with self.assertRaises(GameRuleError):
                operation()
            self.assertEqual(player.resources, [Resource.WOOD] * 4)
        player.resources.pop()
        with self.assertRaises(GameRuleError):
            game.trade(0, Resource.WOOD, Resource.ORE)
        self.assertEqual(player.resources, [Resource.WOOD] * 3)

    def test_demo_does_not_roll_twice_for_automatic_turns(self):
        game = Game(2)
        with patch.object(game, "throwDice", return_value=7) as throw:
            game.runRandomRounds(2)
            self.assertEqual(throw.call_count, 5)
        self.assertEqual(game.turnNumber, 5)
        self.assertEqual(game.currentPlayer, 0)
        self.assertEqual(game.diceRoll, 7)

    def test_demo_completes_setup_even_without_simulated_rounds(self):
        random.seed(42)
        game = Game(5)
        game.runRandomRounds(0)
        self.assertTrue(game.started)
        self.assertIsNone(game.setupStep)
        self.assertEqual([player.points for player in game.players], [2] * 5)


if __name__ == "__main__":
    unittest.main()
