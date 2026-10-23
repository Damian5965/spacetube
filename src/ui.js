// HUD + menus. DOM-driven, with light projection for floating score calls.
import { toScreen, fmtScore, fmtDistance, randomTip, clamp } from './util.js';

const $ = (id) => document.getElementById(id);

const TRANSMISSIONS = [
  '“Runner, the tube is collapsing. Your boots hold the wall — nothing else does. Keep the suit above zero.”',
  '“Warden signatures get louder every sector. If the core glows red, shoot it until it stops.”',
  '“Reminder: the gate only opens for runners who are still breathing. Run accordingly.”',
  '“We lost another courier at the Magenta Rift. Last words: ‘the stripes looked safe.’”',
  '“Overdrive is not a suggestion. Near misses charge it. Use the danger.”',
  '“A magnet leap clears a full ring of arcs. Mind the landing — the wall is the only floor you get.”',
];

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function setWidth(el, pct) {
  if (!el) return;
  const v = `${clamp(pct, 0, 100).toFixed(2)}%`;
  if (el.style.width !== v) el.style.width = v;
}

export class UI {
  constructor({ store, camera, callbacks = {} }) {
    this.store = store;
    this.camera = camera;
    this.cb = callbacks;
    this.settings = { ...store.data.settings };
    this.screens = {
      boot: $('boot'),
      menu: $('menu'),
      how: $('how'),
      leader: $('leader'),
      pause: $('pause'),
      gameover: $('gameover'),
    };
    this.hud = $('hud');
    this.popupLayer = $('popups');
    this.flashEl = $('flash');
    this.damageEl = $('damage');
    this.toastEl = $('toast');
    this.announceEl = $('announce');
    this.bossWrap = $('boss-hud');
    this.touch = $('touch');
    this.reticle = $('reticle');
    this.lastHudText = 0;
    this.bossVisible = false;
    this.announceTimer = 0;
    this.toastTimer = 0;
    this.flashTimer = 0;
    this.damageTimer = 0;
    this.scoreCache = {};

    this.bind();
    this.syncSettings();
    this.renderRecords();
    this.updateBest();
  }

