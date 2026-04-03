#version 300 es
// Instanced rectangle rendering.
// Each instance: vec4 shape (x, y, w, h) + vec3 colour (rgb).
// Draws a solid colored quad at pixel coordinates in the offscreen framebuffer.

layout(location = 0) in vec4 shape;
layout(location = 1) in vec3 colour;

uniform vec2 resolution;

out vec3 colourV;

const vec2 corners[4] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    vec2 pos = shape.xy;
    vec2 size = shape.zw;
    vec2 camScale = vec2(2.0 / resolution.x, -2.0 / resolution.y);
    vec2 camOffset = resolution * -0.5;
    pos = ((corners[gl_VertexID] * size + pos) + camOffset) * camScale;

    gl_Position = vec4(pos, 0.0, 1.0);
    colourV = colour;
}
