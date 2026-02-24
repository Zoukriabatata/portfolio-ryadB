/**
 * 3D SURFACE HEATMAP SHADERS
 *
 * Renders orderbook depth as a 3D terrain surface.
 * Reuses the existing 256x1 gradient textures for coloring.
 */

// ── Surface Mesh Shaders ────────────────────────────────────────────────

export const surface3dVert = `
precision highp float;

attribute vec3 position;    // (x=normalizedTime, y=normalizedPrice, z=intensity)
attribute vec3 normal;      // Surface normal for lighting
attribute float intensity;  // Raw 0-1 for gradient sampling
attribute float side;       // 0=bid, 1=ask

uniform mat4 viewProjection;
uniform float heightScale;
uniform float time;

varying float vIntensity;
varying float vSide;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUV;

void main() {
  vec3 pos = position;
  pos.z *= heightScale;

  gl_Position = viewProjection * vec4(pos, 1.0);

  vIntensity = intensity;
  vSide = side;
  vNormal = normal;
  vWorldPos = pos;
  vUV = vec2(position.x, position.y);
}
`;

export const surface3dFrag = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

varying float vIntensity;
varying float vSide;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUV;

uniform sampler2D bidGradient;
uniform sampler2D askGradient;
uniform float contrast;
uniform float upperCutoff;
uniform float opacity;
uniform vec3 lightDir;
uniform float ambientStrength;
uniform float gridEnabled;
uniform float gridSpacingX;
uniform float gridSpacingY;

void main() {
  // Contrast + cutoff (matches 2D pipeline)
  float adjusted = pow(vIntensity, 1.0 / max(contrast, 0.1));
  adjusted = clamp(adjusted / max(upperCutoff, 0.01), 0.0, 1.0);

  // Sample from gradient texture
  vec4 baseColor;
  if (vSide < 0.5) {
    baseColor = texture2D(bidGradient, vec2(adjusted, 0.5));
  } else {
    baseColor = texture2D(askGradient, vec2(adjusted, 0.5));
  }

  // Lambert diffuse + ambient lighting (more dramatic)
  vec3 norm = normalize(vNormal);
  float diff = max(dot(norm, normalize(lightDir)), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diff;

  vec3 color = baseColor.rgb * lighting;

  // Rim light — warm orange tint on edges for thermal glow
  float rimFactor = 1.0 - max(dot(norm, vec3(0.0, 0.0, 1.0)), 0.0);
  color += vec3(0.30, 0.15, 0.05) * pow(rimFactor, 2.0) * 0.4;

  // Subtle surface grid (very faint, wider spacing)
  if (gridEnabled > 0.5) {
    float gx = abs(fract(vUV.x / gridSpacingX + 0.5) - 0.5);
    float gy = abs(fract(vUV.y / gridSpacingY + 0.5) - 0.5);
    float lineX = smoothstep(0.0, 0.012, gx);
    float lineY = smoothstep(0.0, 0.012, gy);
    float gridLine = 1.0 - min(lineX, lineY);
    color = mix(color, vec3(0.8, 0.7, 0.5), gridLine * 0.03);
  }

  // Floor visibility — keep low areas slightly visible
  float floorAlpha = max(adjusted * 0.85 + 0.15, 0.20);

  gl_FragColor = vec4(color, opacity * floorAlpha);
}
`;

// ── Grid Floor + Axes Shaders ───────────────────────────────────────────

export const grid3dVert = `
precision highp float;

attribute vec3 position;
attribute vec3 color;

uniform mat4 viewProjection;

varying vec3 vColor;

void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vColor = color;
}
`;

export const grid3dFrag = `
precision highp float;

varying vec3 vColor;
uniform float opacity;

void main() {
  gl_FragColor = vec4(vColor, opacity);
}
`;
