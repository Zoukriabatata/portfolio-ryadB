/**
 * GEX 3D SURFACE SHADERS
 *
 * Renders gamma exposure data as a colored 3D terrain surface.
 * Color maps: green for positive GEX (calls), red for negative (puts).
 * Height encodes absolute GEX magnitude.
 */

export const gexSurfaceVert = `
precision highp float;

attribute vec3 position;    // (x=normalizedStrike, y=normalizedTime, z=normalizedGEX)
attribute vec3 normal;
attribute float value;      // Signed GEX value normalized to [-1,1]

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

export const gexSurfaceFrag = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

varying float vValue;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUV;

uniform vec3 callColor;     // Green tones
uniform vec3 putColor;      // Red tones
uniform vec3 zeroColor;     // Neutral
uniform float opacity;
uniform vec3 lightDir;
uniform float ambientStrength;
uniform float gridEnabled;

void main() {
  // Color mapping: positive=callColor, negative=putColor, zero=zeroColor
  float absVal = abs(vValue);
  vec3 baseColor;
  if (vValue >= 0.0) {
    baseColor = mix(zeroColor, callColor, absVal);
  } else {
    baseColor = mix(zeroColor, putColor, absVal);
  }

  // Lambert diffuse + ambient lighting
  vec3 norm = normalize(vNormal);
  float diff = max(dot(norm, normalize(lightDir)), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diff;

  vec3 color = baseColor * lighting;

  // Rim light for depth
  float rimFactor = 1.0 - max(dot(norm, vec3(0.0, 0.0, 1.0)), 0.0);
  color += vec3(0.15, 0.12, 0.05) * pow(rimFactor, 2.5) * 0.3;

  // Subtle surface grid
  if (gridEnabled > 0.5) {
    float gx = abs(fract(vUV.x * 10.0 + 0.5) - 0.5);
    float gy = abs(fract(vUV.y * 10.0 + 0.5) - 0.5);
    float lineX = smoothstep(0.0, 0.015, gx);
    float lineY = smoothstep(0.0, 0.015, gy);
    float gridLine = 1.0 - min(lineX, lineY);
    color = mix(color, vec3(0.7, 0.7, 0.7), gridLine * 0.04);
  }

  // Keep low areas slightly visible
  float floorAlpha = max(absVal * 0.8 + 0.2, 0.25);

  gl_FragColor = vec4(color, opacity * floorAlpha);
}
`;
