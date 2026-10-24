from enum import Enum, auto

from ..resource import Resource


class Landscape(Enum):
    FOREST = auto()
    HILLS = auto()
    PASTURE = auto()
    FIELDS = auto()
    MOUNTAINS = auto()
    DESERT = auto()

    @property
    def resource(self) -> Resource | None:
        return {
            Landscape.FOREST: Resource.WOOD,
            Landscape.HILLS: Resource.BRICK,
            Landscape.PASTURE: Resource.SHEEP,
            Landscape.FIELDS: Resource.WHEAT,
            Landscape.MOUNTAINS: Resource.ORE,
        }.get(self)
