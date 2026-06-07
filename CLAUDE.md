# CLAUDE.md — Arradius

A map of this codebase so changes can start from understanding instead of
re-discovery. Keep it concise and current: update it when the architecture
shifts, not for every function. (Note: `package.json`/`index.html` still carry
the original "2d-platformer" scaffold name — the project is **Arradius**.)

## What this is

A browser game built on **Phaser 3** (Vite dev/build, deployed to Cloudflare
Pages). A spice-opera in the spirit of Cryo's Dune: a point-and-click Residency
hub, a strategic World Map, and a side-scrolling desert Expedition. It is
deliberately **asset-free** — nearly all art is generated procedurally at
runtime and all audio is synthesized with the Web Audio API (no sound files).
See `VISION.md` / `PERSPECTIVE.md` for the creative direction and lore.

## Working agreements (git / releasing)

- **Active development branch is `Stephen-Dev-branch`.** Do work there, not on a
  per-session `claude/*` branch.
- **Always land changes on `main` via a pull request — never push directly to
  `main`.** Develop on `Stephen-Dev-branch`, push it, then open a PR into `main`.
- **Keep this file current as you go.** When a change shifts architecture, adds
  a scene/module, or changes a convention, update the relevant `CLAUDE.md`
  section in the same change — don't leave the map stale.

## Commands

- `npm run dev` — Vite dev server (port 5173, host exposed).
- `npm run build` — production build to `dist/` (Phaser is split into its own
  chunk). **Run this to sanity-check changes — there is no test suite or
  ESLint config in the repo.**
- `npm run preview` — serve the built `dist/`.
- `npm run deploy` — `wrangler pages deploy dist` (Cloudflare Pages).

## Architecture — where to look for X

### Entry & boot flow
- `index.html` → mounts `#game`, loads `src/main.js`.
- `src/main.js` — Phaser `config`: design size **1280×720**, `Scale.FIT` +
  letterbox, arcade physics (gravity 900), registers the `KuwaharaPostFX`
  pipeline, and the **scene order**: `[BootScene, ResidencyScene, WorldMapScene,
  ExpeditionScene]`. Also wires `visibilitychange` → suspend/resume audio so
  only the focused tab plays.
- `src/scenes/BootScene.js` — generates every procedural texture at runtime
  (`sky`, `glow`, `aurun`, `eren`, `figure`, `interiorWall`, `vignette`,
  `noise`, `planetSurface`) and optionally loads `public/hall.png` as `hallBg`
  (loaderror swallowed → procedural fallback). Then starts `ResidencyScene`.

### Scene flow
```
BootScene → ResidencyScene ──(War Room / "Study the map")──→ WorldMapScene
                 │                                                  │
                 └──(Corsair Deck / "Ride out")──→ ExpeditionScene ─┘
   (all roads return to ResidencyScene)
```

### Scenes (`src/scenes/`)
- **`ResidencyScene.js`** (largest) — the House Calder hub. Static painted
  "screens" navigated point-and-click; each room is a `LOCATIONS` entry
  (portrait + dialogue + optional actions); `EXITS` defines door navigation.
  Most rooms are drawn procedurally (`drawScene`/`sceneShell`); the Comms room
  is bespoke (`sceneComms*`) and animated. The hall can use the painted
  `hallBg` backdrop (`USE_HALL_BG`).
- **`WorldMapScene.js`** — strategic overview. `NODES` (forts/sites) +
  `FACTION` colours + `ROUTES`; keyboard-cycle selection, act on a node.
- **`ExpeditionScene.js`** — the side-scroller. `WORLD_WIDTH` 2800, parallax
  `DUNES`, `LEDGES`/`AURUN` placed in fractional world space, arcade physics
  player, collectible Aurun, touch controls. Returns to the Residency.

### Audio engine (`src/audio/AudioManager.js`)
The single most documented module — read its header comment first. **Before
changing the soundscape, read `docs/audio-soundscape-research.md`** — a
researched plan for making the fully-synthesized ambience subtle and
non-repetitive (co-prime modulation, sparseness, pink/brown noise, soft events,
adaptive layering). Fully synthesized, **two-bus** design:
```
master ─┬─ musicGain    (continuous score — drone chord + pad + sub, "breathes")
        ├─ ambienceGain (per-room atmosphere — crossfades on room change)
        └─ reverb        (shared convolution hall, fed by both buses)
```
- One instance for the whole game, stored on `game.audio`, persists across
  scenes. Each scene's `createAudio()` grabs it (creating it if absent).
