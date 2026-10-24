import math
import random
import unittest
from collections import Counter

from backend.src.types.action import FreeRoad
from backend.src.types.board import Board
from backend.src.types.enum import BuildingType, Resource
from backend.src.types.game import Game, GameRuleError


class PortTests(unittest.TestCase):
    def test_random_ports_are_spaced_coastal_edges_with_exact_distribution(self):
        layouts = set()
        for seed in range(40):
            with self.subTest(seed=seed):
                state = random.getstate()
                try:
                    random.seed(seed)
                    board = Board()
                finally:
                    random.setstate(state)
                self.assertEqual(len(board.ports), 9)
                self.assertEqual(Counter(port.resource for port in board.ports),
                                 Counter(list(Resource) + [None] * 4))
                coastal = [edge for edge in board.edges
                           if sum(edge in tile.edges for tile in board.tiles) == 1]
                coastal.sort(key=lambda edge: math.atan2(
                    edge.node1.y + edge.node2.y, edge.node1.x + edge.node2.x))
                used = set()
                indices = []
                for port in board.ports:
                    self.assertIn(port.edge, coastal)
                    self.assertIn(port.edge.node2, port.edge.node1.neighbors)
                    self.assertIsNone(port.owner)
                    nodes = {port.edge.node1, port.edge.node2}
                    self.assertTrue(used.isdisjoint(nodes))
                    used.update(nodes)
                    indices.append(coastal.index(port.edge))
                indices.sort()
                self.assertTrue(all((indices[(i + 1) % 9] - indices[i]) % len(coastal) >= 3
                                    for i in range(9)))
                layouts.add(tuple((port.edge.node1.id, port.resource) for port in board.ports))
        self.assertGreater(len(layouts), 1)

    def test_small_boards_have_only_spaced_ports(self):
        for size, count in ((1, 2), (2, 6), (3, 9), (4, 9)):
            with self.subTest(size=size):
                board = Board(size)
                self.assertEqual(len(board.ports), count)
                nodes = [node for port in board.ports
                         for node in (port.edge.node1, port.edge.node2)]
                self.assertEqual(len(nodes), len(set(nodes)))

    def test_either_setup_endpoint_claims_port_and_city_keeps_it(self):
        for endpoint in ("node1", "node2"):
            with self.subTest(endpoint=endpoint):
                game = Game(2)
                port = game.board.ports[0]
                node = getattr(port.edge, endpoint)
                game.start()
                with self.assertRaises(GameRuleError):
                    game.buildAt(1, "settlement", node.id)
                self.assertIsNone(port.owner)
                game.buildAt(0, "settlement", node.id)
                self.assertIs(port.owner, game.players[0])
                game.setupStep = None
                game.setupNode = None
                game.diceRoll = 8
                game.players[0].resources = [Resource.ORE] * 3 + [Resource.WHEAT] * 2
                game.buildAt(0, "city", node.id)
                self.assertIs(port.owner, game.players[0])
                self.assertEqual(node.building, BuildingType.CITY)
                # Even a later build through the shared build primitive cannot steal a port.
                other = port.edge.node2 if node is port.edge.node1 else port.edge.node1
                game.build(game.players[1], other, BuildingType.SETTLEMENT)
                self.assertIs(port.owner, game.players[0])

    def test_road_does_not_claim_port(self):
        game = Game(1)
        port = game.board.ports[0]
        port.edge.node1.owner = game.players[0]
        self.assertTrue(FreeRoad(game.players[0], game, port.edge).execute())
        self.assertIsNone(port.owner)

    def test_all_resource_pairs_use_best_rate_without_stacking(self):
        for general in (False, True):
            for specialized in (None, *Resource):
                for give in Resource:
                    for receive in Resource:
                        if give == receive:
                            continue
                        with self.subTest(general=general, specialized=specialized,
                                          give=give, receive=receive):
                            game = Game(2)
                            player = game.players[0]
                            for port in game.board.ports:
                                if ((general and port.resource is None)
                                        or (specialized is not None and port.resource == specialized)):
                                    port.owner = player
                            game.started = True
                            game.diceRoll = 8
                            rate = 2 if give == specialized else 3 if general else 4
                            self.assertEqual(game.tradeRate(player, give), rate)
                            self.assertEqual(game.tradeRate(game.players[1], give), 4)
                            player.resources = [give] * (rate - 1)
                            with self.assertRaisesRegex(GameRuleError, f"needs {rate} {give.value}"):
                                game.trade(0, give, receive)
                            self.assertEqual(player.resources, [give] * (rate - 1))
                            player.resources = [give] * (rate * 2)
                            game.trade(0, give, receive)
                            game.trade(0, give, receive)
                            self.assertEqual(player.resources, [receive, receive])
                            self.assertIn(f"traded {rate} {give.value}", game.chat[-1]["text"])

    def test_port_trade_obeys_turn_and_phase_rules(self):
        game = Game(2)
        player = game.players[0]
        for port in game.board.ports:
            port.owner = player
        player.resources = [Resource.WOOD] * 2
        operations = [
            lambda: game.trade(0, Resource.WOOD, Resource.ORE),
            lambda: game.trade(1, Resource.WOOD, Resource.ORE),
        ]
        for phase in ("lobby", "setup", "before-roll", "thief", "free-roads", "finished"):
            game.started = phase != "lobby"
            game.setupStep = 0 if phase == "setup" else None
            game.diceRoll = None if phase == "before-roll" else 8
            game.thiefMovePending = phase == "thief"
            game.freeRoadsRemaining = 1 if phase == "free-roads" else 0
            game.winner = 0 if phase == "finished" else None
            for operation in operations:
                with self.subTest(phase=phase), self.assertRaises(GameRuleError):
                    operation()
                self.assertEqual(player.resources, [Resource.WOOD] * 2)
        game.winner = None
        game.freeRoadsRemaining = 0
        with self.assertRaises(GameRuleError):
            game.trade(0, Resource.WOOD, Resource.WOOD)
        self.assertEqual(player.resources, [Resource.WOOD] * 2)

    def test_serialization_exposes_ports_owners_and_rates(self):
        game = Game(2)
        general = next(port for port in game.board.ports if port.resource is None)
        wood = next(port for port in game.board.ports if port.resource == Resource.WOOD)
        general.owner = wood.owner = game.players[0]
        state = game.serialize()
        self.assertEqual(len(state["board"]["ports"]), 9)
        for port, serialized in zip(game.board.ports, state["board"]["ports"]):
            self.assertEqual(serialized, {
                "node1": port.edge.node1.id, "node2": port.edge.node2.id,
                "resource": port.resource.value if port.resource else None,
                "owner": 0 if port.owner else None,
            })
        self.assertEqual(state["players"][0]["tradeRates"],
                         {resource.value: 2 if resource == Resource.WOOD else 3
                          for resource in Resource})
        self.assertEqual(state["players"][1]["tradeRates"],
                         {resource.value: 4 for resource in Resource})
