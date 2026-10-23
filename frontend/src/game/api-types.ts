export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'white';
export type BuildingType = 'none' | 'settlement' | 'city';

export type PlayerDto = {
    id: number;
    name: string;
    color: PlayerColor;
    points: number;
    resources: ResourceCard[];
    devCards: DevCardDto[];
};

export type ResourceCard = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';

export type DevCardDto = {
    name: string;
    color: string;
};

export type TileDto = {
    i: number;
    j: number;
    landscape: number;
    diceNumber: number | null;
    isOccupiedByThief: boolean;
    nodes: number[];
};

export type NodeDto = {
    id: number;
    x: number;
    y: number;
    building: BuildingType;
    owner: number | null;
};

export type EdgeDto = {
    node1: number;
    node2: number;
    owner: number | null;
};

export type GameDto = {
    players: PlayerDto[];
    board: {
        boardSize: number;
        tiles: TileDto[];
        nodes: NodeDto[];
        edges: EdgeDto[];
    };
};

export type JoinedPlayerDto = PlayerDto & {
    connected: boolean;
};

export type GameSessionDto = GameDto & {
    gameId: string;
    createdAt: string;
    joinedPlayers: JoinedPlayerDto[];
};

export type GameIdentityDto = {
    gameId: string;
    playerId: number;
    createdAt: string;
};
