// Bootstrap: input, settings, screen flow and the render loop.
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './style.css';

import { Engine } from './engine.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { store } from './storage.js';
import { clamp, isTouch } from './util.js';

const canvas = document.getElementById('render');
const engine = new Engine(canvas);
const audio = new AudioEngine();
const touchDevice = isTouch();

const held = { left: false, right: false, up: false, down: false, fire: false, boost: false };
const mouse = { fire: false, boost: false };
const touch = { fire: false, boost: false, stickX: 0, stickY: 0 };
let muted = false;
let bootDone = false;
let game = null;

function syncInput() {
  if (!game) return;
  game.input.left = held.left;
  game.input.right = held.right;
  game.input.up = held.up;
  game.input.down = held.down;
  game.input.fire = held.fire || mouse.fire || touch.fire;
  game.input.boost = held.boost || mouse.boost || touch.boost;
  game.input.stickX = touch.stickX;
  game.input.stickY = touch.stickY;
}

function clearInput() {
  Object.keys(held).forEach((k) => (held[k] = false));
  mouse.fire = false;
  mouse.boost = false;
  touch.fire = false;
  touch.boost = false;
  touch.stickX = 0;
  touch.stickY = 0;
  document.querySelectorAll('.touch-btn.on').forEach((b) => b.classList.remove('on'));
  const nub = document.getElementById('stick-nub');
  if (nub) nub.style.transform = '';
  syncInput();
}

const ui = new UI({
  store,
  camera: engine.camera,
  callbacks: {
    onClick: () => {
      audio.init();
      audio.uiClick();
    },
    onStart: () => startRun(),
    onRetry: () => startRun(),
    onMenu: () => goMenu(),
    onResume: () => resumeGame(),
    onRestart: () => {
      ui.hidePause();
      startRun();
    },
    onQuit: () => {
      ui.hidePause();
      goMenu();
    },
    onQuality: (q) => {
      store.setSetting('quality', q);
      applySettings();
    },
    onVolume: (v) => {
      store.setSetting('volume', v);
      applySettings();
    },
    onShake: (v) => {
      store.setSetting('shake', v);
      applySettings();
    },
    onReducedFlash: (v) => {
      store.setSetting('reducedFlash', v);
      applySettings();
    },
    onClearRecords: () => {
      store.clearRecords();
      ui.updateBest();
      ui.toast('FLIGHT ARCHIVE WIPED');
    },
  },
});

game = new Game({
  scene: engine.scene,
  camera: engine.camera,
  engine,
  audio,
  ui,
});

// dev hook: lets tooling jump to bosses / sectors while tuning
if (import.meta.env.DEV) {
  window.__spacetube = { game, engine, audio, ui, store, startRun, goMenu };
}

game.onGameOver = (stats) => {
  const meta = store.addRun({
    score: stats.score,
    distance: stats.distance,
    level: stats.level,
    maxMultiplier: stats.maxMultiplier,
    nearMisses: stats.nearMisses,
    kills: stats.kills,
    date: Date.now(),
  });
  clearInput();
  ui.hideHUD();
  ui.showGameOver(stats, { isRecord: meta.isRecord, best: store.data.best });
  ui.updateBest();
  audio.duck(true);
  if (touchDevice) ui.hideTouch();
};

function applySettings() {
  const s = store.data.settings;
  engine.shakeEnabled = s.shake;
  engine.setQuality(s.quality);
  game.fx.setQuality(s.quality);
  audio.setVolume(s.volume / 100);
  ui.settings = { ...s };
  ui.syncSettings();
  ui.updateBest();
}

function startRun() {
  if (!audio.ready) audio.init();
  audio.resume();
  audio.setVolume(store.data.settings.volume / 100);
  audio.duck(false);
  audio.setIntensity(0);
  clearInput();
  game.pointerActive = false;
  game.pointerNDC.set(0, 0);
  game.steerMode = 'pointer';
  game.startRun();
  ui.hideAllScreens();
  ui.showHUD();
  ui.updateBest();
  if (touchDevice) ui.showTouch();
  else ui.hideTouch();
  document.body.classList.add('in-run');
}

function goMenu() {
  game.enterAttract();
  audio.duck(false);
  audio.setIntensity(0);
  clearInput();
  ui.hideAllScreens();
  ui.showMenu();
  document.body.classList.remove('in-run');
}

function pauseGame() {
  if (game.state !== 'playing' || game.paused) return;
  game.pause();
  ui.showPause(game.getSnapshot());
  audio.duck(true);
  clearInput();
}

function resumeGame() {
  if (!game.paused) return;
  game.resume();
  ui.hidePause();
  audio.duck(false);
  if (touchDevice) ui.showTouch();
}

function togglePause() {
  if (game.paused) resumeGame();
  else if (game.state === 'playing') pauseGame();
}

function toggleMute() {
  muted = !muted;
  audio.setMuted(muted);
  ui.toast(muted ? 'AUDIO MUTED' : 'AUDIO ONLINE');
}

function enterMenu() {
  if (bootDone) return;
  bootDone = true;
  audio.init();
  audio.setVolume(store.data.settings.volume / 100);
  audio.setIntensity(0);
  ui.hideBoot();
  ui.showMenu();
  game.enterAttract();
  applySettings();
}

// ------------------------------------------------------------- boot
applySettings();
ui.bootSequence();

document.getElementById('boot-start')?.addEventListener('click', enterMenu);

// ------------------------------------------------------------- keyboard
const gameKeys = new Set([
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape', 'KeyM', 'KeyR', 'Enter',
]);

