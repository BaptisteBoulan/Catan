from __future__ import annotations

import abc
from typing import TYPE_CHECKING, Generic, TypeVar

from ..board.edge import Edge
from ..board.node import Node
from ..player.player import Player
from .action import Action

if TYPE_CHECKING:
    from ..game.game import Game


Target = TypeVar("Target", Node, Edge)


class TargetedAction(Action, Generic[Target]):
    def __init__(self, player: Player, game: Game, target: Target | None = None):
        super().__init__(player, game)
        self.target: Target | None = target

    @abc.abstractmethod
    def getValidTargets(self) -> list[Target]:
        pass

    def canBeExecuted(self) -> bool:
        if not super().canBeExecuted():
            return False
        targets = self.getValidTargets()
        return self.target in targets if self.target is not None else bool(targets)

    def chooseTarget(self, target: Target | None = None) -> bool:
        if not super().canBeExecuted():
            return False
        targets = self.getValidTargets()
        if not targets:
            return False
        if target is not None:
            if target not in targets:
                return False
            self.target = target
            return True

        for index, option in enumerate(targets, start=1):
            label = (f"node {option.id}" if isinstance(option, Node)
                     else f"edge {option.node1.id}-{option.node2.id}")
        while True:
            try:
                choice = input("Choose a target number (Enter to cancel): ").strip()
            except EOFError:
                return False
            if not choice:
                return False
            try:
                index = int(choice) - 1
            except ValueError:
                continue
            if 0 <= index < len(targets):
                self.target = targets[index]
                return True
