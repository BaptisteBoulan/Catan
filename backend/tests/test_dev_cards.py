import unittest
from unittest.mock import patch

from backend.src.types.action import FreeRoad
from backend.src.types.devCard import Knight, Monopoly, RoadBuilding, VictoryPoint, YearOfPlenty
from backend.src.types.enum import Resource
from backend.src.types.game import Game, GameRuleError


class DevCardTests(unittest.TestCase):
    def normalGame(self, playerCount: int = 3) -> Game:
        game = Game(playerCount)
        game.start()
        with patch.object(game, "throwDice", return_value=8):
            while game.setupStep is not None:
                kind = game.setupKind
                game.buildAt(game.currentPlayer, kind, game.buildTargets(game.currentPlayer, kind)[0])
        return game

    def nextRound(self, game: Game):
        with patch.object(game, "throwDice", return_value=8):
            for _ in game.players:
                game.endTurn(game.currentPlayer)

    def test_purchase_waits_until_next_turn_and_deck_instances_are_distinct(self):
        game = self.normalGame()
        self.assertEqual(len({id(card) for card in game.devCardDeck}), len(game.devCardDeck))
        game.devCardDeck = [Knight(), Knight()]
        player = game.players[0]
        player.resources = [Resource.SHEEP, Resource.WHEAT, Resource.ORE] * 2
        game.buyDevCard(0)
        game.buyDevCard(0)
        self.assertEqual(player.devCards[0].acquiredTurn, game.turnNumber)
        self.assertIn("next turn", game.devCardUnavailableReason(0, player.devCards[0]))
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 0, [])
        self.nextRound(game)
        self.assertIsNone(game.devCardUnavailableReason(0, player.devCards[0]))
        game.playDevCard(0, 0, [])
        self.assertTrue(player.devCards[0].used)
        self.assertFalse(player.devCards[1].used)
        self.assertEqual(len(player.devCards), 2)

    def test_knight_moves_thief_and_blocks_other_actions_until_resolved(self):
        game = self.normalGame()
        game.players[0].devCards = [Knight(), Knight()]
        game.playDevCard(0, 0, [])
        self.assertTrue(game.thiefMovePending)
        with self.assertRaises(GameRuleError):
            game.endTurn(0)
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 1, [])
        destination = game.thiefTargets(0)[0]
        game.moveThief(0, destination)
        self.assertTrue(game.board.tiles[destination].isOccupiedByThief)
        self.assertFalse(game.thiefMovePending)
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 1, [])
        self.nextRound(game)
        game.playDevCard(0, 1, [])
        self.assertTrue(game.thiefMovePending)
        self.assertTrue(all(card.used for card in game.players[0].devCards))

    def test_monopoly_takes_only_chosen_resource_from_every_opponent(self):
        game = self.normalGame()
        game.players[0].devCards = [Monopoly()]
        game.players[0].resources = [Resource.ORE]
        game.players[1].resources = [Resource.WOOD] * 3 + [Resource.BRICK]
        game.players[2].resources = [Resource.WOOD, Resource.SHEEP]
        game.playDevCard(0, 0, [Resource.WOOD])
        self.assertEqual(game.chat[-1]["text"], "Player 1 played Monopoly (wood).")
        self.assertEqual(game.players[0].resources, [Resource.ORE] + [Resource.WOOD] * 4)
        self.assertEqual(game.players[1].resources, [Resource.BRICK])
        self.assertEqual(game.players[2].resources, [Resource.SHEEP])

    def test_plenty_allows_matching_or_distinct_resources(self):
        for choices in ([Resource.WHEAT, Resource.ORE], [Resource.SHEEP] * 2):
            game = self.normalGame()
            player = game.players[0]
            player.devCards = [YearOfPlenty()]
            player.resources = []
            game.playDevCard(0, 0, choices)
            self.assertEqual(player.resources, choices)
            self.assertEqual(game.chat[-1]["text"],
                             f"Player 1 played Year of Plenty ({', '.join(r.value for r in choices)}).")

    def test_victory_point_is_immediate_once_and_does_not_use_action_limit(self):
        game = self.normalGame()
        player = game.players[0]
        point = VictoryPoint()
        point.acquiredTurn = game.turnNumber
        player.devCards = [point, YearOfPlenty(), VictoryPoint()]
        points = player.points
        game.playDevCard(0, 0, [])
        self.assertEqual(player.points, points + 1)
        self.assertFalse(game.devCardPlayed)
        game.playDevCard(0, 1, [Resource.WOOD] * 2)
        game.playDevCard(0, 2, [])
        self.assertEqual(player.points, points + 2)
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 0, [])
        self.assertEqual(player.points, points + 2)

    def test_two_free_roads_resume_and_use_normal_connectivity(self):
        game = self.normalGame()
        player = game.players[0]
        player.resources = []
        player.devCards = [RoadBuilding()]
        game.playDevCard(0, 0, [])
        self.assertEqual(game.serializeTurn()["freeRoadsRemaining"], 2)
        for operation in (
            lambda: game.endTurn(0),
            lambda: game.buyDevCard(0),
            lambda: game.trade(0, Resource.WOOD, Resource.ORE),
            lambda: game.buildTargets(0, "settlement"),
            lambda: game.buildTargets(1, "road"),
            lambda: game.buildAt(0, "road", -1),
        ):
            with self.assertRaises(GameRuleError):
                operation()
            self.assertEqual(game.freeRoadsRemaining, 2)
        initialTargets = game.buildTargets(0, "road")
        game.buildAt(0, "road", initialTargets[0])
        self.assertEqual(game.freeRoadsRemaining, 1)
        secondTargets = game.buildTargets(0, "road")
        self.assertNotIn(initialTargets[0], secondTargets)
        extension = next(target for target in secondTargets if target not in initialTargets)
        game.buildAt(0, "road", extension)
        self.assertEqual(game.freeRoadsRemaining, 0)
        self.assertEqual(player.resources, [])
        self.assertIs(game.board.edges[extension].owner, player)
        with self.assertRaises(GameRuleError):
            game.buildTargets(0, "road")

    def test_road_building_rejects_no_targets_and_finishes_if_only_one_remains(self):
        game = self.normalGame()
        player = game.players[0]
        player.devCards = [RoadBuilding()]
        available = FreeRoad(player, game).getValidTargets()[0]
        for edge in game.board.edges:
            if edge is not available:
                edge.owner = game.players[1]
        game.playDevCard(0, 0, [])
        game.buildAt(0, "road", game.targetId(available))
        self.assertEqual(game.freeRoadsRemaining, 0)
        self.nextRound(game)
        player.devCards.append(RoadBuilding())
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 1, [])
        self.assertFalse(player.devCards[1].used)

    def test_invalid_choices_and_timing_do_not_consume_card(self):
        for card, choices in (
            (Monopoly(), []), (Monopoly(), [Resource.WOOD] * 2),
            (YearOfPlenty(), [Resource.ORE]), (Knight(), [Resource.WOOD]),
            (VictoryPoint(), [Resource.ORE]), (RoadBuilding(), [Resource.WOOD]),
        ):
            game = self.normalGame()
            game.players[0].devCards = [card]
            for player, index, resources in ((0, -1, []), (0, 4, []), (1, 0, []), (0, 0, choices)):
                with self.assertRaises(GameRuleError):
                    game.playDevCard(player, index, resources)
                self.assertFalse(card.used)
                self.assertFalse(game.devCardPlayed)
                self.assertFalse(any("played" in entry["text"] for entry in game.chat))
        game = Game()
        game.players[0].devCards = [VictoryPoint()]
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 0, [])
        game.start()
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 0, [])

    def test_serialization_exposes_status_for_refresh(self):
        game = self.normalGame()
        cards = [Knight(), VictoryPoint(), Monopoly()]
        cards[0].acquiredTurn = game.turnNumber
        cards[1].used = True
        game.players[0].devCards = cards
        serialized = game.serialize()["players"][0]["devCards"]
        self.assertIn("next turn", serialized[0]["unavailableReason"])
        self.assertTrue(serialized[1]["used"])
        self.assertIsNone(serialized[2]["unavailableReason"])
        self.assertEqual(serialized[0]["acquiredTurn"], game.turnNumber)


if __name__ == "__main__":
    unittest.main()
