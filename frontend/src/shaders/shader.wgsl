struct Uniforms {
    mvp: mat4x4f,
    model: mat4x4f,
    normalMatrix: mat3x3f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) normal: vec3f
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
    var lightDir = vec3f(0, -1, 0);
    var lightColor = vec3f(0.95, 0.9, 0.8);
    const ambient: f32 = 0.3;

    var diff = min(1.0, ambient + max(0.0, dot(-normalize(normal), lightDir)));
    var outputColor = diff * lightColor * color;
    return vec4f(outputColor, 1.0);
}