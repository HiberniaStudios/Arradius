# 2D Platformer

A [Phaser 3](https://phaser.io/) 2D platformer scaffold, bundled with
[Vite](https://vitejs.dev/) and ready to deploy to **Cloudflare Pages**.

It runs out of the box with no binary assets — all sprites are generated as
textures at runtime in `BootScene`, so you can clone, install, and play
immediately, then swap in real art later.

## Quick start

```bash
npm install
npm run dev      # local dev server at http://localhost:5173
npm run build    # production build into ./dist
npm run preview  # preview the production build locally
```

Controls: **← →** or **A / D** to move, **↑** / **Space** to jump. Collect coins
to raise your score.

## Project structure

```
.
├── index.html              # page shell that mounts the game
├── vite.config.js          # Vite build config (outputs to ./dist)
├── wrangler.toml           # Cloudflare Pages config
├── public/                 # static files copied as-is (e.g. real art, _headers)
│   └── _headers            # long-cache headers for hashed build assets
└── src/
    ├── main.js             # Phaser.Game config + entry point
    └── scenes/
        ├── BootScene.js    # generates placeholder textures, then starts the game
        └── GameScene.js    # the playable level: player, platforms, coins, HUD
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