window.addEventListener('keydown', (e) => {
  if (gameKeys.has(e.code) && (game.state === 'playing' || game.state === 'over')) e.preventDefault();
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();

  if (e.code === 'Enter') {
    if (!bootDone) {
      const btn = document.getElementById('boot-start');
      if (btn && !btn.classList.contains('hidden')) btn.click();
      return;
    }
    if (game.state === 'menu') startRun();
    else if (game.state === 'over') startRun();
    else if (game.paused) resumeGame();
    return;
  }

  if (e.code === 'Escape') {
    if (ui.screens.how && !ui.screens.how.classList.contains('hidden')) return ui.closeScreen('how');
    if (ui.screens.leader && !ui.screens.leader.classList.contains('hidden')) return ui.closeScreen('leader');
    if (game.paused) return resumeGame();
    if (game.state === 'playing') return pauseGame();
    if (game.state === 'over') return goMenu();
    return;
  }

  if (e.code === 'KeyP' || (e.code === 'Escape' && game.state === 'playing')) {
    if (!e.repeat) togglePause();
    return;
  }
  if (e.code === 'KeyM') {
    if (!e.repeat) toggleMute();
    return;
  }
  if (e.code === 'KeyR') {
    if (game.state === 'over' || game.paused) {
      if (!e.repeat) {
        ui.hideGameOver();
        ui.hidePause();
        startRun();
      }
    }
    return;
  }

  if (game.state !== 'playing' || game.paused) return;

  switch (e.code) {
    case 'KeyA':
    case 'ArrowLeft':
      held.left = true;
      break;
    case 'KeyD':
    case 'ArrowRight':
      held.right = true;
      break;
    case 'KeyW':
    case 'ArrowUp':
      held.up = true;
      break;
    case 'KeyS':
    case 'ArrowDown':
      held.down = true;
      break;
    case 'Space':
      held.fire = true;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      held.boost = true;
      break;
    default:
      break;
  }
  syncInput();
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyA':
    case 'ArrowLeft':
      held.left = false;
      break;
    case 'KeyD':
    case 'ArrowRight':
      held.right = false;
      break;
    case 'KeyW':
    case 'ArrowUp':
      held.up = false;
      break;
    case 'KeyS':
    case 'ArrowDown':
      held.down = false;
      break;
    case 'Space':
      held.fire = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      held.boost = false;
      break;
    default:
      break;
  }
  syncInput();
});

// ------------------------------------------------------------- pointer
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -((e.clientY / window.innerHeight) * 2 - 1);
  game?.setPointerNDC(nx, ny);
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  audio.init();
  if (game.state !== 'playing' || game.paused) return;
  if (e.button === 0) {
    mouse.fire = true;
    syncInput();
  } else if (e.button === 2) {
    mouse.boost = true;
    syncInput();
  }
});

window.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch') return;
  if (e.button === 0) mouse.fire = false;
  if (e.button === 2) mouse.boost = false;
  syncInput();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------- touch
function setupTouch() {
  const stick = document.getElementById('stick');
  const nub = document.getElementById('stick-nub');
  const boostBtn = document.getElementById('touch-boost');
  const fireBtn = document.getElementById('touch-fire');
  if (!stick) return;
  let activeId = null;
  let cx = 0;
  let cy = 0;
  const R = 42;

  const updateStick = (e) => {
    const dx = clamp(e.clientX - cx, -R, R);
    const dy = clamp(e.clientY - cy, -R, R);
    touch.stickX = dx / R;
    touch.stickY = -dy / R;
    if (nub) nub.style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
    syncInput();
  };

  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    activeId = e.pointerId;
    stick.setPointerCapture?.(e.pointerId);
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    updateStick(e);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId === activeId) updateStick(e);
  });
  const endStick = (e) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    touch.stickX = 0;
    touch.stickY = 0;
    if (nub) nub.style.transform = '';
    syncInput();
  };
  window.addEventListener('pointerup', endStick);
  window.addEventListener('pointercancel', endStick);

  const bindButton = (el, key) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      touch[key] = true;
      el.classList.add('on');
      el.setPointerCapture?.(e.pointerId);
      syncInput();
    });
    const off = (e) => {
      e.preventDefault?.();
      touch[key] = false;
      el.classList.remove('on');
      syncInput();
    };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };
  bindButton(boostBtn, 'boost');
  bindButton(fireBtn, 'fire');
}

if (touchDevice) setupTouch();

// ------------------------------------------------------------- lifecycle
function autoPause() {
  if (game.state === 'playing' && !game.paused) {
    pauseGame();
    ui.toast('RUN PAUSED');
  }
  clearInput();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
  else if (audio.ctx && audio.ctx.state === 'suspended') audio.resume();
});

window.addEventListener('blur', () => {
  clearInput();
});

window.addEventListener('resize', () => {
  if (window.innerHeight < 420 && touchDevice) {
    const hint = document.getElementById('rotate-hint');
    if (hint) {
      hint.classList.remove('hidden');
      setTimeout(() => hint.classList.add('hidden'), 2600);
    }
  }
});

// ------------------------------------------------------------- loop
let last = performance.now();
let bootedVisual = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.06, Math.max(0, (now - last) / 1000));
  last = now;
  if (document.hidden) return;

  game.update(dt);
  const snap = game.getSnapshot();
  ui.updateHUD(snap, store.data.best);
  engine.render(dt);

  if (!bootedVisual && bootDone) bootedVisual = true;
}

requestAnimationFrame(frame);
