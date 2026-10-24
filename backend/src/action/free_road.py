from __future__ import annotations

from ..resource import Resource
from .build_road import BuildRoad


class FreeRoad(BuildRoad):
    cost: dict[Resource, int] = {}
