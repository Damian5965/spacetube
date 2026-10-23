// Obstacles, drones, collectibles and the sector gate.
import * as THREE from 'three';
import { glowTexture, hazardTexture, hexTexture, starTexture } from './textures.js';
import { rand, randInt, clamp, TAU } from './util.js';
import { pathX, pathY, TUBE_RADIUS, angleDelta } from './path.js';

const shared = {};

function initShared() {
  if (shared.ready) return;
  shared.ready = true;
  shared.box = new THREE.BoxGeometry(1, 1, 1);
  shared.boxEdges = new THREE.EdgesGeometry(shared.box);
  shared.edgeMat = new THREE.LineBasicMaterial({
    color: 0xff9a4d,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  shared.edgeMatEnergy = new THREE.LineBasicMaterial({
    color: 0xff54c8,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const hz = hazardTexture('#ff8a3d', '#2a1210');
  shared.barrierMat = new THREE.MeshStandardMaterial({
    map: hz,
    emissiveMap: hz,
    emissive: 0xff7a2f,
    emissiveIntensity: 1.35,
    metalness: 0.3,
    roughness: 0.6,
    color: 0xb08a72,
  });
  shared.barrierHaloMat = new THREE.SpriteMaterial({
    map: glowTexture('#ff7a2f'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.32,
  });
  shared.energyMat = new THREE.MeshBasicMaterial({
    map: hexTexture('#ff3c8e'),
    color: 0xff5fb0,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  shared.lampMat = new THREE.MeshBasicMaterial({ color: 0xffb066 });
  shared.redLampMat = new THREE.MeshBasicMaterial({ color: 0xff365e });
  shared.droneBodyMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f3c,
    metalness: 0.9,
    roughness: 0.3,
    flatShading: true,
  });
  shared.droneTrimMat = new THREE.MeshStandardMaterial({
    color: 0x121622,
    metalness: 0.8,
    roughness: 0.5,
  });
  shared.rockMats = [
    new THREE.MeshStandardMaterial({ color: 0x8f7d97, roughness: 0.9, metalness: 0.2, flatShading: true, emissive: 0x2a1338, emissiveIntensity: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x7a6f92, roughness: 0.88, metalness: 0.25, flatShading: true, emissive: 0x1c1140, emissiveIntensity: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x9c7f92, roughness: 0.86, metalness: 0.22, flatShading: true, emissive: 0x38102c, emissiveIntensity: 0.7 }),
  ];
  shared.rockGeo = [];
  for (let v = 0; v < 4; v++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const scale = 0.72 + Math.random() * 0.55;
      pos.setXYZ(i, pos.getX(i) * scale, pos.getY(i) * scale, pos.getZ(i) * scale);
    }
    g.computeVertexNormals();
    shared.rockGeo.push(g);
  }
  shared.crystalMat = new THREE.MeshBasicMaterial({
    color: 0x9a7bff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  shared.droneEyeMat = new THREE.SpriteMaterial({
    map: glowTexture('#ff365e'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: 0xffffff,
  });
  shared.mineMat = new THREE.MeshStandardMaterial({ color: 0x23212e, metalness: 0.85, roughness: 0.35, flatShading: true });
  shared.mineGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff3d6b,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  shared.pickupRingMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  shared.gateTorusMat = new THREE.MeshBasicMaterial({
    color: 0x9ff4ff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  shared.gateChevronMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  shared.pickupColors = {
    arc: 0x6ef3ff,
    repair: 0xb6ff5e,
    shield: 0xb18cff,
    boost: 0xff6ee7,
    quantum: 0xffc45e,
  };
  shared.pickupGeo = {
    arc: new THREE.OctahedronGeometry(0.34),
    repair: new THREE.BoxGeometry(0.38, 0.38, 0.38),
    shield: new THREE.IcosahedronGeometry(0.32, 0),
    boost: new THREE.TetrahedronGeometry(0.38),
    quantum: new THREE.TorusKnotGeometry(0.2, 0.065, 48, 6),
  };
  shared.pickupMats = {};
  shared.pickupGlows = {};
  for (const [type, color] of Object.entries(shared.pickupColors)) {
    shared.pickupMats[type] = new THREE.MeshBasicMaterial({ color });
    shared.pickupGlows[type] = new THREE.SpriteMaterial({
      map: glowTexture(`#${new THREE.Color(color).getHexString()}`),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    });
  }
  shared.pickupRingGeo = new THREE.TorusGeometry(0.74, 0.05, 6, 28);
  shared.pickupRingGeo2 = new THREE.TorusGeometry(0.92, 0.024, 4, 24);
  shared.gateRingGeo = new THREE.TorusGeometry(9.7, 0.13, 8, 120);
  shared.gateRingGeo2 = new THREE.TorusGeometry(9.1, 0.05, 6, 100);
  shared.gateDiscGeo = new THREE.CircleGeometry(9.6, 96);
  shared.chevronGeo = new THREE.BoxGeometry(0.22, 1.15, 0.3);
}

const _color = new THREE.Color();

export class Barrier {
  constructor(scene, { x, y, w, h, energy = false, hp = 4 }) {
    initShared();
    this.kind = energy ? 'energy' : 'barrier';
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.a = 0;
    this.radius = Math.max(w, h) * 0.5;
    this.halfW = w * 0.5;
    this.halfH = h * 0.5;
    this.hp = energy ? Infinity : hp;
    this.maxHp = this.hp;
    this.energy = energy;
    this.dead = false;
    this.score = energy ? 0 : 90;
    this.passed = false;
    this.nearMissed = false;
    this.spin = rand(-0.15, 0.15);
    this.phase = rand(0, TAU);
    this.group = new THREE.Group();

    const core = new THREE.Mesh(shared.box, energy ? shared.energyMat : shared.barrierMat);
    core.scale.set(w, h, 1.15);
    this.group.add(core);
    const halo = new THREE.Sprite(shared.barrierHaloMat.clone());
    halo.material.color.setHex(energy ? 0xff3c8e : 0xff7a2f);
    halo.scale.set(w * 1.6, h * 1.7, 1);
    halo.position.z = -0.7;
    this.group.add(halo);
    this.halo = halo;
    const edge = new THREE.LineSegments(shared.boxEdges, energy ? shared.edgeMatEnergy : shared.edgeMat);
    edge.scale.set(w, h, 1.18);
    this.group.add(edge);

    if (energy) {
      const inner = new THREE.Mesh(shared.box, new THREE.MeshBasicMaterial({
        color: 0xff8fd0,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      inner.scale.set(w * 0.92, h * 0.92, 1.3);
      this.group.add(inner);
      this.inner = inner;
    } else {
      const lampGeo = new THREE.SphereGeometry(0.12, 8, 6);
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const lamp = new THREE.Mesh(lampGeo, sy > 0 ? shared.redLampMat : shared.lampMat);
        lamp.position.set(sx * (w * 0.5 - 0.16), sy * (h * 0.5 - 0.16), 0.68);
        this.group.add(lamp);
      }
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.6, 0.05, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      stripe.position.set(0, h * 0.5 - 0.22, 0.6);
      this.group.add(stripe);
      // pulsing rim light strip
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.98, 0.035, 0.03),
        new THREE.MeshBasicMaterial({ color: 0xff6b3d, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      rim.position.set(0, -h * 0.5 + 0.06, 0.62);
      this.group.add(rim);
      this.rim = rim;
    }
    scene.add(this.group);
  }

  update(dt, game) {
    this.group.rotation.z = Math.sin(game.time * 0.8 + this.phase) * 0.06 + this.spin * 0.35;
    if (this.rim) this.rim.material.opacity = 0.45 + Math.sin(game.time * 5 + this.phase) * 0.35;
    if (this.halo) this.halo.material.opacity = 0.14 + Math.sin(game.time * 3.4 + this.phase) * 0.05;
    if (this.energy) {
      this.inner.material.opacity = 0.12 + Math.sin(game.time * 6 + this.phase) * 0.06;
      this.group.children[1].material.opacity = 0.7 + Math.sin(game.time * 9 + this.phase) * 0.25;
    }
  }

  hit(dmg, game, at) {
    if (this.dead) return 'blocked';
    if (this.energy) {
      game.fx.hitSpark(at);
      return 'blocked';
    }
    this.hp -= dmg;
    game.fx.hitSpark(at);
    if (this.hp <= 0) {
      this.dead = true;
      return 'dead';
    }
    return 'hit';
  }

  dispose(scene) {
    scene.remove(this.group);
    this.halo?.material?.dispose();
    this.rim?.material?.dispose();
    this.group.traverse((o) => {
      if (o.isMesh && o.material && !Object.values(shared).includes(o.material)) {
        if (o.material.map && !Object.values(shared).includes(o.material.map)) o.material.map.dispose?.();
        o.material.dispose?.();
      }
    });
  }
}

export class Asteroid {
  constructor(scene, { x, y, scale = 1.6 }) {
    initShared();
    this.kind = 'asteroid';
    this.x = x;
    this.y = y;
    this.a = 0;
    this.scale = scale;
    this.radius = scale * 1.12;
    this.hp = 2 + Math.round(scale);
    this.maxHp = this.hp;
    this.score = 50;
    this.dead = false;
    this.passed = false;
    this.nearMissed = false;
    this.phase = rand(0, TAU);
    this.spinSpeed = new THREE.Vector3(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.5, 0.5));

    this.group = new THREE.Group();
    const rock = new THREE.Mesh(
      shared.rockGeo[randInt(0, shared.rockGeo.length - 1)],
      shared.rockMats[randInt(0, shared.rockMats.length - 1)]
    );
    rock.scale.setScalar(scale);
    this.group.add(rock);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(rock.geometry),
      new THREE.LineBasicMaterial({
        color: 0xb79bff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    edges.scale.setScalar(scale * 1.004);
    this.group.add(edges);
    this.edgeMat = edges.material;
    for (let i = 0; i < 3; i++) {
      const crystal = new THREE.Mesh(new THREE.TetrahedronGeometry(scale * rand(0.12, 0.2)), shared.crystalMat);
      const theta = rand(0, TAU);
      const phi = rand(-1, 1);
      const r = scale * 0.85;
      crystal.position.set(
        Math.cos(theta) * Math.sqrt(1 - phi * phi) * r,
        Math.sin(theta) * Math.sqrt(1 - phi * phi) * r,
        phi * r
      );
      crystal.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
      this.group.add(crystal);
    }
    scene.add(this.group);
  }

  update(dt, game) {
    this.group.rotation.x += this.spinSpeed.x * dt;
    this.group.rotation.y += this.spinSpeed.y * dt;
    this.group.rotation.z += this.spinSpeed.z * dt;
  }

  hit(dmg, game, at) {
    if (this.dead) return 'blocked';
    this.hp -= dmg;
    game.fx.hitSpark(at, '#c8b4ff');
    if (this.hp <= 0) {
      this.dead = true;
      return 'dead';
    }
    return 'hit';
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}

export class Drone {
  constructor(scene, { x, y }) {
    initShared();
    this.kind = 'drone';
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    this.a = 0;
    this.radius = 1.15;
    this.hp = 2;
    this.maxHp = 2;
    this.score = 140;
    this.dead = false;
    this.passed = false;
    this.nearMissed = false;
    this.phase = rand(0, TAU);
    this.sway = rand(0.5, 1.4);
    this.swaySpeed = rand(0.7, 1.4);
    this.track = rand(0.7, 1.5);
    this.fireTimer = rand(0.4, 1.6);
    this.charge = 0;
    this.cooldown = rand(0.8, 2.0);
    this.group = new THREE.Group();

    // --- spider drone ----------------------------------------------------
    const shellMat = shared.droneBodyMat;
    const limbMat = shared.droneTrimMat;

    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), shellMat);
    body.scale.set(1.0, 0.78, 1.25);
    this.group.add(body);
    this.body = body;

    // armoured cap on top, gives the crab-like hump from the concept art
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, TAU, 0, Math.PI * 0.55), shellMat);
    cap.scale.set(1.02, 0.72, 1.2);
    cap.position.y = 0.14;
    this.group.add(cap);

    // glowing seam where the shell splits
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.028, 4, 28), shared.mineGlowMat);
    seam.rotation.x = Math.PI / 2;
    seam.scale.set(1.02, 1.22, 1);
    seam.position.z = 0.06;
    this.group.add(seam);
    this.ring = seam;

    // four curved claws, two per side
    this.legs = [];
    for (const side of [-1, 1]) {
      for (const row of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.4, -0.06, row * 0.28);
        leg.rotation.z = side * -0.35;
        leg.rotation.y = side * row * 0.22;
        this.group.add(leg);

        const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.5, 4, 7), limbMat);
        upper.rotation.z = side * Math.PI * 0.42;
        upper.position.set(side * 0.26, -0.1, 0);
        leg.add(upper);

        const joint = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), shellMat);
        joint.position.set(side * 0.52, -0.16, 0);
        leg.add(joint);

        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.55, 5), limbMat);
        claw.position.set(side * 0.7, -0.42, 0);
        claw.rotation.z = side * 0.35;
        leg.add(claw);

        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), shared.redLampMat);
        tip.position.set(side * 0.78, -0.68, 0);
        leg.add(tip);

        this.legs.push({ leg, side, row, phase: rand(0, TAU) });
      }
    }

    // the eye: a recessed red lens with a hot core, like the concept art
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 14), shellMat);
    socket.rotation.x = Math.PI / 2;
    socket.position.z = -0.66;
    this.group.add(socket);

    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2418 }));
    lens.position.z = -0.72;
    this.group.add(lens);
    this.core = lens;

    this.eyeMat = shared.droneEyeMat.clone();
    const eye = new THREE.Sprite(this.eyeMat);
    eye.scale.setScalar(1.9);
    eye.position.z = -0.8;
    this.group.add(eye);
    this.eye = eye;

    // under-glow so it reads against a dark wall
    const under = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('#ff3a20'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    under.scale.setScalar(2.2);
    under.position.set(0, -0.1, -0.3);
    this.group.add(under);
    this.underGlow = under;

    const exhaust = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('#7a5bff'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    exhaust.scale.setScalar(1.1);
    exhaust.position.z = 1.05;
    this.group.add(exhaust);
    this.exhaust = exhaust;
    scene.add(this.group);
  }

  update(dt, game) {
    const t = game.time;
    this.phase += dt;
    // track the runner around the circumference of the tube
    if (this.theta !== undefined) {
      const target = game.theta ?? Math.atan2(game.ship.y, game.ship.x);
      this.theta += clamp(angleDelta(target, this.theta), -1, 1) * this.track * 0.55 * dt;
      this.theta += Math.sin(this.phase * this.swaySpeed) * this.sway * 0.05 * dt;
      const r = TUBE_RADIUS - 2.2 + Math.sin(this.phase * 1.3) * 0.35;
      this.x = Math.cos(this.theta) * r;
      this.y = Math.sin(this.theta) * r;
    } else {
      this.baseX += clamp(game.ship.x - this.baseX, -1, 1) * this.track * dt;
      this.baseY += clamp(game.ship.y - this.baseY, -1, 1) * this.track * 0.45 * dt;
      this.x = this.baseX + Math.sin(this.phase * this.swaySpeed + this.phase) * this.sway * 0.4;
      this.y = this.baseY + Math.cos(this.phase * this.swaySpeed * 0.7) * 0.35;
      this.x = clamp(this.x, -7.6, 7.6);
      this.y = clamp(this.y, -5.4, 5.4);
    }

    this.group.lookAt(
      pathX(this.a) + game.ship.x,
      pathY(this.a) + game.ship.y,
      -(game.ship.a - this.a) * 0.2
    );
    this.group.rotation.z = Math.sin(t * 2 + this.phase) * 0.16;
    this.ring.rotation.z += dt * 0.6;
    this.core.scale.setScalar(1 + Math.sin(t * 8) * 0.12);
    // claws flex as it hovers
    this.legs.forEach((l, i) => {
      l.leg.rotation.x = Math.sin(t * 2.4 + l.phase) * 0.16;
      l.leg.rotation.z = l.side * (-0.35 + Math.sin(t * 1.7 + i) * 0.1);
    });
    if (this.underGlow) this.underGlow.material.opacity = 0.35 + Math.sin(t * 3.6 + this.phase) * 0.15;

    const ahead = this.a - game.traveled;
    const inRange = ahead > 8 && ahead < 190;
    if (!inRange) {
      this.eyeMat.opacity = 0.35;
      this.eye.scale.setScalar(1.4);
      return;
    }

    if (this.charge > 0) {
      this.charge -= dt;
      this.eye.scale.setScalar(2.0 + (0.9 - this.charge) * 2.8);
      this.eyeMat.opacity = 1;
      this.eyeMat.color.setHex(0xffffff);
      if (this.charge <= 0) {
        game.fireDroneShot(this);
        this.cooldown = rand(1.9, 3.1) / game.difficulty;
        this.eyeMat.color.setHex(0xff5470);
      }
      return;
    }

    this.cooldown -= dt;
    this.eye.scale.setScalar(1.7 + Math.sin(t * 5 + this.phase) * 0.18);
    this.eyeMat.opacity = 0.65 + Math.sin(t * 3 + this.phase) * 0.2;
    if (this.cooldown <= 0) {
      this.charge = 0.85;
      game.audio.teleportCharge(clamp(this.x / 8, -1, 1) * 0.4);
    }
  }

  hit(dmg, game, at) {
    if (this.dead) return 'blocked';
    this.hp -= dmg;
    game.fx.hitSpark(at, '#ff9bb0');
    if (this.hp <= 0) {
      this.dead = true;
      return 'dead';
    }
    return 'hit';
  }

  dispose(scene) {
    scene.remove(this.group);
    this.eyeMat.dispose();
    this.exhaust.material.dispose();
  }
}

