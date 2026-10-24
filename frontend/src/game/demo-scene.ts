import { vec3, type Vec3 } from "wgpu-matrix";
import { Camera } from "../engine/camera";
import { FlyCameraController } from "../engine/controllers/fly-camera-controller";
import { IdleOrbitController, type IdleOrbitOptions } from "../engine/controllers/idle-orbit-controller";
import { Scene } from "../engine/scene";
import { SceneObject } from "../engine/scene-object";
import { Mesh } from "../engine/mesh/mesh";
import { createCylinder } from "../engine/mesh/primitives/cylinder";
import { HexTile } from "./objects/hex-tile";
import { Settlement } from "./objects/settlement";
import { City } from "./objects/city";
import { Road } from "./objects/road";
import { Port } from "./objects/port";
import { Thief } from "./objects/thief";
import { loadNumberTokenGeometry } from "./objects/number-token";
import type { PlacementKind, GameDto, PlayerColor } from "./api-types";
import { PLAYER_COLORS } from "./player-colors";

export type Placement = {
    kind: PlacementKind;
    targets: number[];
    playerId: number;
    onPick: (target: number) => void;
};

const PREVIEW_LIGHTEN = 0.45;
const ROAD_PICK_RADIUS = 0.3;
const BUILDING_PICK_RADIUS = 0.2;

const sqrt3 = Math.sqrt(3);
const TILE_HEIGHT = 0.15;
/** Models rest on their origin; pieces stand on the tiles' top surface. */
const BOARD_TOP = TILE_HEIGHT / 2;
const THIEF_OFFSET = 0.35;
const PORT_OFFSET = 0.28;

export const CAMERA_MIN_HEIGHT = 0.5;
export const CAMERA_MAX_DISTANCE = 20;
export const ENVIRONMENT_URL =
    `${import.meta.env.BASE_URL}hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr`;

function playerColor(color: PlayerColor): Vec3 {
    return vec3.fromValues(...PLAYER_COLORS[color]);
}

function addHexTile(parent: SceneObject, i: number, j: number, landscape: number) {
    const x = i * 1.5;
    const z = (j + i/2) * sqrt3;
    return parent.add(new HexTile({
        position: vec3.fromValues(x, -TILE_HEIGHT / 2, z),
        landscape,
    }));
}

function thiefPosition(i: number, j: number) {
    return vec3.fromValues(i * 1.5 + THIEF_OFFSET, BOARD_TOP, (j + i / 2) * sqrt3);
}

type SceneEntry = { signature: string; object: SceneObject };
type SceneUpdate = {
    signature: string;
    create: () => SceneObject | Promise<SceneObject>;
    onPick?: () => void;
};

function destroyObject(object: SceneObject): void {
    const geometries = new Set<Mesh["geometry"]>();
    object.traverse((child) => {
        if (child.mesh) geometries.add(child.mesh.geometry);
    });
    object.destroy();
    for (const geometry of geometries) geometry.destroy();
}

export type GameSceneOptions = {
    /** Whether the user can steer the camera. */
    interactive?: boolean;
    idleOrbit?: IdleOrbitOptions;
    cameraPosition?: Vec3;
};

export class GameScene extends Scene {
    private readonly entries = new Map<string, SceneEntry>();
    private revision = 0;

    constructor({ interactive = true, idleOrbit, cameraPosition }: GameSceneOptions = {}) {
        super(new Camera({
            position: cameraPosition,
            bounds: { minHeight: CAMERA_MIN_HEIGHT, maxDistance: CAMERA_MAX_DISTANCE },
        }));
        this.environmentUrl = ENVIRONMENT_URL;
        if (interactive) this.add(new FlyCameraController());
        this.add(new IdleOrbitController(idleOrbit));
    }

    async sync(game: GameDto, signal?: AbortSignal, placement?: Placement): Promise<void> {
        const revision = ++this.revision;
        signal?.throwIfAborted();
        const updates = describeObjects(game, signal, placement);
        const prepared = new Map<string, SceneEntry>();
        try {
            for (const [key, update] of updates) {
                if (this.entries.get(key)?.signature === update.signature) continue;
                prepared.set(key, { signature: update.signature, object: await update.create() });
                signal?.throwIfAborted();
                // A newer sync or destruction must never be overwritten by an older asset load.
                if (revision !== this.revision) return;
            }
            signal?.throwIfAborted();
            if (revision !== this.revision) return;

            for (const [key, entry] of this.entries) {
                if (!updates.has(key) || prepared.has(key)) {
                    destroyObject(entry.object);
                    this.entries.delete(key);
                }
            }
            for (const [key, entry] of prepared) {
                this.add(entry.object);
                this.entries.set(key, entry);
            }
            prepared.clear();
            for (const [key, update] of updates) {
                const entry = this.entries.get(key);
                if (entry) entry.object.onPick = update.onPick;
            }
            this.root.updateWorldMatrix();
        } finally {
            for (const entry of prepared.values()) destroyObject(entry.object);
        }
    }

