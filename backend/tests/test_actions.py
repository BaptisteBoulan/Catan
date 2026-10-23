from contextlib import redirect_stdout
from io import StringIO
import unittest
from unittest.mock import patch

from backend.src.types.action import BuildCity, BuildRoad, BuildSettlement, DrawDevCard
from backend.src.types.board import Board
from backend.src.types.devCard import Knight
from backend.src.types.enum import BuildingType, Color, Resource
from backend.src.types.game import Game
from backend.src.types.player import Player


class ActionTests(unittest.TestCase):
    def setUp(self):
        self.game = Game.__new__(Game)
        self.game.board = Board(1)
        self.game.devCardDeck = [Knight()]
        self.player = Player("Alice", list(Color)[0])
        self.other = Player("Bob", list(Color)[1])

    def fund(self, action):
        self.player.resources = [resource for resource, count in action.cost.items()
                                 for _ in range(count)]

    def test_build_actions_check_select_and_execute(self):
        for actionType in (BuildRoad, BuildSettlement, BuildCity):
            with self.subTest(action=actionType.__name__):
                self.setUp()
                edge = self.game.board.edges[0]
                node = edge.node1
                if actionType is BuildRoad:
                    self.game.build(self.player, node, BuildingType.SETTLEMENT)
                    target = edge
                elif actionType is BuildSettlement:
                    edge.owner = self.player
                    target = node
                else:
                    self.game.build(self.player, node, BuildingType.SETTLEMENT)
                    target = node
                action = actionType(self.player, self.game)
                self.assertFalse(action.canBeExecuted())
                self.fund(action)
                before = list(self.player.resources)
                points = self.player.points
                self.assertTrue(action.canBeExecuted())
                self.assertFalse(action.execute())
                self.assertTrue(action.chooseTarget(target))
                self.assertEqual(self.player.resources, before)
                self.assertEqual(self.player.points, points)
                self.assertTrue(action.execute())
                self.assertIs(target.owner, self.player)
                self.assertEqual(self.player.resources, [])
                self.assertFalse(action.execute())
                if actionType is not BuildRoad:
                    self.assertEqual(self.player.points, points + 1)
                    expected = BuildingType.CITY if actionType is BuildCity else BuildingType.SETTLEMENT
                    self.assertEqual(node.building, expected)

    def test_prompt_retries_invalid_input_and_can_cancel(self):
        node = self.game.board.nodes[0]
        self.game.build(self.player, node, BuildingType.SETTLEMENT)
        action = BuildCity(self.player, self.game)
        self.fund(action)
        with patch("builtins.input", side_effect=["bad", "0", "2", "1"]), redirect_stdout(StringIO()):
            self.assertTrue(action.chooseTarget())
        self.assertIs(action.target, node)
        action = BuildCity(self.player, self.game)
        with patch("builtins.input", return_value=""), redirect_stdout(StringIO()):
            self.assertFalse(action.chooseTarget())
        self.assertIsNone(action.target)

    def test_execution_rechecks_target_and_resources_without_partial_payment(self):
        node = self.game.board.nodes[0]
        self.game.build(self.player, node, BuildingType.SETTLEMENT)
        action = BuildCity(self.player, self.game)
        self.fund(action)
        self.assertTrue(action.chooseTarget(node))
        before = list(self.player.resources)
        node.owner = self.other
        self.assertFalse(action.execute())
        self.assertEqual(self.player.resources, before)
        node.owner = self.player
        self.player.resources.remove(Resource.WHEAT)
        before = list(self.player.resources)
        self.assertFalse(action.execute())
        self.assertEqual(self.player.resources, before)
        self.assertEqual(node.building, BuildingType.SETTLEMENT)

    def test_invalid_or_missing_targets_are_unavailable(self):
        for actionType in (BuildRoad, BuildSettlement, BuildCity):
            with self.subTest(action=actionType.__name__):
                action = actionType(self.player, self.game)
                self.fund(action)
                self.assertFalse(action.canBeExecuted())
                with patch("builtins.input") as prompt:
                    self.assertFalse(action.chooseTarget())
                prompt.assert_not_called()
                self.assertFalse(action.execute())

    def test_roads_cannot_cross_opponents_buildings(self):
        edge = self.game.board.edges[0]
        nextEdge = next(candidate for candidate in edge.node1.edges if candidate is not edge)
        nextEdge.owner = self.player
        edge.node1.owner = self.other
        action = BuildRoad(self.player, self.game)
        self.fund(action)
        self.assertNotIn(edge, action.getValidTargets())
        self.assertFalse(action.chooseTarget(edge))

    def test_settlement_distance_rule(self):
        edge = self.game.board.edges[0]
        edge.owner = self.player
        self.game.build(self.other, edge.node2, BuildingType.SETTLEMENT)
        action = BuildSettlement(self.player, self.game)
        self.fund(action)
        self.assertNotIn(edge.node1, action.getValidTargets())

    def test_draw_card_needs_no_target(self):
        action = DrawDevCard(self.player, self.game)
        self.assertFalse(action.execute())
        self.fund(action)
        before = list(self.player.resources)
        self.assertTrue(action.canBeExecuted())
        with patch("builtins.input") as prompt:
            self.assertTrue(action.chooseTarget())
        prompt.assert_not_called()
        self.assertEqual(self.player.resources, before)
        self.assertTrue(action.execute())
        self.assertEqual(len(self.player.devCards), 1)
        self.assertEqual(self.player.resources, [])
        self.fund(action)
        self.assertFalse(action.canBeExecuted())
        self.assertFalse(action.execute())
        self.assertEqual(self.player.resources, before)

    def test_random_turn_does_not_prompt(self):
        self.game.board.edges[0].owner = self.player
        action = BuildSettlement(self.player, self.game)
        self.fund(action)
        before = list(self.player.resources)
        with patch.object(self.game, "runTurn"), patch("builtins.input") as prompt, redirect_stdout(StringIO()):
            self.game.runRandomTurn(self.player)
        prompt.assert_not_called()
        self.assertLess(len(self.player.resources), len(before))
        self.assertTrue(self.player.points > 0 or sum(
            edge.owner is self.player for edge in self.game.board.edges) > 1)


if __name__ == "__main__":
    unittest.main()