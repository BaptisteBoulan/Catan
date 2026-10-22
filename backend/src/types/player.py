from backend.src.types.devCard import DevCard

from .enum import Resource, Color

class Player:
    def __init__(self, name: str, color: Color):
        self.name = name
        self.points = 0
        self.resources: set[Resource] = set()
        self.devCards: set[DevCard] = set()
        self.color: Color = color
        
    def getResourceCount(self, resource: Resource) -> int:
        return sum(1 for r in self.resources if r == resource)
    
    def payResource(self, resource: Resource, count:int = 1) -> bool:
        if self.getResourceCount(resource) < count:
            return False
        for _ in range(count):
            self.resources.remove(resource)
        return True
    
    def payResources(self, resources: dict[Resource, int]) -> bool:
        for resource, count in resources.items():
            if self.getResourceCount(resource) < count:
                return False
        for resource, count in resources.items():
            for _ in range(count):
                self.resources.remove(resource)
        return True
        