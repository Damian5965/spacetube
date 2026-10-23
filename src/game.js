// Game director for the mag-boot runner.
// The hero sticks to the inside wall of the tube and can run all the way
// around it (a full 360°), so gameplay lives on a cylinder: one axis runs
// along the tunnel, the other is the angle around its circumference.
import * as THREE from 'three';
import {
  TUBE_RADIUS,
  RUNNER_CENTER_R,
  BODY_HALF_ANGLE,
  sectorFor,
  pathX,
  pathY,
  angleDelta,
} from './path.js';
import { Hull } from './hull.js';
import { Backdrop } from './backdrop.js';
import { FX } from './fx.js';
import { Bullets } from './projectiles.js';
import { Runner } from './runner.js';
import { ArcBarrier, Asteroid, Drone, Mine, Pickup, Gate, PICKUP_INFO } from './hazards.js';
import { Warden } from './boss.js';
import { clamp, damp, rand, randInt, chance, pick, TAU } from './util.js';

const METERS_PER_UNIT = 0.45;
const BASE_SPEED = 46;
const WEAPON_NAMES = ['PULSE I', 'TWIN II', 'TRI-LANCE III'];
const START_THETA = -Math.PI / 2; // bottom of the tube
const MAX_ANGVEL = 1.85; // rad/s around the tube

// Only try to load a custom character if one was actually shipped — this keeps
// the console clean when public/models/ is empty.
const HAS_CUSTOM_MODEL = Object.keys(import.meta.glob('../public/models/*.glb')).length > 0;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _ray = new THREE.Raycaster();

export class Game {
  constructor({ scene, camera, engine, audio, ui }) {
    this.scene = scene;
    this.camera = camera;
    this.engine = engine;
    this.audio = audio;
    this.ui = ui;

    this.palette = sectorFor(1);
    this.tunnel = new Hull(scene, this.palette);
    this.backdrop = new Backdrop(scene, this.palette);
    this.fx = new FX(scene, camera);
    this.bullets = new Bullets(scene, this.fx);
    this.runner = new Runner(scene, this.palette);
    this.runner.onFootstep = (index, pos) => this.onFootstep(index, pos);
    // optional drop-in model: public/models/runner.glb (silently falls back)
    if (HAS_CUSTOM_MODEL) this.runner.loadCustomModel('./models/runner.glb');
    // kept for the boss/projectile code that talks to `game.ship`
    this.ship = this.runner;

    this.input = {
      left: false,
      right: false,
      up: false,
      down: false,
      fire: false,
      boost: false,
      stickX: 0,
      stickY: 0,
    };
    this.pointerNDC = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.pointerSteer = 0;

    this.state = 'boot';
    this.paused = false;
    this.time = 0;
    this.runTime = 0;
    this.traveled = 0;
    this.speed = 26;
    this.speedTarget = 26;
    this.boostVisual = 0;
    this.overdrive = 100;
    this.boosting = false;
    this.boostLocked = false;
    this.hull = 100;
    this.shield = 0;
    this.weaponLevel = 1;
    this.fireCooldown = 0;
    this.invuln = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.maxMultiplier = 1;
    this.score = 0;
    this.kills = 0;
    this.nearMisses = 0;
    this.level = 1;
    this.sectorStart = 0;
    this.sectorLength = 1100;
    this.bossTriggered = false;
    this.boss = null;
    this.bossRewarded = false;
    this.gate = null;
    this.gateStart = 0;
    this.spawnCursor = 260;
    this.patternIndex = 0;
    this.slowmo = 0;
    this.hitstop = 0;
    this.damageFx = 0;
    this.deathTimer = 0;
    this.deathNotified = false;
    this.onGameOver = null;
    this.attractTimer = 0;

    // runner state
    this.theta = START_THETA;
    this.thetaVel = 0;
    this.thetaTarget = START_THETA;
    this.camTheta = START_THETA;
    this.airLift = 0;
    this.airTime = 0;
    this.airCooldown = 0;
    this.leapRequested = false;
    this.footstepTimer = 0;
    this.magnetPulse = 0;

    this.hazards = [];
    this.pickups = [];
    this.applySector(1);
    this.state = 'menu';
    this.resetRun();
    this.state = 'menu';
    this.enterAttract();
  }

  // ------------------------------------------------------------- lifecycle
  resetRun() {
    this.clearEntities();
    this.traveled = 0;
    this.speed = 22;
    this.speedTarget = 30;
    this.runTime = 0;
    this.score = 0;
    this.hull = 100;
    this.shield = 0;
    this.weaponLevel = 1;
    this.overdrive = 100;
    this.boosting = false;
    this.boostVisual = 0;
    this.boostLocked = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.maxMultiplier = 1;
    this.kills = 0;
    this.nearMisses = 0;
    this.level = 1;
    this.sectorStart = 0;
    this.sectorLength = 1100;
    this.bossTriggered = false;
    this.bossRewarded = false;
    this.spawnCursor = 300;
    this.patternIndex = 0;
    this.invuln = 0;
    this.fireCooldown = 0;
    this.slowmo = 0;
    this.hitstop = 0;
    this.deathNotified = false;
    this.damageFx = 0;
    this.theta = START_THETA;
    this.thetaVel = 0;
    this.thetaTarget = START_THETA;
    this.camTheta = START_THETA;
    this.airLift = 0;
    this.airTime = 0;
    this.airCooldown = 0;
    this.runner.setVisible(true);
    this.runner.rig.visible = true;
    this.applySector(1);
    this.syncRunnerPosition();
    this.engine.addShake(0);
    this.audio.setIntensity(0);
    this.tunnel.impulse(0.4);
  }

