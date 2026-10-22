// The signature piece: an additive, shader-driven hyperspace tube.
// Bands are independent slices so the tunnel can wrap seamlessly.
import * as THREE from 'three';
import { PATH_GLSL, TUBE_RADIUS } from './path.js';

const RINGS = 200;
const SEGMENTS = 56;
const SPACING = 2.6;
const BAND = 2.72;
const LOOP = RINGS * SPACING;
const BEHIND = 7;

const vertexShader = /* glsl */ `
  ${PATH_GLSL}
  attribute float aRing;
  attribute float aEnd;
  attribute float aAngle;

  uniform float uTraveled;
  uniform float uLoopLen;
  uniform float uBand;
  uniform float uBehind;
  uniform float uRadius;

  varying float vAhead;
  varying float vA;
  varying float vAngle;

  void main() {
    float base = mod(aRing - uTraveled, uLoopLen) - uBehind;
    float ahead = base + aEnd * uBand;
    float a = uTraveled + ahead;
    vec2 center = pathCenter(a);
    float radius = uRadius * (1.0 + 0.026 * sin(a * 0.052) + 0.015 * sin(a * 0.131 + 2.0));
    float twist = a * 0.0125;
    float ct = cos(twist);
    float st = sin(twist);
    vec2 ringPos = vec2(position.x * ct - position.y * st, position.x * st + position.y * ct);
    vec3 p = vec3(center + ringPos * radius, -ahead);
    vAhead = ahead;
    vA = a;
    vAngle = aAngle;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uGlow;
  uniform vec3 uFogColor;
  uniform float uTime;
  uniform float uFogStart;
  uniform float uFogEnd;
  uniform float uBoost;
  uniform float uPulse;
  uniform float uGateWarmth;
  uniform float uBehind;

  varying float vAhead;
  varying float vA;
  varying float vAngle;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    float ang = vAngle * 6.2831853;

    // ---- structural grid -------------------------------------------------
    float ca = vAngle * 34.0;
    float dca = abs(fract(ca + 0.5) - 0.5);
    float lon = 1.0 - smoothstep(0.0, max(0.004, fwidth(ca) * 1.15), dca);

    float cb = vAngle * 136.0;
    float dcb = abs(fract(cb + 0.5) - 0.5);
    float fineLon = (1.0 - smoothstep(0.0, max(0.004, fwidth(cb) * 1.0), dcb)) * 0.32;
    fineLon *= 1.0 - smoothstep(50.0, 190.0, vAhead);

    float tr = vA * 0.072;
    float dtr = abs(fract(tr + 0.5) - 0.5);
    float ringL = 1.0 - smoothstep(0.0, max(0.0035, fwidth(tr) * 1.3), dtr);

    // ---- structure -------------------------------------------------------
    float major = abs(fract(vA / 46.0 + 0.5) - 0.5) * 46.0;
    float frame = 1.0 - smoothstep(0.0, 0.8, major);
    float frameBody = (1.0 - smoothstep(0.0, 2.2, major)) * 0.35;

    float hoopD = abs(fract(vA / 30.0 + 0.5) - 0.5) * 30.0;
    float hoop = 1.0 - smoothstep(0.0, 0.3, hoopD);
    float hoopGlow = (1.0 - smoothstep(0.0, 1.8, hoopD)) * 0.12;

    float railD = abs(sin(ang * 2.0));
    float rail = 1.0 - smoothstep(0.0, 0.06, railD);
    float railCore = 1.0 - smoothstep(0.0, 0.016, railD);
    float railHalo = (1.0 - smoothstep(0.0, 0.28, railD)) * 0.06;
    float node = (1.0 - smoothstep(0.0, 0.35, major)) * step(0.5, sin(vA * 0.9 + ang * 2.0));

    float runLightCell = floor(vA * 0.35 - uTime * 2.4);
    float runLight = step(0.72, hash21(vec2(floor(vAngle * 34.0), runLightCell)))
                   * smoothstep(0.22, 0.0, dca) * (1.0 - smoothstep(0.0, 0.2, railD));

    // ---- energy ----------------------------------------------------------
    float pulse = pow(max(0.0, sin(vA * 0.085 - uTime * 2.1)), 22.0);
    float pulse2 = pow(max(0.0, sin(vA * 0.031 - uTime * 0.9 + 1.7)), 8.0) * 0.4;

    float dashCell = floor(vA * 0.42 + uTime * 3.0);
    float dash = step(0.92, hash21(vec2(floor(vAngle * 34.0), dashCell)));
    float data = dash * smoothstep(0.4, 0.0, dca) * smoothstep(0.2, 0.9, sin(vA * 0.08 - uTime));

    float warm = uGateWarmth * (0.35 + 0.65 * pulse2);

    vec3 tint = mix(uColorA, uColorB, 0.35 + 0.65 * (0.5 + 0.5 * sin(ang * 2.0 + vA * 0.004)));
    vec3 col = vec3(0.0);

    col += tint * lon * 0.3;
    col += uColorB * fineLon * 0.38;
    col += tint * ringL * 0.14;
    col += uColorB * frameBody * 0.4;
    col += uGlow * frame * 0.7;
    col += uGlow * node * 1.0;
    col += uGlow * (hoop * 1.1 + hoopGlow);
    col += uGlow * (rail * 0.55 + railCore * 1.2 + railHalo);
    col += vec3(1.0, 0.9, 0.72) * runLight * 1.2;
    col += uColorB * pulse * 0.8 + uColorB * pulse2 * 0.45;
    col += uGlow * data * 1.2;
    col += uGlow * warm * 1.6;
    col *= 1.0 + uBoost * 0.6 + uPulse * 0.5;

    col *= 0.62;

    // Additive slices pile up near the camera and at the vanishing point, so
    // fade both ends: the wall right beside the camera sits in shadow, which
    // keeps barriers readable, and the far end melts into the void.
    float nearFade = smoothstep(1.0, 22.0, vAhead);
    float farFade = 1.0 - smoothstep(95.0, 320.0, vAhead);
    float alpha = nearFade * farFade;

    gl_FragColor = vec4(col, alpha);
  }
`;

const shellFragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uGlow;
  uniform vec3 uFogColor;
  uniform float uTime;
  uniform float uFogStart;
  uniform float uFogEnd;
  uniform float uPulse;
  uniform float uGateWarmth;
  uniform float uBehind;

  varying float vAhead;
  varying float vA;
  varying float vAngle;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    float ang = vAngle * 6.2831853;
    float panelU = vAngle * 34.0;
    float panelV = vA * 0.145;
    vec2 cell = vec2(floor(panelU), floor(panelV));
    float cellRand = hash21(cell);
    vec2 cellF = vec2(fract(panelU), fract(panelV));
    float bevel = smoothstep(0.0, 0.12, cellF.x) * smoothstep(0.0, 0.12, cellF.y)
                * smoothstep(1.0, 0.88, cellF.x) * smoothstep(1.0, 0.88, cellF.y);
    float stripe = step(0.9, cellRand) * smoothstep(0.46, 0.5, abs(fract((cellF.x + cellF.y) * 2.0) - 0.5));

    // vertical panel gradient + occasional lit window
    float shade = 0.05 + 0.055 * cellRand + 0.03 * sin(ang * 2.0 + 1.2);
    float lit = step(0.993, cellRand) * (0.6 + 0.4 * sin(uTime * 2.0 + cellRand * 20.0));
    float strip = (1.0 - smoothstep(0.0, 0.02, abs(cellF.y - 0.5))) * step(0.84, cellRand) * 0.5;

    vec3 col = mix(uColorA * 0.9, uColorB, 0.18) * shade;
    col += mix(uColorA, uColorB, 0.4) * bevel * 0.07;
    col += uColorB * stripe * 0.14;
    col += mix(uGlow, vec3(1.0), 0.4) * lit * 0.3;
    col += uColorB * strip * 0.2;
    col += uGlow * uGateWarmth * 0.03;
    col *= 1.0 + uPulse * 0.3;

    // distance: sink toward a deep, near-black void with a faint colour lift
    float fogT = smoothstep(uFogStart, uFogEnd, vAhead);
    vec3 depthCol = vec3(0.012, 0.016, 0.04) + uFogColor * 0.12;
    vec3 fogged = mix(col, depthCol, fogT * 0.97);
    float near = smoothstep(-uBehind - 4.0, 8.0, vAhead);
    fogged *= 0.2 + 0.8 * near;

    gl_FragColor = vec4(fogged, 1.0);
  }