    override destroy(): void {
        ++this.revision;
        for (const entry of this.entries.values()) destroyObject(entry.object);
        this.entries.clear();
        super.destroy();
    }
}

export function createDemoScene(): GameScene {
    return new GameScene();
}

/** Non-interactive scene that keeps turning, used behind the lobby. */
export function createPreviewScene(): GameScene {
    return new GameScene({
        interactive: false,
        idleOrbit: { idleDelay: null, speed: 0.08 },
        cameraPosition: vec3.fromValues(0, 2.6, 6),
    });
}

async function createTerrain({ board }: GameDto, signal?: AbortSignal): Promise<SceneObject> {
    const numberedTiles = board.tiles.filter((tile) => tile.landscape !== 6);
    const diceNumbers = new Set<number>();
    for (const tile of numberedTiles) {
        if (tile.diceNumber == null) {
            throw new Error(`Missing dice number for tile (${tile.i}, ${tile.j})`);
        }
        diceNumbers.add(tile.diceNumber);
    }
    const tokenGeometries = new Map(await Promise.all(
        [...diceNumbers].map(async (diceNumber) =>
            [diceNumber, await loadNumberTokenGeometry(diceNumber, signal)] as const),
    ));
    signal?.throwIfAborted();
    const terrain = new SceneObject({ name: "Terrain" });

    const waterRadius = board.nodes.reduce(
        (radius, node) => Math.max(radius, Math.hypot(node.x, node.y) + 20.8), 1,
    );
    terrain.add(new SceneObject({
        name: "Water",
        mesh: new Mesh(createCylinder(waterRadius * 2, 0.02, 128, vec3.fromValues(0.4, 0.75, 0.95))),
        position: vec3.fromValues(0, -TILE_HEIGHT / 2 - 0.02, 0),
    }));
    board.tiles.forEach((tile) => {
        const hexTile = addHexTile(terrain, tile.i, tile.j, tile.landscape);
        if (tile.landscape !== 6) {
            const geometry = tile.diceNumber == null ? undefined : tokenGeometries.get(tile.diceNumber);
            if (!geometry) {
                throw new Error(`Missing number token for tile (${tile.i}, ${tile.j})`);
            }
            hexTile.add(new SceneObject({
                name: `Dice token ${tile.diceNumber}`,
                mesh: new Mesh(geometry),
                position: vec3.fromValues(0, TILE_HEIGHT, 0),
            }));
        }
    });

    return terrain;
}

