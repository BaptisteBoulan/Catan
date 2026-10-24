/** Linear RGB pixels of an equirectangular image, row 0 at the top (+Y). */
export type HdrImage = {
    width: number;
    height: number;
    data: Float32Array;
};

export type Environment = {
    sky: HdrImage;
    /** Low-resolution cosine-convolved sky, normalized to an average luminance of 1. */
    irradiance: HdrImage;
    /** Unit vector pointing from the scene towards the sun. */
    sunDirection: [number, number, number];
};

const IRRADIANCE_WIDTH = 32;
const IRRADIANCE_HEIGHT = 16;
/** Pixels brighter than this many times the median are clipped before the ambient blur. */
const AMBIENT_CLIP = 8;
const MIN_SUN_ELEVATION = Math.PI / 5;

/** Parses a Radiance RGBE (.hdr) file, flat or new-style run-length encoded. */
export function parseHdr(buffer: ArrayBuffer): HdrImage {
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    const readLine = () => {
        const start = offset;
        while (offset < bytes.length && bytes[offset] !== 0x0a) offset++;
        const line = String.fromCharCode(...bytes.subarray(start, offset));
        offset++;
        return line.trim();
    };

    if (!readLine().startsWith("#?")) throw new Error("Not a Radiance HDR file");
    for (let line = readLine(); line !== ""; line = readLine()) {
        if (line.startsWith("FORMAT=") && line !== "FORMAT=32-bit_rle_rgbe") {
            throw new Error(`Unsupported HDR format: ${line}`);
        }
        if (offset >= bytes.length) throw new Error("Truncated HDR header");
    }
    const resolution = /^-Y (\d+) \+X (\d+)$/.exec(readLine());
    if (!resolution) throw new Error("Unsupported HDR orientation");
    const height = Number(resolution[1]);
    const width = Number(resolution[2]);

    const rgbe = new Uint8Array(width * height * 4);
    const scanline = new Uint8Array(width * 4);
    for (let y = 0; y < height; y++) {
        const isRle = width >= 8 && width < 0x8000 && bytes[offset] === 2 && bytes[offset + 1] === 2
            && ((bytes[offset + 2] << 8) | bytes[offset + 3]) === width;
        if (!isRle) {
            // Flat file: the remaining pixels are stored as is.
            const size = (height - y) * width * 4;
            if (offset + size > bytes.length) throw new Error("Truncated HDR data");
            rgbe.set(bytes.subarray(offset, offset + size), y * width * 4);
            break;
        }
        offset += 4;
        for (let channel = 0; channel < 4; channel++) {
            for (let x = 0; x < width;) {
                if (offset >= bytes.length) throw new Error("Truncated HDR data");
                let count = bytes[offset++];
                if (count > 128) {
                    count -= 128;
                    if (x + count > width) throw new Error("Corrupt HDR run");
                    const value = bytes[offset++];
                    for (let i = 0; i < count; i++) scanline[(x++) * 4 + channel] = value;
                } else {
                    if (count === 0 || x + count > width) throw new Error("Corrupt HDR run");
                    for (let i = 0; i < count; i++) scanline[(x++) * 4 + channel] = bytes[offset++];
                }
            }
        }
        rgbe.set(scanline, y * width * 4);
    }

    const data = new Float32Array(width * height * 4);
    for (let i = 0; i < rgbe.length; i += 4) {
        const exponent = rgbe[i + 3];
        const scale = exponent === 0 ? 0 : 2 ** (exponent - 136);
        data[i] = rgbe[i] * scale;
        data[i + 1] = rgbe[i + 1] * scale;
        data[i + 2] = rgbe[i + 2] * scale;
        data[i + 3] = 1;
    }
    return { width, height, data };
}

