// The runner: a girl in magnetic boots who sprints along the inside wall of
// the tube. Everything is procedural — no asset files required.
//
// Drop a GLB into public/models/runner.glb and it is loaded automatically
// (see loadCustomModel); if it ships animations, the first clip is played,
// otherwise the procedural rig stays in charge of the pose.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { glowTexture, hexTexture } from './textures.js';
import { WALL_RADIUS } from './path.js';
import { clamp, damp, lerp, rand, TAU } from './util.js';

const FOOT_OFFSET = 0.0; // soles sit exactly on the wall
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

function capsuleMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.18,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: false,
  });
}

function limbSegment(length, radiusTop, radiusBottom, mat) {
  const geo = new THREE.CapsuleGeometry(radiusTop, Math.max(0.01, length - radiusTop * 2), 6, 12);
  geo.translate(0, -length * 0.5, 0);
  const mesh = new THREE.Mesh(geo, mat);
  void radiusBottom;
  return mesh;
}

export class Runner {
  constructor(scene, palette) {
    this.scene = scene;
    this.root = new THREE.Group(); // world placement (feet on the wall)
    this.rig = new THREE.Group(); // procedural body, local Y-up
    this.root.add(this.rig);
    scene.add(this.root);

    this.palette = palette;
    this.time = 0;
    this.runPhase = 0;
    this.velocity = 0;
    this.turn = 0;
    this.airTime = 0;
    this.boosting = false;
    this.footIndex = 0;
    this.lastFootPhase = 0;
    this.onFootstep = null;
    this.custom = null;
    this.mixer = null;
    this.customReady = false;

    this.buildMaterials(palette);
    this.buildBody();
    this.buildBoots();
    this.buildAccents();
    this.rig.position.y = FOOT_OFFSET;
    this.updateMatrixWorlds();

    this.tmpV = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    this.tmpM = new THREE.Matrix4();
    this.tmpBasis = new THREE.Vector3();
  }

