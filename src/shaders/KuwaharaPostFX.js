import Phaser from 'phaser';

// Kuwahara filter — an edge-preserving smoothing that gives flat, painterly
// "brush-clump" regions, making procedural (or any) art read as oil-painted.
// Implemented as a Phaser PostFX pipeline applied to a camera.

const frag = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
varying vec2 outTexCoord;

#define RADIUS 3

void main () {
  vec2 texel = 1.0 / uResolution;
  vec2 uv = outTexCoord;
  float n = float((RADIUS + 1) * (RADIUS + 1));

  vec3 m0 = vec3(0.0); vec3 s0 = vec3(0.0);
  vec3 m1 = vec3(0.0); vec3 s1 = vec3(0.0);
  vec3 m2 = vec3(0.0); vec3 s2 = vec3(0.0);
  vec3 m3 = vec3(0.0); vec3 s3 = vec3(0.0);
  vec3 c;

  // Four overlapping quadrants around the pixel.
  for (int j = -RADIUS; j <= 0; j++) {
    for (int i = -RADIUS; i <= 0; i++) {
      c = texture2D(uMainSampler, uv + vec2(float(i), float(j)) * texel).rgb;
      m0 += c; s0 += c * c;
    }
  }
  for (int j = -RADIUS; j <= 0; j++) {
    for (int i = 0; i <= RADIUS; i++) {
      c = texture2D(uMainSampler, uv + vec2(float(i), float(j)) * texel).rgb;
      m1 += c; s1 += c * c;
    }
  }
  for (int j = 0; j <= RADIUS; j++) {
    for (int i = -RADIUS; i <= 0; i++) {
      c = texture2D(uMainSampler, uv + vec2(float(i), float(j)) * texel).rgb;
      m2 += c; s2 += c * c;
    }
  }
  for (int j = 0; j <= RADIUS; j++) {
    for (int i = 0; i <= RADIUS; i++) {
      c = texture2D(uMainSampler, uv + vec2(float(i), float(j)) * texel).rgb;
      m3 += c; s3 += c * c;
    }
  }

  // Output the mean of whichever quadrant has the lowest colour variance.
  vec3 mean; vec3 v; vec3 result; float minv; float vv;
  mean = m0 / n; v = abs(s0 / n - mean * mean); result = mean; minv = v.r + v.g + v.b;
  mean = m1 / n; v = abs(s1 / n - mean * mean); vv = v.r + v.g + v.b; if (vv < minv) { minv = vv; result = mean; }
  mean = m2 / n; v = abs(s2 / n - mean * mean); vv = v.r + v.g + v.b; if (vv < minv) { minv = vv; result = mean; }
  mean = m3 / n; v = abs(s3 / n - mean * mean); vv = v.r + v.g + v.b; if (vv < minv) { minv = vv; result = mean; }

  gl_FragColor = vec4(result, 1.0);
}
`;

export default class KuwaharaPostFX extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  constructor(game) {
    super({ game, name: 'KuwaharaPostFX', fragShader: frag });
  }

  onDraw(renderTarget) {
    this.set2f('uResolution', renderTarget.width, renderTarget.height);
    this.bindAndDraw(renderTarget);
  }
}

/** Turn the painterly filter on for a scene's main camera (WebGL only). */
export function enablePainterly(scene) {
  if (scene.renderer.type !== Phaser.WEBGL) return;
  scene.cameras.main.setPostPipeline(KuwaharaPostFX);
}

/** Toggle the painterly filter; returns the new on/off state. */
export function togglePainterly(scene) {
  if (scene.renderer.type !== Phaser.WEBGL) return false;
  const cam = scene.cameras.main;
  if (cam.hasPostPipeline) {
    cam.resetPostPipeline();
    return false;
  }
  cam.setPostPipeline(KuwaharaPostFX);
  return true;
}
