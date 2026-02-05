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

// Staircase line shader (for best bid/ask) - Enhanced with thick lines and glow
export const staircaseVert = `
precision highp float;

attribute vec2 position;      // Center point of line
attribute vec2 normal;        // Perpendicular direction for thickness
attribute float side;         // 0 = bid, 1 = ask
attribute float progress;     // 0 = oldest, 1 = newest (for fade effect)
attribute float edge;         // -1 = bottom edge, 1 = top edge (for thickness)

uniform mat4 projection;
uniform float lineWidth;

varying float vSide;
varying float vProgress;
varying float vEdge;

void main() {
  // Offset position by normal * lineWidth to create thick line
  vec2 pos = position + normal * edge * lineWidth * 0.5;

  gl_Position = projection * vec4(pos, 0.0, 1.0);

  vSide = side;
  vProgress = progress;
  vEdge = edge;
}
`;

export const staircaseFrag = `
precision highp float;

varying float vSide;
varying float vProgress;
varying float vEdge;

uniform vec3 bidColor;
uniform vec3 askColor;
uniform float opacity;
uniform float glowIntensity;
uniform float time;           // Animation time (0-1 cycling)
uniform float trailEnabled;   // 0 = off, 1 = on
uniform float trailFadeSpeed; // Trail animation speed multiplier

void main() {
  vec3 baseColor = vSide < 0.5 ? bidColor : askColor;

  // Core line is brighter, edges have glow falloff
  float distFromCenter = abs(vEdge);

  // Sharp core with soft glow edge
  float core = smoothstep(0.8, 0.3, distFromCenter);
  float glow = smoothstep(1.0, 0.0, distFromCenter) * glowIntensity;

  // Combine core and glow
  float intensity = core + glow * 0.5;

  // Time-based fade: newer = brighter, older = dimmer
  float timeFade = 0.4 + 0.6 * vProgress;

  // Trail animation effect (pulsating wave along the line)
  float trailEffect = 1.0;
  if (trailEnabled > 0.5) {
    // Create a wave that travels from old to new along the line
    float wave = sin((vProgress * 6.28318 - time * 6.28318 * trailFadeSpeed) * 2.0) * 0.5 + 0.5;

    // Pulse effect at the leading edge (newest points)
    float pulse = smoothstep(0.7, 1.0, vProgress) * (sin(time * 6.28318 * 3.0) * 0.3 + 0.7);

    // Combine wave and pulse for trail effect
    trailEffect = 1.0 + wave * 0.3 * (1.0 - vProgress) + pulse * 0.5;

    // Add extra brightness at the tip
    if (vProgress > 0.95) {
      trailEffect += 0.4 * (1.0 + sin(time * 6.28318 * 4.0) * 0.3);
    }
  }

  // Brighten the core
  vec3 color = baseColor * (0.8 + 0.4 * core);

  // Add subtle white highlight at center
  color = mix(color, vec3(1.0), core * 0.15);

  // Apply trail brightening
  color *= trailEffect;

  float alpha = opacity * intensity * timeFade;

  gl_FragColor = vec4(color, alpha);
}
`;

// Fill area shader (between bid and ask lines)
export const fillAreaVert = `
precision highp float;

attribute vec2 position;
attribute float side;     // 0 = bid area, 1 = ask area

uniform mat4 projection;

varying float vSide;
varying vec2 vPos;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);
  vSide = side;
  vPos = position;
}
`;

export const fillAreaFrag = `
precision highp float;

varying float vSide;
varying vec2 vPos;

uniform vec3 bidColor;
uniform vec3 askColor;
uniform float opacity;
uniform float viewportWidth;

void main() {
  vec3 color = vSide < 0.5 ? bidColor : askColor;

  // Horizontal gradient: fade from right (current) to left (history)
  float timeFade = vPos.x / viewportWidth;
  timeFade = 0.2 + 0.8 * timeFade;

  // Subtle gradient
  float alpha = opacity * 0.15 * timeFade;

  gl_FragColor = vec4(color, alpha);
}
`;
