import unittest
from unittest.mock import patch

from backend.src.types.action import BuildRoad, BuildSettlement, FreeRoad, SetupRoad
from backend.src.types.board import Node
from backend.src.types.devCard import VictoryPoint
from backend.src.types.enum import BuildingType, Resource
from backend.src.types.game import Game, GameRuleError


class VictoryTests(unittest.TestCase):
    def roadNetwork(self, game, player, connections):
        nodes = {index: Node(index, index, 0)
                 for connection in connections for index in connection}
        edges = [game.board.getOrCreateEdge(nodes[start], nodes[end])
                 for start, end in connections]
        for edge in edges:
            edge.owner = player
        return nodes, edges

    def test_longest_road_counts_trails_not_branches_or_repeated_edges(self):
        cases = (
            ([(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)], 2, 5),
            ([(0, 1), (1, 2), (1, 3)], 0, 2),
            ([(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0)], 2, 6),
            ([(0, 1), (1, 2), (2, 0), (0, 3), (3, 4)], 3, 5),
        )
        for connections, added, expected in cases:
            with self.subTest(connections=connections):
                game = Game(2)
                _, edges = self.roadNetwork(game, game.players[0], connections)
                self.assertEqual(game.longestRoadThrough(edges[added]), expected)

    def test_longest_road_stops_at_opponent_buildings(self):
        game = Game(2)
        nodes, edges = self.roadNetwork(game, game.players[0],
                                       [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)])
        nodes[2].owner = game.players[1]
        self.assertEqual(game.longestRoadThrough(edges[2]), 3)
        nodes[2].owner = game.players[0]
        self.assertEqual(game.longestRoadThrough(edges[2]), 5)

    def test_longest_road_diagnostics_include_short_roads_ties_and_cuts(self):
        game = Game(2)
        first, second = game.players
        first.name, second.name = "Alice", "Bob"
        nodes, edges = self.roadNetwork(game, first,
                                       [(index, index + 1) for index in range(5)])
        with patch("builtins.print") as output:
            game.updateLongestRoad(edges[0])
        output.assert_called_once_with(
            "[Longest Road] Alice: longest road through 0-1 = 5; "
            "current award: unclaimed (length 0)", flush=True)

        _, rivalEdges = self.roadNetwork(game, second,
                                        [(index, index + 1) for index in range(5)])
        with patch("builtins.print") as output:
            game.updateLongestRoad(rivalEdges[0])
        output.assert_called_once_with(
            "[Longest Road] Bob: longest road through 0-1 = 5; "
            "current award: Alice (length 5)", flush=True)
        self.assertIs(game.longestRoadHolder, first)

        with patch("builtins.print") as output:
            game.build(second, nodes[2], BuildingType.SETTLEMENT)
        self.assertEqual(output.call_count, 10)
        self.assertIn(
            "[Longest Road] Alice: longest road through 0-1 = 2; "
            "current award: Alice (length 5)",
            [call.args[0] for call in output.call_args_list])
        self.assertIs(game.longestRoadHolder, second)

        with patch("builtins.print") as output:
            game.updateLongestRoad(edges[0])
        output.assert_called_once_with(
            "[Longest Road] Alice: longest road through 0-1 = 2; "
            "current award: Bob (length 5)", flush=True)

    def test_longest_road_minimum_ties_transfer_and_victory(self):
        game = Game(2)
        first, second = game.players
        _, firstEdges = self.roadNetwork(game, first, [(index, index + 1) for index in range(6)])
        firstEdges[-1].owner = None
        firstEdges[-2].owner = None
        game.updateLongestRoad(firstEdges[0])
        self.assertIsNone(game.longestRoadHolder)
        firstEdges[-2].owner = first
        game.updateLongestRoad(firstEdges[-2])
        self.assertIs(game.longestRoadHolder, first)
        self.assertEqual(first.points, 2)
        _, secondEdges = self.roadNetwork(game, second, [(index, index + 1) for index in range(6)])
        secondEdges[-1].owner = None
        game.updateLongestRoad(secondEdges[0])
        self.assertIs(game.longestRoadHolder, first)
        self.assertEqual(second.points, 0)
        second.points = 5
        secondEdges[-1].owner = second
        game.updateLongestRoad(secondEdges[-1])
        self.assertIs(game.longestRoadHolder, second)
        self.assertEqual(game.longestRoadLength, 6)
        self.assertEqual(first.points, 0)
        self.assertEqual(second.points, 7)
        self.assertEqual(game.winner, 1)
        snapshots = game.serialize()["players"]
        self.assertFalse(snapshots[0]["hasLongestRoad"])
        self.assertTrue(snapshots[1]["hasLongestRoad"])
        awards = [entry for entry in game.chat if "Longest Road" in entry["text"]]
        self.assertEqual(len(awards), 2)
        self.assertIn("taking it from Player 1", awards[-1]["text"])

    def test_all_road_actions_update_longest_road(self):
        for actionType in (BuildRoad, FreeRoad, SetupRoad):
            with self.subTest(action=actionType.__name__):
                game = Game(2)
                player = game.players[0]
                nodes, edges = self.roadNetwork(game, player,
                                               [(index, index + 1) for index in range(6)])
                edges[-1].owner = None
                game.setupNode = nodes[6]
                player.resources = [Resource.WOOD, Resource.BRICK]
                self.assertTrue(actionType(player, game, edges[-1]).execute())
                self.assertEqual(len(game.chat), 2)
                self.assertEqual(game.chat[0]["text"], "Player 1 built a road.")
                self.assertIn("Longest Road (+2 victory points)", game.chat[1]["text"])
                self.assertEqual(game.longestRoadLength, 6)
                self.assertEqual(player.points, 2)
                self.assertFalse(FreeRoad(player, game, edges[0]).execute())
                self.assertEqual(player.points, 2)
                self.assertEqual(len(game.chat), 2)

    def test_settlement_breaks_longest_road_and_reassigns_award(self):
        for competingLengths, expectedHolder in (((5, 0), 1), ((5, 5), None), ((4, 0), None)):
            with self.subTest(competingLengths=competingLengths):
                game = Game(3)
                nodes, edges = self.roadNetwork(game, game.players[0],
                                               [(index, index + 1) for index in range(6)])
                game.updateLongestRoad(edges[0])
                for player, length in zip(game.players[1:], competingLengths):
                    self.roadNetwork(game, player, [(index, index + 1) for index in range(length)])
                game.build(game.players[2], nodes[2], BuildingType.SETTLEMENT)
                self.assertIs(game.longestRoadHolder,
                              None if expectedHolder is None else game.players[expectedHolder])
                self.assertEqual(game.players[0].points, 0)
                self.assertEqual(game.players[1].points, 2 if expectedHolder == 1 else 0)
                self.assertIn("built a settlement", game.chat[-2]["text"])
                self.assertIn("Longest Road", game.chat[-1]["text"])
                self.assertIn("awarded" if expectedHolder is not None else "lost",
                              game.chat[-1]["text"])

    def test_holder_keeps_award_when_broken_road_still_ties(self):
        game = Game(2)
        nodes, edges = self.roadNetwork(game, game.players[0],
                                       [(index, index + 1) for index in range(8)])
        game.updateLongestRoad(edges[0])
        self.roadNetwork(game, game.players[1], [(index, index + 1) for index in range(7)])
        game.build(game.players[1], nodes[1], BuildingType.SETTLEMENT)
        self.assertIs(game.longestRoadHolder, game.players[0])
        self.assertEqual(game.longestRoadLength, 7)
        self.assertEqual(game.players[0].points, 2)

    def test_breaking_unclaimed_tie_awards_remaining_longest_road(self):
        game = Game(3)
        nodes, edges = self.roadNetwork(game, game.players[0],
                                       [(index, index + 1) for index in range(6)])
        game.updateLongestRoad(edges[0])
        rivalNodes, _ = self.roadNetwork(game, game.players[1],
                                        [(index, index + 1) for index in range(5)])
        self.roadNetwork(game, game.players[2], [(index, index + 1) for index in range(5)])
        game.build(game.players[1], nodes[2], BuildingType.SETTLEMENT)
        self.assertIsNone(game.longestRoadHolder)
        game.build(game.players[0], rivalNodes[2], BuildingType.SETTLEMENT)
        self.assertIs(game.longestRoadHolder, game.players[2])
        self.assertEqual(game.players[2].points, 2)

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
