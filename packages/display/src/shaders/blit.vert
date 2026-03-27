#version 300 es
// Fullscreen quad for blitting the offscreen framebuffer to the screen.

uniform vec2 resolution;

out vec2 srcCoord;

const vec2 corners[4] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    vec2 pos = corners[gl_VertexID] * 2.0 - 1.0;
    gl_Position = vec4(pos, 0.0, 1.0);
    srcCoord = corners[gl_VertexID] * resolution;
}
