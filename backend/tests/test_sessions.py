from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import socket
from threading import Thread
from time import monotonic, sleep
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import uvicorn

from backend.src.main import PRESENCE_TIMEOUT, app, games, gamesLock
from backend.src.types.devCard import Knight
from backend.src.types.enum import Resource


class SessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.socket = socket.socket()
        cls.socket.bind(("127.0.0.1", 0))
        cls.baseUrl = f"http://127.0.0.1:{cls.socket.getsockname()[1]}"
        cls.server = uvicorn.Server(uvicorn.Config(app, log_level="critical"))
        cls.thread = Thread(target=cls.server.run, kwargs={"sockets": [cls.socket]}, daemon=True)
        cls.thread.start()
        deadline = monotonic() + 10
        while not cls.server.started:
            if not cls.thread.is_alive() or monotonic() > deadline:
                raise RuntimeError("Test server failed to start")
            sleep(0.01)

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=10)
        cls.socket.close()

    def setUp(self):
        with gamesLock:
            games.clear()

    def request(self, method, path, body=None, expected=200):
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.baseUrl + path, data=data, method=method,
                          headers={"Content-Type": "application/json"})
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            self.assertEqual(response.status, expected)
            return json.load(response)

    def create(self, name="Alice", playerCount=2):
        return self.request("POST", "/games", {"name": name, "playerCount": playerCount}, 201)

    def test_create_and_join_preserve_board_and_identity(self):
        created = self.create(" Alice ")
        gameId = created["gameId"]
        self.assertRegex(gameId, r"^[1-9][0-9]{3}$")
        self.assertIsNotNone(datetime.fromisoformat(created["createdAt"]).tzinfo)
        before = self.request("GET", f"/games/{gameId}?playerId=0")
        joined = self.request("POST", f"/games/{gameId}/players", {"name": "Bob"}, 201)
        self.assertEqual(joined["playerId"], 1)
        after = self.request("GET", f"/games/{gameId}?playerId=1")
        self.assertEqual(before["board"], after["board"])
        self.assertEqual([p["name"] for p in after["players"]], ["Alice", "Bob"])
        self.assertEqual([p["id"] for p in after["joinedPlayers"]], [0, 1])
        self.assertEqual(after["createdAt"], created["createdAt"])
        self.assertEqual(self.request("GET", f"/games/{gameId}?playerId=1"), after)

    def test_player_cards_are_in_game_and_presence_data(self):
        gameId = self.create()["gameId"]
        with gamesLock:
            player = games[gameId].game.players[0]
            player.resources.extend([Resource.WOOD, Resource.WOOD, Resource.ORE])
            player.devCards.append(Knight())

        game = self.request("GET", f"/games/{gameId}?playerId=0")
        playerData = game["players"][0]
        self.assertEqual(playerData["resources"], ["wood", "wood", "ore"])
        self.assertEqual(playerData["devCards"], [{"name": "Knight", "color": "#3b82f6"}])
        self.assertEqual(playerData["points"], 3)

        presence = self.request("POST", f"/games/{gameId}/players/0/heartbeat")
        self.assertEqual(presence["players"][0]["resources"], playerData["resources"])
        self.assertEqual(presence["players"][0]["devCards"], playerData["devCards"])

    def test_games_are_isolated_and_names_are_game_local(self):
        first = self.create()
        second = self.create()
        self.assertNotEqual(first["gameId"], second["gameId"])
        self.request("POST", f"/games/{first['gameId']}/players", {"name": "Bob"}, 201)
        other = self.request("GET", f"/games/{second['gameId']}?playerId=0")
        self.assertEqual(len(other["joinedPlayers"]), 1)
        self.assertEqual(other["players"][1]["name"], "Player 2")

    def test_duplicate_names_full_games_and_unknown_identities(self):
        gameId = self.create()["gameId"]
        self.request("POST", f"/games/{gameId}/players", {"name": " alice "}, 409)
        self.request("GET", f"/games/{gameId}?playerId=1", expected=404)
        self.request("POST", f"/games/{gameId}/players/1/heartbeat", expected=404)
        self.request("POST", f"/games/{gameId}/players", {"name": "Bob"}, 201)
        self.request("POST", f"/games/{gameId}/players", {"name": "Carol"}, 409)
        self.request("POST", "/games/0000/players", {"name": "Bob"}, 404)
        self.request("GET", "/games/0000?playerId=0", expected=404)

    def test_invalid_requests_do_not_create_sessions(self):
        for name in ("", "   ", "x" * 41):
            self.request("POST", "/games", {"name": name}, 422)
        for count in (1, 6):
            self.request("POST", "/games", {"name": "Alice", "playerCount": count}, 422)
        self.assertEqual(games, {})

    def test_presence_expires_without_releasing_identity(self):
        gameId = self.create()["gameId"]
        self.request("POST", f"/games/{gameId}/players", {"name": "Bob"}, 201)
        with gamesLock:
            games[gameId].lastSeen[1] = monotonic() - PRESENCE_TIMEOUT - 1
        presence = self.request("POST", f"/games/{gameId}/players/0/heartbeat")
        self.assertEqual([p["connected"] for p in presence["players"]], [True, False])
        restored = self.request("POST", f"/games/{gameId}/players/1/heartbeat")
        self.assertTrue(all(p["connected"] for p in restored["players"]))
        self.assertEqual(restored["players"][1]["name"], "Bob")

    def test_simultaneous_joins_cannot_claim_same_slot(self):
        gameId = self.create()["gameId"]

        def join(name):
            request = Request(self.baseUrl + f"/games/{gameId}/players",
                              data=json.dumps({"name": name}).encode(),
                              headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urlopen(request, timeout=10) as response:
                    return response.status
            except HTTPError as error:
                error.close()
                return error.code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = sorted(executor.map(join, ["Bob", "Carol"]))
        self.assertEqual(statuses, [201, 409])
        self.assertEqual(len(games[gameId].lastSeen), 2)

    def test_id_collision_is_avoided(self):
        first = self.create()["gameId"]
        with patch("backend.src.main.secrets.choice") as choice:
            choice.side_effect = lambda available: available[0]
            second = self.create()["gameId"]
            third = self.create()["gameId"]
        self.assertEqual(len({first, second, third}), 3)

    def test_all_supported_capacities(self):
        for count in range(2, 6):
            gameId = self.create(playerCount=count)["gameId"]
            for index in range(1, count):
                joined = self.request("POST", f"/games/{gameId}/players",
                                      {"name": f"Guest {index}"}, 201)
                self.assertEqual(joined["playerId"], index)
            self.request("POST", f"/games/{gameId}/players", {"name": "Extra"}, 409)
            game = self.request("GET", f"/games/{gameId}?playerId={count - 1}")
            self.assertEqual(len(game["players"]), count)
            self.assertEqual(len(game["joinedPlayers"]), count)

    def test_exhausted_ids_return_explicit_error(self):
        gameId = self.create()["gameId"]
        session = games[gameId]
        with gamesLock:
            games.update({str(number): session for number in range(1000, 10000)})
        self.request("POST", "/games", {"name": "Bob"}, 503)
        self.assertEqual(len(games), 9000)

    def test_board_operations_are_scoped_and_preserve_names(self):
        first = self.create()
        second = self.create()
        firstId, secondId = first["gameId"], second["gameId"]
        self.request("POST", f"/games/{firstId}/players", {"name": "Bob"}, 201)
        other = self.request("GET", f"/games/{secondId}?playerId=0")
        board = self.request("POST", f"/games/{firstId}/new-board?playerId=0", {"playerCount": 3})
        self.assertEqual([p["name"] for p in board["players"]], ["Alice", "Bob", "Player 3"])
        self.assertEqual(self.request("GET", f"/games/{secondId}?playerId=0"), other)
        self.request("POST", f"/games/{firstId}/players", {"name": "Carol"}, 201)
        self.request("POST", f"/games/{firstId}/new-board?playerId=0", {"playerCount": 2}, 409)
        self.request("POST", f"/games/{firstId}/demo-game?playerId=0",
                     {"playerCount": 3, "roundCount": 0})


if __name__ == "__main__":
    unittest.main()
