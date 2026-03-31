#version 300 es
// Instanced text rendering.
// Each instance has a character index (uint8) and RGB colour (3 × uint8).
// Characters are laid out in a fixed grid — the instance ID determines the
// grid position (column = ID % columns, row = ID / columns).
// The vertex shader computes the quad corners and the font atlas UV lookup.

layout(location = 0) in vec3 colour;
layout(location = 1) in float charIndex;

uniform vec2 resolution;
uniform vec2 gridSize;   // e.g. (40, 25)
uniform vec2 cellSize;   // e.g. (8, 10) — pixel size of each character cell
uniform vec2 glyphSize;  // e.g. (5, 7) — pixel size of the glyph within the atlas

out vec3 colourV;
out vec2 fontCoord;

const vec2 corners[4] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    int cols = int(gridSize.x);
    float row = float(gl_InstanceID / cols);
    float col = float(gl_InstanceID - int(row) * cols);

    vec2 pos = vec2(col, row) * cellSize;
    vec2 camScale = vec2(2.0 / resolution.x, -2.0 / resolution.y);
    vec2 camOffset = resolution * -0.5;

    pos = ((corners[gl_VertexID] * glyphSize + pos) + camOffset) * camScale;

    // If char is 0 (empty), move offscreen
    gl_Position = vec4(charIndex == 0.0 ? vec2(2.0) : pos, 0.0, 1.0);
    colourV = colour;
    fontCoord = (vec2(charIndex - 1.0, 0.0) + corners[gl_VertexID]) * glyphSize;
}