function describeObjects(
    game: GameDto, signal?: AbortSignal, placement?: Placement,
): Map<string, SceneUpdate> {
    const { board, players } = game;
    const updates = new Map<string, SceneUpdate>();
    updates.set("terrain", {
        signature: JSON.stringify([
            board.tiles.map(({ i, j, landscape, diceNumber }) => [i, j, landscape, diceNumber]),
            board.nodes.map(({ x, y }) => [x, y]),
        ]),
        create: () => createTerrain(game, signal),
    });
    board.tiles.forEach((tile, index) => {
        if (!tile.isOccupiedByThief) return;
        const position = thiefPosition(tile.i, tile.j);
        updates.set(`thief:${index}`, {
            signature: JSON.stringify(position),
            create: () => new Thief({ position }),
        });
    });
    const nodesById = new Map(board.nodes.map((node) => [node.id, node]));
    board.ports.forEach((port, index) => {
        const start = nodesById.get(port.node1);
        const end = nodesById.get(port.node2);
        const player = port.owner === null ? null : players[port.owner];
        if (!start || !end || player === undefined) {
            throw new Error(`Invalid port from node ${port.node1} to ${port.node2}`);
        }
        const dx = end.x - start.x;
        const dz = end.y - start.y;
        const length = Math.hypot(dx, dz);
        if (!length) throw new Error("Port nodes must be distinct");
        const x = (start.x + end.x) / 2;
        const z = (start.y + end.y) / 2;
        // +1 when the (-dz, dx) normal points away from the board center.
        const direction = x * -dz + z * dx > 0 ? 1 : -1;
        const owner = player ? playerColor(player.color) : undefined;
        updates.set(`port:${index}`, {
            signature: JSON.stringify([start.x, start.y, end.x, end.y, port.resource, player?.color]),
            create: () => new Port(port.resource, {
                owner,
                position: vec3.fromValues(
                    x - direction * dz / length * PORT_OFFSET,
                    -TILE_HEIGHT / 2,
                    z + direction * dx / length * PORT_OFFSET,
                ),
                // Turn the model's +Z towards the open sea.
                rotation: vec3.fromValues(0, -Math.atan2(dz, dx) + (direction < 0 ? Math.PI : 0), 0),
            }),
        });
    });
    board.edges.forEach((edge, index) => {
        if (edge.owner === null) return;
        const start = nodesById.get(edge.node1);
        const end = nodesById.get(edge.node2);
        const player = players[edge.owner];
        if (!start || !end || !player) {
            throw new Error(`Invalid road from node ${edge.node1} to ${edge.node2}`);
        }
        const y = BOARD_TOP;
        updates.set(`road:${index}`, {
            signature: JSON.stringify([start.x, start.y, end.x, end.y, player.color]),
            create: () => new Road(
                vec3.fromValues(start.x, y, start.y),
                vec3.fromValues(end.x, y, end.y),
                playerColor(player.color),
            ),
        });
    });

    // Backend node (x, y) maps to the XZ plane; buildings sit on top of the tiles.
    board.nodes.forEach((node) => {
        if (node.building === 'none' || node.owner === null) return;
        const player = players[node.owner];
        const color = player ? playerColor(player.color) : vec3.fromValues(0.5, 0.5, 0.5);
        updates.set(`building:${node.id}`, {
            signature: JSON.stringify([node.x, node.y, node.building, [...color]]),
            create: () => {
                if (node.building === 'settlement') {
                    return new Settlement({ position: vec3.fromValues(node.x, BOARD_TOP, node.y), color });
                }
                return new City({ position: vec3.fromValues(node.x, BOARD_TOP, node.y), color });
            },
        });
    });

    if (!placement) return updates;
    const player = players[placement.playerId];
    if (!player) throw new Error(`Unknown player ${placement.playerId}`);
    const color = vec3.lerp(playerColor(player.color), vec3.fromValues(1, 1, 1), PREVIEW_LIGHTEN);

    for (const target of placement.targets) {
        if (placement.kind === 'thief') {
            const tile = board.tiles[target];
            if (!tile) throw new Error(`Invalid thief slot ${target}`);
            const position = thiefPosition(tile.i, tile.j);
            updates.set(`preview:thief:${target}`, {
                signature: JSON.stringify(position),
                create: () => {
                    const preview = new Thief({
                        position,
                        color: vec3.fromValues(0.5, 0.5, 0.5),
                    });
                    preview.pickRadius = 0.45;
                    return preview;
                },
                onPick: () => placement.onPick(target),
            });
        } else if (placement.kind === 'road') {
            const edge = board.edges[target];
            const start = edge && nodesById.get(edge.node1);
            const end = edge && nodesById.get(edge.node2);
            if (!start || !end) throw new Error(`Invalid road slot ${target}`);
            const y = BOARD_TOP;
            updates.set(`preview:road:${target}`, {
                signature: JSON.stringify([start.x, start.y, end.x, end.y, [...color]]),
                create: () => {
                    const preview = new Road(
                        vec3.fromValues(start.x, y, start.y), vec3.fromValues(end.x, y, end.y), color,
                    );
                    preview.pickRadius = ROAD_PICK_RADIUS;
                    return preview;
                },
                onPick: () => placement.onPick(target),
            });
        } else {
            const node = nodesById.get(target);
            if (!node) throw new Error(`Invalid building slot ${target}`);
            updates.set(`preview:${placement.kind}:${target}`, {
                signature: JSON.stringify([node.x, node.y, [...color]]),
                create: () => {
                    const isSettlement = placement.kind === 'settlement';
                    const options = { position: vec3.fromValues(node.x, BOARD_TOP, node.y), color };
                    const preview = isSettlement ? new Settlement(options) : new City({
                        ...options,
                        // Slightly wider so it doesn't z-fight with the settlement it replaces.
                        scale: vec3.fromValues(1.1, 1, 1.1),
                    });
                    preview.pickRadius = BUILDING_PICK_RADIUS;
                    return preview;
                },
                onPick: () => placement.onPick(target),
            });
        }
    }
    return updates;
}
