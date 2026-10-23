// v2 hull: a real industrial transit tube built from geometry instead of a
// full-screen shader. Corrugated steel wall, ring frames at every joint,
// stringers, conduits, hazard bands, warm lamp housings and red beacons.
//
// One module = SEG units long and is instanced COUNT times along the curve,
// so the whole tunnel costs four draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TUBE_RADIUS, pathX, pathY } from './path.js';
import { hullTextures, hazardStripeTexture, glowTexture } from './textures.js';
import { clamp, TAU } from './util.js';

const SEG = 6.2;
const COUNT = 40;
const R = TUBE_RADIUS;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3(0, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const STRINGERS = [0.85, 2.05, 3.3, 4.55];
const LAMPS = [1.05, 3.15, 5.35];
const BEACONS = [2.05, 4.7];
const PIPES = [0.35, 2.6, 4.95];

/** Box laid flat against the wall at the given angle. */
function wallBox(w, h, d, angle, radius, z, out = []) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateZ(angle + Math.PI / 2);
  g.translate(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
  out.push(g);
  return out;
}

function buildModule() {
  const metal = [];
  const glow = [];
  const beacon = [];
  const hazard = [];
  const glass = [];

  // --- corrugated wall panel with a viewing window ----------------------
  // The window sits on the -X side of the module; instance rotation swings it
  // around so windows land at different angles down the tunnel.
  const GAP = 1.15;
  const arcA = TAU - GAP;
  const panelA = new THREE.CylinderGeometry(R, R, SEG, 56, 1, true, GAP / 2, arcA);
  panelA.rotateX(Math.PI / 2);
  panelA.translate(0, 0, -SEG / 2);
  metal.push(panelA);

  // window frame: two rings + vertical mullions
  const frameMatRing = new THREE.TorusGeometry(R - 0.06, 0.16, 6, 26, arcA);
  for (const z of [0.1, -SEG + 0.1]) {
    const f = frameMatRing.clone();
    f.rotateZ(GAP / 2);
    f.translate(0, 0, z);
    metal.push(f);
  }
  for (let i = 0; i <= 4; i++) {
    const a = GAP / 2 + (i / 4) * arcA;
    const mull = new THREE.BoxGeometry(0.14, 0.34, SEG - 0.2);
    mull.rotateZ(a + Math.PI / 2);
    mull.translate(Math.cos(a) * (R - 0.02), Math.sin(a) * (R - 0.02), -SEG / 2);
    metal.push(mull);
  }
  // glass
  const glassGeo = new THREE.CylinderGeometry(R - 0.02, R - 0.02, SEG - 0.25, 40, 1, true, GAP / 2, arcA);
  glassGeo.rotateX(Math.PI / 2);
  glassGeo.translate(0, 0, -SEG / 2);
  glass.push(glassGeo);

  // --- ring frame at the module joint ----------------------------------
  const ring = new THREE.TorusGeometry(R - 0.08, 0.3, 8, 64);
  ring.translate(0, 0, -0.12);
  metal.push(ring);
  const lip = new THREE.TorusGeometry(R - 0.52, 0.1, 6, 64);
  lip.translate(0, 0, -0.42);
  metal.push(lip);
  // bolt blocks around the frame
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    wallBox(0.42, 0.2, 0.5, a, R - 0.46, -0.12, metal);
  }

  // --- stringers running the length of the module ----------------------
  for (const a of STRINGERS) {
    const strut = new THREE.BoxGeometry(0.2, 0.34, SEG - 0.5);
    strut.rotateZ(a + Math.PI / 2);
    strut.translate(Math.cos(a) * (R - 0.17), Math.sin(a) * (R - 0.17), -SEG / 2 - 0.15);
    metal.push(strut);
  }

  // --- conduits ---------------------------------------------------------
  for (const a of PIPES) {
    const pipe = new THREE.CylinderGeometry(0.15, 0.15, SEG - 0.6, 10, 1);
    pipe.rotateX(Math.PI / 2);
    pipe.translate(Math.cos(a) * (R - 0.62), Math.sin(a) * (R - 0.62), -SEG / 2);
    metal.push(pipe);
    // clamp brackets
    for (const z of [-1.6, -SEG / 2, -SEG + 1.6]) {
      const clampGeo = new THREE.BoxGeometry(0.44, 0.12, 0.16);
      clampGeo.rotateZ(a + Math.PI / 2);
      clampGeo.translate(Math.cos(a) * (R - 0.62), Math.sin(a) * (R - 0.62), z);
      metal.push(clampGeo);
    }
  }

  // --- lamp housings + light panels (long strips along the tunnel) ------
  for (const a of LAMPS) {
    // housing: narrow across the circumference, long along the axis
    const housing = new THREE.BoxGeometry(0.4, 0.22, 2.7);
    housing.rotateZ(a + Math.PI / 2);
    housing.translate(Math.cos(a) * (R - 0.12), Math.sin(a) * (R - 0.12), -SEG / 2);
    metal.push(housing);
    const tubeLit = new THREE.BoxGeometry(0.26, 0.14, 2.42);
    tubeLit.rotateZ(a + Math.PI / 2);
    tubeLit.translate(Math.cos(a) * (R - 0.24), Math.sin(a) * (R - 0.24), -SEG / 2);
    glow.push(tubeLit);
  }

  // --- red warning beacons ---------------------------------------------
  for (const a of BEACONS) {
    wallBox(0.34, 0.16, 0.24, a, R - 0.24, -0.75, beacon);
    wallBox(0.26, 0.1, 0.16, a, R - 0.32, -0.75, beacon);
  }

  // --- hazard band painted around the frame ----------------------------
  const band = new THREE.CylinderGeometry(R - 0.2, R - 0.2, 0.62, 64, 1, true);
  band.rotateX(Math.PI / 2);
  band.translate(0, 0, -0.95);
  hazard.push(band);

  return {
    metal: mergeGeometries(metal, false),
    glow: mergeGeometries(glow, false),
    beacon: mergeGeometries(beacon, false),
    hazard: mergeGeometries(hazard, false),
    glass: mergeGeometries(glass, false),
  };
}

