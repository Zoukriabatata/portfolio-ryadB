/**
 * Heatmap Shaders
 * Renders passive orders as horizontal bars with intensity-based coloring
 */

export const heatmapVert = `
precision highp float;

attribute vec2 position;      // Normalized position (0-1) within cell
attribute vec2 offset;        // Instance offset (x = time position, y = price position)
attribute float intensity;    // Order intensity 0-1
attribute float side;         // 0 = bid, 1 = ask
attribute float width;        // Bar width in pixels

uniform mat4 projection;
uniform vec2 viewport;        // Canvas size in pixels
uniform float cellHeight;     // Height of each price level
uniform float baseX;          // Left edge of heatmap area

varying float vIntensity;
varying float vSide;
varying vec2 vUV;

void main() {
  // Calculate screen position
  float x = baseX + offset.x + position.x * width;
  float y = offset.y + position.y * cellHeight;

  // Apply projection
  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  // Pass to fragment shader
  vIntensity = intensity;
  vSide = side;
  vUV = position;
}
`;

export const heatmapFrag = `
precision highp float;

varying float vIntensity;
varying float vSide;
varying vec2 vUV;

uniform sampler2D bidGradient;
uniform sampler2D askGradient;
uniform float contrast;
uniform float upperCutoff;
uniform float opacity;

void main() {
  // Apply contrast and cutoff
  float adjusted = pow(vIntensity, 1.0 / contrast);
  adjusted = clamp(adjusted / upperCutoff, 0.0, 1.0);

  // Sample from gradient texture based on side
  vec4 color;
  if (vSide < 0.5) {
    color = texture2D(bidGradient, vec2(adjusted, 0.5));
  } else {
    color = texture2D(askGradient, vec2(adjusted, 0.5));
  }

  // Apply overall opacity
  color.a *= opacity;

  // Soft edge at bar ends
  float edgeFade = smoothstep(0.0, 0.05, vUV.x) * smoothstep(1.0, 0.95, vUV.x);
  color.a *= edgeFade;

  gl_FragColor = color;
}
`;

// Grid lines shader
export const gridVert = `
precision highp float;

attribute vec2 position;

uniform mat4 projection;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);
}
`;

export const gridFrag = `
precision highp float;

uniform vec4 color;

void main() {
  gl_FragColor = color;
}
`;

// Staircase line shader (for best bid/ask)
export const staircaseVert = `
precision highp float;

attribute vec2 position;
attribute float side;     // 0 = bid, 1 = ask

uniform mat4 projection;

varying float vSide;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);
  vSide = side;
}
`;

export const staircaseFrag = `
precision highp float;

varying float vSide;

uniform vec3 bidColor;
uniform vec3 askColor;
uniform float lineWidth;
uniform float opacity;

void main() {
  vec3 color = vSide < 0.5 ? bidColor : askColor;
  gl_FragColor = vec4(color, opacity);
}
`;