export class Mine {
  constructor(scene, { x, y }) {
    initShared();
    this.kind = 'mine';
    this.x = x;
    this.y = y;
    this.a = 0;
    this.radius = 1.15;
    this.hp = Infinity;
    this.score = 0;
    this.dead = false;
    this.passed = false;
    this.nearMissed = false;
    this.phase = rand(0, TAU);
    this.group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), shared.mineMat);
    this.group.add(core);
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.75, 5), shared.mineMat);
      const theta = (i / 6) * TAU;
      spike.position.set(Math.cos(theta) * 0.6, Math.sin(theta) * 0.6, 0);
      spike.rotation.z = theta - Math.PI / 2;
      this.group.add(spike);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.035, 4, 48), shared.mineGlowMat);
    this.group.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, 4, 40), shared.mineGlowMat);
    ring2.rotation.x = Math.PI / 2;
    this.group.add(ring2);
    this.rings = [ring, ring2];
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('#ff3d6b'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    glow.scale.setScalar(2.4);
    this.group.add(glow);
    this.glow = glow;
    scene.add(this.group);
  }

  update(dt, game) {
    this.group.rotation.z += dt * 1.4;
    this.rings[1].rotation.z -= dt * 2.2;
    const pulse = 1 + Math.sin(game.time * 5 + this.phase) * 0.08;
    this.glow.scale.setScalar(2.4 * pulse);
  }

  hit(dmg, game, at) {
    game.fx.hitSpark(at, '#ff6b8f');
    return 'blocked';
  }

  dispose(scene) {
    scene.remove(this.group);
    this.glow.material.dispose();
  }
}