  // ------------------------------------------------------------- binding
  bind() {
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener('click', () => {
        this.cb.onClick?.();
        fn();
      });
    };
    on('btn-start', () => this.cb.onStart?.());
    on('btn-retry', () => this.cb.onRetry?.());
    on('btn-menu', () => this.cb.onMenu?.());
    on('btn-resume', () => this.cb.onResume?.());
    on('btn-restart', () => this.cb.onRestart?.());
    on('btn-quit', () => this.cb.onQuit?.());
    on('btn-how', () => this.openScreen('how'));
    on('btn-leader', () => {
      this.renderRecords();
      this.openScreen('leader');
    });

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.cb.onClick?.();
        this.closeScreen(btn.dataset.close);
      });
    });

    document.querySelectorAll('.modal-screen').forEach((scr) => {
      scr.addEventListener('click', (e) => {
        if (e.target === scr) this.closeScreen(scr.id);
      });
    });

    document.querySelectorAll('#sel-quality, #sel-quality-pause').forEach((sel) => {
      sel.addEventListener('change', () => {
        this.cb.onQuality?.(sel.value);
        this.syncQuality(sel.value);
      });
    });
    document.querySelectorAll('#rng-volume, #rng-volume-pause').forEach((rng) => {
      rng.addEventListener('input', () => {
        this.cb.onVolume?.(Number(rng.value));
        this.syncVolume(Number(rng.value));
      });
    });
    const shake = $('chk-shake');
    shake?.addEventListener('change', () => this.cb.onShake?.(shake.checked));
    const flash = $('chk-flash');
    flash?.addEventListener('change', () => this.cb.onReducedFlash?.(flash.checked));

    $('btn-clear-records')?.addEventListener('click', () => {
      this.cb.onClearRecords?.();
      this.renderRecords();
      this.updateBest();
    });
  }

  // ------------------------------------------------------------- boot
  bootSequence() {
    this.showScreen('boot');
    const bar = $('boot-bar');
    const pct = $('boot-pct');
    const status = $('boot-status');
    const tip = $('boot-tip');
    const stages = [
      'initializing warp core',
      'calibrating path splines',
      'priming plasma banks',
      'linking deep-space relay',
      'systems online',
    ];
    return new Promise((resolve) => {
      let p = 0;
      let idx = 0;
      const tick = () => {
        p = Math.min(100, p + 3 + Math.random() * 9);
        setWidth(bar, p);
        setText(pct, `${Math.floor(p)}%`);
        const stage = Math.min(stages.length - 1, Math.floor(p / 24));
        if (stage !== idx) {
          idx = stage;
          setText(status, stages[stage]);
          setText(tip, randomTip());
        }
        if (p < 100) {
          setTimeout(tick, 80 + Math.random() * 120);
        } else {
          setText(status, 'all systems nominal');
          $('boot-start')?.classList.remove('hidden');
          resolve();
        }
      };
      setTimeout(tick, 260);
    });
  }

  hideBoot() {
    this.screens.boot?.classList.add('hidden');
  }

  // ------------------------------------------------------------- screens
  showScreen(name) {
    Object.entries(this.screens).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('hidden', key !== name);
    });
  }

  hideAllScreens() {
    Object.values(this.screens).forEach((el) => el?.classList.add('hidden'));
  }

  openScreen(name) {
    if (!this.screens[name]) return;
    this.screens[name].classList.remove('hidden');
  }

  closeScreen(name) {
    this.screens[name]?.classList.add('hidden');
  }

  showMenu() {
    this.hideAllScreens();
    this.showScreen('menu');
    this.hideHUD();
    this.setBoosting(false);
    this.setFiring(false);
    this.updateBest();
    this.renderRecords();
    const tx = $('transmission-text');
    if (tx) tx.textContent = TRANSMISSIONS[Math.floor(Math.random() * TRANSMISSIONS.length)];
    this.hideTouch();
  }

  showBoot() {
    this.showScreen('boot');
    this.hideHUD();
  }

  showPause(snapshot) {
    setText($('pause-sector'), `SECTOR ${String(snapshot.level).padStart(2, '0')} · ${snapshot.sectorName}`);
    setText($('pause-score'), fmtScore(snapshot.score));
    setText($('pause-dist'), fmtDistance(snapshot.distance));
    setText($('pause-best'), fmtScore(this.store.data.best));
    const pauseBest = $('pause-best');
    if (pauseBest) pauseBest.textContent = fmtScore(this.store.data.best);
    this.openScreen('pause');
  }

  hidePause() {
    this.closeScreen('pause');
  }

  showGameOver(stats, { isRecord = false, best = 0 } = {}) {
    setText($('go-score'), fmtScore(stats.score));
    setText($('go-sector'), String(stats.level).padStart(2, '0'));
    setText($('go-distance'), fmtDistance(stats.distance));
    setText($('go-mult'), `×${stats.maxMultiplier.toFixed(1)}`);
    setText($('go-nearmiss'), String(stats.nearMisses));
    setText($('go-drones'), String(stats.kills));
    setText($('go-best'), fmtScore(best));
    setText($('go-kicker'), stats.score >= best && isRecord ? 'RUN LOGGED · ARCHIVE UPDATED' : 'RUN TERMINATED');
    setText($('go-title'), 'SUIT BREACH');
    $('go-record')?.classList.toggle('hidden', !isRecord);
    this.openScreen('gameover');
    this.hideTouch();
    this.setFiring(false);
    this.setBoosting(false);
    this.updateBest();
  }

  hideGameOver() {
    this.closeScreen('gameover');
  }

  showHUD() {
    this.hud.classList.remove('hidden');
    this.bossWrap.classList.add('hidden');
    this.bossVisible = false;
  }

  hideHUD() {
    this.hud.classList.add('hidden');
    this.damageEl.classList.remove('low');
  }

  showTouch() {
    this.touch.classList.remove('hidden');
  }

  hideTouch() {
    this.touch.classList.add('hidden');
  }

  get modalOpen() {
    return ['how', 'leader', 'pause', 'gameover'].some((k) => this.screens[k] && !this.screens[k].classList.contains('hidden'));
  }

  // ------------------------------------------------------------- settings
  syncSettings() {
    const s = this.store.data.settings;
    this.settings = { ...s };
    this.syncQuality(s.quality);
    this.syncVolume(s.volume);
    const shake = $('chk-shake');
    if (shake) shake.checked = s.shake;
    const flash = $('chk-flash');
    if (flash) flash.checked = s.reducedFlash;
  }

  syncQuality(q) {
    document.querySelectorAll('#sel-quality, #sel-quality-pause').forEach((sel) => {
      if (sel.value !== q) sel.value = q;
    });
  }

  syncVolume(v) {
    document.querySelectorAll('#rng-volume, #rng-volume-pause').forEach((rng) => {
      if (Number(rng.value) !== v) rng.value = v;
    });
  }

  updateBest() {
    const best = this.store.data.best || 0;
    const runs = this.store.data.runs || 0;
    setText($('menu-best'), fmtScore(best));
    setText($('menu-best-2'), fmtScore(best));
    setText($('menu-best-sub'), runs > 0 ? `best of ${runs} logged run${runs === 1 ? '' : 's'}` : 'no runs logged');
    setText($('hud-best'), fmtScore(best));
  }

  renderRecords() {
    const list = $('records-list');
    if (!list) return;
    const records = this.store.data.records || [];
    if (!records.length) {
      list.innerHTML = '<div class="records-empty">NO FLIGHTS ON RECORD — BE THE FIRST</div>';
      return;
    }
    list.innerHTML = records
      .map(
        (r, i) => `
        <div class="records-row ${i === 0 ? 'top' : ''}">
          <span class="rk">${String(i + 1).padStart(2, '0')}</span>
          <span class="rs">${fmtScore(r.score)}</span>
          <span>S${String(r.level || 1).padStart(2, '0')}</span>
          <span>${fmtDistance(r.distance || 0)}</span>
        </div>`
      )
      .join('');
  }

  setPalette(palette) {
    if (!palette) return;
    const root = document.documentElement;
    root.style.setProperty('--cyan', palette.accentCss);
    root.style.setProperty('--glow', palette.glow);
    root.style.setProperty('--line', `rgba(126, 226, 255, 0.22)`);
    setText($('hud-zone'), palette.name);
  }

  // ------------------------------------------------------------- HUD
  updateHUD(snap, best) {
    if (!snap || this.hud.classList.contains('hidden')) return;
    if (this.modalOpen || snap.state === 'over') return;
    const now = performance.now();
    const fast = now - this.lastHudText > 60;
    if (fast) this.lastHudText = now;

    setWidth($('hull-fill'), snap.hull);
    setWidth($('shield-fill'), snap.shield ? 100 : 0);
    setWidth($('boost-fill'), snap.overdrive);
    $('boost-fill')?.classList.toggle('full', snap.overdrive >= 99);
    const hullFill = $('hull-fill');
    if (hullFill) {
      hullFill.classList.toggle('warn', snap.hull <= 60 && snap.hull > 30);
      hullFill.classList.toggle('crit', snap.hull <= 30);
    }
    this.damageEl.classList.toggle('low', snap.hull <= 30 && snap.state === 'playing');
    if (fast) {
      setText($('hull-num'), String(snap.hull));
      setText($('shield-num'), snap.shield ? 'ON' : 'OFF');
      setText($('boost-num'), String(snap.overdrive));
      setText($('hud-score'), fmtScore(snap.score));
      setText($('hud-mult'), `×${snap.multiplier.toFixed(1)}`);
      $('hud-mult')?.classList.toggle('hot', snap.multiplier >= 3);
      setText($('hud-distance'), fmtDistance(snap.distance));
      setText($('hud-speed'), `${fmtScore(snap.kmh)} km/h`);
      setText($('hud-best'), fmtScore(best));
      setText($('hud-level-target'), snap.progressLabel || '');
      const sec = String(snap.level).padStart(2, '0');
      setText($('hud-sector'), `SECTOR ${sec}`);
      setText($('hud-level-label'), `SECTOR ${sec} — ${snap.sectorName}`);
      setText($('weapon-name'), ['PLASMA I', 'TWIN II', 'TRI-LANCE III'][snap.weaponLevel - 1] || 'PLASMA I');
      const pips = document.querySelectorAll('#weapon-chip .pips i');
      pips.forEach((p, i) => p.classList.toggle('on', i < snap.weaponLevel));
      const combo = $('combo-chip');
      combo?.classList.toggle('hidden', snap.combo < 2);
      setText($('combo-count'), `${snap.combo} HIT${snap.combo === 1 ? '' : 'S'}`);
      setWidth($('level-fill'), snap.progress * 100);
    }
    if (snap.boss) {
      this.setBoss(snap.boss);
    } else if (this.bossVisible) {
      this.hideBoss();
    }
  }

  setBoss(data) {
    if (!data) {
      this.hideBoss();
      return;
    }
    if (!this.bossVisible) {
      this.bossWrap.classList.remove('hidden');
      this.bossVisible = true;
    }
    setText($('boss-name'), data.name || 'WARDEN');
    const pct = clamp((data.hp / data.maxHp) * 100, 0, 100);
    setWidth($('boss-fill'), pct);
    setText($('boss-hp-text'), `${Math.ceil(pct)}%`);
  }

  hideBoss() {
    this.bossWrap.classList.add('hidden');
    this.bossVisible = false;
  }

  showBoss() {
    this.bossWrap.classList.remove('hidden');
    this.bossVisible = true;
  }

  setFiring(on) {
    this.reticle?.classList.toggle('firing', !!on);
  }

  setBoosting(on) {
    document.body.classList.toggle('boosting', !!on);
  }

  // ------------------------------------------------------------- feedback
  announce(kicker, title, sub) {
    setText($('announce-kicker'), kicker);
    setText($('announce-title'), title);
    setText($('announce-sub'), sub || '');
    this.announceEl.classList.remove('show');
    void this.announceEl.offsetWidth;
    this.announceEl.classList.add('show');
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => this.announceEl.classList.remove('show'), 2900);
  }

  popupWorld(worldPos, text, kind = 'kill') {
    if (!this.popupLayer || this.hud.classList.contains('hidden') || !worldPos) return;
    if (this.popupLayer.childElementCount > 26) this.popupLayer.firstElementChild?.remove();
    const p = toScreen(worldPos, this.camera, window.innerWidth, window.innerHeight);
    if (!p.visible) return;
    const el = document.createElement('div');
    el.className = `popup ${kind}`;
    el.textContent = text;
    el.style.left = `${p.x.toFixed(0)}px`;
    el.style.top = `${p.y.toFixed(0)}px`;
    this.popupLayer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  toast(text) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), 2400);
  }

  flash(red = false) {
    if (this.settings.reducedFlash) return;
    this.flashEl.classList.remove('on');
    this.flashEl.classList.toggle('red', !!red);
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashEl.classList.remove('on'), 380);
  }

  triggerDamage(power = 1) {
    if (this.settings.reducedFlash) return;
    this.damageEl.classList.add('on');
    clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => this.damageEl.classList.remove('on'), 120 + power * 80);
  }

  setScoreVisible(v) {
    this.scoreCache.visible = v;
    void v;
  }
}
