# Arradius

A desert-world adventure in the spirit of Cryo's 1992 *Dune* — painterly,
atmospheric, quiet. Built with [Phaser 3](https://phaser.io/) +
[Vite](https://vitejs.dev/), deployed to **Cloudflare Pages**. Original
universe; Herbert's themes worn openly.

See [`VISION.md`](./VISION.md) for the full creative direction and lore.

---

## What's here

Three interlocking layers are playable now:

**The Residency** — House Calder's palace at Saltspire, navigated
point-and-click in the spirit of Cryo's painted hub screens. Eight rooms, each
with its own atmosphere, portrait dialogue, and soundscape. Every surface is
drawn procedurally at runtime (no image assets except the optional painted hall
backdrop). Characters: Lord Aldric, Sela, Mother Ysolde, Brannic, Master Orlin,
and more.

**The World Map** — the strategic overview of Arradius: your seat at Saltspire,
Tamir's Hollow (First Contact awaits), and the House Vorrin watchpost at Ashmaw.
A stub of the full territory campaign to come.

**The Expedition** — a side-scrolling desert crossing: Eren on foot across the
dunes toward the Hollow, gathering Aurun, under a dusk sky with god-rays and
parallax layers. Physics, touch controls, and a glowing hollow entrance.

Everything runs with **no binary assets** — all textures are generated in
`BootScene` and all sound is synthesized with the Web Audio API, so you can
clone, install, and play immediately.

---

## Audio

The soundscape is a fully synthesized two-bus engine (`AudioManager.js`):

- **Music bus** — a sacred drone chord (F open fifths) through a stone-hall
  convolution reverb, breathing via three co-prime slow LFOs (~67/97/139 s) so
  the swells never align into an audible "whoosh-whoosh". Transitions between
  the contained Residency and the open desert by transposing and adjusting
  filter cutoffs.
- **Ambience bus** — each room crossfades to its own recipe of air, murmur,
  wind, bells, or pulse. All noise voices use pink (1/*f*) noise — warmer and
  less hissy than white.
- **Spice Opera FM voices** — a "crying flute" lead (2-operator FM + pink
  breath noise, portamento, late vibrato) and inharmonic FM bell chimes, drawn
  from an F natural Phrygian pool for the desert colour. Modelled on the HERAD
  expressivity technique from Cryo's original *Dune* OPL2 driver.

See [`docs/audio-soundscape-research.md`](./docs/audio-soundscape-research.md)
for the full research and design rationale.

---

## Visual style

Painterly and procedural. Rooms are drawn with Phaser `Graphics` using
one-point perspective geometry (box model, not a tunnel to a single point) —
barrel-shaded columns, atmospheric depth dimming, wall torches, carpet runner,
banners with the House Calder sigil. The **Kuwahara post-FX pipeline**
(`KuwaharaPostFX.js`) applies an oil-paint edge-preserving smoothing filter;
toggle it with **K**.

See [`PERSPECTIVE.md`](./PERSPECTIVE.md) for the depth and lighting guide used
when building rooms.

---

## Quick start

```bash
npm install
npm run dev      # Vite dev server at http://localhost:5173
npm run build    # production build → ./dist
npm run preview  # serve the production build locally
npm run deploy   # wrangler pages deploy dist → Cloudflare Pages
```

**Controls**

| | |
|---|---|
| Click anywhere | Start the music |
| **♪** (top-right) | Toggle music on/off |
| **K** | Toggle painterly filter |
| Click doorways | Navigate rooms (Residency) |
| **ESC** | Walk back one room |
| **← → / A D** | Move (Expedition) |
| **↑ / Space** | Jump (Expedition) |
| On-screen buttons | Touch controls (Expedition) |

---

## Project structure

```
.
├── VISION.md               # creative direction, lore, characters, mechanics
├── PERSPECTIVE.md          # implementation guide: 3D perspective in 2D rooms
├── docs/
│   └── audio-soundscape-research.md  # psychoacoustics research + synth design
├── public/
│   ├── hall.png            # optional painted hall backdrop
│   └── _headers            # Cloudflare Pages cache headers
└── src/
    ├── main.js             # Phaser.Game config, scene list, tab-mute handler
    ├── audio/
    │   └── AudioManager.js # two-bus Web Audio engine (music + per-room ambience)
    ├── shaders/
    │   └── KuwaharaPostFX.js  # Kuwahara oil-paint post-process filter
    └── scenes/
        ├── BootScene.js        # procedural texture generation at runtime
        ├── ResidencyScene.js   # painted palace hub, point-and-click navigation
        ├── WorldMapScene.js    # strategic War Map of Arradius
        └── ExpeditionScene.js  # desert side-scroller, physics, Aurun gathering
```

---

## Deploying to Cloudflare Pages

### Option A — Git integration (recommended)

1. Push to GitHub/GitLab.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
   Git**, pick this repo.
3. Build settings: framework **None / Vite**, build command `npm run build`,
   output directory `dist`.
4. Deploy. Every push to your production branch redeploys automatically.

### Option B — Direct upload via Wrangler

```bash
npm run build && npm run deploy
```

---

## Adding painted assets

As the project moves from procedural placeholders to real painted art:

1. Drop images into `public/` (e.g. `public/rooms/court.png`).
2. Load in `BootScene.preload()`:
   ```js
   this.load.image('court', 'rooms/court.png');
   ```
3. In the relevant scene, display instead of (or over) the procedural draw.
   Files in `public/` are served from the site root — no `public/` prefix needed.

The hall backdrop (`public/hall.png`) is already wired this way in
`ResidencyScene` via the `USE_HALL_BG` flag.
