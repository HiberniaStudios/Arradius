# Arradius _(working title)_

An atmospheric exploration-platformer built with [Phaser 3](https://phaser.io/)
and [Vite](https://vitejs.dev/), deployed to **Cloudflare Pages**. Influenced by
the 1992 Cryo/Virgin _Dune_ — mood, music, and a desert world — in an original
universe. See [`VISION.md`](./VISION.md) for the creative direction.

This is the **first painterly slice**: a hooded walk across the dunes of Aridun
toward a Hollow, gathering Aurun, under a dusk sky with an ambient soundbed. It
still runs with no binary assets — every texture and sound is generated at
runtime, so you can clone, install, and play immediately.

## Quick start

```bash
npm install
npm run dev      # local dev server at http://localhost:5173
npm run build    # production build into ./dist
npm run preview  # preview the production build locally
```

Controls: **← →** or **A / D** to move, **↑** / **Space** to jump (or the
on-screen buttons on touch devices). Gather Aurun; head right toward the Hollow.
Tap once to start the music; **♪** (top-right) toggles it.

## Project structure

```
.
├── index.html              # page shell that mounts the game
├── vite.config.js          # Vite build config (outputs to ./dist)
├── wrangler.toml           # Cloudflare Pages config
├── VISION.md               # creative direction / design bible
├── public/                 # static files copied as-is (e.g. real art, _headers)
│   └── _headers            # long-cache headers for hashed build assets
└── src/
    ├── main.js             # Phaser.Game config + entry point
    ├── audio/
    │   └── AudioManager.js     # two-bus Web Audio engine: spice-opera score + per-room ambience
    ├── shaders/
    │   └── KuwaharaPostFX.js   # painterly oil-paint post-process filter
    └── scenes/
        ├── BootScene.js        # generates painterly textures, then starts the hub
        ├── ResidencyScene.js   # the Palace hub: painted room screens, point-and-click + portraits
        ├── WorldMapScene.js    # the strategic War Map of Arradius
        └── ExpeditionScene.js  # the desert slice: parallax dunes, Eren, Aurun, Hollow
```

## Deploying to Cloudflare Pages

### Option A — Git integration (recommended)

1. Push this repo to GitHub/GitLab.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
   Git**, and pick this repo.
3. Set the build settings:
   - **Framework preset:** None / Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Deploy. Every push to your production branch redeploys automatically.

### Option B — Direct upload via Wrangler

```bash
npm run build
npx wrangler pages deploy dist
# or, once you've named the project:
npm run deploy
```

## Adding real assets

1. Drop images/spritesheets into `public/` (e.g. `public/sprites/player.png`).
2. Load them in a `preload()` method instead of generating textures:

   ```js
   preload() {
     this.load.image('player', 'sprites/player.png');
   }
   ```

3. Remove the matching `makeRectTexture` / `makeCoinTexture` call in
   `BootScene.js`. Files in `public/` are served from the site root, so
   reference them without the `public/` prefix.