const PICKUP_TYPES = ['arc', 'repair', 'shield', 'boost', 'quantum'];

export class Pickup {
  constructor(scene, { x, y, type = 'arc' }) {
    initShared();
    this.kind = 'pickup';
    this.type = PICKUP_TYPES.includes(type) ? type : 'arc';
    this.color = shared.pickupColors[this.type];
    this.x = x;
    this.y = y;
    this.a = 0;
    this.radius = 1.25;
    this.phase = rand(0, TAU);
    this.collected = false;
    this.dead = false;
    this.group = new THREE.Group();

    const ring = new THREE.Mesh(shared.pickupRingGeo, shared.pickupRingMat.clone());
    ring.material.color.setHex(this.color);
    this.group.add(ring);
    this.ring = ring;
    const ring2 = new THREE.Mesh(shared.pickupRingGeo2, shared.pickupRingMat.clone());
    ring2.material.color.setHex(this.color);
    ring2.rotation.x = Math.PI / 2;
    this.group.add(ring2);
    this.ring2 = ring2;

    const core = new THREE.Mesh(shared.pickupGeo[this.type], shared.pickupMats[this.type]);
    this.group.add(core);
    this.core = core;

    const glow = new THREE.Sprite(shared.pickupGlows[this.type].clone());
    glow.scale.setScalar(1.55);
    this.group.add(glow);
    this.glow = glow;

    const spark = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: starTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      })
    );
    spark.scale.setScalar(0.8);
    this.group.add(spark);
    this.spark = spark;
    scene.add(this.group);
  }

  update(dt, game) {
    const t = game.time + this.phase;
    this.ring.rotation.z += dt * 1.6;
    this.ring2.rotation.z -= dt * 2.0;
    this.core.rotation.y += dt * 1.8;
    this.core.rotation.x += dt * 0.9;
    this.glow.scale.setScalar(1.5 + Math.sin(t * 4) * 0.2);
    this.spark.material.rotation = t * 0.5;
    this.spark.scale.setScalar(0.78 + Math.sin(t * 5) * 0.12);
    this.y += Math.sin(t * 1.7) * dt * 0.25;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.ring.material.dispose();
    this.ring2.material.dispose();
    this.glow.material.dispose();
    this.spark.material.dispose();
  }
}

