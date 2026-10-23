# SPACETUBE

A tunnel runner built with **Three.js** and **Vite**. You play a runner in
magnetic boots: she sprints along the *inside* of the tube, all 360° around it,
leaps off the wall to clear live arcs and shoots the drones down.
No external art — the tunnel, the character, the drones, Warden bosses, planets,
nebulae, textures and the whole soundtrack are generated procedurally.

## Two versions, two links

| Version | Link (GitHub Pages) | Look |
| --- | --- | --- |
| **v1 — Neon Runner** (frozen) | `…/spacetube/v1/` | holographic blue hyperspace tube |
| **v2 — Industrial Tube** (current) | `…/spacetube/v2/` | corrugated steel corridor, ring frames, windows into space, spider drones |

The Pages root (`…/spacetube/`) is a chooser page for both. `docs/v1/` is a
frozen snapshot and is never rebuilt; `npm run build:pages` only regenerates
`docs/v2/` plus the chooser.

```
npm install
npm run dev            # dev server (hot reload) → http://localhost:5173
npm run build          # production build into dist/
npm run preview:static # serve dist/ → http://localhost:5173
npm run build:pages    # rebuild docs/v2/ + the version chooser
```

### Play without a local setup

- **Sandbox preview** — the static build is already served on port **5173**;
  open the live preview panel.
- **GitHub Pages** — the prebuilt game lives in `docs/`. One-time setup:
  repository **Settings → Pages → Source: Deploy from a branch →
  Branch `arena/dac131fc-spacetube`, folder `/docs` → Save**.
  The game then lives at <https://damian5965.github.io/spacetube/>.
  After any rebuild run `npm run build:pages` and commit `docs/`.

No build step needed for playing in this workspace: the dev server is already
running on port **5173** (open the live preview, or http://localhost:5173).

If the page ever shows raw unstyled text, it means the stylesheet or the module
bundle did not load — do a hard reload (`Ctrl` + `Shift` + `R` / `Cmd` + `Shift` + `R`).
The UI is styled from `src/app.css`, which is linked directly from `index.html`,
so it renders even before the JS bundle finishes.

## How to fly

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Steer | `WASD` / arrows | move the pointer | left stick |
| Fire | `Space` / `Enter` | left click | FIRE |
| Overdrive | `Shift` | right click | BOOST |
| Pause | `P` / `Esc` | — | — |
| Mute | `M` | — | — |
| Retry | `R` | — | — |

Arrow keys and the mouse use analog fly-to steering; `WASD` is direct thrust.

## What's in the box

- **Shader tunnel** — a helical, panelled transit tube (2 stacked meshes: an opaque
  hull shell and an additive neon grid) with travelling energy pulses, running
  lights and per-sector palettes that cross-fade.
- **Post-processing** — Unreal bloom, ACES tone mapping, chromatic aberration,
  radial boost blur, damage bleed, scanlines, grain and vignette.
- **Combat** — plasma bolts, 3 weapon tiers, kamikaze drones with telegraphed
  shots, mines, asteroids, armoured barriers and energy walls.
- **Wardens** — a boss construct per sector with 4 attack patterns (volley, fan,
  sweeping wall, drone deployment), armour flashes and a death sequence that
  opens the gate ring into the next sector.
- **Systems** — hull, shields, overdrive (boost), quantum time dilation,
  combo/multiplier up to ×8, near-miss rewards, pickups for every system.
- **HUD & flow** — boot sequence, live-attract menu, flight manual, records
  archive (localStorage), pause menu, game-over stats, toasts, floating score
  callouts, screen shake and reduced-flash accessibility option.
- **Audio** — procedural synth score (pads, bass, arpeggios, drums) that opens up
  during boss fights, plus synthesised weapons, explosions, pickups and gates.
- **Quality presets** — Ultra / High / Performance. Performance skips the
  post-processing stack and lowers the pixel ratio.

## Structure

```
src/
  main.js       bootstrap, input, screen flow, render loop
  game.js       run state, spawner, collisions, scoring, camera
  hull.js       v2 industrial corridor (instanced steel, lamps, windows)
  tunnel.js     v1 shader tube (kept for reference)
  backdrop.js   stars, nebulae, gas giant, dust
  runner.js     the mag-boot runner: procedural body, rig, animation, shield
  hazards.js    barriers, asteroids, drones, mines, pickups, gate
  boss.js       Warden boss + attack patterns
  projectiles.js pooled bolts
  fx.js         particles, shockwaves, flashes
  audio.js      procedural music + SFX
  ui.js         HUD and menus
  path.js       tube centreline shared with GLSL + sector palettes
  textures.js   canvas-generated textures
  storage.js    settings and run archive
  util.js       math / helpers
```