  startRun() {
    this.resetRun();
    this.state = 'playing';
    this.paused = false;
    this.runTime = 0;
    this.ui?.setBoosting(false);
    this.ui?.setFiring(false);
    this.ui?.hideBoss();
    this.ui?.hideGameOver?.();
    this.audio.gameStart();
    this.ui?.announce('SECTOR 01', this.palette.name, 'magnetise · run the wall · reach the gate');
    this.ui?.toast('A / D — RUN AROUND THE TUBE · W — MAGNET LEAP · SPACE — FIRE');
    this.spawnIntroPickups();
  }

  enterAttract() {
    this.resetRun();
    this.paused = false;
    this.state = 'menu';
    this.attractTimer = 0;
    this.audio.setIntensity(0);
    this.runner.setVisible(true);
    this.ui?.setBoosting(false);
    this.ui?.setFiring(false);
    this.ui?.hideBoss();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.paused = true;
    this.audio.duck(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.audio.duck(false);
    this.audio.resume();
  }

  applyQuality(q) {
    this.engine.setQuality(q);
    this.fx.setQuality(q);
  }

  setPointerNDC(x, y) {
    this.pointerNDC.set(x, y);
    this.pointerActive = true;
  }

  // ------------------------------------------------------------- sectors
  applySector(level) {
    this.palette = sectorFor(level);
    this.engine.setPalette(this.palette);
    this.tunnel.setSector(this.palette);
    this.backdrop.setSector(this.palette);
    this.runner.setPalette(this.palette);
    this.gate?.setPalette(this.palette);
    this.ui?.setPalette?.(this.palette);
  }

  nextSector() {
    this.level += 1;
    this.sectorStart = this.traveled;
    this.sectorLength = 1100 + (this.level - 1) * 140;
    this.bossTriggered = false;
    this.boss?.dispose();
    this.boss = null;
    this.spawnCursor = this.traveled + 240;
    this.gate?.dispose();
    this.gate = null;
    this.clearEntities(false);
    this.bullets.clear();
    this.hull = Math.min(100, this.hull + 14);
    this.overdrive = 100;
    this.applySector(this.level);
    this.tunnel.impulse(1.1);
    this.engine.addShake(0.35);
    this.audio.gate();
    this.audio.levelUp();
    this.score += 500 * this.level;
    this.slowmo = 0.6;
    this.ui?.flash();
    this.ui?.announce(`SECTOR ${String(this.level).padStart(2, '0')}`, this.palette.name, 'gate cleared · suit patched');
    this.ui?.hideBoss();
    this.audio.setIntensity(0);
    this.spawnIntroPickups();
  }

  spawnIntroPickups() {
    const a = this.traveled + 150;
    ['arc', 'boost', 'boost', 'repair'].forEach((type, i) => {
      const theta = this.theta + (i - 1.5) * 0.22;
      this.spawnPickup(a + i * 9, theta, type);
    });
  }

  // ------------------------------------------------------------- entities
  spawnArc(a, thetaStart, thetaLen, { depth = 2.4, height = 1.2, energy = false, hp = Infinity } = {}) {
    const b = new ArcBarrier(this.scene, { thetaStart, thetaLen, depth, height, energy, hp });
    b.a = a;
    this.hazards.push(b);
    return b;
  }

  spawnAsteroid(a, theta, radiusFromWall = 1.6, scale = 2) {
    const r = TUBE_RADIUS - radiusFromWall;
    const ast = new Asteroid(this.scene, { x: Math.cos(theta) * r, y: Math.sin(theta) * r, scale });
    ast.theta = theta;
    ast.a = a;
    this.hazards.push(ast);
    return ast;
  }

  spawnDrone(a, theta, radiusFromWall = 2.2) {
    const r = TUBE_RADIUS - radiusFromWall;
    const d = new Drone(this.scene, { x: Math.cos(theta) * r, y: Math.sin(theta) * r });
    d.theta = theta;
    d.a = a;
    this.hazards.push(d);
    return d;
  }

  spawnMine(a, theta) {
    const r = TUBE_RADIUS - 0.7;
    const m = new Mine(this.scene, { x: Math.cos(theta) * r, y: Math.sin(theta) * r });
    m.theta = theta;
    m.a = a;
    this.hazards.push(m);
    return m;
  }

  spawnPickup(a, theta, type = 'boost') {
    const r = TUBE_RADIUS - 1.15;
    const p = new Pickup(this.scene, { x: Math.cos(theta) * r, y: Math.sin(theta) * r, type });
    p.theta = theta;
    p.a = a;
    this.pickups.push(p);
    return p;
  }

  spawnBossDrones(boss) {
    for (const side of [-1, 1]) {
      const theta = (boss.theta ?? this.theta) + side * 0.35;
      const d = this.spawnDrone(boss.a + rand(6, 14), theta, 2.0);
      d.baseX = d.x;
      d.baseY = d.y;
    }
    this.fx.sparks({ x: boss.x, y: boss.y, z: -(boss.a - this.traveled) }, '#ffb3c0', 20, { speed: 7 });
  }

  clearEntities(disposeBullets = true) {
    for (const h of this.hazards) h.dispose(this.scene);
    for (const p of this.pickups) p.dispose(this.scene);
    this.hazards.length = 0;
    this.pickups.length = 0;
    this.boss?.dispose();
    this.boss = null;
    this.gate?.dispose();
    this.gate = null;
    if (disposeBullets) this.bullets.clear();
  }

  // ------------------------------------------------------------- spawning
  updateSpawner() {
    let guard = 0;
    while (this.spawnCursor < this.traveled + 320 && guard++ < 4) {
      const a = this.spawnCursor;
      const consumed = this.spawnPattern(a);
      const gap = Math.max(30, 58 - this.level * 2.6 + rand(-6, 6));
      this.spawnCursor = a + consumed + gap;
    }
  }

  /** A random angle close to the runner's current wall position. */
  nearTheta(spread = Math.PI, minOffset = 0) {
    const dir = chance(0.5) ? 1 : -1;
    const offset = minOffset + Math.random() * Math.max(0.01, spread - minOffset);
    return this.theta + dir * offset;
  }

  spawnPattern(a) {
    this.patternIndex++;
    const roll = Math.random();
    const lvl = this.level;
    let consumed = 8;

    if (roll < 0.15) {
      // Full ring wall with one safe gap: run to the opening.
      const gap = rand(1.15, 1.6);
      const gapStart = this.theta + rand(-1.6, 1.6);
      const start = gapStart + gap;
      const len = TAU - gap;
      this.spawnArc(a, start, len, { height: 1.35, depth: 3, hp: 5 });
      consumed = 12;
    } else if (roll < 0.33) {
      // One or two blocking arcs on the wall.
      const count = lvl > 2 && chance(0.4) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const theta = this.nearTheta(Math.PI * 0.9, 0.35);
        const len = rand(0.7, 1.25);
        const energy = chance(0.3);
        this.spawnArc(a + i * 16, theta - len * 0.5, len, {
          height: rand(0.95, 1.5),
          depth: rand(2.2, 3.4),
          energy,
          hp: energy ? Infinity : 4,
        });
      }
      consumed = count * 16;
    } else if (roll < 0.47) {
      // Slalom: alternating arcs, one per side.
      const dir = chance(0.5) ? 1 : -1;
      this.spawnArc(a, this.theta + dir * 0.75, 0.85, { height: 1.2, depth: 2.2, hp: 3 });
      this.spawnArc(a + 26, this.theta - dir * 0.95, 0.9, { height: 1.2, depth: 2.2, hp: 3 });
      this.spawnArc(a + 52, this.theta + dir * 0.65, 0.8, { height: 1.2, depth: 2.2, hp: 3 });
      consumed = 56;
    } else if (roll < 0.63) {
      // Drone wing hovering off the wall.
      const count = lvl > 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const theta = this.theta + (i - (count - 1) / 2) * 0.5 + rand(-0.15, 0.15);
        this.spawnDrone(a + i * 7, theta, rand(1.8, 2.6));
      }
      consumed = 18;
    } else if (roll < 0.78) {
      // Mine ring.
      const count = randInt(3, 5);
      for (let i = 0; i < count; i++) {
        const theta = this.theta + (i - (count - 1) / 2) * 0.45;
        this.spawnMine(a + rand(-4, 4), theta);
      }
      consumed = 18;
    } else if (roll < 0.9) {
      // Asteroid cluster drifting near the wall.
      const count = randInt(2, 4);
      for (let i = 0; i < count; i++) {
        this.spawnAsteroid(a + rand(-6, 6), this.nearTheta(2.4, 0.2), rand(1.2, 2.6), rand(1.4, 2.4));
      }
      consumed = 16;
    } else {
      this.spawnPickupLine(a, 8, 'mixed');
      consumed = 4;
    }

