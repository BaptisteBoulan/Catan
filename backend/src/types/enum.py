from enum import Enum, auto


class Color(Enum):
    RED = auto()
    BLUE = auto()
    GREEN = auto()
    YELLOW = auto()

class Resource(Enum):
    WOOD = "wood"
    BRICK = "brick"
    SHEEP = "sheep"
    WHEAT = "wheat"
    ORE = "ore"


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


class BuildingType(Enum):
    NONE = auto()
    SETTLEMENT = auto()
    CITY = auto()


class DevelopmentCard(Enum):
    KNIGHT = auto()
    VICTORY_POINT = auto()
    ROAD_BUILDING = auto()
    YEAR_OF_PLENTY = auto()
    MONOPOLY = auto()