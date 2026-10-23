export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'white';
export type BuildingType = 'none' | 'settlement' | 'city';
export type BuildKind = 'road' | 'settlement' | 'city';
export type PlacementKind = BuildKind | 'thief';

/** Node ids for settlements and cities, edge indices (in `board.edges`) for roads. */
export type BuildTargetsDto = {
    targets: number[];
};

export type PlayerDto = {
    id: number;
    name: string;
    color: PlayerColor;
    points: number;
    resources: ResourceCard[];
    devCards: DevCardDto[];
};

export type ResourceCard = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';

export type TradeRequestDto = {
    give: ResourceCard;
    receive: ResourceCard;
};

export type DevCardDto = {
    name: string;
    color: string;
    used: boolean;
    acquiredTurn: number;
    unavailableReason: string | null;
};

export type PlayDevCardRequestDto = {
    resources: ResourceCard[];
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

export type TurnDto = {
    started: boolean;
    currentPlayer: number;
    turnNumber: number;
    diceRoll: number | null;
    thiefMovePending: boolean;
    freeRoadsRemaining: number;
    devCardPlayed: boolean;
    setup: { round: number; kind: 'settlement' | 'road' } | null;
};

export type GameDto = {
    players: PlayerDto[];
    turn: TurnDto;
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
