import asyncio
import json
import unittest
from unittest.mock import patch

from backend.src.main import app, games
from backend.src.types.enum import Resource
from backend.src.types.devCard import Knight, Monopoly, RoadBuilding, VictoryPoint, YearOfPlenty


class SetupApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        games.clear()

    def tearDown(self):
        games.clear()

    async def request(self, method: str, path: str, body: dict | None = None):
        route, _, query = path.partition("?")
        messages = []

        async def receive():
            return {"type": "http.request", "body": json.dumps(body or {}).encode(),
                    "more_body": False}

        async def send(message):
            messages.append(message)

        await app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": method, "scheme": "http", "path": route, "raw_path": route.encode(),
            "query_string": query.encode(), "root_path": "",
            "headers": [(b"content-type", b"application/json")],
            "client": ("127.0.0.1", 12345), "server": ("localhost", 80),
        }, receive, send)
        status = next(message["status"] for message in messages
                      if message["type"] == "http.response.start")
        data = json.loads(b"".join(message.get("body", b"") for message in messages
                                   if message["type"] == "http.response.body"))
        return status, data

    async def test_chat_messages_and_trade_offer_acceptance(self):
        _, identity = await self.request("POST", "/games", {"name": "Alice", "playerCount": 2})
        root = f"/games/{identity['gameId']}"
        await self.request("POST", f"{root}/players", {"name": "Bob"})
        game = games[identity["gameId"]].game
        game.started = True
        game.setupStep = None
        game.currentPlayer = 0
        game.diceRoll = 8
        game.players[0].resources = [Resource.WOOD, Resource.WOOD, Resource.ORE]
        game.players[1].resources = [Resource.BRICK, Resource.BRICK, Resource.WHEAT]

        status, response = await self.request(
            "POST", f"{root}/chat?playerId=0", {"text": "Anyone need wood?"})
        self.assertEqual(status, 201)
        self.assertEqual(response["messages"][0]["text"], "Anyone need wood?")
        status, _ = await self.request(
            "POST", f"{root}/chat?playerId=0",
            {"recipientId": 1, "give": "wood", "giveCount": 4,
             "receive": "brick", "receiveCount": 1})
        self.assertEqual(status, 409)
        status, response = await self.request(
            "POST", f"{root}/chat?playerId=0",
            {"recipientId": 1, "give": "wood", "giveCount": 2,
             "receive": "brick", "receiveCount": 1})
        self.assertEqual(status, 201)
        offerId = response["messages"][1]["id"]
        status, _ = await self.request(
            "POST", f"{root}/chat/{offerId}/accept?playerId=0")
        self.assertEqual(status, 409)
        status, response = await self.request(
            "POST", f"{root}/chat/{offerId}/accept?playerId=1")
        self.assertEqual(status, 200)
        self.assertEqual(response["messages"][1]["status"], "accepted")
        self.assertCountEqual(game.players[0].resources, [Resource.ORE, Resource.BRICK])
        self.assertCountEqual(
            game.players[1].resources,
            [Resource.BRICK, Resource.WHEAT, Resource.WOOD, Resource.WOOD],
        )
        status, _ = await self.request(
            "POST", f"{root}/chat/{offerId}/accept?playerId=1")
        self.assertEqual(status, 409)
        _, chat = await self.request("GET", f"{root}/chat?playerId=0")
        self.assertEqual(chat["messages"], response["messages"])
        game.players[0].resources.append(Resource.WOOD)
        _, response = await self.request(
            "POST", f"{root}/chat?playerId=0",
            {"recipientId": 1, "give": "wood", "receive": "wheat"})
        expiredId = response["messages"][-1]["id"]
        status, _ = await self.request("POST", f"{root}/end-turn?playerId=0")
        self.assertEqual(status, 200)
        _, chat = await self.request("GET", f"{root}/chat?playerId=1")
        self.assertEqual(chat["messages"][expiredId]["status"], "expired")

    async def test_victory_and_concurrent_replay_keep_the_same_lobby(self):
        _, identity = await self.request("POST", "/games", {"name": "Alice", "playerCount": 2})
        root = f"/games/{identity['gameId']}"
        await self.request("POST", f"{root}/players", {"name": "Bob"})
        status, _ = await self.request("POST", f"{root}/play-again?playerId=0")
        self.assertEqual(status, 409)
        await self.request("POST", f"{root}/start?playerId=0")
        session = games[identity["gameId"]]
        game = session.game
        with patch("backend.src.types.game.random.randint", return_value=3):
            while game.setupStep is not None:
                kind = game.setupKind
                game.buildAt(game.currentPlayer, kind, game.buildTargets(game.currentPlayer, kind)[0])
        game.players[0].points = 6
        game.players[0].devCards = [VictoryPoint()]
        session.chat.append({"status": "pending"})
        status, state = await self.request("POST", f"{root}/dev-card/0/play?playerId=0")
        self.assertEqual(status, 200)
        self.assertEqual(state["turn"]["winner"], 0)
        _, heartbeat = await self.request("POST", f"{root}/players/1/heartbeat")
        self.assertEqual(heartbeat["state"]["turn"], state["turn"])
        self.assertEqual(heartbeat["state"]["players"], state["players"])
        self.assertEqual(state["turn"]["diceValues"], [3, 3])
        status, _ = await self.request("POST", f"{root}/end-turn?playerId=0")
        self.assertEqual(status, 409)
        status, _ = await self.request("POST", f"{root}/play-again?playerId=4")
        self.assertEqual(status, 404)
        results = await asyncio.gather(
            self.request("POST", f"{root}/play-again?playerId=0"),
            self.request("POST", f"{root}/play-again?playerId=1"),
        )
        self.assertTrue(all(status == 200 for status, _ in results))
        self.assertEqual(results[0][1], results[1][1])
        self.assertEqual(len(games), 1)
        fresh = session.game
        self.assertIsNot(fresh, game)
        self.assertEqual([player.name for player in fresh.players], ["Alice", "Bob"])
        self.assertEqual([player.color for player in fresh.players],
                         [player.color for player in game.players])
        self.assertTrue(all(player.points == 0 and not player.resources and not player.devCards
                            for player in fresh.players))
        self.assertTrue(all(node.owner is None for node in fresh.board.nodes))
        self.assertTrue(all(edge.owner is None for edge in fresh.board.edges))
        self.assertFalse(fresh.started)
        self.assertIsNone(fresh.winner)
        self.assertIsNone(fresh.diceValues)
        self.assertEqual(session.chat, [])
        status, replay = await self.request("POST", f"{root}/play-again?playerId=1")
        self.assertEqual(status, 200)
        self.assertIs(session.game, fresh)
        self.assertEqual(replay["gameId"], identity["gameId"])
        _, heartbeat = await self.request("POST", f"{root}/players/1/heartbeat")
        self.assertEqual(heartbeat["state"], replay)
        status, _ = await self.request("POST", f"{root}/start?playerId=1")
        self.assertEqual(status, 403)
        status, state = await self.request("POST", f"{root}/start?playerId=0")
        self.assertEqual(status, 200)
        self.assertEqual(state["turn"]["setup"], {"round": 1, "kind": "settlement"})
        status, _ = await self.request("POST", f"{root}/play-again?playerId=1")
        self.assertEqual(status, 409)

    async def test_development_cards_validation_effects_and_heartbeat_sync(self):
        _, identity = await self.request("POST", "/games", {"name": "Alice", "playerCount": 2})
        root = f"/games/{identity['gameId']}"
        await self.request("POST", f"{root}/players", {"name": "Bob"})
        game = games[identity["gameId"]].game
        game.start()
        with patch.object(game, "throwDice", return_value=8):
            while game.setupStep is not None:
                kind = game.setupKind
                game.buildAt(game.currentPlayer, kind, game.buildTargets(game.currentPlayer, kind)[0])
        game.players[0].devCards = [Monopoly(), VictoryPoint(), Knight(), RoadBuilding(), YearOfPlenty()]
        game.players[1].resources = [Resource.ORE] * 3
        for index, player, body, expected in (
            (0, 0, {}, 409), (-1, 0, {}, 409), (8, 0, {}, 409),
            (0, 1, {"resources": ["ore"]}, 409), (0, 4, {}, 404),
            (0, 0, {"resources": ["gold"]}, 422),
        ):
            status, _ = await self.request(
                "POST", f"{root}/dev-card/{index}/play?playerId={player}", body)
            self.assertEqual(status, expected)
        status, state = await self.request(
            "POST", f"{root}/dev-card/0/play?playerId=0", {"resources": ["ore"]})
        self.assertEqual(status, 200)
        self.assertEqual(state["players"][0]["resources"].count("ore"), 3)
        self.assertEqual(state["players"][1]["resources"], [])
        self.assertTrue(state["players"][0]["devCards"][0]["used"])
        status, state = await self.request("POST", f"{root}/dev-card/1/play?playerId=0")
        self.assertEqual(status, 200)
        self.assertEqual(state["players"][0]["points"], 3)
        for index in (2, 3, 4):
            with patch.object(game, "throwDice", return_value=8):
                game.endTurn(0)
                game.endTurn(1)
            status, state = await self.request(
                "POST", f"{root}/dev-card/{index}/play?playerId=0",
                {"resources": ["wood", "wheat"]} if index == 4 else {})
            self.assertEqual(status, 200)
            if index == 2:
                self.assertTrue(state["turn"]["thiefMovePending"])
                _, targets = await self.request("GET", f"{root}/thief/targets?playerId=0")
                await self.request("POST", f"{root}/thief?playerId=0", {"target": targets["targets"][0]})
            if index == 3:
                self.assertEqual(state["turn"]["freeRoadsRemaining"], 2)
                for _ in range(2):
                    _, targets = await self.request("GET", f"{root}/build/road/targets?playerId=0")
                    status, state = await self.request(
                        "POST", f"{root}/build/road?playerId=0", {"target": targets["targets"][0]})
                    self.assertEqual(status, 200)
            if index == 4:
                self.assertIn("wood", state["players"][0]["resources"])
                self.assertIn("wheat", state["players"][0]["resources"])
        _, refreshed = await self.request("GET", f"{root}?playerId=0")
        _, heartbeat = await self.request("POST", f"{root}/players/1/heartbeat")
        self.assertEqual(refreshed, heartbeat["state"])
        self.assertTrue(all(card["used"] for card in refreshed["players"][0]["devCards"]))
        self.assertTrue(all(card["used"] for card in refreshed["joinedPlayers"][0]["devCards"]))

    async def test_full_setup_and_heartbeat_board_sync(self):
        status, identity = await self.request("POST", "/games", {"name": "Alice", "playerCount": 2})
        self.assertEqual(status, 201)
        root = f"/games/{identity['gameId']}"
        status, _ = await self.request("POST", f"{root}/start?playerId=0")
        self.assertEqual(status, 409)
        status, _ = await self.request("POST", f"{root}/players", {"name": "Bob"})
        self.assertEqual(status, 201)
        status, _ = await self.request("POST", f"{root}/start?playerId=1")
        self.assertEqual(status, 403)
        status, state = await self.request("POST", f"{root}/start?playerId=0")
        self.assertEqual(status, 200)
        self.assertEqual(state["turn"]["setup"], {"round": 1, "kind": "settlement"})
        status, _ = await self.request("POST", f"{root}/roll?playerId=0")
        self.assertEqual(status, 409)

        for player in (0, 1, 1, 0):
            for kind in ("settlement", "road"):
                status, targets = await self.request(
                    "GET", f"{root}/build/{kind}/targets?playerId={player}")
                self.assertEqual(status, 200)
                status, state = await self.request(
                    "POST", f"{root}/build/{kind}?playerId={player}",
                    {"target": targets["targets"][0]})
                self.assertEqual(status, 200)
                status, presence = await self.request(
                    "POST", f"{root}/players/{1 - player}/heartbeat")
                self.assertEqual(status, 200)
                self.assertEqual(presence["state"]["board"], state["board"])
                self.assertEqual(presence["state"]["turn"], state["turn"])
                status, refreshed = await self.request("GET", f"{root}?playerId={player}")
                self.assertEqual(status, 200)
                self.assertEqual(refreshed["turn"], state["turn"])

        self.assertIsNone(state["turn"]["setup"])
        self.assertEqual(state["turn"]["currentPlayer"], 0)
        self.assertEqual(state["turn"]["turnNumber"], 1)
        self.assertIn(state["turn"]["diceRoll"], range(2, 13))
        self.assertEqual([player["points"] for player in state["players"]], [2, 2])
        status, _ = await self.request("POST", f"{root}/roll?playerId=0")
        self.assertEqual(status, 409)
        if state["turn"]["thiefMovePending"]:
            _, targets = await self.request("GET", f"{root}/thief/targets?playerId=0")
            status, state = await self.request(
                "POST", f"{root}/thief?playerId=0", {"target": targets["targets"][0]})
            self.assertEqual(status, 200)
        with patch.object(games[identity["gameId"]].game, "throwDice", return_value=9) as dice:
            status, state = await self.request("POST", f"{root}/end-turn?playerId=0")
            self.assertEqual(status, 200)
            dice.assert_called_once_with()
        self.assertEqual(state["turn"]["diceRoll"], 9)
        self.assertEqual(state["turn"]["currentPlayer"], 1)
        self.assertEqual(state["turn"]["turnNumber"], 2)

    async def test_trade_validation_and_state_sync(self):
        _, identity = await self.request("POST", "/games", {"name": "Alice", "playerCount": 2})
        root = f"/games/{identity['gameId']}"
        await self.request("POST", f"{root}/players", {"name": "Bob"})
        game = games[identity["gameId"]].game
        game.players[0].resources = [Resource.WOOD] * 4
        trade = {"give": "wood", "receive": "ore"}
        status, _ = await self.request("POST", f"{root}/trade?playerId=0", trade)
        self.assertEqual(status, 409)
        game.start()
        status, _ = await self.request("POST", f"{root}/trade?playerId=0", trade)
        self.assertEqual(status, 409)
        with patch.object(game, "throwDice", return_value=8):
            while game.setupStep is not None:
                kind = game.setupKind
                game.buildAt(game.currentPlayer, kind, game.buildTargets(game.currentPlayer, kind)[0])

        for player, body, expected in (
            (1, trade, 409),
            (4, trade, 404),
            (0, {"give": "gold", "receive": "ore"}, 422),
            (0, {"give": "wood", "receive": "gold"}, 422),
            (0, {"give": "wood"}, 422),
            (0, {"give": "wood", "receive": "wood"}, 409),
            (0, {"give": "brick", "receive": "ore"}, 409),
        ):
            status, _ = await self.request("POST", f"{root}/trade?playerId={player}", body)
            self.assertEqual(status, expected)
            self.assertEqual(game.players[0].resources, [Resource.WOOD] * 4)
        status, state = await self.request("POST", f"{root}/trade?playerId=0", trade)
        self.assertEqual(status, 200)
        self.assertEqual(state["players"][0]["resources"], ["ore"])
        self.assertEqual(state["turn"]["turnNumber"], 1)
        status, presence = await self.request("POST", f"{root}/players/1/heartbeat")
        self.assertEqual(status, 200)
        self.assertEqual(presence["state"]["players"], state["players"])
        status, _ = await self.request("POST", f"{root}/trade?playerId=0", trade)
        self.assertEqual(status, 409)
        self.assertEqual(game.players[0].resources, [Resource.ORE])

    async def test_thief_move_validation_and_heartbeat_sync(self):
        _, identity = await self.request("POST", "/games", {"name": "Alice", "playerCount": 2})
        root = f"/games/{identity['gameId']}"
        await self.request("POST", f"{root}/players", {"name": "Bob"})
        game = games[identity["gameId"]].game
        status, _ = await self.request("GET", f"{root}/thief/targets?playerId=0")
        self.assertEqual(status, 409)
        game.start()
        with patch.object(game, "throwDice", return_value=7):
            while game.setupStep is not None:
                kind = game.setupKind
                game.buildAt(game.currentPlayer, kind, game.buildTargets(game.currentPlayer, kind)[0])
        status, targets = await self.request("GET", f"{root}/thief/targets?playerId=0")
        self.assertEqual(status, 200)
        self.assertEqual(len(targets["targets"]), len(game.board.tiles) - 1)
        old = next(i for i, tile in enumerate(game.board.tiles) if tile.isOccupiedByThief)
        for player, target, expected in (
            (1, targets["targets"][0], 409), (4, targets["targets"][0], 404),
            (0, old, 409), (0, -1, 409), (0, len(game.board.tiles), 409),
        ):
            status, _ = await self.request(
                "POST", f"{root}/thief?playerId={player}", {"target": target})
            self.assertEqual(status, expected)
            self.assertTrue(game.thiefMovePending)
            self.assertTrue(game.board.tiles[old].isOccupiedByThief)
        status, _ = await self.request("POST", f"{root}/thief?playerId=0", {"target": "bad"})
        self.assertEqual(status, 422)
        status, _ = await self.request("POST", f"{root}/end-turn?playerId=0")
        self.assertEqual(status, 409)
        destination = next(i for i in targets["targets"]
                           if any(node.owner is game.players[1] for node in game.board.tiles[i].nodes))
        game.players[1].resources = [Resource.ORE] * 9
        status, state = await self.request(
            "POST", f"{root}/thief?playerId=0", {"target": destination})
        self.assertEqual(status, 200)
        self.assertFalse(state["turn"]["thiefMovePending"])
        self.assertEqual(state["players"][1]["resources"], ["ore"] * 5)
        self.assertTrue(state["board"]["tiles"][destination]["isOccupiedByThief"])
        _, presence = await self.request("POST", f"{root}/players/1/heartbeat")
        for key in ("turn", "board", "players"):
            self.assertEqual(presence["state"][key], state[key])
        status, _ = await self.request(
            "POST", f"{root}/thief?playerId=0", {"target": old})
        self.assertEqual(status, 409)


if __name__ == "__main__":
    unittest.main()