function luminance(data: Float32Array, i: number): number {
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

/** Same mapping as `equirectUv` in the shaders. */
function texelDirection(u: number, v: number): [number, number, number] {
    const phi = (u - 0.5) * 2 * Math.PI;
    const theta = v * Math.PI;
    return [Math.sin(theta) * Math.sin(phi), Math.cos(theta), -Math.sin(theta) * Math.cos(phi)];
}

/** Derives the ambient light and a sun direction from an equirectangular HDR sky. */
export function createEnvironment(sky: HdrImage): Environment {
    const { width, height, data } = sky;

    const samples: number[] = [];
    let brightest = 0;
    let brightestLuminance = -1;
    for (let i = 0; i < data.length; i += 4) {
        const value = luminance(data, i);
        if (value > brightestLuminance) {
            brightestLuminance = value;
            brightest = i / 4;
        }
        if (i % 64 === 0) samples.push(value);
    }
    samples.sort((a, b) => a - b);
    const clip = Math.max(1e-6, samples[samples.length >> 1] * AMBIENT_CLIP);

    // Box-downsample the clipped radiance, then convolve with a cosine lobe.
    const cells = IRRADIANCE_WIDTH * IRRADIANCE_HEIGHT;
    const radiance = new Float64Array(cells * 3);
    const counts = new Float64Array(cells);
    for (let y = 0; y < height; y++) {
        const cy = Math.min(IRRADIANCE_HEIGHT - 1, Math.floor(y * IRRADIANCE_HEIGHT / height));
        for (let x = 0; x < width; x++) {
            const cell = cy * IRRADIANCE_WIDTH + Math.min(IRRADIANCE_WIDTH - 1,
                Math.floor(x * IRRADIANCE_WIDTH / width));
            const i = (y * width + x) * 4;
            const factor = Math.min(1, clip / Math.max(1e-9, luminance(data, i)));
            for (let c = 0; c < 3; c++) radiance[cell * 3 + c] += data[i + c] * factor;
            counts[cell]++;
        }
    }
    const directions: [number, number, number][] = [];
    const solidAngles: number[] = [];
    for (let cell = 0; cell < cells; cell++) {
        for (let c = 0; c < 3; c++) radiance[cell * 3 + c] /= Math.max(1, counts[cell]);
        const u = (cell % IRRADIANCE_WIDTH + 0.5) / IRRADIANCE_WIDTH;
        const v = (Math.floor(cell / IRRADIANCE_WIDTH) + 0.5) / IRRADIANCE_HEIGHT;
        directions.push(texelDirection(u, v));
        solidAngles.push(Math.sin(v * Math.PI));
    }

    const irradiance = new Float32Array(cells * 4);
    let totalLuminance = 0;
    for (let out = 0; out < cells; out++) {
        const n = directions[out];
        let r = 0, g = 0, b = 0, weight = 0;
        for (let cell = 0; cell < cells; cell++) {
            const d = directions[cell];
            const cosine = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
            if (cosine <= 0) continue;
            const w = cosine * solidAngles[cell];
            r += radiance[cell * 3] * w;
            g += radiance[cell * 3 + 1] * w;
            b += radiance[cell * 3 + 2] * w;
            weight += w;
        }
        irradiance.set([r / weight, g / weight, b / weight, 1], out * 4);
        totalLuminance += luminance(irradiance, out * 4) * solidAngles[out];
    }
    const average = totalLuminance / solidAngles.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < irradiance.length; i += 4) {
        for (let c = 0; c < 3; c++) irradiance[i + c] /= Math.max(1e-9, average);
    }

    // Light from a low sun would leave the board's top faces dark, so raise it.
    const [sx, sy, sz] = texelDirection(
        (brightest % width + 0.5) / width, (Math.floor(brightest / width) + 0.5) / height,
    );
    const elevation = Math.max(MIN_SUN_ELEVATION, Math.asin(Math.min(1, Math.max(-1, sy))));
    const horizontal = Math.hypot(sx, sz) || 1;
    const sunDirection: [number, number, number] = [
        sx / horizontal * Math.cos(elevation), Math.sin(elevation), sz / horizontal * Math.cos(elevation),
    ];

    return {
        sky,
        irradiance: { width: IRRADIANCE_WIDTH, height: IRRADIANCE_HEIGHT, data: irradiance },
        sunDirection,
    };
}

export async function loadEnvironment(url: string, signal?: AbortSignal): Promise<Environment> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`Failed to load environment "${url}": ${response.status} ${response.statusText}`);
    }
    return createEnvironment(parseHdr(await response.arrayBuffer()));
}

const floatView = new Float32Array(1);
const intView = new Uint32Array(floatView.buffer);

/** Converts to IEEE half floats (for rgba16float textures), clamping to the finite range. */
export function toHalfFloats(values: Float32Array): Uint16Array {
    const result = new Uint16Array(values.length);
    for (let i = 0; i < values.length; i++) {
        floatView[0] = Math.min(65504, Math.max(-65504, values[i]));
        const bits = intView[0];
        const sign = (bits >>> 16) & 0x8000;
        const exponent = ((bits >>> 23) & 0xff) - 112;
        const mantissa = bits & 0x7fffff;
        if (exponent <= 0) {
            // Subnormal halves; tiny values flush to zero.
            result[i] = exponent < -10 ? sign
                : sign | (((mantissa | 0x800000) >>> (1 - exponent)) + 0x1000) >>> 13;
        } else {
            result[i] = sign | ((exponent << 10) + ((mantissa + 0x1000) >>> 13));
        }
    }
    return result;
}
