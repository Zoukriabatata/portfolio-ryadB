/**
 * Heatmap Shaders
 * Renders passive orders as horizontal bars with intensity-based coloring
 */

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED HEATMAP SHADERS - Glow, Pulse, States, Iceberg
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED INSTANCED SHADER - Glow, Pulse, States, Iceberg
// ═══════════════════════════════════════════════════════════════════════════

export const heatmapInstancedVert = `
precision highp float;

// Per-vertex
attribute vec2 position;      // Quad corner (0,0) to (1,1)

// Per-instance
attribute vec2 offset;        // (x, y) screen position
attribute float intensity;    // 0-1 normalized
attribute float side;         // 0 = bid, 1 = ask
attribute float cellWidth;    // Width of this cell
attribute float age;          // 0 = new, 1 = old
attribute float state;        // 0=new, 1=stable, 2=absorbed, 3=fading, 4=iceberg
attribute float pulsePhase;   // 0-1 for synchronized pulse

uniform mat4 projection;
uniform float cellHeight;
uniform float baseX;
uniform float time;           // Animation time

varying float vIntensity;
varying float vSide;
varying float vAge;
varying float vState;
varying float vPulse;
varying vec2 vUV;

void main() {
  // Calculate screen position
  float x = baseX + offset.x + position.x * cellWidth;
  float y = offset.y + position.y * cellHeight;

  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  // Pass to fragment
  vIntensity = intensity;
  vSide = side;
  vAge = age;
  vState = state;
  vUV = position;

  // Pulse animation for new orders
  float pulse = 0.0;
  if (state < 0.5) { // new state
    pulse = sin((time + pulsePhase) * 6.28318 * 2.0) * 0.5 + 0.5;
  }
  vPulse = pulse;
}
`;

export const heatmapInstancedFrag = `
precision highp float;

varying float vIntensity;
varying float vSide;
varying float vAge;
varying float vState;
varying float vPulse;
varying vec2 vUV;

uniform sampler2D bidGradient;
uniform sampler2D askGradient;
uniform float contrast;
uniform float upperCutoff;
uniform float opacity;
uniform float glowEnabled;
uniform float glowIntensity;

// State colors
const vec3 newColor = vec3(1.0, 1.0, 0.5);      // Yellow tint for new
const vec3 absorbedColor = vec3(1.0, 0.5, 0.0); // Orange for absorbed
const vec3 icebergColor = vec3(0.0, 1.0, 1.0);  // Cyan for iceberg

void main() {
  // Apply contrast and cutoff
  float adjusted = pow(vIntensity, 1.0 / contrast);
  adjusted = clamp(adjusted / upperCutoff, 0.0, 1.0);

  // Sample base color from gradient
  vec4 baseColor;
  if (vSide < 0.5) {
    baseColor = texture2D(bidGradient, vec2(adjusted, 0.5));
  } else {
    baseColor = texture2D(askGradient, vec2(adjusted, 0.5));
  }

  vec3 color = baseColor.rgb;
  float alpha = baseColor.a;

  // ═══════════════════════════════════════════════════════════════
  // STATE-BASED COLORING
  // ═══════════════════════════════════════════════════════════════

  // New orders (state 0): yellow tint + pulse
  if (vState < 0.5) {
    color = mix(color, newColor, 0.3 + vPulse * 0.2);
    alpha *= 1.0 + vPulse * 0.3;
  }
  // Stable (state 1): normal color
  else if (vState < 1.5) {
    // No modification
  }
  // Absorbed (state 2): orange tint
  else if (vState < 2.5) {
    color = mix(color, absorbedColor, 0.4);
  }
  // Fading (state 3): dimmed
  else if (vState < 3.5) {
    alpha *= 0.5;
    color *= 0.7;
  }
  // Iceberg (state 4): cyan outline + glow
  else if (vState < 4.5) {
    // Add cyan tint and brighter glow
    color = mix(color, icebergColor, 0.3);
    alpha *= 1.2;
  }

  // ═══════════════════════════════════════════════════════════════
  // AGE-BASED FADE
  // ═══════════════════════════════════════════════════════════════

  // Fade older orders slightly
  float ageFade = 1.0 - vAge * 0.3;
  alpha *= ageFade;

  // ═══════════════════════════════════════════════════════════════
  // GLOW EFFECT (for high intensity orders)
  // ═══════════════════════════════════════════════════════════════

  if (glowEnabled > 0.5 && adjusted > 0.6) {
    // Distance from center of cell
    vec2 centered = vUV - vec2(0.5);
    float dist = length(centered);

    // Glow falloff
    float glowFactor = smoothstep(0.5, 0.2, dist);
    float glowAmount = (adjusted - 0.6) / 0.4 * glowIntensity;

    // Add glow (brighten center)
    color = mix(color, vec3(1.0), glowFactor * glowAmount * 0.3);
    alpha += glowFactor * glowAmount * 0.2;
  }

  // ═══════════════════════════════════════════════════════════════
  // ICEBERG BORDER
  // ═══════════════════════════════════════════════════════════════

  if (vState > 3.5 && vState < 4.5) {
    // Draw cyan border for iceberg orders
    float borderWidth = 0.08;
    float border = 1.0 - smoothstep(0.0, borderWidth, vUV.x)
                 * smoothstep(0.0, borderWidth, 1.0 - vUV.x)
                 * smoothstep(0.0, borderWidth, vUV.y)
                 * smoothstep(0.0, borderWidth, 1.0 - vUV.y);

    if (border > 0.5) {
      color = icebergColor;
      alpha = 0.9;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SOFT EDGES
  // ═══════════════════════════════════════════════════════════════

  float edgeFade = smoothstep(0.0, 0.05, vUV.x) * smoothstep(1.0, 0.95, vUV.x);
  alpha *= edgeFade;

  // Apply overall opacity
  alpha *= opacity;

  gl_FragColor = vec4(color, alpha);
}
`;

// Grid lines shader with major/minor support
export const gridVert = `
precision highp float;

attribute vec2 position;
attribute float lineType;  // 0 = minor, 1 = major

uniform mat4 projection;

varying float vLineType;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);
  vLineType = lineType;
}
`;

export const gridFrag = `
precision highp float;

uniform vec4 majorColor;
uniform vec4 minorColor;
uniform float dashSize;     // 0 = solid, >0 = dashed
uniform float gapSize;
uniform vec2 lineStart;     // For dash calculation
uniform vec2 lineEnd;

varying float vLineType;

void main() {
  vec4 color = vLineType > 0.5 ? majorColor : minorColor;

  // Dash pattern (if enabled)
  if (dashSize > 0.0) {
    float lineLength = length(lineEnd - lineStart);
    float pattern = mod(gl_FragCoord.x + gl_FragCoord.y, dashSize + gapSize);
    if (pattern > dashSize) {
      discard;
    }
  }

  gl_FragColor = color;
}
`;

// Tick marks shader
export const tickMarkVert = `
precision highp float;

attribute vec2 position;
attribute float highlight;  // 0 = normal, 1 = highlight (round number)

uniform mat4 projection;

varying float vHighlight;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);
  vHighlight = highlight;
}
`;

export const tickMarkFrag = `
precision highp float;

uniform vec3 normalColor;
uniform vec3 highlightColor;
uniform float opacity;

varying float vHighlight;

void main() {
  vec3 color = vHighlight > 0.5 ? highlightColor : normalColor;
  gl_FragColor = vec4(color, opacity);
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