    if (chance(0.6) && this.pickups.length < 32) {
      this.spawnPickupLine(a + consumed + 10, randInt(4, 7), chance(0.45) ? 'mixed' : 'boost');
    }
    return consumed;
  }

  /** A trail of cells that spirals around the tube — rewards wall-running. */
  spawnPickupLine(a, count = 7, mode = 'mixed') {
    const startTheta = this.theta + rand(-1.2, 1.2);
    const dir = chance(0.5) ? 1 : -1;
    const sweep = rand(0.5, 1.6) * dir;
    for (let i = 0; i < count; i++) {
      let type = 'boost';
      if (mode === 'mixed') {
        if (i === Math.floor(count * 0.5)) type = 'arc';
        else if (i === count - 1) type = chance(0.65) ? 'repair' : 'shield';
        else if (chance(0.1)) type = chance(0.5) ? 'quantum' : 'shield';
      } else if (i === Math.floor(count * 0.6)) {
        type = chance(0.5) ? 'arc' : 'shield';
      }
      const theta = startTheta + sweep * (i / Math.max(1, count - 1));
      this.spawnPickup(a + i * 5.5, theta, type);
    }
  }

  // ------------------------------------------------------------- movement
  updateSteering(dt) {
    const input = this.input;
    // keyboard + touch stick steer the angle; the pointer acts like a wheel
    let steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (Math.abs(input.stickX) > 0.08) steer = clamp(input.stickX, -1, 1);
    if (steer === 0 && this.pointerActive) {
      const px = this.pointerNDC.x;
      const dead = 0.16;
      if (Math.abs(px) > dead) steer = clamp(((px - Math.sign(px) * dead) / (1 - dead)) * 1.4, -1, 1);
    }
    this.steerInput = steer;

    const accel = 9.5;
    this.thetaVel += steer * accel * dt;
    this.thetaVel *= Math.exp(-2.6 * dt);
    if (Math.abs(steer) < 0.05) this.thetaVel *= Math.exp(-5.5 * dt);
    this.thetaVel = clamp(this.thetaVel, -MAX_ANGVEL, MAX_ANGVEL);
    this.theta += this.thetaVel * dt;

    // keep the angle in a readable range (wrapping is seamless)
    if (this.theta > Math.PI * 4) {
      this.theta -= TAU * 2;
      this.thetaTarget -= TAU * 2;
    } else if (this.theta < -Math.PI * 4) {
      this.theta += TAU * 2;
      this.thetaTarget += TAU * 2;
    }

    // magnet leap ------------------------------------------------------
    if (this.airCooldown > 0) this.airCooldown -= dt;
    const wantLeap = input.up || this.leapRequested;
    if (wantLeap && this.airTime <= 0 && this.airCooldown <= 0 && this.state === 'playing') {
      this.airTime = 0.001;
      this.airCooldown = 0.75;
      this.audio.leap?.();
      this.fx.particles.burst(
        _v.set(pathX(this.traveled) + Math.cos(this.theta) * (TUBE_RADIUS - 0.2), pathY(this.traveled) + Math.sin(this.theta) * (TUBE_RADIUS - 0.2), 0),
        '#9ff6ff',
        14,
        { speed: 5, size: 0.3, life: 0.45, spread: 0.5, drag: 2 }
      );
      this.magnetPulse = 1;
    }
    this.leapRequested = false;

    if (this.airTime > 0) {
      this.airTime += dt;
      const T = 0.62;
      const t = clamp(this.airTime / T, 0, 1);
      this.airLift = Math.sin(t * Math.PI) * 1.75;
      if (this.airTime >= T) {
        this.airTime = 0;
        this.airLift = 0;
        this.magnetPulse = 1;
        this.audio.land?.();
      }
    } else {
      this.airLift = 0;
    }

    this.magnetPulse = Math.max(0, this.magnetPulse - dt * 3.2);
  }

  syncRunnerPosition() {
    const radius = RUNNER_CENTER_R - this.airLift;
    this.runnerX = Math.cos(this.theta) * radius;
    this.runnerY = Math.sin(this.theta) * radius;
    // compatibility for boss/projectile code that reads game.ship.{x,y,vx,vy}
    this.ship.x = this.runnerX;
    this.ship.y = this.runnerY;
    this.ship.vx = -Math.sin(this.theta) * this.thetaVel * radius;
    this.ship.vy = Math.cos(this.theta) * this.thetaVel * radius;
  }

  updateWeapon(dt) {
    this.fireCooldown -= dt;
    const firing = this.input.fire && this.state === 'playing';
    this.ui?.setFiring(firing);
    if (!firing || this.fireCooldown > 0) return;
    this.fireCooldown = this.weaponLevel >= 3 ? 0.115 : 0.14;
    const r = RUNNER_CENTER_R - 0.15;
    const bx = Math.cos(this.theta) * r;
    const by = Math.sin(this.theta) * r;
    this.bullets.firePlayer(this.traveled + 2.2, bx, by, this.weaponLevel);
    this.audio.shoot(this.weaponLevel, clamp(this.thetaVel / MAX_ANGVEL, -0.7, 0.7));
    _v.set(pathX(this.traveled + 2.0) + bx, pathY(this.traveled + 2.0) + by, -2.0);
    this.fx.sparks(_v, '#9ffaff', 2, { speed: 2.4, size: 0.22, life: 0.18, spread: 0.08 });
  }

  onFootstep(index, pos) {
    if (this.state !== 'playing') return;
    if (!pos) return;
    const speedFactor = clamp(this.speed / BASE_SPEED, 0.5, 2);
    this.fx.particles.burst(pos, '#8ff6ff', Math.round(3 * speedFactor), {
      speed: 3.4,
      size: 0.2,
      life: 0.3,
      spread: 0.12,
      drag: 3.2,
    });
    if (this.boosting) {
      this.fx.particles.burst(pos, '#ffb3ee', 3, { speed: 4.5, size: 0.24, life: 0.35, spread: 0.15, drag: 2.6 });
    }
    this.audio.footstep?.(index, this.boosting);
  }

  // ------------------------------------------------------------- collisions
  collisionRunnerVsHazards() {
    const airborne = this.airLift > 0.55;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.dead) continue;
      const ahead = h.a - this.traveled;

      if (!h.hitPlayer && Math.abs(ahead) < 2.6) {
        let hit = false;
        if (h.thetaStart !== undefined) {
          // wall arc: only the angular position matters, and a leap clears it
          if (!airborne && h.hitsAngle(this.theta, BODY_HALF_ANGLE)) hit = true;
        } else {
          const dx = h.x - this.runnerX;
          const dy = h.y - this.runnerY;
          hit = Math.hypot(dx, dy) < h.radius + 0.55;
        }
        if (hit) {
          h.hitPlayer = true;
          const amount =
            h.kind === 'mine' ? 18 : h.kind === 'drone' ? 16 : h.kind === 'arcEnergy' ? 16 : h.kind === 'asteroid' ? 14 : 18;
          this.damagePlayer(amount, h.kind);
          if (h.kind === 'mine' || h.kind === 'drone' || h.kind === 'asteroid') {
            this.destroyHazard(h, false);
            continue;
          }
        }
      }

      if (!h.passed && ahead < 0) {
        h.passed = true;
        if (!h.hitPlayer && !h.dead) this.checkNearMiss(h);
      }
    }

    // enemy fire
    for (let i = this.bullets.enemy.length - 1; i >= 0; i--) {
      const b = this.bullets.enemy[i];
      if (b.ahead < -2 || b.ahead > 2) continue;
      if (Math.hypot(b.x - this.runnerX, b.y - this.runnerY) < b.radius + 0.6) {
        this.bullets.enemyPool.kill(b);
        this.damagePlayer(b.damage, 'bullet');
      }
    }

    // pickups (wall cells)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (Math.abs(p.a - this.traveled) < 2.6 && Math.hypot(p.x - this.runnerX, p.y - this.runnerY) < 1.5) {
        this.collectPickup(p);
      }
    }
  }

  checkNearMiss(h) {
    let gap;
    if (h.thetaStart !== undefined) {
      const mid = h.thetaStart + h.thetaLen * 0.5;
      gap = Math.abs(angleDelta(this.theta, mid)) * TUBE_RADIUS - h.thetaLen * 0.5 * TUBE_RADIUS;
    } else {
      gap = Math.max(0, Math.hypot(this.runnerX - h.x, this.runnerY - h.y) - h.radius);
    }
    if (gap < 2.6 && !h.nearMissed) {
      h.nearMissed = true;
      this.nearMisses++;
      this.overdrive = Math.min(100, this.overdrive + 8);
      this.combo += 1;
      this.comboTimer = 4.5;
      this.score += Math.round(25 * this.multiplier);
      const p = this.wallPointWorld(this.theta, RUNNER_CENTER_R, 0);
      this.fx.nearMiss(p);
      this.audio.nearMiss(clamp(this.thetaVel / MAX_ANGVEL, -0.8, 0.8));
      this.engine.addShake(0.05);
      this.ui?.popupWorld(p.clone().add(new THREE.Vector3(0, 1.6, 0)), 'NEAR MISS', 'kill');
    }
  }

  wallPointWorld(theta, radius, z) {
    return new THREE.Vector3(Math.cos(theta) * radius + pathX(this.traveled), Math.sin(theta) * radius + pathY(this.traveled), z);
  }

  collisionBulletsVsTargets() {
    for (let i = this.bullets.player.length - 1; i >= 0; i--) {
      const b = this.bullets.player[i];
      let struck = false;

      if (this.boss && !this.boss.dying) {
        const boss = this.boss;
        if (Math.abs(b.a - boss.a) < 6) {
          const dx = (b.x - boss.x) / 6.2;
          const dy = (b.y - boss.y) / 5.2;
          if (dx * dx + dy * dy < 1.0) {
            _v.set(pathX(boss.a) + b.x, pathY(boss.a) + b.y, -(boss.a - this.traveled));
            boss.damage(1, this, _v);
            this.bullets.playerPool.kill(b);
            struck = true;
          }
        }
      }

      if (!struck) {
        for (let j = this.hazards.length - 1; j >= 0; j--) {
          const h = this.hazards[j];
          if (h.dead || h.passive) continue;
          if (Math.abs(b.a - h.a) > 2.8) continue;
          let hit;
          if (h.thetaStart !== undefined) {
            const r = Math.hypot(b.x, b.y);
            const t = Math.atan2(b.y, b.x);
            hit = r > h.innerR - 0.6 && h.hitsAngle(t, 0.02);
          } else {
            hit = Math.hypot(b.x - h.x, b.y - h.y) < h.radius + 0.3;
          }
          if (!hit) continue;
          _v.set(pathX(h.a) + b.x, pathY(h.a) + b.y, -(h.a - this.traveled));
          const result = h.hit(1, this, _v);
          this.bullets.playerPool.kill(b);
          if (result === 'dead') this.destroyHazard(h, true);
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------- effects
  destroyHazard(h, byPlayer = true) {
    const idx = this.hazards.indexOf(h);
    if (idx >= 0) this.hazards.splice(idx, 1);
    if (h.thetaStart !== undefined) {
      const mid = h.thetaStart + h.thetaLen * 0.5;
      _v.set(Math.cos(mid) * (h.innerR ?? TUBE_RADIUS - 1) + pathX(h.a), Math.sin(mid) * (h.innerR ?? TUBE_RADIUS - 1) + pathY(h.a), -(h.a - this.traveled));
    } else {
      _v.set(pathX(h.a) + h.x, pathY(h.a) + h.y, -(h.a - this.traveled));
    }
    const scale = h.kind === 'asteroid' ? h.scale * 0.5 : h.kind === 'drone' ? 0.65 : 0.9;
    const color = h.kind === 'asteroid' ? '#b39bff' : h.kind === 'drone' ? '#ff8a9d' : '#ffb03a';
    this.fx.explosion(_v, color, scale);
    this.audio.explosion(scale);
    this.engine.addShake(0.14 + scale * 0.12);
    if (byPlayer) {
      this.combo += 1;
      this.comboTimer = 4.5;
      this.kills++;
      this.overdrive = Math.min(100, this.overdrive + 3);
      const gained = Math.round((h.score || 50) * this.multiplier);
      this.score += gained;
      this.ui?.popupWorld(_v, `+${gained}`, 'kill');
      if (h.kind === 'drone' && chance(0.35)) {
        this.spawnPickup(h.a, Math.atan2(h.y, h.x), chance(0.5) ? 'boost' : 'arc');
      }
    }
    h.dispose(this.scene);
  }

  collectPickup(p) {
    const idx = this.pickups.indexOf(p);
    if (idx >= 0) this.pickups.splice(idx, 1);
    _v.set(pathX(p.a) + p.x, pathY(p.a) + p.y, -(p.a - this.traveled));
    const info = PICKUP_INFO[p.type];
    this.fx.pickup(_v, `#${new THREE.Color(p.color).getHexString()}`, p.type === 'arc');
    this.audio.pickup(p.type);
    this.score += Math.round(40 * this.multiplier);
    this.combo += 1;
    this.comboTimer = 4.5;
    this.overdrive = Math.min(100, this.overdrive + 5);
    this.ui?.popupWorld(_v, info.label, 'pickup');

    switch (p.type) {
      case 'arc':
        if (this.weaponLevel < 3) {
          this.weaponLevel++;
          this.audio.levelUp();
          this.ui?.announce('BLASTER UPGRADE', WEAPON_NAMES[this.weaponLevel - 1], 'more barrels · more problems');
        } else {
          this.score += 250;
          this.ui?.popupWorld(_v, '+250', 'pickup');
        }
        break;
      case 'repair':
        this.hull = Math.min(100, this.hull + 22);
        break;
      case 'shield':
        this.shield = 1;
        this.audio.shieldBreak();
        break;
      case 'boost':
        this.overdrive = Math.min(100, this.overdrive + 40);
        break;
      case 'quantum':
        this.slowmo = Math.max(this.slowmo, 2.6);
        this.tunnel.impulse(0.35);
        this.ui?.toast('TIME DILATION ENGAGED');
        break;
      default:
        break;
    }
    this.audio.setIntensity(this.boss ? 1 : Math.min(0.6, this.level * 0.08));
    p.dispose(this.scene);
  }

  damagePlayer(amount, source = 'impact') {
    if (this.invuln > 0 || this.state !== 'playing') return;
    _v.copy(this.wallPointWorld(this.theta, RUNNER_CENTER_R, -0.2));

    if (this.shield > 0) {
      this.shield = 0;
      this.invuln = 0.8;
      this.audio.shieldBreak();
      this.fx.pickup(_v, '#b18cff', true);
      this.fx.explosion(_v, '#8f7bff', 0.5);
      this.engine.addShake(0.28);
      this.ui?.popupWorld(_v, 'SHIELD DOWN', 'pickup');
      this.ui?.triggerDamage(0.35);
      return;
    }

    this.hull = Math.max(0, this.hull - amount);
    this.invuln = 1.25;
    this.combo = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.damageFx = 1;
    this.audio.hurt();
    this.fx.explosion(_v, '#ff5470', 0.7);
    this.engine.addShake(0.55);
    this.hitstop = 0.045;
    this.ui?.triggerDamage(1);
    this.ui?.popupWorld(_v, `-${amount} SUIT`, 'hurt');
    this.ui?.setFiring(false);
    if (this.hull <= 0) this.beginDeath(source);
  }

  beginDeath(source) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.deathTimer = 2.0;
    this.deathNotified = false;
    this.boosting = false;
    this.shield = 0;
    this.combo = 0;
    _v.copy(this.wallPointWorld(this.theta, RUNNER_CENTER_R, 0));
    this.fx.explosion(_v, '#ffb03a', 2.2);
    this.fx.explosion(_v, '#ff5470', 1.4);
    this.audio.explosion(2);
    this.audio.gameOver();
    this.audio.setIntensity(0);
    this.engine.addShake(1);
    this.ui?.flash(true);
    this.ui?.triggerDamage(1.4);
    this.ui?.setBoosting(false);
    this.slowmo = 1.2;
    this.speedTarget = 4;
    setTimeout(() => {
      this.runner.setVisible(false);
    }, 120);
    void source;
  }

  onBossKilled(boss) {
    if (this.bossRewarded) return;
    this.bossRewarded = true;
    this.score += 2500 * this.level;
    this.combo += 5;
    this.comboTimer = 4.5;
    this.kills++;
    this.overdrive = 100;
    this.slowmo = 1.1;
    this.hitstop = 0.08;
    this.engine.addShake(0.85);
    this.audio.explosion(2);
    this.audio.setIntensity(0);
    this.ui?.announce('WARDEN CRITICAL', 'CORE BREACH', 'gate sequence unlocking');
    _v.set(pathX(boss.a) + boss.x, pathY(boss.a) + boss.y, -(boss.a - this.traveled));
    this.ui?.popupWorld(_v, `+${2500 * this.level}`, 'combo');
  }

  finalizeBoss() {
    if (!this.boss) return;
    const boss = this.boss;
    _v.set(pathX(boss.a) + boss.x, pathY(boss.a) + boss.y, -(boss.a - this.traveled));
    this.fx.explosion(_v, '#ffb03a', 3);
    this.fx.explosion(_v, '#ffffff', 2);
    this.audio.explosion(2.2);
    this.engine.addShake(1);
    this.ui?.flash();
    this.gateStart = this.traveled;
    this.gate = new Gate(this.scene, this.palette);
    this.gate.a = this.traveled + 150;
    this.gate.open = 0.35;
    this.tunnel.setGateWarmth(1);
    this.tunnel.impulse(0.8);
    this.audio.gate();
    this.ui?.hideBoss();
    this.ui?.announce('GATE OPEN', 'SECTOR CLEAR', 'run through the ring');
    boss.dispose();
    this.boss = null;
  }

  // ------------------------------------------------------------- update
  update(dtRaw) {
    if (this.paused) return;
    const dt = Math.min(dtRaw, 0.05);
    this.time += dt;

    let scale = 1;
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      scale = 0.55;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      scale *= 0.15;
    }
    const sdt = dt * scale;

    if (this.state === 'menu') {
      this.updateAttract(dt, sdt);
    } else if (this.state === 'playing') {
      this.runTime += sdt;
      this.updatePlaying(dt, sdt);
    } else if (this.state === 'dying' || this.state === 'over') {
      this.updateAfterDeath(dt, sdt);
    }

    this.boostVisual = damp(this.boostVisual, this.boosting ? 1 : 0, 5, dt);
    this.damageFx = Math.max(0, this.damageFx - dt * 2.3);
    this.engine.setBoost(this.boostVisual);
    this.engine.setDamage(this.damageFx);
    this.engine.update(dt);
    this.bullets.update(dt, this.traveled);

    if (this.state === 'playing' || this.state === 'dying') {
      this.updateHazards(dt);
      this.collisionBulletsVsTargets();
      if (this.state === 'playing') this.collisionRunnerVsHazards();
      this.updateGate(dt);
    } else if (this.state === 'menu') {
      this.updateHazards(dt);
    }

    this.syncRunnerPosition();
    this.placeEntities();
    this.updateCamera(dt);
    this.updateVisuals(dt);
    this.updateRunnerVisual(dt);
    this.ui?.setBoosting(this.boosting);
    if (this.state === 'playing') this.updateProgress();
  }

  updatePlaying(dt, sdt) {
    this.updateSteering(sdt);
    this.syncRunnerPosition();
    this.updateWeapon(dt);

    const boosting = this.input.boost && this.overdrive > 0.5 && !this.boostLocked;
    if (boosting !== this.boosting) {
      this.boosting = boosting;
      if (boosting) {
        this.audio.boost();
        this.ui?.setBoosting(true);
        this.engine.addShake(0.08);
        this.magnetPulse = 1;
      } else {
        this.audio.boostEnd();
        this.engine.addShake(0.04);
      }
    }
    if (this.boosting) {
      this.overdrive = Math.max(0, this.overdrive - dt * 27);
      if (this.overdrive <= 0.5) {
        this.boosting = false;
        this.boostLocked = true;
        this.audio.boostEnd();
        this.ui?.toast('OVERDRIVE DEPLETED');
      }
    } else {
      this.overdrive = Math.min(100, this.overdrive + dt * (this.boostLocked ? 0.8 : 2.2));
      if (this.boostLocked && this.overdrive > 22) this.boostLocked = false;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    this.multiplier = Math.min(8, 1 + this.combo * 0.18);
    this.maxMultiplier = Math.max(this.maxMultiplier, this.multiplier);

    const brake = this.input.down ? 0.68 : 1;
    const base = BASE_SPEED + (this.level - 1) * 3.2;
    const introRamp = clamp(this.runTime / 2.4, 0.5, 1);
    this.speedTarget = base * introRamp * brake * (this.boosting ? 1.85 : 1);
    this.speed = damp(this.speed, this.speedTarget, 2.4, dt);
    this.traveled += this.speed * sdt;
    this.score += this.speed * sdt * 0.5 * this.multiplier * (this.boosting ? 1.25 : 1);

    if (!this.bossTriggered && this.traveled > this.sectorStart + this.sectorLength * 0.72) {
      this.spawnBoss();
    }
    if (!this.bossTriggered) this.updateSpawner();

    if (this.boss) {
      this.boss.update(dt, this);
      if (this.boss && this.boss.dying && this.boss.finished) this.finalizeBoss();
      if (this.boss) this.ui?.setBoss({ name: this.boss.name, hp: this.boss.hp, maxHp: this.boss.maxHp });
    }
    if (this.gate) {
      this.gate.open = Math.min(1, this.gate.open + dt * 0.8);
      if (this.traveled >= this.gate.a - 2) this.nextSector();
    }
    this.audio.setIntensity(this.boss ? 1 : Math.min(0.5, 0.1 + this.level * 0.07));
  }

  updateAttract(dt, sdt) {
    this.attractTimer += dt;
    const t = this.attractTimer;
    // weave around the tube by itself
    this.thetaTarget = START_THETA + Math.sin(t * 0.5) * 1.5 + Math.sin(t * 0.23) * 0.7;
    const steer = clamp((this.thetaTarget - this.theta) * 2.2, -1, 1);
    this.thetaVel += steer * 8 * dt;
    this.thetaVel *= Math.exp(-3.2 * dt);
    this.theta += this.thetaVel * dt;
    this.steerInput = steer;
    this.speed = damp(this.speed, 30, 1.2, dt);
    this.traveled += this.speed * sdt;
    this.boosting = false;
    this.airTime = 0;
    this.airLift = 0;
    this.invuln = 1;
    this.fireCooldown -= dt;
    this.ui?.setBoosting(false);
    this.ui?.setFiring(false);

    if (chance(dt * 0.55)) {
      const a = this.traveled + rand(190, 270);
      this.spawnAsteroid(a, this.nearTheta(2.6), rand(2.4, 4), rand(1.2, 2.2));
    }
  }

  updateAfterDeath(dt, sdt) {
    this.speed = damp(this.speed, 6, 1.2, dt);
    this.traveled += this.speed * sdt;
    if (this.state === 'dying') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.deathTimer = 0;
        this.state = 'over';
        if (!this.deathNotified) {
          this.deathNotified = true;
          this.onGameOver?.(this.getStats());
        }
      }
    }
    this.speedTarget = 6;
  }

  updateHazards(dt) {
    const despawn = this.traveled - 26;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.update?.(dt, this);
      if (h.a < despawn) {
        this.hazards.splice(i, 1);
        h.dispose(this.scene);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update?.(dt, this);
      if (p.a < this.traveled - 22) {
        this.pickups.splice(i, 1);
        p.dispose(this.scene);
      }
    }
  }

  updateGate(dt) {
    if (!this.gate) return;
    this.gate.update(dt, this);
  }

  placeEntities() {
    const T = this.traveled;
    for (const h of this.hazards) {
      if (!h.group) continue;
      // arcs are already built in tube space; everything else carries a lateral offset
      if (h.thetaStart !== undefined) h.group.position.set(pathX(h.a), pathY(h.a), -(h.a - T));
      else h.group.position.set(pathX(h.a) + h.x, pathY(h.a) + h.y, -(h.a - T));
    }
    for (const p of this.pickups) {
      p.group.position.set(pathX(p.a) + p.x, pathY(p.a) + p.y, -(p.a - T));
    }
    if (this.boss) {
      this.boss.group.position.set(pathX(this.boss.a) + this.boss.x, pathY(this.boss.a) + this.boss.y, -(this.boss.a - T));
    }
    if (this.gate) {
      this.gate.group.position.set(pathX(this.gate.a), pathY(this.gate.a), -(this.gate.a - T));
      this.gate.group.rotation.z = Math.sin(this.time * 0.2) * 0.08;
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (this.debugCamera) return; // tooling hook: free camera for close-ups
    // camera follows her angle with a little lag so turns read as motion
    const follow = this.state === 'menu' ? 3.2 : 6.5;
    this.camTheta = damp(this.camTheta, this.theta, follow, dt);
    const camTheta = this.camTheta;

    const back = 3.15 + this.boostVisual * 0.5;
    const camA = this.traveled - back;
    const camRadius = TUBE_RADIUS - 1.15;
    const shake = this.engine.shake;
    cam.position.set(
      pathX(camA) + Math.cos(camTheta) * camRadius + shake.x * 0.5,
      pathY(camA) + Math.sin(camTheta) * camRadius + shake.y * 0.5,
      back
    );
    // up is toward the axis: the wall stays under her boots
    cam.up.set(-Math.cos(camTheta), -Math.sin(camTheta), 0);

    // look a little past her, down the tunnel, at roughly her wall height.
    // the aim angle is mostly the (lagging) camera angle so she stays centred,
    // with a hint of her real angle so turns still read as motion
    const aimTheta = camTheta + angleDelta(this.theta, camTheta) * 0.2;
    const lookA = this.traveled + 9;
    const lookR = TUBE_RADIUS - 2.6;
    cam.lookAt(
      pathX(lookA) + Math.cos(aimTheta) * lookR,
      pathY(lookA) + Math.sin(aimTheta) * lookR,
      -9
    );
    cam.rotateZ(shake.roll + Math.sin(this.time * 0.33) * 0.006);

    const targetFov = 62 + this.boostVisual * 10;
    if (Math.abs(cam.fov - targetFov) > 0.02) {
      cam.fov = damp(cam.fov, targetFov, 4, dt);
      cam.updateProjectionMatrix();
    }
  }

  updateVisuals(dt) {
    this.tunnel.setRunner(this.theta, 0.55 + this.magnetPulse * 0.75 + this.boostVisual * 0.3);
    this.tunnel.update(dt, this.traveled, this.time, this.boostVisual);
    this.backdrop.update(dt, this.camera, this.speed, this.boostVisual);
    this.fx.update(dt);
  }

  updateRunnerVisual(dt) {
    const runner = this.runner;
    const theta = this.theta;
    const radius = RUNNER_CENTER_R - this.airLift;
    const x = pathX(this.traveled) + Math.cos(theta) * radius;
    const y = pathY(this.traveled) + Math.sin(theta) * radius;
    runner.setWallBasis(theta, _q);
    runner.setWorldPose(x, y, 0, _q, theta);

    if (this.state === 'playing') {
      const blink = this.invuln > 0 && this.invuln < 0.9 && Math.floor(this.time * 18) % 2 === 0;
      runner.rig.visible = !blink;
    } else if (this.state === 'dying' || this.state === 'over') {
      runner.rig.visible = false;
    }

    runner.update(dt, {
      speed: this.speed,
      turn: clamp(this.thetaVel / MAX_ANGVEL, -1, 1),
      boosting: this.boosting,
      shield: this.shield,
      airborne: this.airLift > 0.2,
    });

    // jump trail
    if (this.airLift > 0.2 && Math.random() < 0.5) {
      const trailPos = this.wallPointWorld(theta, radius + 0.55, 0);
      this.fx.particles.trail(trailPos, '#9ff6ff', 1, {
        size: 0.22,
        life: 0.3,
        speed: 1.2,
      });
    }
  }

  updateProgress() {
    if (this.gate) {
      const span = Math.max(1, this.gate.a - this.gateStart);
      this.progress = 0.82 + clamp((this.traveled - this.gateStart) / span, 0, 1) * 0.18;
      this.progressLabel = `GATE ${Math.max(0, Math.round((this.gate.a - this.traveled) * METERS_PER_UNIT))} m`;
    } else if (this.bossTriggered) {
      const hpPart = this.boss ? 1 - this.boss.hp / this.boss.maxHp : 1;
      this.progress = 0.72 + hpPart * 0.1;
      this.progressLabel = 'WARDEN ENGAGED';
    } else {
      this.progress = clamp((this.traveled - this.sectorStart) / this.sectorLength, 0, 1) * 0.72;
      const remaining = Math.max(0, this.sectorLength * 0.72 - (this.traveled - this.sectorStart));
      this.progressLabel = `CONTACT ${Math.max(0, Math.round(remaining * METERS_PER_UNIT))} m`;
    }
  }

  spawnBoss() {
    this.bossTriggered = true;
    this.bossRewarded = false;
    this.boss = new Warden(this.scene, this.level, this.palette, this.audio);
    this.boss.a = this.traveled + 42;
    this.boss.theta = this.theta;
    this.boss.start();
    this.audio.setIntensity(1);
    this.tunnel.setGateWarmth(0.7);
    this.ui?.showBoss();
    this.ui?.announce('WARNING', 'WARDEN DETECTED', 'destroy the core to open the gate');
    this.engine.addShake(0.3);
    this.ui?.flash(true);
    this.bullets.enemyPool.clear();
    this.spawnCursor = this.traveled + 400;
  }

  fireDroneShot(drone) {
    const t = Math.max(0.25, (drone.a - this.traveled) / (this.speed + 40));
    const tx = this.runnerX + this.ship.vx * t * 0.4;
    const ty = this.runnerY + this.ship.vy * t * 0.4;
    const dx = tx - drone.x;
    const dy = ty - drone.y;
    const len = Math.max(0.1, Math.hypot(dx, dy));
    const lateral = 17 + this.level * 1.6;
    this.bullets.fireEnemy(drone.a - 1, drone.x, drone.y, (dx / len) * lateral, (dy / len) * lateral, {
      va: -25 - this.level,
      damage: 11,
      radius: 0.42,
    });
    this.audio.enemyShoot(clamp(drone.x / 8, -0.8, 0.8));
    _v.set(pathX(drone.a) + drone.x, pathY(drone.a) + drone.y, -(drone.a - this.traveled));
    this.fx.sparks(_v, '#ff6b8f', 6, { speed: 4, size: 0.3, life: 0.3 });
  }

  // ------------------------------------------------------------- data out
  getSnapshot() {
    const mult = Number.isFinite(this.multiplier) ? this.multiplier : 1;
    return {
      state: this.state,
      score: Math.round(this.score),
      multiplier: mult,
      combo: Math.floor(this.combo),
      distance: this.traveled * METERS_PER_UNIT,
      kmh: Math.round(this.speed * 16),
      level: this.level,
      sectorName: this.palette.name,
      progress: this.progress || 0,
      progressLabel: this.progressLabel || '',
      hull: Math.round(this.hull),
      shield: this.shield,
      overdrive: Math.round(this.overdrive),
      weaponLevel: this.weaponLevel,
      boosting: this.boosting,
      wallAngle: this.theta,
      airborne: this.airLift > 0.2,
      boss: this.boss ? { name: this.boss.name, hp: this.boss.hp, maxHp: this.boss.maxHp } : null,
      fireCooldown: this.fireCooldown,
    };
  }

  getStats() {
    return {
      score: Math.round(this.score),
      distance: Math.round(this.traveled * METERS_PER_UNIT),
      level: this.level,
      sector: this.palette.name,
      maxMultiplier: this.maxMultiplier,
      nearMisses: this.nearMisses,
      kills: this.kills,
      weaponLevel: this.weaponLevel,
    };
  }

  hasPointerMoved() {
    return this.pointerActive;
  }
}