const gateShader = {
  uniforms: {
    uColor: { value: new THREE.Color(0x66f3ff) },
    uColor2: { value: new THREE.Color(0xff45d4) },
    uTime: { value: 0 },
    uOpen: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uColor2;
    uniform float uTime;
    uniform float uOpen;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0;
      float ang = atan(p.y, p.x);
      float spiral = sin(ang * 7.0 + r * 17.0 - uTime * 2.4);
      float spiral2 = sin(ang * 3.0 - r * 9.0 + uTime * 1.3);
      float bands = smoothstep(0.55, 1.0, spiral * 0.5 + 0.5) * 0.35;
      float pulse = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin(r * 11.0 - uTime * 3.0)) * 0.5;
      float rim = smoothstep(0.86, 0.99, r) * (0.55 + 0.45 * sin(ang * 22.0 + uTime * 4.0));
      float centre = (1.0 - smoothstep(0.0, 0.36, r)) * 0.55;
      vec3 col = mix(uColor, uColor2, 0.5 + 0.5 * spiral2);
      float alpha = (bands + pulse * 0.4 + rim * 0.9 + centre + 0.04) * (0.35 + uOpen * 0.65);
      gl_FragColor = vec4(col * (1.0 + pulse + rim * 2.0), alpha * (1.0 - smoothstep(0.92, 1.0, r)));
    }
  `,
};

export class Gate {
  constructor(scene, palette) {
    initShared();
    this.scene = scene;
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.radius = 9.7;
    this.group = new THREE.Group();
    this.open = 0;

    const outer = new THREE.Mesh(shared.gateRingGeo, shared.gateTorusMat.clone());
    outer.material.color.setHex(palette.tubeB);
    this.group.add(outer);
    this.outer = outer;

    const inner = new THREE.Mesh(shared.gateRingGeo2, shared.gateTorusMat.clone());
    inner.material.color.setHex(palette.glow);
    inner.material.opacity = 0.5;
    this.group.add(inner);
    this.inner = inner;

    this.discMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(palette.tubeB) },
        uColor2: { value: new THREE.Color(palette.glow) },
        uTime: { value: 0 },
        uOpen: { value: 0 },
      },
      vertexShader: gateShader.vertexShader,
      fragmentShader: gateShader.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const disc = new THREE.Mesh(shared.gateDiscGeo, this.discMat);
    disc.scale.setScalar(1.04);
    this.group.add(disc);
    this.disc = disc;

    this.chevrons = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const chev = new THREE.Mesh(shared.chevronGeo, shared.gateChevronMat.clone());
      chev.material.color.setHex(palette.glow);
      chev.position.set(Math.cos(a) * 9.7, Math.sin(a) * 9.7, 0);
      chev.rotation.z = a - Math.PI / 2;
      this.group.add(chev);
      this.chevrons.push(chev);
    }

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(`#${new THREE.Color(palette.glow).getHexString()}`),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    this.halo.scale.setScalar(30);
    this.group.add(this.halo);

    scene.add(this.group);
  }

  setPalette(palette) {
    this.outer.material.color.setHex(palette.tubeB);
    this.inner.material.color.setHex(palette.glow);
    this.discMat.uniforms.uColor.value.setHex(palette.tubeB);
    this.discMat.uniforms.uColor2.value.setHex(palette.glow);
    this.chevrons.forEach((c) => c.material.color.setHex(palette.glow));
    this.halo.material.map = glowTexture(`#${new THREE.Color(palette.glow).getHexString()}`);
  }

  update(dt, game) {
    this.outer.rotation.z += dt * 0.12;
    this.inner.rotation.z -= dt * 0.2;
    this.discMat.uniforms.uTime.value = game.time;
    this.chevrons.forEach((c, i) => {
      c.scale.y = 0.8 + Math.sin(game.time * 3 + i * 0.7) * 0.18;
    });
    const pulse = 1 + Math.sin(game.time * 2.2) * 0.06;
    this.halo.scale.setScalar(30 * pulse);
    this.open = clamp(this.open, 0, 1);
    this.discMat.uniforms.uOpen.value = this.open;
  }

  dispose() {
    this.scene.remove(this.group);
    this.outer.material.dispose();
    this.inner.material.dispose();
    this.discMat.dispose();
    this.chevrons.forEach((c) => c.material.dispose());
    this.halo.material.dispose();
  }
}

