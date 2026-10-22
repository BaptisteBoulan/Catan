import earcut from "earcut";
import { vec3, type Vec3 } from "wgpu-matrix";
import { Geometry } from "../geometry";

/**
 * Fetches browser-accessible OBJ and optional MTL URLs, then parses their content.
 * Use Vite asset URLs for files under src, or public URLs for files under public.
 */
export async function loadOBJFromPath(
    objPath: string,
    mtlPath?: string,
    defaultColor?: Vec3,
    signal?: AbortSignal
): Promise<Geometry> {
    async function loadText(path: string): Promise<string> {
        const response = await fetch(path, { signal });
        if (!response.ok) {
            throw new Error(`Failed to load mesh asset "${path}": ${response.status} ${response.statusText}`);
        }
        return response.text();
    }

    const [objText, mtlText] = await Promise.all([
        loadText(objPath),
        mtlPath === undefined ? undefined : loadText(mtlPath),
    ]);
    return loadOBJ(objText, mtlText, defaultColor);
}

/**
 * Loads a 3D mesh from OBJ text content, with optional MTL material color support.
 * @param objText Raw string content of the .obj file
 * @param mtlText Optional raw string content of the corresponding .mtl file
 * @param defaultColor Fallback color if no material is defined or found
 */
export function loadOBJ(
    objText: string, 
    mtlText?: string, 
    defaultColor: Vec3 = vec3.fromValues(0.2, 0.2, 0.2)
): Geometry {
    // 1. Parse MTL file content if provided (extracts diffuse color `Kd`)
    const materials = new Map<string, Vec3>();
    if (mtlText) {
        let currentMtl = "";
        for (const line of mtlText.split("\n")) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === "newmtl") {
                currentMtl = parts[1];
            } else if (parts[0] === "Kd" && currentMtl) {
                materials.set(
                    currentMtl, 
                    vec3.fromValues(
                        parseFloat(parts[1]), 
                        parseFloat(parts[2]), 
                        parseFloat(parts[3])
                    )
                );
            }
        }
    }

    // 2. Data buffers for Geometry
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // Temporary raw storage from OBJ
    const tempPositions: number[][] = [];
    const tempNormals: number[][] = [];

    let currentMaterialColor: Vec3 = defaultColor;
    
    // Maps unique OBJ vertex combo string ("v/vt/vn") to new unified index
    const vertexMap = new Map<string, number>();

    // 3. Parse OBJ file content line by line
    const lines = objText.split("\n");
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith("#") || line === "") continue;

        const parts = line.split(/\s+/);
        const type = parts[0];

        if (type === "v") {
            tempPositions.push([
                parseFloat(parts[1]), 
                parseFloat(parts[2]), 
                parseFloat(parts[3])
            ]);
        } else if (type === "vn") {
            tempNormals.push([
                parseFloat(parts[1]), 
                parseFloat(parts[2]), 
                parseFloat(parts[3])
            ]);
        } else if (type === "usemtl") {
            const mtlName = parts[1];
            if (materials.has(mtlName)) {
                currentMaterialColor = materials.get(mtlName)!;
            }
        } else if (type === "f") {
            // Face definition (can be triangles, quads, or n-gons)
            const faceVertices = parts.slice(1);
            const parsedIndices: number[] = [];

            for (const vertexStr of faceVertices) {
                if (vertexMap.has(vertexStr)) {
                    parsedIndices.push(vertexMap.get(vertexStr)!);
                } else {
                    const indicesParts = vertexStr.split("/");
                    const pIdx = parseInt(indicesParts[0], 10) - 1;
                    const nIdx = indicesParts[2] ? parseInt(indicesParts[2], 10) - 1 : -1;

                    const pos = tempPositions[pIdx] || [0, 0, 0];
                    const norm = (nIdx >= 0 && tempNormals[nIdx]) ? tempNormals[nIdx] : [0, 1, 0];

                    const newIndex = positions.length / 3;
                    vertexMap.set(vertexStr, newIndex);

                    positions.push(...pos);
                    normals.push(...norm);
                    colors.push(...currentMaterialColor);

                    parsedIndices.push(newIndex);
                }
            }

            if (parsedIndices.length === 3) {
                indices.push(...parsedIndices);
                continue;
            }

            // Project onto the face's dominant plane; fans fill concave digit cutouts.
            const normal = [0, 0, 0];
            for (let i = 0; i < parsedIndices.length; i++) {
                const a = parsedIndices[i] * 3;
                const b = parsedIndices[(i + 1) % parsedIndices.length] * 3;
                normal[0] += (positions[a + 1] - positions[b + 1]) * (positions[a + 2] + positions[b + 2]);
                normal[1] += (positions[a + 2] - positions[b + 2]) * (positions[a] + positions[b]);
                normal[2] += (positions[a] - positions[b]) * (positions[a + 1] + positions[b + 1]);
            }
            const dominant = normal.map(Math.abs);
            const [u, v] = dominant[0] >= dominant[1] && dominant[0] >= dominant[2]
                ? [1, 2] : dominant[1] >= dominant[2] ? [0, 2] : [0, 1];
            const polygon = parsedIndices.flatMap((index) => [positions[index * 3 + u], positions[index * 3 + v]]);
            let area = 0;
            for (let i = 0; i < parsedIndices.length; i++) {
                const next = (i + 1) % parsedIndices.length;
                area += polygon[i * 2] * polygon[next * 2 + 1] - polygon[next * 2] * polygon[i * 2 + 1];
            }
            const triangles = earcut(polygon);
            if (triangles.length === 0) {
                throw new Error("Cannot triangulate OBJ face");
            }
            for (let i = 0; i < triangles.length; i += 3) {
                const [a, b, c] = triangles.slice(i, i + 3);
                const triangleArea = (polygon[b * 2] - polygon[a * 2]) * (polygon[c * 2 + 1] - polygon[a * 2 + 1])
                    - (polygon[b * 2 + 1] - polygon[a * 2 + 1]) * (polygon[c * 2] - polygon[a * 2]);
                // Preserve OBJ winding for back-face culling.
                indices.push(parsedIndices[a], parsedIndices[triangleArea * area < 0 ? c : b],
                    parsedIndices[triangleArea * area < 0 ? b : c]);
            }
        }
    }

    // Fallback if no normals were present in the OBJ file
    if (normals.length === 0 && positions.length > 0) {
        for (let i = 0; i < positions.length / 3; i++) {
            normals.push(0, 1, 0);
        }
    }

    return Geometry.fromArrays(positions, colors, indices, normals);
}