export class Hull {
  constructor(scene, palette) {
    this.scene = scene;
    this.palette = palette;
    this.pulse = 0;
    this.gateWarmth = 0;
    this.runnerTheta = 0;
    this.runnerStrength = 0;
    this.time = 0;

    const tex = hullTextures();
    for (const t of [tex.map, tex.normalMap, tex.roughnessMap]) t.repeat.set(4, 1);

    this.metalMat = new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: tex.roughnessMap,
      metalness: 0.82,
      roughness: 0.52,
      color: 0xb0b6be,
      emissive: 0x1a1408,
      emissiveMap: tex.map,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
      envMapIntensity: 1.35,
    });

    this.hazardMat = new THREE.MeshStandardMaterial({
      map: hazardStripeTexture(),
      metalness: 0.3,
      roughness: 0.78,
      color: 0x8f8f8f,
      side: THREE.DoubleSide,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xa8c4d8,
      metalness: 0.0,
      roughness: 0.06,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      envMapIntensity: 2.2,
      emissive: 0x0a1622,
      emissiveIntensity: 0.6,
      depthWrite: false,
    });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c4 });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a12, toneMapped: false });

    const geo = buildModule();
    this.group = new THREE.Group();
    scene.add(this.group);

    const make = (g, m, name) => {
      const mesh = new THREE.InstancedMesh(g, m, COUNT);
      mesh.frustumCulled = false;
      mesh.name = name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      return mesh;
    };

    this.metal = make(geo.metal, this.metalMat, 'hull-metal');
    this.lamps = make(geo.glow, this.lampMat, 'hull-lamps');
    this.beacons = make(geo.beacon, this.beaconMat, 'hull-beacons');
    this.hazard = make(geo.hazard, this.hazardMat, 'hull-hazard');
    this.glass = make(geo.glass, this.glassMat, 'hull-glass');
    this.glass.renderOrder = 2;

    // warm haze deep down the tunnel: the classic "there is a light at the end"
    this.farGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('#ffd06a'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.55,
        fog: false,
        toneMapped: false,
      })
    );
    this.farGlow.scale.setScalar(64);
    this.group.add(this.farGlow);

    // a couple of real lights travel with the camera so metal has highlights
    this.runLight = new THREE.PointLight(0xffd9a0, 26, 46, 2);
    scene.add(this.runLight);
    this.beaconLight = new THREE.PointLight(0xff3a1a, 12, 34, 2);
    scene.add(this.beaconLight);

    this.setSector(palette);
    this.update(0, 0, 0, 0);
  }

  setSector(palette) {
    if (!palette) return;
    this.palette = palette;
    const tint = new THREE.Color(palette.tubeA ?? 0x6a6f78);
    // keep the steel grey but nudge it toward the sector's colour
    this.metalMat.color.setHex(0x9aa0a8).lerp(tint, 0.32);
    this.lampMat.color.setHex(palette.lamp ?? 0xfff0c4);
    if (this.farGlow) this.farGlow.material.map = glowTexture(palette.haze ?? '#ffd06a');
    if (this.runLight) this.runLight.color.setHex(palette.lamp ?? 0xffd9a0);
  }

  /** Compatibility hooks with the old shader tunnel. */
  setRunner(theta, strength = 1) {
    this.runnerTheta = theta;
    this.runnerStrength = strength;
  }

  impulse(v = 0.4) {
    this.pulse = Math.min(1.2, this.pulse + v);
  }

  setGateWarmth(v) {
    this.gateWarmth = v;
  }

  update(dt, traveled, time, boost) {
    this.time = time;
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.gateWarmth = Math.max(0, this.gateWarmth - dt * 0.3);

    const base = Math.floor(traveled / SEG) * SEG;
    for (let i = 0; i < COUNT; i++) {
      const a = base + i * SEG;
      const z = -(a - traveled);
      const idx = Math.round(a / SEG);
      _p.set(pathX(a), pathY(a), z);
      // window swings from module to module (+PI puts the opening on +X)
      _q.setFromAxisAngle(Z_AXIS, Math.PI + Math.sin(idx * 2.399) * 0.95);
      _s.setScalar(1);
      _m.compose(_p, _q, _s);
      this.metal.setMatrixAt(i, _m);
      this.lamps.setMatrixAt(i, _m);
      this.beacons.setMatrixAt(i, _m);
      this.glass.setMatrixAt(i, _m);
      // hazard bands only on every third joint
      if (i % 4 === 0) this.hazard.setMatrixAt(i, _m);
      else {
        _m.compose(_zero, _q, _zero);
        this.hazard.setMatrixAt(i, _m);
      }
    }
    this.metal.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.beacons.instanceMatrix.needsUpdate = true;
    this.hazard.instanceMatrix.needsUpdate = true;
    this.glass.instanceMatrix.needsUpdate = true;

    // lamps flicker a little, brighten with boost / impulses
    const t = time;
    const boostK = 1 + (boost || 0) * 0.5 + this.pulse * 0.8;
    const flicker = 0.92 + Math.sin(t * 13.0) * 0.03 + Math.sin(t * 3.7 + 1.3) * 0.05;
    this.lampMat.color.setHex(this.palette.lamp ?? 0xfff0c4).multiplyScalar(1.15 * flicker * boostK);

    // beacons pulse like the ones in the reference art
    const pulse = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(t * 2.4)), 6);
    this.beaconMat.color.setHex(0xff2a12).multiplyScalar(0.35 + pulse * 1.3);

    // far haze follows the tunnel ahead of the camera
    const glowA = traveled + 150;
    this.farGlow.position.set(pathX(glowA), pathY(glowA), -150);
    this.farGlow.material.opacity = 0.22 + Math.sin(t * 0.8) * 0.04 + this.gateWarmth * 0.2;

    // travelling lights sit just behind/above the runner
    const backA = traveled - 2.5;
    this.runLight.position.set(
      pathX(backA) + Math.cos(this.runnerTheta) * (R - 2.4),
      pathY(backA) + Math.sin(this.runnerTheta) * (R - 2.4),
      2.5
    );
    this.runLight.intensity = 20 + this.pulse * 30 + this.gateWarmth * 20;
    const beaconA = traveled + 26;
    this.beaconLight.position.set(
      pathX(beaconA) + Math.cos(this.runnerTheta + 0.7) * (R - 1.2),
      pathY(beaconA) + Math.sin(this.runnerTheta + 0.7) * (R - 1.2),
      -26
    );
    this.beaconLight.intensity = 6 + pulse * 10;
  }
}
