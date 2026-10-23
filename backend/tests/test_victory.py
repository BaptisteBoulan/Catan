import unittest
from unittest.mock import patch

from backend.src.types.action import BuildSettlement
from backend.src.types.devCard import VictoryPoint
from backend.src.types.enum import BuildingType, Resource
from backend.src.types.game import Game, GameRuleError


class VictoryTests(unittest.TestCase):
    def normalGame(self):
        game = Game(2)
        game.start()
        with patch("backend.src.types.game.random.randint", return_value=3):
            while game.setupStep is not None:
                kind = game.setupKind
                game.buildAt(game.currentPlayer, kind, game.buildTargets(game.currentPlayer, kind)[0])
        return game

    def test_city_wins_at_seven_not_six_and_freezes_actions(self):
        game = self.normalGame()
        player = game.players[0]
        player.points = 5
        player.resources = [Resource.ORE] * 6 + [Resource.WHEAT] * 4
        game.buildAt(0, "city", game.buildTargets(0, "city")[0])
        self.assertEqual(player.points, 6)
        self.assertIsNone(game.winner)
        game.buildAt(0, "city", game.buildTargets(0, "city")[0])
        self.assertEqual(player.points, 7)
        self.assertEqual(game.winner, 0)
        before = game.serialize()
        for operation in (
            lambda: game.endTurn(0),
            lambda: game.rollDice(0),
            lambda: game.buyDevCard(0),
            lambda: game.trade(0, Resource.WOOD, Resource.ORE),
            lambda: game.buildTargets(0, "road"),
            lambda: game.buildAt(0, "city", 0),
            lambda: game.playDevCard(0, 0, []),
            lambda: game.moveThief(0, 0),
        ):
            with self.assertRaisesRegex(GameRuleError, "game is over"):
                operation()
            self.assertEqual(game.serialize(), before)
        self.assertEqual(before["turn"]["winner"], 0)
        self.assertEqual(before["turn"]["winningPoints"], 7)

    def test_settlement_wins_and_first_winner_is_preserved(self):
        game = self.normalGame()
        player = game.players[0]
        player.points = 6
        node = BuildSettlement(player, game).getAvailableNodes()[0]
        next(iter(node.edges)).owner = player
        player.resources = [Resource.WOOD, Resource.BRICK, Resource.SHEEP, Resource.WHEAT]
        game.buildAt(0, "settlement", game.buildTargets(0, "settlement")[0])
        self.assertEqual(player.points, 7)
        self.assertEqual(game.winner, 0)
        game.players[1].points = 8
        game.checkVictory(game.players[1])
        self.assertEqual(game.winner, 0)

    def test_playing_victory_point_finishes_game_and_disables_cards(self):
        game = self.normalGame()
        player = game.players[0]
        player.points = 6
        player.devCards = [VictoryPoint(), VictoryPoint()]
        game.playDevCard(0, 0, [])
        self.assertTrue(player.devCards[0].used)
        self.assertEqual(player.points, 7)
        self.assertEqual(game.winner, 0)
        self.assertEqual(game.devCardUnavailableReason(0, player.devCards[1]), "The game is over.")
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 1, [])
        self.assertFalse(player.devCards[1].used)

    def test_dice_faces_match_total_and_survive_reads(self):
        game = self.normalGame()
        for values in ((1, 6), (2, 5), (3, 4), (6, 6), (1, 1)):
            with patch("backend.src.types.game.random.randint", side_effect=values) as dice:
                game.endTurn(game.currentPlayer)
                self.assertEqual(dice.call_count, 2)
                turn = game.serializeTurn()
                self.assertEqual(turn["diceValues"], values)
                self.assertEqual(turn["diceRoll"], sum(values))
                self.assertEqual(game.serialize()["turn"], turn)
            if game.thiefMovePending:
                game.moveThief(game.currentPlayer, game.thiefTargets(game.currentPlayer)[0])

    def test_demo_stops_after_winning(self):
        game = self.normalGame()
        player = game.players[0]
        player.points = 6
        player.resources = [Resource.ORE] * 3 + [Resource.WHEAT] * 2
        game.runRandomRounds(100)
        self.assertEqual(game.winner, 0)
        self.assertEqual(player.points, 7)
        self.assertEqual(sum(node.building == BuildingType.CITY
                             for node in game.board.nodes), 1)
