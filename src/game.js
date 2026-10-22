// Game director: run state, spawning, combat, scoring, camera and sectors.
import * as THREE from 'three';
import { PLAY_X, PLAY_Y, sectorFor, pathX, pathY } from './path.js';
import { Tunnel } from './tunnel.js';
import { Backdrop } from './backdrop.js';
import { FX } from './fx.js';
import { Bullets } from './projectiles.js';
import { Ship } from './ship.js';
import { Barrier, Asteroid, Drone, Mine, Pickup, Gate, PICKUP_INFO } from './hazards.js';
import { Warden } from './boss.js';
import { clamp, damp, rand, randInt, pick, chance, TAU } from './util.js';

const METERS_PER_UNIT = 0.45;
const PLAYER_RADIUS = 0.7;
const BASE_SPEED = 56;
const WEAPON_NAMES = ['PLASMA I', 'TWIN II', 'TRI-LANCE III'];

const _v = new THREE.Vector3();
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
    this.tunnel = new Tunnel(scene, this.palette);
    this.backdrop = new Backdrop(scene, this.palette);
    this.fx = new FX(scene, camera);
    this.bullets = new Bullets(scene, this.fx);
    this.ship = new Ship(scene, this.palette.tubeB, this.palette.glow);

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
    this.pointerTarget = { x: 0, y: 0 };
    this.steerMode = 'pointer';

    this.state = 'boot';
    this.paused = false;
    this.time = 0;
    this.runTime = 0;
    this.traveled = 0;
    this.speed = 30;
    this.speedTarget = 30;
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
    this.lastTraveled = 0;
    this.playedIntro = false;
    this.speedLines = 0;
    this.bossWarnTimer = 0;

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
    this.lastTraveled = 0;
    this.speed = 28;
    this.speedTarget = 40;
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
    this.ship.setVisible(true);
    this.ship.model.visible = true;
    this.ship.x = 0;
    this.ship.y = 0;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
    this.applySector(1);
    this.placeShip();
    this.engine.addShake(0);
    this.audio.setIntensity(0);
    this.tunnel.impulse(0.4);
  }

  startRun() {
    this.resetRun();
    this.state = 'playing';
    this.paused = false;
    this.runTime = 0;
    this.enterAt = this.time;
    this.ui?.setBoosting(false);
    this.ui?.setFiring(false);
    this.ui?.hideBoss();
    this.ui?.hideGameOver?.();
    this.audio.gameStart();
    this.ui?.announce(`SECTOR 01`, this.palette.name, 'thread the wreckage · reach the gate');
    this.ui?.toast('HOLD FIRE · SPACE — BOOST · SHIFT');
    this.spawnIntroPickups();
  }

  enterAttract() {
    this.resetRun();
    this.state = 'menu';
    this.paused = false;
    this.attractTimer = 0;
    this.audio.setIntensity(0);
    this.ship.setVisible(true);
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
    this.steerMode = 'pointer';
  }

  // ------------------------------------------------------------- sectors
  applySector(level) {
    this.palette = sectorFor(level);
    this.engine.setPalette(this.palette);
    this.tunnel.setSector(this.palette);
    this.backdrop.setSector(this.palette);
    this.ship.setPalette(this.palette.tubeB, this.palette.glow);
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
    this.tunnel.setSector(this.palette);
    this.tunnel.impulse(1.1);
    this.engine.addShake(0.35);
    this.audio.gate();
    this.audio.levelUp();
    this.score += 500 * this.level;
    this.slowmo = 0.6;
    this.ui?.flash();
    this.ui?.announce(`SECTOR ${String(this.level).padStart(2, '0')}`, this.palette.name, 'gate cleared · hull restored');
    this.ui?.hideBoss();
    this.audio.setIntensity(0);
    this.spawnIntroPickups();
  }

  spawnIntroPickups() {
    const a = this.traveled + 170;
    const types = ['arc', 'boost', 'boost', 'repair'];
    types.forEach((type, i) => {
      this.spawnPickup(a + i * 9, Math.sin(i * 0.8) * 2.6, Math.cos(i * 0.6) * 1.2, type);
    });
  }

  // ------------------------------------------------------------- entities
  spawnBarrier(a, x, y, w, h, energy = false, hp = 4) {
    const b = new Barrier(this.scene, { x, y, w, h, energy, hp });
    b.a = a;
    this.hazards.push(b);
    return b;
  }

  spawnAsteroid(a, x, y, scale) {
    const ast = new Asteroid(this.scene, { x, y, scale });
    ast.a = a;
    this.hazards.push(ast);
    return ast;
  }

  spawnDrone(a, x, y) {
    const d = new Drone(this.scene, { x, y });
    d.a = a;
    this.hazards.push(d);
    return d;
  }

  spawnMine(a, x, y) {
    const m = new Mine(this.scene, { x, y });
    m.a = a;
    this.hazards.push(m);
    return m;
  }

  spawnPickup(a, x, y, type = 'arc') {
    const p = new Pickup(this.scene, { x, y, type });
    p.a = a;
    this.pickups.push(p);
    return p;
  }

  spawnBossDrones(boss) {
    for (const sx of [-1, 1]) {
      const d = this.spawnDrone(boss.a + rand(6, 14), boss.x + sx * 5.2, boss.y + rand(-1.2, 1.2));
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
      const gap = Math.max(24, 50 - this.level * 2.4 + rand(-7, 7));
      this.spawnCursor = a + consumed + gap;
    }
  }

  spawnPattern(a) {
    this.patternIndex++;
    const lvl = this.level;
    const roll = Math.random();
    let consumed = 8;

    if (roll < 0.16) {
      // armored door: a beam with a clean opening
      const gap = rand(5.2, 6.4);
      const half = gap * 0.5;
      const width = PLAY_X - half;
      const y = rand(-1.7, 1.7);
      const h = rand(1.4, 2.3);
      this.spawnBarrier(a, -(half + width * 0.5), y, width, h, false, 4);
      if (chance(0.5)) this.spawnBarrier(a + rand(-1, 1), half + width * 0.5, -y * 0.5, width, h * 0.85, false, 4);
      consumed = 10;
    } else if (roll < 0.34) {
      // single block / double block
      const count = lvl > 2 && chance(0.35) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = rand(3.2, 5.0);
        const h = rand(2.2, 3.9);
        const x = clamp(rand(-5.5, 5.5), -PLAY_X + w / 2, PLAY_X - w / 2);
        const y = clamp(rand(-3.2, 3.2), -PLAY_Y + h / 2, PLAY_Y - h / 2);
        const energy = chance(0.28);
        this.spawnBarrier(a + i * 14, x, y, w, h, energy, 4);
      }
      consumed = count * 14;
    } else if (roll < 0.5) {
      // slalom pillars
      const dir = chance(0.5) ? 1 : -1;
      const s1 = this.spawnBarrier(a, dir * 4.2, rand(0.8, 2.2), 3.2, 3.0, false, 3);
      s1.nearMissed = false;
      this.spawnBarrier(a + 26, -dir * 4.0, rand(-2.4, -0.6), 3.4, 3.2, false, 3);
      this.spawnBarrier(a + 52, dir * 3.8, rand(-0.8, 1.6), 3.1, 2.9, false, 3);
      consumed = 52;
    } else if (roll < 0.66) {
      // drone wing
      const count = lvl > 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const x = count === 2 ? (i === 0 ? -4.4 : 4.4) : -4.8 + i * 4.8;
        this.spawnDrone(a + i * 6, x, rand(-2.6, 2.6));
      }
      consumed = 16;
    } else if (roll < 0.8) {
      // mine field
      const count = randInt(3, 5);
      for (let i = 0; i < count; i++) {
        const x = -6 + (i / Math.max(1, count - 1)) * 12;
        if (chance(0.25)) continue;
        this.spawnMine(a + rand(-4, 4), x + rand(-0.9, 0.9), rand(-3.2, 3.2));
      }
      consumed = 18;
    } else if (roll < 0.92) {
      // asteroid cluster
      const count = randInt(2, 4);
      for (let i = 0; i < count; i++) {
        this.spawnAsteroid(a + rand(-6, 6), rand(-5.8, 5.8), rand(-3.6, 3.6), rand(1.6, 2.9));
      }
      consumed = 16;
    } else {
      // breather: pickup run
      this.spawnPickupLine(a, 9);
      consumed = 4;
    }

    // reward trail between obstacles
    if (chance(0.62) && this.pickups.length < 30) {
      this.spawnPickupLine(a + consumed + 10, randInt(4, 7), chance(0.45) ? 'mixed' : 'boost');
    }
    return consumed;
  }

  spawnPickupLine(a, count = 7, mode = 'mixed') {
    const phase = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      let type = 'boost';
      if (mode === 'mixed') {
        if (i === Math.floor(count * 0.5)) type = 'arc';
        else if (i === count - 1) type = chance(0.65) ? 'repair' : 'shield';
        else if (chance(0.12)) type = chance(0.5) ? 'quantum' : 'shield';
      } else if (i === Math.floor(count * 0.6)) {
        type = chance(0.5) ? 'arc' : 'shield';
      }
      const x = Math.sin(phase + i * 0.62) * 3.6;
      const y = Math.cos(phase * 0.7 + i * 0.44) * 1.7;
      this.spawnPickup(a + i * 5.2, x, y, type === 'boots' ? 'boost' : type);
    }
  }

  // ------------------------------------------------------------- input/motion
  updateSteering(dt) {
    const ship = this.ship;
    const input = this.input;
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0) + clamp(input.stickX, -1, 1);
    const iy = (input.up ? 1 : 0) - (input.down ? 1 : 0) + clamp(input.stickY, -1, 1);
    const bx = PLAY_X - 0.9;
    const by = PLAY_Y - 0.7;
    const prevX = ship.x;
    const prevY = ship.y;

    if (Math.abs(ix) > 0.06 || Math.abs(iy) > 0.06) {
      this.steerMode = 'keys';
      const accel = 72;
      ship.vx += ix * accel * dt;
      ship.vy += iy * accel * dt;
      ship.vx *= Math.exp(-7 * dt);
      ship.vy *= Math.exp(-7 * dt);
      const maxV = 19;
      ship.vx = clamp(ship.vx, -maxV, maxV);
      ship.vy = clamp(ship.vy, -maxV, maxV);
      ship.x = clamp(ship.x + ship.vx * dt, -bx, bx);
      ship.y = clamp(ship.y + ship.vy * dt, -by, by);
      if (Math.abs(ship.x) >= bx) ship.vx *= 0.2;
      if (Math.abs(ship.y) >= by) ship.vy *= 0.2;
    } else if (this.steerMode === 'pointer' && this.pointerActive) {
      this.computePointerTarget();
      const prevTarget = { x: prevX, y: prevY };
      ship.x = damp(ship.x, this.pointerTarget.x, 9.5, dt);
      ship.y = damp(ship.y, this.pointerTarget.y, 9.5, dt);
      ship.x = clamp(ship.x, -bx, bx);
      ship.y = clamp(ship.y, -by, by);
      if (dt > 0.0001) {
        ship.vx = damp(ship.vx, (ship.x - prevTarget.x) / dt, 12, dt);
        ship.vy = damp(ship.vy, (ship.y - prevTarget.y) / dt, 12, dt);
      }
    } else {
      ship.vx *= Math.exp(-5 * dt);
      ship.vy *= Math.exp(-5 * dt);
      ship.x = clamp(ship.x + ship.vx * dt, -bx, bx);
      ship.y = clamp(ship.y + ship.vy * dt, -by, by);
    }
  }

  computePointerTarget() {
    _ray.setFromCamera(this.pointerNDC, this.camera);
    const hit = _ray.ray.intersectPlane(_plane, _v);
    if (!hit) return;
    this.pointerTarget.x = clamp(hit.x - pathX(this.traveled), -PLAY_X + 0.9, PLAY_X - 0.9);
    this.pointerTarget.y = clamp(hit.y - pathY(this.traveled), -PLAY_Y + 0.7, PLAY_Y - 0.7);
  }

  updateWeapon(dt) {
    this.fireCooldown -= dt;
    const firing = this.input.fire && this.state === 'playing';
    this.ui?.setFiring(firing);
    if (!firing || this.fireCooldown > 0) return;
    this.fireCooldown = this.weaponLevel >= 3 ? 0.115 : 0.14;
    this.bullets.firePlayer(this.traveled + 3.0, this.ship.x, this.ship.y, this.weaponLevel);
    this.audio.shoot(this.weaponLevel, clamp(this.ship.x / 8, -0.7, 0.7));
    _v.set(pathX(this.traveled + 2.4) + this.ship.x, pathY(this.traveled + 2.4) + this.ship.y, -2.4);
    this.fx.sparks(_v, '#9ffaff', 2, { speed: 2.4, size: 0.22, life: 0.18, spread: 0.08 });
  }

  // ------------------------------------------------------------- collisions
  collisionShipVsHazards() {
    const ship = this.ship;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.passive || h.dead) continue;
      const ahead = h.a - this.traveled;
      if (!h.hitPlayer && Math.abs(ahead) < 2.4) {
        let hit = false;
        if (h.halfW !== undefined) {
          const dx = Math.abs(ship.x - h.x) - h.halfW;
          const dy = Math.abs(ship.y - h.y) - h.halfH;
          hit = Math.max(0, dx) ** 2 + Math.max(0, dy) ** 2 < PLAYER_RADIUS * PLAYER_RADIUS;
        } else {
          hit = Math.hypot(ship.x - h.x, ship.y - h.y) < h.radius + PLAYER_RADIUS;
        }
        if (hit) {
          h.hitPlayer = true;
          const amount = h.kind === 'mine' ? 18 : h.kind === 'drone' ? 16 : h.kind === 'energy' ? 16 : h.kind === 'asteroid' ? 14 : 18;
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

    // enemy bullets
    for (let i = this.bullets.enemy.length - 1; i >= 0; i--) {
      const b = this.bullets.enemy[i];
      if (b.ahead < -2 || b.ahead > 2) continue;
      if (Math.hypot(b.x - ship.x, b.y - ship.y) < b.radius + PLAYER_RADIUS) {
        this.bullets.enemyPool.kill(b);
        this.damagePlayer(b.damage, 'bullet');
      }
    }

    // collectibles
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (Math.abs(p.a - this.traveled) < 2.6 && Math.hypot(p.x - ship.x, p.y - ship.y) < 1.9) {
        this.collectPickup(p);
      }
    }
  }

  checkNearMiss(h) {
    const ship = this.ship;
    let gap;
    if (h.halfW !== undefined) {
      const dx = Math.max(0, Math.abs(ship.x - h.x) - h.halfW);
      const dy = Math.max(0, Math.abs(ship.y - h.y) - h.halfH);
      gap = Math.hypot(dx, dy);
    } else {
      gap = Math.max(0, Math.hypot(ship.x - h.x, ship.y - h.y) - h.radius);
    }
    if (gap < 2.6 && !h.nearMissed) {
      h.nearMissed = true;
      this.nearMisses++;
      this.overdrive = Math.min(100, this.overdrive + 8);
      this.combo += 1;
      this.comboTimer = 4.5;
      this.score += Math.round(25 * this.multiplier);
      this.fx.nearMiss(_v.set(pathX(this.traveled) + ship.x, pathY(this.traveled) + ship.y, -4));
      this.audio.nearMiss(clamp(ship.x / 8, -0.8, 0.8));
      this.engine.addShake(0.05);
      this.ui?.popupWorld(_v.clone().add(new THREE.Vector3(0, 1.5, 0)), 'NEAR MISS', 'kill');
    }
  }

  collisionBulletsVsTargets() {
    for (let i = this.bullets.player.length - 1; i >= 0; i--) {
      const b = this.bullets.player[i];
      let struck = false;

      if (this.boss && !this.boss.dying) {
        const boss = this.boss;
        if (Math.abs(b.a - boss.a) < 3.2) {
          const dx = (b.x - boss.x) / 5.6;
          const dy = (b.y - boss.y) / 3.4;
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
          if (Math.abs(b.a - h.a) > 2.6) continue;
          let hit;
          if (h.halfW !== undefined) {
            hit = Math.abs(b.x - h.x) < h.halfW + 0.3 && Math.abs(b.y - h.y) < h.halfH + 0.3;
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
    _v.set(pathX(h.a) + h.x, pathY(h.a) + h.y, -(h.a - this.traveled));
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
      this.ui?.popupWorld(_v, `+${gained}`, h.kind === 'drone' ? 'kill' : 'kill');
      if (h.kind === 'drone' && chance(0.35)) {
        this.spawnPickup(h.a, h.x, h.y, chance(0.5) ? 'boost' : 'arc');
      }
    }
    h.dispose(this.scene);
  }

  explodeHazard(h, byPlayer) {
    this.destroyHazard(h, byPlayer);
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
          this.ui?.announce('WEAPON UPGRADE', WEAPON_NAMES[this.weaponLevel - 1], 'more barrels · more problems');
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
    const ship = this.ship;
    _v.set(pathX(this.traveled) + ship.x, pathY(this.traveled) + ship.y, 0);

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
    this.ui?.popupWorld(_v, `-${amount} HULL`, 'hurt');
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
    const ship = this.ship;
    _v.set(pathX(this.traveled) + ship.x, pathY(this.traveled) + ship.y, 0);
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
      this.ship.setVisible(false);
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
    this.ui?.popupWorld(_v.set(pathX(boss.a) + boss.x, pathY(boss.a) + boss.y, -(boss.a - this.traveled)), `+${2500 * this.level}`, 'combo');
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
    this.ui?.announce('GATE OPEN', 'SECTOR CLEAR', 'fly through the ring');
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
      scale = 0.52;
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
      if (this.state === 'playing') this.collisionShipVsHazards();
      this.updateGate(dt);
    } else if (this.state === 'menu') {
      this.updateHazards(dt);
    }
    this.placeEntities();
    this.updateCamera(dt);
    this.updateVisuals(dt);
    this.updateShipVisual(dt);
    this.ui?.setBoosting(this.boosting);
    if (this.state === 'playing') this.updateProgress();
  }

  updatePlaying(dt, sdt) {
    this.updateSteering(sdt);
    this.updateWeapon(dt);

    const boosting = this.input.boost && this.overdrive > 0.5 && !this.boostLocked;
    if (boosting !== this.boosting) {
      this.boosting = boosting;
      if (boosting) {
        this.audio.boost();
        this.ui?.setBoosting(true);
        this.engine.addShake(0.08);
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

    const base = BASE_SPEED + (this.level - 1) * 3.2;
    const introRamp = clamp(this.runTime / 2.4, 0.5, 1);
    this.speedTarget = base * introRamp * (this.boosting ? 1.9 : 1);
    this.speed = damp(this.speed, this.speedTarget, 2.4, dt);
    this.traveled += this.speed * sdt;
    this.score += this.speed * sdt * 0.42 * this.multiplier * (this.boosting ? 1.25 : 1);

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
    if (this.input.fire) {
      this.engine.addShake(0.008);
    }
    this.audio.setIntensity(this.boss ? 1 : Math.min(0.5, 0.1 + this.level * 0.07));
  }

  updateAttract(dt, sdt) {
    this.attractTimer = (this.attractTimer || 0) + dt;
    const t = this.attractTimer;
    this.steerMode = 'pointer';
    this.pointerActive = true;
    this.pointerTarget.x = Math.sin(t * 0.5) * 4.2 + Math.sin(t * 0.23) * 1.6;
    this.pointerTarget.y = Math.sin(t * 0.67 + 1) * 2.2;
    this.updateSteering(sdt);
    this.speedTarget = 42;
    this.speed = damp(this.speed, this.speedTarget, 1.4, dt);
    this.traveled += this.speed * sdt;
    this.boosting = false;
    this.invuln = 1;

    if (chance(dt * 0.7)) {
      const a = this.traveled + rand(180, 260);
      this.spawnAsteroid(a, rand(-6, 6), rand(-4, 4), rand(1.0, 2.4));
    }
    this.ui?.setBoosting(false);
    this.playerWeaponIdle(dt);
  }

  playerWeaponIdle(dt) {
    this.fireCooldown -= dt;
    this.ui?.setFiring(false);
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
    if (!this.gateGroupA) this.gateGroupA = this.gate;
  }

  placeShip() {
    this.ship.root.position.set(pathX(this.traveled) + this.ship.x, pathY(this.traveled) + this.ship.y, 0);
  }

  placeEntities() {
    const T = this.traveled;
    this.placeShip();
    for (const h of this.hazards) {
      h.group.position.set(pathX(h.a) + h.x, pathY(h.a) + h.y, -(h.a - T));
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
    const ship = this.ship;
    // portrait / narrow screens need a longer lens distance so the tube and
    // the ship stay fully readable
    const narrow = clamp((1.25 - cam.aspect) / 0.7, 0, 1);
    const back = 9.4 + this.boostVisual * 0.7 + narrow * 5.6;
    const shake = this.engine.shake;
    const camA = this.traveled - back;
    cam.position.set(
      pathX(camA) + ship.x * 0.32 + shake.x,
      pathY(camA) + 1.75 + narrow * 0.9 + ship.y * 0.32 + shake.y,
      back
    );
    const lookA = this.traveled + 32;
    cam.up.set(0, 1, 0);
    cam.lookAt(pathX(lookA) + ship.x * 0.5, pathY(lookA) + 0.55 + ship.y * 0.45, -32);
    const roll = clamp(-ship.vx * 0.008, -0.1, 0.1) + shake.roll + Math.sin(this.time * 0.33) * 0.006;
    cam.rotateZ(roll);

    const targetFov = 70 + this.boostVisual * 13 + narrow * 8;
    if (Math.abs(cam.fov - targetFov) > 0.02) {
      cam.fov = damp(cam.fov, targetFov, 4, dt);
      cam.updateProjectionMatrix();
    }
  }

  updateVisuals(dt) {
    this.tunnel.update(dt, this.traveled, this.time, this.boostVisual);
    this.backdrop.update(dt, this.camera, this.speed, this.boostVisual);
    this.fx.update(dt);

    // engine trails
    const ship = this.ship;
    const cx = pathX(this.traveled) + ship.x;
    const cy = pathY(this.traveled) + ship.y;
    _v.set(cx - 0.36, cy - 0.05, 1.15);
    this.fx.engineTrail(_v, this.palette.glow, this.boosting);
    _v.set(cx + 0.36, cy - 0.05, 1.15);
    this.fx.engineTrail(_v, this.palette.glow, this.boosting);
  }

  updateShipVisual(dt) {
    const ship = this.ship;
    if (this.state === 'playing') {
      const blink = this.invuln > 0 && this.invuln < 0.9 && Math.floor(this.time * 18) % 2 === 0;
      ship.model.visible = !blink;
    } else if (this.state === 'dying' || this.state === 'over') {
      ship.model.visible = false;
    }
    ship.setBank(clamp(ship.vx / 14, -1, 1));
    ship.setTilt(clamp(ship.vy / 14, -1, 1));
    ship.update(dt, { boosting: this.boosting, speed: this.speed, shield: this.shield });
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
    this.boss.a = this.traveled + 58;
    this.boss.start();
    this.audio.setIntensity(1);
    this.tunnel.setGateWarmth(0.7);
    this.ui?.showBoss();
    this.ui?.announce('WARNING', 'WARDEN DETECTED', 'destroy the core to open the gate');
    this.engine.addShake(0.3);
    this.ui?.flash(true);
    // clear drones/bullets from the approach to give the boss room
    this.bullets.enemyPool.clear();
    this.spawnCursor = this.traveled + 400;
  }

  fireDroneShot(drone) {
    const t = Math.max(0.25, (drone.a - this.traveled) / (this.speed + 40));
    const tx = this.ship.x + this.ship.vx * t * 0.55;
    const ty = this.ship.y + this.ship.vy * t * 0.55;
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
      kmh: Math.round(this.speed * 13),
      level: this.level,
      sectorName: this.palette.name,
      progress: this.progress || 0,
      progressLabel: this.progressLabel || '',
      hull: Math.round(this.hull),
      shield: this.shield,
      overdrive: Math.round(this.overdrive),
      weaponLevel: this.weaponLevel,
      boosting: this.boosting,
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