- **Two noise seeds:** `noiseBuffer` (white, 2 s) and `pinkBuffer` (pink/1·f,
  6 s — calmer; used for air/room-tone/flute breath).
- **The bed "breathes"** via three co-prime LFOs (≈67/97/139 s — long so swells
  feel like fabric, not sudden) summed over a low floor on `musicGain.gain`.
- **Reverb is a MONO ~2.4 s convolution IR** (`makeImpulse`) — kept short/mono
  because convolution is the heaviest, always-on node; a long stereo IR starved
  the audio thread → crackle. The synthesised signal itself is clean (verified
  by offline render: no clipping/clicks), so soundscape crackle = CPU, not DSP.
- **Lifecycle:** `prepare()` pre-builds the context + buffers at scene-create
  (avoids first-gesture lag); `start()` (bound to the first `pointerdown`/
  `keydown`, because browsers block audio until a gesture) builds music and
  fades in; `setEnabled`/`toggle` fade the master without tearing down.
- **State:** `setMusicState('residency'|'expedition')` transposes/filters the
  bed; `setAmbience(roomKey)` crossfades to a room's recipe.
- **All noise voices use `pinkBuffer`** (`wind`, `murmur`, `roomTone`) — pink
  noise is warmer/less hissy than white; the switch came from the research doc
  (Part 3, item 4).
- **Per-room sound** lives in the `RECIPES` map at the bottom (`hall`, `court`,
  `comms`, `veil`, `infirmary`, `yard`, `quarters`, `deck`, `map`,
  `expedition`), built from voice helpers (`wind`, `roomTone`, `murmur`,
  `chord`, `hum`, `subRumble`, `gong`, `ping`, `pulse`, scheduled via `every`).
- **Spice Opera voices (HERAD-style FM):** `cryingFlute`/`flutePhrase` (the
  signature breathy lead, used in `hall`) and `fmBell` (inharmonic chimes, used
  in `comms`), drawn from the `FLUTE_POOL` (F natural Phrygian — dark/yearning)
  and `BELL_POOL`. `radarSweep` gives `comms` a rotating-dish throb + sweep.
  **First pass so far covers `hall` + `comms` only** — the other rooms still use
  the older generic recipes.

### Painterly filter (`src/shaders/KuwaharaPostFX.js`)
A Kuwahara edge-preserving smoothing PostFX pipeline (oil-painted look),
registered in `main.js` and applied per scene via `enablePainterly(scene)`;
`togglePainterly(scene)` is bound to the **`K`** key. **WebGL-only** — both
helpers no-op on the canvas renderer.

### Assets (`public/`)
- `hall.png` — optional painted hall backdrop (the only image asset).
- `_headers` — Cloudflare Pages headers.

## Conventions & patterns

- **Procedural-first / asset-free:** generate textures in `BootScene`, synth
  audio in `AudioManager`. Don't add binary assets without a reason.
- **Responsive layout:** never hard-code against 1280×720 mid-scene. Each scene
  has a `layout(width, height)` and an `onResize` bound via
  `this.scale.on('resize', …)` and cleaned up on `SHUTDOWN`. Follow the
  `create() → build*() → layout()` shape.
- **Input gating:** scenes set `inputReadyAt` and ignore input for ~350ms after
  fade-in to avoid stray clicks during transitions.
- **Constants up top:** colours (`GOLD`, `CREAM`, …) and data tables
  (`LOCATIONS`, `NODES`, `LEDGES`, `MUSIC`, `RECIPES`) live at file scope.
- **Lore naming is intentional:** Aurun, Aridun, House Calder, Eren, the Veil,
  Corsair Deck, etc. Match existing names; see `VISION.md`.

## Intentional decisions & gotchas (don't "fix" these)

- **Audio needs a user gesture** — sound starts on the first click/keypress by
  design (browser autoplay policy), not on load.
- **The soundscape is deliberately quiet, dark, and "breathing"** — low master
  level, low filter cutoffs, long co-prime swells on the music bus. This is a
  tuned aesthetic ("atmosphere, not a score on top"); tuning knobs are commented
  inline in `AudioManager.js`. Don't brighten/loudness-maximize without intent.
- **Standing preference: keep audio loudness conservative (err quiet).** It has
  repeatedly come back as "too loud"; default to lower levels (master `this.level`
  is the global knob, currently `0.14`) and only raise on explicit request.
- **No tests / no lint config** — `npm run build` is the available check.
- **Scaffold leftovers:** `package.json` name and the `index.html` `<title>`
  still say "2D Platformer".
