import unittest
from unittest.mock import patch

from backend.src.types.devCard import Knight, VictoryPoint
from backend.src.types.game import Game, GameRuleError


class LargestArmyTests(unittest.TestCase):
    def normalGame(self):
        game = Game(2)
        game.started = True
        game.turnNumber = 1
        game.diceRoll = 8
        return game

    def playKnight(self, game, playerIndex):
        with patch.object(game, "throwDice", return_value=8):
            if game.thiefMovePending:
                game.moveThief(game.currentPlayer, game.thiefTargets(game.currentPlayer)[0])
            if game.devCardPlayed:
                game.endTurn(game.currentPlayer)
            while game.currentPlayer != playerIndex:
                game.endTurn(game.currentPlayer)
        player = game.players[playerIndex]
        player.devCards.append(Knight())
        game.playDevCard(playerIndex, len(player.devCards) - 1, [])

    def test_deck_has_enough_distinct_knights_for_competing_armies(self):
        game = Game()
        knights = [card for card in game.devCardDeck if isinstance(card, Knight)]
        self.assertEqual(len(knights), 14)
        self.assertEqual(len({id(card) for card in knights}), 14)

    def test_only_played_knights_count_and_third_awards_exactly_two_points(self):
        game = self.normalGame()
        player = game.players[0]
        otherCard = VictoryPoint()
        otherCard.used = True
        player.devCards = [Knight(), Knight(), Knight(), otherCard]
        self.assertEqual(player.knightsPlayed, 0)
        for count in (1, 2, 3, 4):
            self.playKnight(game, 0)
            self.assertEqual(player.knightsPlayed, count)
            snapshot = game.serialize()["players"][0]
            self.assertEqual(snapshot["knightsPlayed"], count)
            self.assertEqual(snapshot["hasLargestArmy"], count >= 3)
            self.assertEqual(player.points, 2 if count >= 3 else 0)
            self.assertIs(game.largestArmyHolder, player if count >= 3 else None)
        awards = [entry for entry in game.chat if "Largest Army" in entry["text"]]
        self.assertEqual(len(awards), 1)

    def test_ties_preserve_holder_and_larger_army_transfers_points_once(self):
        game = self.normalGame()
        first, second = game.players
        for _ in range(3):
            self.playKnight(game, 0)
        for _ in range(3):
            self.playKnight(game, 1)
        self.assertIs(game.largestArmyHolder, first)
        self.assertEqual((first.points, second.points), (2, 0))
        self.playKnight(game, 0)
        self.playKnight(game, 1)
        self.assertIs(game.largestArmyHolder, first)
        self.assertEqual((first.points, second.points), (2, 0))
        self.playKnight(game, 1)
        self.assertIs(game.largestArmyHolder, second)
        self.assertEqual((first.points, second.points), (0, 2))
        snapshots = game.serialize()["players"]
        self.assertFalse(snapshots[0]["hasLargestArmy"])
        self.assertTrue(snapshots[1]["hasLargestArmy"])
        awards = [entry for entry in game.chat if "Largest Army" in entry["text"]]
        self.assertEqual(len(awards), 2)
        self.assertIn("taking it from Player 1", awards[-1]["text"])

    def test_award_can_win_game_and_rejected_plays_do_not_count_or_log(self):
        game = self.normalGame()
        player = game.players[0]
        player.points = 5
        self.playKnight(game, 0)
        count = len(game.chat)
        with self.assertRaises(GameRuleError):
            game.playDevCard(0, 0, [])
        self.assertEqual(player.knightsPlayed, 1)
        self.assertEqual(len(game.chat), count)
        self.playKnight(game, 0)
        self.playKnight(game, 0)
        self.assertEqual(player.points, 7)
        self.assertEqual(game.winner, 0)
        self.assertIn("played Knight", game.chat[-2]["text"])
        self.assertIn("Largest Army", game.chat[-1]["text"])
        count = len(game.chat)
        with self.assertRaisesRegex(GameRuleError, "game is over"):
            game.playDevCard(0, 2, [])
        self.assertEqual(player.knightsPlayed, 3)
        self.assertEqual(len(game.chat), count)


if __name__ == "__main__":
    unittest.main()
