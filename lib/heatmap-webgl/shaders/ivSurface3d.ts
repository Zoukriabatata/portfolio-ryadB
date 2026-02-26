/**
 * IV 3D SURFACE SHADERS
 *
 * Renders implied volatility data as a colored 3D terrain surface.
 * X = strike, Y = expiration, Z = IV height.
 * Color maps from cool (low IV) to warm (high IV).
 */

export const ivSurfaceVert = `
precision highp float;

attribute vec3 position;    // (x=normalizedStrike, y=normalizedExpiry, z=normalizedIV)
attribute vec3 normal;
attribute float value;      // IV value normalized to [0,1]

uniform mat4 viewProjection;
uniform float heightScale;

varying float vValue;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUV;

void main() {
  vec3 pos = position;
  pos.z *= heightScale;

  gl_Position = viewProjection * vec4(pos, 1.0);

  vValue = value;
  vNormal = normal;
  vWorldPos = pos;
  vUV = vec2(position.x, position.y);
}
`;

export const ivSurfaceFrag = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

varying float vValue;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUV;

uniform float opacity;
uniform vec3 lightDir;
uniform float ambientStrength;
uniform float gridEnabled;

// IV color ramp: blue (low) -> green (mid) -> yellow -> red (high)
vec3 ivColorRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.25) {
    float f = t / 0.25;
    return mix(vec3(0.1, 0.2, 0.6), vec3(0.05, 0.55, 0.55), f);
  } else if (t < 0.5) {
    float f = (t - 0.25) / 0.25;
    return mix(vec3(0.05, 0.55, 0.55), vec3(0.13, 0.77, 0.37), f);
  } else if (t < 0.75) {
    float f = (t - 0.5) / 0.25;
    return mix(vec3(0.13, 0.77, 0.37), vec3(0.95, 0.75, 0.1), f);
  } else {
    float f = (t - 0.75) / 0.25;
    return mix(vec3(0.95, 0.75, 0.1), vec3(0.95, 0.2, 0.15), f);
  }
}

void main() {
  vec3 baseColor = ivColorRamp(vValue);

  // Lambert diffuse + ambient lighting
  vec3 norm = normalize(vNormal);
  float diff = max(dot(norm, normalize(lightDir)), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diff;

  vec3 color = baseColor * lighting;

  // Rim light for depth
  float rimFactor = 1.0 - max(dot(norm, vec3(0.0, 0.0, 1.0)), 0.0);
  color += vec3(0.12, 0.08, 0.02) * pow(rimFactor, 2.5) * 0.35;

  // Subtle surface grid
  if (gridEnabled > 0.5) {
    float gx = abs(fract(vUV.x * 10.0 + 0.5) - 0.5);
    float gy = abs(fract(vUV.y * 10.0 + 0.5) - 0.5);
    float lineX = smoothstep(0.0, 0.015, gx);
    float lineY = smoothstep(0.0, 0.015, gy);
    float gridLine = 1.0 - min(lineX, lineY);
    color = mix(color, vec3(0.7, 0.7, 0.7), gridLine * 0.05);
  }

  // Keep low areas slightly visible
  float floorAlpha = max(vValue * 0.8 + 0.2, 0.3);

  gl_FragColor = vec4(color, opacity * floorAlpha);
}
`;