export const PICKUP_INFO = {
  arc: { label: 'ARC CELL', color: '#6ef3ff' },
  repair: { label: 'HULL REPAIR', color: '#b6ff5e' },
  shield: { label: 'SHIELD ONLINE', color: '#b18cff' },
  boost: { label: 'OVERDRIVE +', color: '#ff6ee7' },
  quantum: { label: 'TIME DILATION', color: '#ffc45e' },
};

// ============================================================================
// Wall-mounted hazards for the mag-boot runner.
// The runner sticks to the inside of the tube, so obstacles live on the wall:
// they occupy an angular arc [thetaStart, thetaEnd] and a short axial slice.
// ============================================================================

function arcSectorGeometry(thetaStart, thetaLen, innerR, outerR, depth, curves = 0) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, thetaStart, thetaStart + thetaLen, false);
  shape.absarc(0, 0, innerR, thetaStart + thetaLen, thetaStart, true);
  shape.closePath();
  const segments = curves || Math.max(10, Math.round(thetaLen * 26));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: segments,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Split an arc into two capped pieces so the collision edge is never cubic. */
export class ArcBarrier {
  constructor(scene, { thetaStart, thetaLen, depth = 2.2, height = 1.25, energy = false, hp = Infinity, inside = false }) {
    initShared();
    this.kind = energy ? 'arcEnergy' : 'arc';
    this.a = 0;
    this.thetaStart = thetaStart;
    this.thetaLen = thetaLen;
    this.thetaEnd = thetaStart + thetaLen;
    this.depth = depth;
    this.height = height;
    this.hp = energy ? Infinity : hp;
    this.maxHp = this.hp;
    this.score = energy ? 0 : 80;
    this.energy = energy;
    this.inside = inside;
    this.dead = false;
    this.passed = false;
    this.hitPlayer = false;
    this.phase = rand(0, TAU);
    this.spin = rand(-0.1, 0.1);

    const R = TUBE_RADIUS;
    const innerR = R - height;
    const outerR = R - 0.02;
    this.innerR = innerR;
    this.outerR = outerR;

    this.group = new THREE.Group();

    const plateMat = energy
      ? new THREE.MeshBasicMaterial({
          color: 0xff4fa8,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          map: hexTexture('#ff3c8e'),
        })
      : new THREE.MeshStandardMaterial({
          map: hazardTexture('#ff8a3d', '#241010'),
          emissiveMap: hazardTexture('#ff8a3d', '#241010'),
          emissive: 0xff7a2f,
          emissiveIntensity: 1.15,
          metalness: 0.55,
          roughness: 0.5,
          color: 0xbb9a8c,
          side: THREE.DoubleSide,
        });

    const plate = new THREE.Mesh(arcSectorGeometry(thetaStart + 0.004, thetaLen - 0.008, innerR, outerR, depth), plateMat);
    this.group.add(plate);
    this.plate = plate;

    // glowing rims at both ends of the arc
    const rimMat = new THREE.MeshBasicMaterial({
      color: energy ? 0xff7ac8 : 0xffb066,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.rimMat = rimMat;
    const rimGeo = new THREE.TorusGeometry(R - 0.03, 0.05, 6, 28, thetaLen);
    for (const z of [-depth / 2, depth / 2]) {
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = thetaStart;
      rim.position.z = z;
      this.group.add(rim);
    }
    // inner lip
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(innerR + 0.02, 0.035, 4, 64, thetaLen),
      rimMat
    );
    lip.rotation.z = thetaStart;
    lip.position.z = depth / 2;
    this.group.add(lip);
    const lip2 = lip.clone();
    lip2.position.z = -depth / 2;
    this.group.add(lip2);

    // spikes pointing into the tube
    const spikeCount = Math.max(2, Math.round((thetaLen / (Math.PI * 2)) * 26));
    const spikeGeo = new THREE.ConeGeometry(0.075, 0.36, 6);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a2a30, metalness: 0.8, roughness: 0.4 });
    this.spikes = [];
    for (let i = 0; i < spikeCount; i++) {
      const t = thetaStart + ((i + 0.5) / spikeCount) * thetaLen;
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(Math.cos(t) * (innerR + 0.16), Math.sin(t) * (innerR + 0.16), 0);
      spike.rotation.z = t - Math.PI / 2;
      spike.rotation.x = Math.PI; // point inward
      this.group.add(spike);
      this.spikes.push(spike);
    }

