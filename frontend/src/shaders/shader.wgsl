struct Uniforms {
    mvp: mat4x4f,
    model: mat4x4f,
    normalMatrix: mat3x3f,
}

struct Lighting {
    /** xyz: unit vector towards the sun. */
    sunDirection: vec4f,
    /** rgb: sun color, a: ambient strength. */
    sunColor: vec4f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(1) @binding(0)
var<uniform> lighting: Lighting;
@group(1) @binding(1)
var environmentSampler: sampler;
/** Sky irradiance, normalized to an average luminance of 1. */
@group(1) @binding(2)
var irradiance: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) normal: vec3f
}

const PI: f32 = 3.14159265;

fn equirectUv(direction: vec3f) -> vec2f {
    return vec2f(atan2(direction.x, -direction.z) / (2.0 * PI) + 0.5, acos(clamp(direction.y, -1.0, 1.0)) / PI);
}

@vertex
fn vsMain(
    @location(0) position: vec3f,
    @location(1) color: vec3f,
    @location(2) normal: vec3f
    ) -> VertexOutput {

    var output: VertexOutput;
    output.position = uniforms.mvp * vec4f(position, 1.0);
    output.normal = uniforms.normalMatrix * normal;
    output.color = color;
    return output;
}

@fragment
fn fsMain(@location(0) color: vec3f, @location(1) normal: vec3f) -> @location(0) vec4f {
    let n = normalize(normal);
    let sun = max(0.0, dot(n, lighting.sunDirection.xyz)) * lighting.sunColor.rgb;
    let ambient = textureSampleLevel(irradiance, environmentSampler, equirectUv(n), 0.0).rgb
        * lighting.sunColor.a;
    return vec4f(min(vec3f(1.0), sun + ambient) * color, 1.0);
}