`;

function center(d) {
  return [0, 0, d];
}

export class Tunnel {
  constructor(scene, palette) {
    this.scene = scene;
    this.uniforms = {
      uTraveled: { value: 0 },
      uLoopLen: { value: LOOP },
      uBand: { value: BAND },
      uBehind: { value: BEHIND },
      uRadius: { value: TUBE_RADIUS },
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(palette.tubeA) },
      uColorB: { value: new THREE.Color(palette.tubeB) },
      uGlow: { value: new THREE.Color(palette.glow) },
      uFogColor: { value: new THREE.Color(palette.bg) },
      uFogStart: { value: 90 },
      uFogEnd: { value: 330 },
      uBoost: { value: 0 },
      uPulse: { value: 0 },
      uGateWarmth: { value: 0 },
    };
    this.target = new THREE.Color();
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.shellMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader: shellFragmentShader,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });

    const geo = new THREE.BufferGeometry();
    const verts = RINGS * 2 * (SEGMENTS + 1);
    const positions = new Float32Array(verts * 3);
    const aRing = new Float32Array(verts);
    const aEnd = new Float32Array(verts);
    const aAngle = new Float32Array(verts);
    const indices = [];
    let v = 0;
    for (let i = 0; i < RINGS; i++) {
      for (let e = 0; e < 2; e++) {
        for (let s = 0; s <= SEGMENTS; s++) {
          const a = (s / SEGMENTS) * Math.PI * 2;
          positions[v * 3] = Math.cos(a);
          positions[v * 3 + 1] = Math.sin(a);
          positions[v * 3 + 2] = 0;
          aRing[v] = i * SPACING;
          aEnd[v] = e;
          aAngle[v] = s / SEGMENTS;
          v++;
        }
      }
    }
    const stride = SEGMENTS + 1;
    for (let i = 0; i < RINGS; i++) {
      const base = i * 2 * stride;
      for (let s = 0; s < SEGMENTS; s++) {
        const a0 = base + s;
        const a1 = base + s + 1;
        const b0 = base + stride + s;
        const b1 = base + stride + s + 1;
        indices.push(a0, b0, b1, a0, b1, a1);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRing', new THREE.BufferAttribute(aRing, 1));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
    geo.setIndex(indices);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -200), 2000);

    // opaque outer shell (blocks the starfield outside the tube)
    const shellUniforms = { ...this.uniforms, uRadius: { value: TUBE_RADIUS * 1.035 } };
    this.shellMaterial.uniforms = shellUniforms;
    this.shell = new THREE.Mesh(geo, this.shellMaterial);
    this.shell.frustumCulled = false;
    this.shell.renderOrder = -1;
    scene.add(this.shell);

    // additive glow grid just inside the shell
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    scene.add(this.mesh);

    this.palette = palette;
    this.targetPalette = palette;
    this.gateWarmth = 0;
    this.pulse = 0;
  }

  setSector(palette) {
    this.targetPalette = palette;
    this.uniforms.uGateWarmth.value = 0.6;
  }

  setGateWarmth(v) {
    this.gateWarmth = v;
  }

  impulse(v = 0.4) {
    this.pulse = Math.min(1.2, this.pulse + v);
  }

  update(dt, traveled, time, boost) {
    const u = this.uniforms;
    u.uTraveled.value = traveled;
    u.uTime.value = time;
    u.uBoost.value += (boost - u.uBoost.value) * Math.min(1, dt * 3);
    u.uPulse.value = this.pulse;
    u.uGateWarmth.value += (this.gateWarmth - u.uGateWarmth.value) * Math.min(1, dt * 2);
    this.pulse = Math.max(0, this.pulse - dt * 1.8);
    this.gateWarmth = Math.max(0, this.gateWarmth - dt * 0.35);

    const p = this.targetPalette;
    const k = Math.min(1, dt * 2.4);
    u.uColorA.value.lerp(this.target.setHex(p.tubeA), k);
    u.uColorB.value.lerp(this.target.setHex(p.tubeB), k);
    u.uGlow.value.lerp(this.target.setHex(p.glow), k);
    u.uFogColor.value.lerp(this.target.setHex(p.bg), k);
  }
}
