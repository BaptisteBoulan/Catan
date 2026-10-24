struct SkyUniforms {
    /** Inverse of projection * view, without the camera translation. */
    inverseViewProjection: mat4x4f,
    /** x: exposure. */
    params: vec4f,
}

@group(0) @binding(0)
var<uniform> sky: SkyUniforms;
@group(0) @binding(1)
var skySampler: sampler;
@group(0) @binding(2)
var skyTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) ndc: vec2f,
}

const PI: f32 = 3.14159265;

fn equirectUv(direction: vec3f) -> vec2f {
    return vec2f(atan2(direction.x, -direction.z) / (2.0 * PI) + 0.5, acos(clamp(direction.y, -1.0, 1.0)) / PI);
}

// Narkowicz's ACES filmic curve approximation.
fn tonemap(color: vec3f) -> vec3f {
    return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

@vertex
fn vsMain(@builtin(vertex_index) index: u32) -> VertexOutput {
    // One triangle covering the whole screen.
    let ndc = vec2f(f32((index << 1u) & 2u), f32(index & 2u)) * 2.0 - 1.0;
    var output: VertexOutput;
    output.position = vec4f(ndc, 1.0, 1.0);
    output.ndc = ndc;
    return output;
}

@fragment
fn fsMain(@location(0) ndc: vec2f) -> @location(0) vec4f {
    let far = sky.inverseViewProjection * vec4f(ndc, 1.0, 1.0);
    let direction = normalize(far.xyz / far.w);
    let radiance = textureSampleLevel(skyTexture, skySampler, equirectUv(direction), 0.0).rgb;
    let color = tonemap(radiance * sky.params.x);
    return vec4f(pow(color, vec3f(1.0 / 2.2)), 1.0);
}