    // warning glow hovering just off the wall
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(energy ? '#ff3c8e' : '#ff7a2f'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.22,
      })
    );
    this.halo.scale.setScalar(Math.max(3, thetaLen * R * 0.7));
    const mid = thetaStart + thetaLen * 0.5;
    this.halo.position.set(Math.cos(mid) * (R - 0.6), Math.sin(mid) * (R - 0.6), 0);
    this.group.add(this.halo);

    scene.add(this.group);
  }

  update(dt, game) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 4 + this.phase);
    this.rimMat.opacity = 0.65 + pulse * 0.35;
    this.halo.material.opacity = 0.12 + pulse * 0.12;
    if (this.energy) this.plate.material.opacity = 0.3 + pulse * 0.22;
    if (this.hp !== Infinity && this.hp < this.maxHp) {
      this.rimMat.color.setHex(this.hp <= 1 ? 0xff3355 : 0xffb066);
    }
  }

  /** Does an angular position (plus body half-angle) touch this arc? */
  hitsAngle(theta, halfAngle = 0.075) {
    const rel = ((theta - this.thetaStart) % TAU + TAU) % TAU;
    if (rel <= this.thetaLen) return true;
    // wrap-around tolerance at both ends
    const dStart = Math.min(rel, TAU - rel);
    const dEnd = Math.min(Math.abs(rel - this.thetaLen), TAU - Math.abs(rel - this.thetaLen));
    return Math.min(dStart, dEnd) < halfAngle;
  }

  hit(dmg, game, at) {
    if (this.hp === Infinity) {
      game.fx.hitSpark(at);
      return 'blocked';
    }
    this.hp -= dmg;
    game.fx.hitSpark(at, '#ffb066');
    if (this.hp <= 0) {
      this.dead = true;
      return 'dead';
    }
    return 'hit';
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      }
      if (o.isSprite) o.material?.dispose?.();
    });
  }
}