  // ------------------------------------------------------------------ look
  buildMaterials(palette) {
    const accent = new THREE.Color(palette.tubeB);
    const glow = new THREE.Color(palette.glow);
    this.accent = accent;
    this.glowColor = glow;

    this.mat = {
      suit: capsuleMaterial(0x46536e, { roughness: 0.74, metalness: 0.06 }),
      suitLight: capsuleMaterial(0x9aabc4, { roughness: 0.65, metalness: 0.08 }),
      suitDark: capsuleMaterial(0x151b28, { roughness: 0.55, metalness: 0.42 }),
      jacket: capsuleMaterial(0x222c40, { roughness: 0.48, metalness: 0.32 }),
      trim: new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 1.9,
        roughness: 0.35,
        metalness: 0.2,
      }),
      skin: capsuleMaterial(0xe8b393, { roughness: 0.78, metalness: 0.0 }),
      hair: capsuleMaterial(0x4a2238, { roughness: 0.36, metalness: 0.16, emissive: 0x1d0a16, emissiveIntensity: 0.5 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x10121c, roughness: 0.12, metalness: 0.3 }),
      eyeGlint: new THREE.MeshBasicMaterial({ color: 0xd8fbff }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x8d4a5c, roughness: 0.6 }),
      boots: capsuleMaterial(0x1a2130, { roughness: 0.3, metalness: 0.92 }),
      bootSole: new THREE.MeshStandardMaterial({
        color: glow,
        emissive: glow,
        emissiveIntensity: 2.6,
        roughness: 0.3,
        metalness: 0.6,
      }),
      visor: new THREE.MeshStandardMaterial({
        color: 0x0a1a2a,
        roughness: 0.05,
        metalness: 0.9,
        emissive: accent,
        emissiveIntensity: 0.35,
      }),
      dark: capsuleMaterial(0x101724, { roughness: 0.6, metalness: 0.3 }),
      glowMid: new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 1.05,
        roughness: 0.4,
        metalness: 0.2,
      }),
      glowSoft: new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.42,
        roughness: 0.4,
        metalness: 0.2,
      }),
    };
  }

  buildBody() {
    const M = this.mat;

    // ---------------------------------------------------------------- hips
    this.hips = new THREE.Group();
    this.hips.position.y = 0.94;
    this.rig.add(this.hips);

    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.168, 18, 14), M.suitDark);
    pelvis.scale.set(1.1, 0.8, 0.92);
    this.hips.add(pelvis);

    // light hip plates read as armoured shorts
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), M.suitLight);
      plate.scale.set(0.72, 0.66, 0.8);
      plate.position.set(side * 0.135, 0.015, -0.015);
      this.hips.add(plate);
    }
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.011, 6, 24), M.glowMid);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.07;
    this.hips.add(belt);

    // --------------------------------------------------------------- torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);

    // one smooth lathe: hips → waist → ribcage → shoulders, no floating parts
    const profile = [
      [0.152, -0.02],
      [0.126, 0.07],
      [0.142, 0.17],
      [0.173, 0.27],
      [0.17, 0.33],
      [0.148, 0.4],
      [0.108, 0.44],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 22), M.jacket);
    body.castShadow = false;
    this.torso.add(body);

    // shoulder yoke closes the lathe and gives her a neckline
    const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), M.suitDark);
    yoke.scale.set(1.45, 0.5, 0.95);
    yoke.position.y = 0.43;
    this.torso.add(yoke);

    // light chest panel + glow seams
    const plate = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), M.suit);
    plate.scale.set(0.92, 0.86, 0.5);
    plate.position.set(0, 0.27, -0.085);
    this.torso.add(plate);

    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.34, 0.014), M.trim);
    zip.position.set(0, 0.2, -0.135);
    zip.rotation.x = -0.06;
    this.torso.add(zip);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.016, 6, 20), M.trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.45;
    this.torso.add(collar);

    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.012), M.trim);
      rib.position.set(side * 0.115, 0.16, -0.09);
      rib.rotation.z = side * 0.12;
      this.torso.add(rib);
    }

    // ------------------------------------------------------------- arms
    this.shoulders = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.156, 0.4, 0);
      this.torso.add(shoulder);

      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), M.suitDark);
      pad.scale.set(1.05, 0.95, 1);
      shoulder.add(pad);

      const upper = limbSegment(0.26, 0.045, 0.04, M.suit);
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.26;
      shoulder.add(elbow);
      const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.043, 10, 8), M.suitDark);
      elbow.add(elbowJoint);

      const fore = limbSegment(0.24, 0.038, 0.032, M.suit);
      elbow.add(fore);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.dark);
      glove.scale.set(0.9, 1.2, 0.92);
      glove.position.y = -0.25;
      elbow.add(glove);

      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 5, 16), M.trim);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.21;
      elbow.add(cuff);

      this.shoulders.push({ side, shoulder, elbow });
    }

    // -------------------------------------------------------- neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.08, 10), M.skin);
    neck.position.y = 0.46;
    this.torso.add(neck);

    this.head = new THREE.Group();
    this.head.position.y = 0.53;
    this.torso.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.132, 20, 16), M.skin);
    skull.scale.set(0.94, 1.04, 0.97);
    this.head.add(skull);

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), M.skin);
    jaw.scale.set(0.86, 0.74, 0.92);
    jaw.position.set(0, -0.056, -0.012);
    this.head.add(jaw);

    // face
    for (const side of [-1, 1]) {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), M.suitLight);
      sclera.scale.set(1.0, 1.2, 0.45);
      sclera.position.set(side * 0.05, 0.004, -0.107);
      this.head.add(sclera);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), M.eye);
      iris.scale.set(1, 1.2, 0.5);
      iris.position.set(side * 0.051, -0.002, -0.124);
      this.head.add(iris);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), M.eyeGlint);
      glint.position.set(side * 0.043, 0.016, -0.14);
      this.head.add(glint);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.009, 0.012), M.hair);
      brow.position.set(side * 0.052, 0.055, -0.112);
      brow.rotation.z = side * 0.16;
      this.head.add(brow);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), M.skin);
    nose.position.set(0, -0.026, -0.128);
    this.head.add(nose);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.007, 0.01), M.mouth);
    mouth.position.set(0, -0.06, -0.116);
    this.head.add(mouth);

    // goggles pushed up on the forehead
    const visor = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.022, 8, 24), M.visor);
    visor.position.set(0, 0.082, -0.01);
    visor.rotation.x = Math.PI / 2.05;
    this.head.add(visor);

    // bob haircut: back mass + fringe + side locks
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), M.hair);
    hair.position.set(0, 0.018, 0.026);
    hair.scale.set(1.02, 1.02, 1.0);
    this.head.add(hair);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.134, 18, 12, 0, TAU, 0, Math.PI * 0.44), M.hair);
    fringe.position.set(0, 0.036, -0.008);
    fringe.scale.set(1.04, 1.06, 1.08);
    this.head.add(fringe);
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), M.hair);
      lock.position.set(side * 0.116, -0.048, -0.012);
      lock.rotation.z = side * 0.1;
      lock.scale.set(0.85, 1, 0.7);
      this.head.add(lock);
    }

    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 6, 14), M.glowMid);
    tie.position.set(0, 0.02, 0.125);
    tie.rotation.x = 0.9;
    this.head.add(tie);

    // ponytail: seven segments on a light spring
    this.tail = [];
    let parent = this.head;
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0.03 : -0.088, i === 0 ? 0.118 : 0);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.046 - i * 0.0045, 0.08, 4, 8), M.hair);
      mesh.position.y = -0.055;
      seg.add(mesh);
      parent.add(seg);
      this.tail.push({ seg, sway: 0, swayVel: 0 });
      parent = seg;
    }

    // ------------------------------------------------------- life support
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.3, 0.026), M.suitDark);
    spine.position.set(0, 0.24, 0.15);
    this.torso.add(spine);
    const packCore = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.16, 0.016), M.glowSoft);
    packCore.position.set(0, 0.25, 0.168);
    this.torso.add(packCore);
    const canister = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.14, 4, 8), M.boots);
    canister.position.set(0.09, 0.22, 0.145);
    this.torso.add(canister);
    this.packVent = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(`#${this.glowColor.getHexString()}`),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    this.packVent.scale.setScalar(0.3);
    this.packVent.position.set(0, 0.14, 0.165);
    this.torso.add(this.packVent);

    // ------------------------------------------------------------- legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.086, -0.04, 0);
      this.hips.add(hip);

      const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), M.suitDark);
      hip.add(hipJoint);

      const thigh = limbSegment(0.42, 0.058, 0.05, M.suit);
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);

      const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), M.suit);
      kneeJoint.scale.set(1, 0.94, 1);
      knee.add(kneeJoint);
      const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), M.suitDark);
      kneePad.scale.set(0.96, 1.05, 0.9);
      kneePad.position.set(0, 0.005, -0.022);
      knee.add(kneePad);

      const shin = limbSegment(0.4, 0.045, 0.038, M.suit);
      knee.add(shin);

      // magnetic boot: origin sits on the sole so it plants flat on the wall
      const boot = new THREE.Group();
      boot.position.y = -0.48;
      knee.add(boot);

      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.16, 0.2), M.boots);
      shell.position.set(0, 0.095, -0.015);
      boot.add(shell);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.1, 12), M.boots);
      shaft.position.set(0, 0.19, 0.005);
      boot.add(shaft);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), M.boots);
      toe.scale.set(0.92, 0.6, 1.2);
      toe.position.set(0, 0.052, -0.115);
      boot.add(toe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.026, 0.28), M.bootSole);
      sole.position.set(0, 0.013, -0.045);
      boot.add(sole);
      const magnetRing = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.014, 6, 18), M.trim);
      magnetRing.rotation.x = Math.PI / 2;
      magnetRing.position.set(0, 0.03, -0.045);
      boot.add(magnetRing);

      const magnetGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(`#${this.glowColor.getHexString()}`),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.85,
        })
      );
      magnetGlow.scale.setScalar(0.5);
      magnetGlow.position.set(0, 0.028, -0.045);
      boot.add(magnetGlow);

      this.legs.push({ side, hip, knee, boot, sole, magnetGlow, footWorld: new THREE.Vector3() });
    }
  }

  buildBoots() {
    // soft pulse of light where the boots touch the wall
    this.wallGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(`#${this.glowColor.getHexString()}`),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    this.wallGlow.scale.set(1.5, 1.5, 1);
    this.wallGlow.position.y = 0.04;
    this.root.add(this.wallGlow);
  }

  buildAccents() {
    // shield bubble (a bubble of magnetised air around her)
    const shieldMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.accent.clone() },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uMap: { value: hexTexture(`#${this.accent.getHexString()}`) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uOpacity;
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float fres = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
          vec2 uv = vec2(vUv.x * 2.0 + uTime * 0.03, vUv.y * 1.2);
          float hex = texture2D(uMap, uv).a;
          float scan = 0.5 + 0.5 * sin(vUv.y * 70.0 - uTime * 5.0);
          vec3 col = uColor * (fres * 1.2 + hex * 0.25 + scan * 0.06);
          gl_FragColor = vec4(col, (fres * 0.55 + hex * 0.08) * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 18), shieldMat);
    this.shield.scale.set(0.9, 1.25, 0.9);
    this.shield.position.y = 0.95;
    this.root.add(this.shield);

    // warm light she carries with her
    this.light = new THREE.PointLight(new THREE.Color(this.palette.tubeB), 1.7, 11, 2);
    this.light.position.set(0, 1.05, 0.55);
    this.root.add(this.light);
  }

  // ------------------------------------------------------------ placement
  /** Orient the body so her feet sit on the wall at angle theta. */
  setWallBasis(theta, quaternion) {
    const radial = this.tmpBasis.set(Math.cos(theta), Math.sin(theta), 0);
    // her up is toward the tube axis
    const up = UP.set(-radial.x, -radial.y, 0).normalize();
    // forward follows the tube (world -Z), projected to stay perpendicular
    const forward = FORWARD.set(0, 0, -1);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const back = new THREE.Vector3().crossVectors(right, up).normalize();
    this.tmpM.makeBasis(right, up, back);
    quaternion.setFromRotationMatrix(this.tmpM);
    return quaternion;
  }

  setWorldPose(x, y, z, quaternion, theta) {
    this.root.position.set(x, y, z);
    this.root.quaternion.copy(quaternion);
    this.wallTheta = theta;
  }

  setPalette(palette) {
    this.palette = palette;
    this.accent.setHex(palette.tubeB);
    this.glowColor.setHex(palette.glow);
    this.mat.trim.color.copy(this.accent);
    this.mat.trim.emissive.copy(this.accent);
    this.mat.bootSole.color.copy(this.glowColor);
    this.mat.bootSole.emissive.copy(this.glowColor);
    this.shield.material.uniforms.uColor.value.copy(this.accent);
    this.shield.material.uniforms.uMap.value = hexTexture(`#${this.accent.getHexString()}`);
    this.light.color.copy(this.accent);
    const glowHex = `#${this.glowColor.getHexString()}`;
    this.wallGlow.material.map = glowTexture(glowHex);
    this.packVent.material.map = glowTexture(glowHex);
    this.legs.forEach((leg) => {
      leg.magnetGlow.material.map = glowTexture(glowHex);
    });
  }

  // ------------------------------------------------------------ animation
  update(dt, params = {}) {
    this.time += dt;
    const speed = params.speed ?? 3;
    const turn = clamp(params.turn ?? 0, -1, 1);
    this.velocity = speed;
    this.turn = damp(this.turn, turn, 8, dt);
    this.boosting = !!params.boosting;
    const shield = params.shield ?? 0;

    const stride = 1.35 + speed * 0.155;
    this.runPhase += dt * stride * (this.boosting ? 1.35 : 1);
    const p = this.runPhase;

    // run cycle --------------------------------------------------------
    this.legs.forEach((leg, i) => {
      const ph = p + (i === 0 ? 0 : Math.PI);
      const swing = Math.sin(ph) * (0.52 + Math.min(0.22, speed * 0.004));
      const lift = Math.max(0, Math.cos(ph)) * (0.5 + Math.min(0.3, speed * 0.006));
      leg.hip.rotation.x = swing;
      leg.knee.rotation.x = -lift * 1.25;
      leg.boot.rotation.x = lift * 0.5 + 0.1;
    });

    this.shoulders.forEach((arm, i) => {
      const ph = p + (i === 0 ? Math.PI : 0);
      arm.shoulder.rotation.x = Math.sin(ph) * (0.4 + Math.min(0.2, speed * 0.004));
      arm.shoulder.rotation.z = arm.side * (0.18 + Math.abs(this.turn) * 0.12);
      arm.elbow.rotation.x = -0.6 - Math.max(0, Math.sin(ph)) * 0.45;
    });

    // torso lean into the run and into turns
    const bob = Math.abs(Math.sin(p)) * 0.045 + Math.sin(this.time * 12) * 0.004;
    this.rig.position.y = FOOT_OFFSET + bob;
    this.hips.rotation.z = -this.turn * 0.14;
    this.hips.rotation.y = this.turn * 0.1;
    this.torso.rotation.x = -0.16 - Math.min(0.16, speed * 0.003) - (this.boosting ? 0.1 : 0);
    this.torso.rotation.z = -this.turn * 0.1;

    // head: look ahead, counter the body lean
    this.head.rotation.x = 0.12 + speed * 0.004;
    this.head.rotation.z = this.turn * 0.05;
    this.head.rotation.y = -this.turn * 0.12;

    // ponytail physics (simple spring chain)
    this.tail.forEach((seg, i) => {
      const target = Math.sin(p * 2 - i * 0.8) * 0.1 * (0.5 + speed * 0.02)
        + this.turn * 0.1
        + (this.boosting ? 0.12 : 0);
      seg.swayVel += (target - seg.sway) * 26 * dt;
      seg.swayVel *= Math.exp(-7 * dt);
      seg.sway += seg.swayVel * dt;
      seg.seg.rotation.x = (i === 0 ? -0.72 : 0) + seg.sway - (this.boosting ? 0.06 : 0);
    });

    // magnet boots pulse on contact
    const contact = Math.abs(Math.cos(p));
    this.legs.forEach((leg, i) => {
      const phase = (p + (i === 0 ? 0 : Math.PI)) % Math.PI;
      const hit = phase < 0.18;
      leg.magnetGlow.material.opacity = hit ? 1 : 0.35 + contact * 0.25;
      leg.magnetGlow.scale.setScalar(hit ? 0.95 : 0.55);
      leg.sole.material.emissiveIntensity = hit ? 3.6 : 1.6;
    });
    this.wallGlow.material.opacity = 0.25 + contact * 0.25;
    this.wallGlow.scale.setScalar(1.2 + Math.sin(this.time * 6) * 0.08 + contact * 0.3);
    this.packVent.material.opacity = 0.25 + Math.sin(this.time * 8) * 0.12 + (this.boosting ? 0.35 : 0);

    // shield
    this.shieldStrength = clamp(damp(this.shieldStrength ?? 0, shield, 6, dt), 0, 1);
    this.shield.visible = this.shieldStrength > 0.02;
    this.shield.material.uniforms.uOpacity.value = this.shieldStrength;
    this.shield.material.uniforms.uTime.value = this.time;
    this.shield.rotation.y += dt * 0.4;

    // custom model (if a GLB was loaded)
    if (this.mixer) this.mixer.update(dt);
    if (this.custom) {
      this.custom.position.y = bob * 0.6;
      this.custom.visible = true;
    }

    // footsteps
    const phaseMod = p % Math.PI;
    if (this.onFootstep && this.lastFootPhase > 0 && phaseMod < this.lastFootPhase) {
      const legIndex = Math.floor(p / Math.PI) % 2;
      this.onFootstep(legIndex, this.getFootWorld(legIndex));
    }
    this.lastFootPhase = phaseMod;
  }

  getFootWorld(index) {
    const leg = this.legs[index];
    this.root.updateMatrixWorld(true);
    return leg.boot.getWorldPosition(new THREE.Vector3());
  }

  setVisible(v) {
    this.root.visible = v;
  }

  // ------------------------------------------------------------ glb hook
  /**
   * Load a custom character model. Silently falls back to the procedural rig.
   * The model is auto-scaled to 1.75 units tall and aligned so its feet sit at
   * the origin, facing -Z like the built-in rig.
   */
  async loadCustomModel(url = '/models/runner.glb') {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) return false;
    } catch {
      return false;
    }
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = size.y > 0.0001 ? 1.75 / size.y : 1;
      model.scale.setScalar(scale);
      const scaled = new THREE.Box3().setFromObject(model);
      model.position.y -= scaled.min.y;
      model.position.z += (scaled.min.z + scaled.max.z) * 0.5;
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.frustumCulled = false;
          if (o.material && o.material.emissiveIntensity !== undefined) o.material.emissiveIntensity = Math.min(2, o.material.emissiveIntensity);
        }
      });
      this.custom = model;
      this.rig.add(model);
      // hide the procedural body, keep the shield/magnet glow
      this.rig.children.forEach((child) => {
        if (child !== model && child !== this.shield) child.visible = false;
      });
      if (gltf.animations && gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(model);
        const clip =
          gltf.animations.find((c) => /run|sprint|jog|walk/i.test(c.name)) || gltf.animations[0];
        this.mixer.clipAction(clip).play();
      }
      this.customReady = true;
      return true;
    } catch (err) {
      console.warn('[runner] custom model failed to load', err);
      return false;
    }
  }

  updateMatrixWorlds() {
    this.root.updateMatrixWorld(true);
  }
}
