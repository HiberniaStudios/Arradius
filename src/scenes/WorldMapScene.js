import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager.js';
import { togglePainterly } from '../shaders/KuwaharaPostFX.js';

// ── World tile (one wrap period) ──────────────────────────────────────────
// East↔West wraps seamlessly. North (y=0) and South (y=WORLD_H) are poles
// — clamped, not wrapped.
const WORLD_W = 4096;   // one east-west loop
const WORLD_H = 2048;   // pole to pole

// Minimap thumbnail
const MM_W = 220;
const MM_H = Math.round(MM_W * WORLD_H / WORLD_W); // ≈ 110

// Zoom is fixed at 1.0 — the map is a fixed-scale cartographic view.

// Drag threshold (px) before we commit to a pan (not a click)
const DRAG_THR = 7;

// Sand-sea regions — golden desert seas interlocked with rocky planes.
// [cx_frac, cy_frac, rw_frac, rh_frac, colour, seed]
const SAND_SEAS = [
  [0.48, 0.62, 0.55, 0.44, 0xa07828, 2.30],  // Great central dune sea
  [0.10, 0.50, 0.26, 0.54, 0x8c6820, 5.71],  // Western sand flats
  [0.87, 0.58, 0.34, 0.50, 0x966e24, 1.44],  // Eastern dune basin
  [0.26, 0.30, 0.22, 0.20, 0x7c5e18, 8.22],  // North-central sand thread
  [0.62, 0.88, 0.36, 0.22, 0xac8030, 3.88],  // Deep south desert (brightest)
  [0.78, 0.24, 0.18, 0.16, 0x6e5414, 6.13],  // Ashmaw sand pocket (north-east)
  [0.16, 0.82, 0.28, 0.22, 0x987428, 4.55],  // South-west sand field
  [0.50, 0.18, 0.20, 0.14, 0x6a5012, 7.80],  // Polar sand thread (far north)
];

// Rocky plateau formations — organic irregular shapes rising through the sand.
// [cx_frac, cy_frac, rx_frac, ry_frac, seed]
// Keep rx/ry small (0.03–0.08) so formations read as planes, not continents.
// Clusters of 2–3 nearby entries mimic real geological groupings.
const ROCK_PLATEAUS = [
  // Central basin cluster
  [0.36, 0.58, 0.07, 0.06, 1.20],
  [0.41, 0.61, 0.05, 0.04, 7.40],
  [0.33, 0.54, 0.04, 0.03, 9.11],
  // Eastern mesa group
  [0.66, 0.50, 0.06, 0.05, 2.73],
  [0.70, 0.46, 0.04, 0.03, 8.12],
  // South plateau cluster
  [0.54, 0.80, 0.06, 0.05, 4.10],
  [0.58, 0.84, 0.04, 0.03, 5.88],
  // Western upland
  [0.20, 0.43, 0.05, 0.06, 0.81],
  [0.16, 0.48, 0.04, 0.03, 6.02],
  // North-east ridge
  [0.80, 0.37, 0.06, 0.05, 3.55],
  [0.76, 0.32, 0.04, 0.03, 4.77],
  // Mid-north rocky patch
  [0.44, 0.41, 0.05, 0.04, 5.22],
  // Far east
  [0.92, 0.80, 0.05, 0.04, 1.94],
  [0.95, 0.74, 0.03, 0.03, 8.60],
  // Far west edge
  [0.04, 0.20, 0.04, 0.05, 6.30],
  // Scattered singles
  [0.60, 0.34, 0.05, 0.04, 2.18],
  [0.15, 0.65, 0.05, 0.04, 3.72],
  [0.72, 0.70, 0.04, 0.04, 4.88],
  [0.28, 0.75, 0.05, 0.04, 1.55],
  [0.50, 0.46, 0.04, 0.03, 6.91],
  [0.85, 0.85, 0.04, 0.03, 2.33],
  [0.42, 0.18, 0.05, 0.04, 5.67],
  [0.70, 0.88, 0.05, 0.04, 0.44],
  [0.08, 0.82, 0.04, 0.03, 3.19],
  [0.55, 0.63, 0.04, 0.03, 7.82],
  [0.93, 0.45, 0.04, 0.03, 1.06],
  [0.25, 0.88, 0.04, 0.03, 4.55],
  [0.77, 0.15, 0.05, 0.04, 2.91],
  [0.62, 0.22, 0.04, 0.03, 6.44],
];

const FACTION = {
  calder:  { color: 0x6fb0ff, name: 'House Calder',  status: 'Held — House Calder' },
  shadmen: { color: 0xffce86, name: 'The Shadmen',    status: 'Unmet — First Contact awaits' },
  vorrin:  { color: 0xe05030, name: 'House Vorrin',   status: 'Enemy — House Vorrin' },
};

// Nodes in world space.  All wrapped at ±WORLD_W automatically.
//
// Geography (VISION.md):
//   Aridun is a rock world — rockbed plains dominant, dune seas in low ground.
//   Calder Hold occupies the northwest rockbed; the Keth Rockbed is northeast.
//   Hollows are carved into rockbed formations — concealed, elevated entrances.
//
//   Saltspire  — capital, Calder Hold (northwest)         → matches region label at ~(573, 492)
//   Tamir's Hollow — nearest Hollow to Saltspire;         → short ride east-southeast, rockbed edge
//                    Hollows hidden in formations          → close enough to be "first contact"
//   Ashmaw     — Vorrin watchpost DEEP in Keth Rockbed    → far northeast, near region label ~(3112, 266)
//                boring rigs run night/day; unreachable until Shadmen won
const NODES = [
  {
    key: 'saltspire', name: 'Saltspire', faction: 'calder', type: 'city',
    wx: 1180, wy: 980, population: 182000,
    desc: 'The capital of Aridun. Seat of House Calder — your Residency.',
    action: 'home', label: '‹ Return to Communications',
  },
  {
    key: 'hollow', name: "Tamir's Hollow", faction: 'shadmen', type: 'hollow',
    wx: 1150, wy: 860, population: 3400,
    desc: "The nearest Shadmen Hollow to Saltspire, carved into the rockbed face. Tamir's people watch from the stone. Ride out and make first contact.",
    action: 'expedition', label: 'Ride out  (Corsair)',
  },
  {
    key: 'ashmaw', name: 'Ashmaw', faction: 'vorrin', type: 'fort',
    wx: 2700, wy: 480, population: 8200, hidden: true,
    desc: "A Vorrin watchpost deep in the Keth Rockbed. Boring rigs run day and night. Too strong to assault — win the Shadmen first.",
    action: 'locked', label: 'Assault  (locked)',
  },
];


export default class WorldMapScene extends Phaser.Scene {
  constructor() { super('WorldMapScene'); }

  // ── Boot ─────────────────────────────────────────────────────────────────

  create() {
    this.selected  = 0;
    this.isDrag    = false;

    // Build the terrain tile once into a texture so we can repeat it cheaply
    this._buildTerrainTexture();

    // Layer order
    this.nodeSymG  = this.add.graphics().setDepth(3);
    this.selRing   = this.add.graphics().setDepth(11);
    this.minimapG  = this.add.graphics().setDepth(500);
    this.infoBgG   = this.add.graphics().setDepth(200);

    this._buildNodes();
    this._buildChrome();
    // Two-camera HUD split — must come after all objects are built.
    // uiCam (zoom=1, no scroll) renders UI chrome; cameras.main renders the world.
    // camera.ignore() also gates input so interactive UI elements hit-test
    // against uiCam's fixed 1:1 transform.
    this._setupCameras();
    this._setupCamera();
    this._setupDrag();
    this._setupKeys();
    this._createAudio();
    this._layout();
    this.refreshSelection();

    this.cameras.main.fadeIn(500, 6, 4, 12);
    this.uiCam.fadeIn(500, 6, 4, 12);
    this.inputReadyAt = this.time.now + 500;
    this.input.keyboard.on('keydown-K', () => togglePainterly(this));
    this.scale.on('resize', () => {
      const { width: W, height: H } = this.cameras.main;
      this.uiCam?.setSize(W, H);
      this._layout();
    }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off('resize', this._layout, this));
  }

  // ── Terrain ───────────────────────────────────────────────────────────────

  _buildTerrainTexture() {
    // Draw one tile of terrain into a Graphics object, bake to a RenderTexture
    // so we can repeat it (3 copies east-west) for a seamless wrap.
    const g = this.add.graphics();
    // Draw at three x-offsets so shapes near the left/right tile edges
    // bleed seamlessly into the adjacent copy (RenderTexture clips at 0/WORLD_W).
    this._drawTerrainTile(g, -WORLD_W);
    this._drawTerrainTile(g,        0);
    this._drawTerrainTile(g,  WORLD_W);

    // RenderTexture = GPU texture; very cheap to repeat as sprites.
    const rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setDepth(-100);
    rt.draw(g, 0, 0);
    rt.saveTexture('worldTile');
    rt.destroy();
    g.destroy();

    // Place three copies side-by-side: left, centre, right
    // Camera wraps so the visible strip always falls on the centre tile.
    this._tileL = this.add.image(-WORLD_W, 0, 'worldTile').setOrigin(0, 0).setDepth(-100);
    this._tileC = this.add.image(       0, 0, 'worldTile').setOrigin(0, 0).setDepth(-100);
    this._tileR = this.add.image( WORLD_W, 0, 'worldTile').setOrigin(0, 0).setDepth(-100);

    // Painted backdrop — replaces procedural terrain if the asset loaded.
    // Three copies for seamless east-west wrap, same pattern as the tile.
    if (this.textures.exists('mapBg')) {
      // Override global pixelArt (NEAREST) setting — the painted backdrop benefits
      // from bilinear filtering when stretched to world space; nearest-neighbour
      // gives it a chunky look at this scale.
      this.textures.get('mapBg').setFilter(Phaser.Textures.FilterMode.LINEAR);

      this._tileL.setVisible(false);
      this._tileC.setVisible(false);
      this._tileR.setVisible(false);
      this._bgL = this.add.image(-WORLD_W, 0, 'mapBg').setOrigin(0, 0).setDisplaySize(WORLD_W, WORLD_H).setDepth(-200);
      this._bgC = this.add.image(       0, 0, 'mapBg').setOrigin(0, 0).setDisplaySize(WORLD_W, WORLD_H).setDepth(-200);
      this._bgR = this.add.image( WORLD_W, 0, 'mapBg').setOrigin(0, 0).setDisplaySize(WORLD_W, WORLD_H).setDepth(-200);

      // Seam hider — soft gradient shadow centred on each tile boundary.
      // The PNG edges don't match so a feathered warm-dark strip reads as a
      // natural terrain crease rather than an artefact.
      this._seamGfx = this.add.graphics().setDepth(-150);
      const SEAM_HALF = 90; // world-units either side of seam centre
      const COL = 0x0a0602;  // warm near-black, matches rock shadow tone
      const PEAK = 0.55;     // peak alpha at the seam centre
      [-WORLD_W, 0, WORLD_W].forEach(sx => {
        // Left wing: transparent → dark (left to right)
        this._seamGfx.fillGradientStyle(COL, COL, COL, COL, 0, PEAK, 0, PEAK);
        this._seamGfx.fillRect(sx - SEAM_HALF, 0, SEAM_HALF, WORLD_H);
        // Right wing: dark → transparent (left to right)
        this._seamGfx.fillGradientStyle(COL, COL, COL, COL, PEAK, 0, PEAK, 0);
        this._seamGfx.fillRect(sx, 0, SEAM_HALF, WORLD_H);
      });
    }

    // Region labels (world-space text, duplicated for each tile)
    this._makeRegionLabels();
  }

  _drawTerrainTile(g, xOff) {
    const W = WORLD_W, H = WORLD_H;
    const x0 = xOff;

    // ── Rocky base — covers the whole tile ───────────────────────────────
    g.fillStyle(0x4a3820, 1);
    g.fillRect(x0, 0, W, H);

    // Latitude toning — polar cool at top, equatorial warmth at bottom.
    // Sun angle on a rock world: light rakes in from the NW at a low angle.
    g.fillStyle(0x00060e, 0.22); // north polar cold
    g.fillRect(x0, 0, W, H * 0.28);
    g.fillStyle(0x120400, 0.12); // south equatorial warmth
    g.fillRect(x0, H * 0.72, W, H * 0.28);

    // ── Interlocking sand seas — organic rolling shapes ───────────────────
    // Each sea is a seed-driven perturbed polygon (low-frequency, smooth) so
    // shores read as natural dune edges rather than perfect ellipses.
    SAND_SEAS.forEach(([cfx, cfy, rw, rh, col, seed]) => {
      const cx  = x0 + cfx * W, cy = cfy * H;
      const rx  = rw * W * 0.5,  ry = rh * H * 0.5;

      // Outer boundary — organic shape for a natural dune-shore silhouette
      g.fillStyle(col, 1);
      this._sandPoly(g, cx, cy, rx, ry, seed);

      // Inner fills — smooth ellipses so the depth shading reads cleanly
      // Leeward shadow — south/SE face, dunes dome toward the NW
      g.fillStyle(0x2a1a06, 0.25);
      g.fillEllipse(cx + rx * 0.10, cy + ry * 0.40, rx * 1.68, ry * 1.04);

      // Sunlit NW crest — windward highlight
      g.fillStyle(col + 0x181008, 0.35);
      g.fillEllipse(cx - rx * 0.18, cy - ry * 0.26, rx * 1.04, ry * 1.04);
    });

    // ── Dune ripple lines — sand only, drawn before rocks ────────────────
    // Rocks are painted on top afterwards so any edge bleed is covered.
    // Frequency snapped to integer cycles → seamless tile join.
    const inSand = (px, py) => SAND_SEAS.some(([cfx, cfy, rw, rh]) => {
      const dx = (px / W - cfx) / (rw * 0.5);
      const dy = (py / H - cfy) / (rh * 0.5);
      return dx * dx + dy * dy <= 1;
    });

    for (let w = 0; w < 90; w++) {
      const t     = w / 90;
      const baseY = H * 0.06 + t * H * 0.90;
      const rawFreq = 0.0016 + Math.abs(Math.sin(w * 0.41)) * 0.0012;
      const cycles  = Math.max(1, Math.round(rawFreq * W / (2 * Math.PI)));
      const freq    = cycles * (2 * Math.PI) / W;
      const amp   = 9 - t * 4;
      const crest = w % 2 === 0;
      const alpha = (crest ? 0.36 : 0.14) * (0.5 + 0.5 * Math.abs(Math.sin(w * 0.83)));
      g.lineStyle(crest ? 1.5 : 1, crest ? 0xe0b048 : 0x7a5818, alpha);
      let drawing = false;
      g.beginPath();
      for (let px = 0; px <= W; px += 8) {
        const py = baseY + Math.sin(px * freq + w * 1.3) * amp;
        if (inSand(px, py)) {
          if (!drawing) { g.moveTo(x0 + px, py); drawing = true; }
          else            g.lineTo(x0 + px, py);
        } else {
          if (drawing) { g.strokePath(); g.beginPath(); drawing = false; }
        }
      }
      if (drawing) g.strokePath();
    }

    // ── Rocky plateau formations — painted AFTER ripples so rocks sit on top ─
    // Sun direction: NW upper-left. Each formation has a SE cast shadow,
    // a lit NW face, and a bright cliff rim where light catches the edge.
    ROCK_PLATEAUS.forEach(([cfx, cfy, rfw, rfh, seed]) => {
      const cx = x0 + cfx * W, cy = cfy * H;
      const rx = rfw * W, ry = rfh * H;

      // Soft ambient contact shadow — large, translucent, bleeds under the rock
      g.fillStyle(0x0a0806, 0.40);
      this._organicPoly(g, cx + rx * 0.10, cy + ry * 0.12, rx * 1.38, ry * 1.38, seed);

      // Cast shadow — SE offset, sun raking in from NW upper-left
      g.fillStyle(0x16100a, 1);
      this._organicPoly(g, cx + rx * 0.28, cy + ry * 0.32, rx * 1.15, ry * 1.15, seed);

      // Main plateau body
      g.fillStyle(0x2e2418, 1);
      this._organicPoly(g, cx, cy, rx, ry, seed);

      // Flat top — inner raised plateau face, slightly cooler/neutral
      g.fillStyle(0x382c1a, 1);
      this._organicPoly(g, cx - rx * 0.06, cy - ry * 0.06, rx * 0.62, ry * 0.62, seed + 1.1);

      // Sunlit NW face — warm amber where the low NW light catches the cliff face
      g.fillStyle(0x52401e, 0.65);
      this._organicPoly(g, cx - rx * 0.24, cy - ry * 0.28, rx * 0.66, ry * 0.56, seed + 0.5);

      // Cliff-edge rim — bright where sun grazes the top edge
      g.lineStyle(1.5, 0xa47c38, 0.80);
      this._organicPolyStroke(g, cx, cy, rx, ry, seed);

      // Fissure lines — cracks across the plateau face
      for (let f = 0; f < 4; f++) {
        const ang  = seed * 1.9 + f * (Math.PI / 4) + f * 0.3;
        const len  = 0.25 + 0.25 * Math.abs(Math.sin(seed + f));
        const x1   = cx + Math.cos(ang) * rx * 0.12;
        const y1   = cy + Math.sin(ang) * ry * 0.12;
        const x2   = cx + Math.cos(ang + 0.4) * rx * len;
        const y2   = cy + Math.sin(ang + 0.4) * ry * len;
        g.lineStyle(1, 0x4a3818, 0.50);
        g.lineBetween(x1, y1, x2, y2);
      }
    });

    // ── Rock-formation hill marks — across the whole map ─────────────────
    const seeds = [
      [0.03,0.19],[0.07,0.62],[0.11,0.36],[0.15,0.72],[0.19,0.26],
      [0.23,0.47],[0.27,0.16],[0.31,0.58],[0.35,0.39],[0.38,0.80],
      [0.42,0.24],[0.46,0.68],[0.50,0.15],[0.53,0.54],[0.57,0.78],
      [0.61,0.28],[0.64,0.63],[0.68,0.43],[0.72,0.86],[0.75,0.15],
      [0.78,0.57],[0.82,0.31],[0.85,0.72],[0.88,0.47],[0.92,0.64],
      [0.95,0.27],[0.98,0.54],[0.05,0.77],[0.13,0.49],[0.21,0.90],
      [0.30,0.38],[0.40,0.71],[0.50,0.89],[0.59,0.37],[0.70,0.20],
      [0.80,0.68],[0.90,0.41],[0.08,0.55],[0.33,0.85],[0.62,0.10],
    ];
    seeds.forEach(([fx, fy]) => {
      const rx = x0 + fx * W;
      const ry = fy * H;
      const s  = 9 + Math.abs(Math.sin(fx * 19 + fy * 13)) * 6;
      const a  = 0.40 + Math.abs(Math.sin(fx * 7.1)) * 0.25;
      g.lineStyle(1, 0xb08040, a);
      g.beginPath();
      g.moveTo(rx - s * 0.85, ry + s * 0.65);
      g.lineTo(rx - s * 0.08, ry - s * 0.90);
      g.lineTo(rx + s * 0.58, ry + s * 0.65);
      g.strokePath();
      g.lineStyle(1, 0xb08040, a * 0.55);
      g.beginPath();
      g.moveTo(rx + s * 0.38, ry + s * 0.65);
      g.lineTo(rx + s * 0.95, ry - s * 0.42);
      g.lineTo(rx + s * 1.60, ry + s * 0.65);
      g.strokePath();
    });

    // Vorrin boring-rig markers (east rocky zone)
    [[0.65,0.16],[0.71,0.28],[0.77,0.14],[0.83,0.31],[0.89,0.20]].forEach(([fx, fy]) => {
      const rx = x0 + fx * W, ry = fy * H;
      g.lineStyle(1, 0xe05030, 0.22);
      g.strokeRect(rx - 5, ry - 5, 10, 10);
      g.lineBetween(rx - 9, ry, rx + 9, ry);
      g.lineBetween(rx, ry - 9, rx, ry + 9);
    });

    // ── Edge vignettes — darken poles so the world feels curved ─────────────
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0x000000, 0.22 * (1 - i / 12));
      g.fillRect(x0, 0, W, H * 0.018 * (12 - i));           // north pole
      g.fillRect(x0, H - H * 0.018 * (12 - i), W, H * 0.018 * (12 - i)); // south pole
    }

  }

  // ── Organic polygon helpers ───────────────────────────────────────────────

  // Sand seas: smooth, low-frequency perturbation — rolling dune shores.
  // Uses signed sin (not abs) so edges swell both inward and outward naturally.
  // N=40 vertices keeps curves fluid at sand-sea scale.
  _sandPoly(g, cx, cy, rx, ry, seed) {
    const N = 40;
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const n = 1.0
        + 0.12 * Math.sin(seed * 1.7 + i * 1.10)   // broad swell (~1.7 cycles)
        + 0.07 * Math.sin(seed * 3.3 + i * 2.51)   // mid undulation
        + 0.03 * Math.sin(seed * 5.9 + i * 4.80);  // fine texture
      const px = cx + Math.cos(angle) * rx * n;
      const py = cy + Math.sin(angle) * ry * n;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }

  // Rock formations: sharp, multi-frequency perturbation — cliff-face silhouettes.
  // Phaser Graphics supports arbitrary path shapes — not limited to primitives.
  // We perturb the radius at each vertex using two sine frequencies (seed-driven)
  // so every formation has a uniquely jagged, geological silhouette.

  _organicPoly(g, cx, cy, rx, ry, seed) {
    const N = 20; // vertices — more = smoother but still irregular
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const n = 0.68
        + 0.20 * Math.abs(Math.sin(seed * 3.1 + i * 2.73))
        + 0.12 * Math.abs(Math.sin(seed * 1.7 + i * 5.11));
      const px = cx + Math.cos(angle) * rx * n;
      const py = cy + Math.sin(angle) * ry * n;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }

  _organicPolyStroke(g, cx, cy, rx, ry, seed) {
    const N = 20;
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const n = 0.68
        + 0.20 * Math.abs(Math.sin(seed * 3.1 + i * 2.73))
        + 0.12 * Math.abs(Math.sin(seed * 1.7 + i * 5.11));
      const px = cx + Math.cos(angle) * rx * n;
      const py = cy + Math.sin(angle) * ry * n;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.strokePath();
  }

  _makeRegionLabels() {
    // Region labels removed — painted backdrop carries the geography visually.
    (this._regionLabels || []).forEach(t => t.destroy());
    this._regionLabels = [];
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  // ── Nodes ─────────────────────────────────────────────────────────────────
  // Each node exists on all 3 tile copies so it's always visible.

  _buildNodes() {
    // Where each sprite type's visual base sits relative to the icon centre.
    // Fraction of ICON_H above 0 (centre). Each sprite has different transparent
    // padding at the bottom; tune these so the shadow ellipse aligns with the
    // visible ground-contact point of each art asset.
    //   palace  → towers fill ~90 % of height  → base ≈ centre + 0.40 × ICON_H
    //   hollow  → arch fills  ~65 % of height  → base ≈ centre + 0.15 × ICON_H
    //   fort    → structure   ~85 % of height  → base ≈ centre + 0.35 × ICON_H
    const SHADOW_FRAC = { city: 0.40, hollow: 0.15, fort: 0.35 };

    this.nodeObjs = NODES.map((node, idx) => {
      // Hidden nodes (not yet discovered) render nothing and are not interactive.
      if (node.hidden) return { node, copies: [] };

      const color = FACTION[node.faction].color;
      const copies = []; // one entry per tile copy

      // Sprite icon — PNG loaded in BootScene; falls back to procedural symbol
      const texKey    = 'node-' + node.type;
      const hasSprite = this.textures.exists(texKey);
      // Display height for map icons; width is auto-scaled from the source aspect.
      const ICON_H    = 50;

      const src    = hasSprite ? this.textures.get(texKey).source[0] : null;
      const iconW  = hasSprite ? Math.round(ICON_H * src.width / src.height) : ICON_H;
      // Shadow footprint — dark ellipse under each icon so it reads against any terrain
      const shadowW = iconW * 0.88, shadowH = ICON_H * 0.20;

      [-WORLD_W, 0, WORLD_W].forEach(off => {
        const nx  = node.wx + off;
        // bot = where this sprite's visual base meets the ground.
        // Uses per-type SHADOW_FRAC so the ellipse aligns with each art asset.
        const bot = node.wy + (hasSprite ? ICON_H * SHADOW_FRAC[node.type] : 12);

        // ① Wide faction glow behind everything (suppressed for locked nodes)
        const glow = this.add.image(nx, node.wy, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD).setTint(color)
          .setDisplaySize(154, 98).setAlpha(node.action === 'locked' ? 0 : 0.35).setDepth(2);

        // ② Dark shadow plate — separates icon from terrain colour
        const shadow = this.add.ellipse(nx, bot, shadowW, shadowH, 0x000000, 0.55)
          .setDepth(3);

        // No faction ring — clean icons, shadow plate is sufficient ground anchor

        // ③ Sprite icon or null (procedural symbol drawn separately below)
        let sprite = null;
        if (hasSprite) {
          sprite = this.add.image(nx, node.wy, texKey)
            .setDisplaySize(iconW, ICON_H)
            .setAlpha(1.0)
            .setDepth(4);
        }

        const zone = this.add.circle(nx, node.wy, hasSprite ? 42 : 26, 0xffffff, 0)
          .setInteractive({ useHandCursor: true }).setDepth(7);

        zone.on('pointerover', (p) => this._showTooltip(node, p.x, p.y));
        zone.on('pointerout',  ()  => this._hideTooltip());

        zone.on('pointerdown', (p, lx, ly, e) => {
          e?.stopPropagation();
          this.time.delayedCall(20, () => {
            if (this.isDrag) return;
            if (this.selected === idx) { this.act(); }
            else { this.selected = idx; this.refreshSelection(); this._panToNode(node); }
          });
        });

        copies.push({ glow, shadow, sprite, zone, nx, off });
      });

      if (node.action !== 'locked') {
        this.tweens.add({
          targets: copies.map(c => c.glow),
          alpha: { from: 0.22, to: 0.55 },
          duration: 1900 + idx * 380, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        });
      }

      // Only draw procedural symbol if no sprite PNG is available
      if (!hasSprite) {
        this._drawNodeSymbol(this.nodeSymG, node.wx, node.wy, node);
        [-WORLD_W, WORLD_W].forEach(off =>
          this._drawNodeSymbol(this.nodeSymG, node.wx + off, node.wy, node));
      }

      return { node, copies };
    });

  }

  _drawNodeSymbol(g, x, y, node) {
    const color = FACTION[node.faction].color;
    const locked = node.action === 'locked';
    const a = locked ? 0.36 : 0.90;
    g.lineStyle(2, color, a);
    g.fillStyle(color, 0.14 * a);

    if (node.type === 'city') {
      const r = 13;
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r * 0.65, y);
      g.lineTo(x, y + r); g.lineTo(x - r * 0.65, y);
      g.closePath(); g.fillPath(); g.strokePath();
      g.lineStyle(1, color, 0.38 * a);
      g.lineBetween(x - r * 0.42, y, x + r * 0.42, y);
      g.lineBetween(x, y - r * 0.56, x, y + r * 0.56);
    } else if (node.type === 'hollow') {
      const r = 14;
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.87, y + r * 0.5);
      g.lineTo(x - r * 0.87, y + r * 0.5);
      g.closePath(); g.fillPath(); g.strokePath();
    } else if (node.type === 'fort') {
      const r = 11;
      g.strokeRect(x - r, y - r, r * 2, r * 2);
      g.fillRect(x - r, y - r, r * 2, r * 2);
      const tk = 7;
      g.lineStyle(1, color, 0.42 * a);
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => {
        g.lineBetween(x + sx * (r + tk), y + sy * r,       x + sx * r, y + sy * r);
        g.lineBetween(x + sx * r,        y + sy * (r + tk), x + sx * r, y + sy * r);
      });
    }
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  _setupCamera() {
    // No setBounds — we manage wrapping manually in update()
    const cam = this.cameras.main;
    cam.zoom = 1.25;
    // Centre on Saltspire
    this._setCamWorld(NODES[0].wx, NODES[0].wy);
  }

  // Set camera to look at world position (wx, wy)
  _setCamWorld(wx, wy) {
    const cam = this.cameras.main;
    const vw  = cam.width;
    const vh  = cam.height;
    cam.scrollX = wx - vw / 2;
    cam.scrollY = Phaser.Math.Clamp(wy - vh / 2, 0, WORLD_H - vh);
    this._wrapCamera();
  }

  // Clamp / wrap the camera so it always looks at a valid slice of the tiled world.
  // scrollX wraps modulo WORLD_W; scrollY is clamped pole-to-pole.
  _wrapCamera() {
    const cam  = this.cameras.main;
    const vh   = cam.height;
    // Horizontal wrap — tiles endlessly, no clamping needed
    cam.scrollX = ((cam.scrollX % WORLD_W) + WORLD_W) % WORLD_W;
    // Vertical clamp — poles are hard edges
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, WORLD_H - vh));
  }

  // Pan camera smoothly to the node that's nearest the current viewport centre
  _panToNode(node) {
    const cam    = this.cameras.main;
    const vw     = cam.width;
    const vh     = cam.height;
    const centX  = cam.scrollX + vw / 2;
    // Choose the copy closest to current viewport centre (wrapped space)
    const copies = [-WORLD_W, 0, WORLD_W].map(off => node.wx + off);
    const nearest = copies.reduce((a, b) =>
      Math.abs(b - centX) < Math.abs(a - centX) ? b : a);

    const tx = nearest - vw / 2;
    const ty = Phaser.Math.Clamp(node.wy - vh / 2, 0, Math.max(0, WORLD_H - vh));
    this.tweens.add({
      targets: cam, scrollX: tx, scrollY: ty,
      duration: 420, ease: 'Cubic.out',
      onComplete: () => this._wrapCamera(),
    });
  }

  // ── Drag ─────────────────────────────────────────────────────────────────

  _setupDrag() {
    let startX = 0, startY = 0, camX = 0, camY = 0;

    this.input.on('pointerdown', (p) => {
      this.isDrag = false;
      startX = p.x; startY = p.y;
      camX   = this.cameras.main.scrollX;
      camY   = this.cameras.main.scrollY;
    });

    this.input.on('pointermove', (p) => {
      // p.isDown is Phaser's authoritative "any button is held" check —
      // more reliable than a manually tracked flag.
      if (!p.isDown) return;

      const dx = p.x - startX;
      const dy = p.y - startY;
      if (!this.isDrag && Math.sqrt(dx * dx + dy * dy) < DRAG_THR) return;
      this.isDrag = true;

      const cam = this.cameras.main;
      // Grab-and-drag: the world follows the cursor (like sliding a paper map).
      cam.scrollX = ((camX - dx) % WORLD_W + WORLD_W) % WORLD_W;
      cam.scrollY = Phaser.Math.Clamp(camY - dy, 0,
        Math.max(0, WORLD_H - cam.height));
    });

    this.input.on('pointerup', () => {
      this.time.delayedCall(20, () => { this.isDrag = false; });
    });
  }

  // ── Chrome / UI ───────────────────────────────────────────────────────────

  _buildChrome() {
    // No setScrollFactor needed — all chrome objects are assigned to uiCam
    // (zoom=1, scroll=0) by _setupCameras() and ignored by cameras.main.
    this.titleTxt    = this.add.text(0, 0, 'ARRADIUS', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#f0e3d0',
    }).setOrigin(0.5, 0).setDepth(300);

    this.subtitleTxt = this.add.text(0, 0, 'the World Map · Aridun', {
      fontFamily: 'Georgia, serif', fontStyle: 'italic',
      fontSize: '13px', color: '#b09070',
    }).setOrigin(0.5, 0).setDepth(300);

    this.backBtn = this.add.text(0, 0, '‹ Communications', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe8c8',
      backgroundColor: '#1a1010', padding: { x: 10, y: 6 },
    }).setDepth(300).setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerover', () => this.backBtn.setColor('#ffffff'));
    this.backBtn.on('pointerout',  () => this.backBtn.setColor('#ffe8c8'));
    this.backBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.goHome(); });

    // Info panel
    this.infoName   = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontSize: '19px',
    }).setOrigin(0, 0).setDepth(301);
    this.infoStatus = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px',
    }).setOrigin(0, 0).setDepth(301);
    this.infoDesc   = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontStyle: 'italic',
      fontSize: '13px', color: '#c8b898',
    }).setOrigin(0, 0).setDepth(301);
    this.actBtn   = this.add.rectangle(0, 0, 192, 40, 0x2a1e10, 1)
      .setStrokeStyle(1, 0xc8a050, 0.70).setOrigin(0.5).setDepth(301)
      .setInteractive({ useHandCursor: true });
    this.actLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe8c8',
    }).setOrigin(0.5).setDepth(302);
    this.actBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.act(); });

    // Minimap label & click zone
    this.mmLbl  = this.add.text(0, 0, 'ARIDUN', {
      fontFamily: 'monospace', fontSize: '9px', color: '#7a6030',
    }).setOrigin(0.5, 0).setDepth(510);
    this.mmZone = this.add.rectangle(0, 0, MM_W, MM_H, 0xffffff, 0)
      .setDepth(511).setInteractive({ useHandCursor: true });

    // Painted minimap backdrop — uses the same mapBg asset, scaled to MM_W×MM_H.
    // Sits just below minimapG (depth 499) and shares the same geometry mask.
    if (this.textures.exists('mapBg')) {
      this._mmBgImg = this.add.image(0, 0, 'mapBg')
        .setOrigin(0, 0).setDepth(499);
    }

    // Geometry mask — clips both the image and the graphics layer to the minimap rect.
    // The shape is redrawn in _layout() whenever the minimap moves.
    this.minimapMaskGfx = this.make.graphics({ add: false });
    const mmMask = this.minimapMaskGfx.createGeometryMask();
    this.minimapG.setMask(mmMask);
    if (this._mmBgImg) this._mmBgImg.setMask(mmMask);
    this.mmZone.on('pointerdown', (p) => {
      const mmX = p.x - (this._mmX || 0);
      const mmY = p.y - (this._mmY || 0);
      const wx  = (mmX / MM_W) * WORLD_W;
      const wy  = (mmY / MM_H) * WORLD_H;
      this._panToNode({ wx, wy });
    });

    // Music button
    const on0 = this.game.audio ? this.game.audio.enabled : false;
    this._musicCircle = this.add.circle(0, 0, 20, 0xffffff, 0.10)
      .setStrokeStyle(2, 0xc8a050, 0.50).setDepth(300)
      .setAlpha(on0 ? 1 : 0.5).setInteractive({ useHandCursor: true });
    this._musicLbl = this.add.text(0, 0, on0 ? '♪' : '♪̷', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffe8c8',
    }).setOrigin(0.5).setDepth(301);
    this._musicCircle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      if (this.ambient) {
        this.ambient.start();
        const on = this.ambient.toggle();
        this._musicCircle.setAlpha(on ? 1 : 0.5);
        this._musicLbl.setText(on ? '♪' : '♪̷');
      }
    });

    this._buildTooltip();
  }

  _buildTooltip() {
    const style = (size, col, bold) => ({
      fontFamily: 'Georgia, serif', fontSize: size + 'px', color: col,
      fontStyle: bold ? 'bold' : 'normal',
    });
    this._ttBg      = this.add.graphics().setDepth(600).setVisible(false);
    this._ttName    = this.add.text(0, 0, '', style(15, '#f5e8cc', true)).setDepth(601).setVisible(false);
    this._ttAlliance= this.add.text(0, 0, '', style(11, '#ffffff', false)).setDepth(601).setVisible(false);
    this._ttPop     = this.add.text(0, 0, '', style(11, '#a08858', false)).setDepth(601).setVisible(false);
  }

  _showTooltip(node, sx, sy) {
    const PAD  = 11;
    const TW   = 178;
    const TH   = 76;
    const fac  = FACTION[node.faction];
    const facHex = '#' + fac.color.toString(16).padStart(6, '0');

    // Position above + slightly right of the pointer; clamp to screen
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    let tx = sx + 14;
    let ty = sy - TH - 14;
    if (tx + TW > W - 6) tx = sx - TW - 14;
    ty = Phaser.Math.Clamp(ty, 6, H - TH - 6);

    this._ttBg.clear().setVisible(true);
    this._ttBg.fillStyle(0x0c0906, 0.94);
    this._ttBg.fillRoundedRect(tx, ty, TW, TH, 5);
    this._ttBg.lineStyle(1, fac.color, 0.65);
    this._ttBg.strokeRoundedRect(tx, ty, TW, TH, 5);
    // thin rule under name
    this._ttBg.lineStyle(1, 0x9a7038, 0.30);
    this._ttBg.lineBetween(tx + PAD, ty + PAD + 18, tx + TW - PAD, ty + PAD + 18);

    this._ttName.setText(node.name)
      .setPosition(tx + PAD, ty + PAD).setVisible(true);
    this._ttAlliance.setText('● ' + fac.name)
      .setColor(facHex).setPosition(tx + PAD, ty + PAD + 24).setVisible(true);
    this._ttPop.setText('Pop. ' + node.population.toLocaleString())
      .setPosition(tx + PAD, ty + PAD + 42).setVisible(true);
  }

  _hideTooltip() {
    this._ttBg?.setVisible(false);
    this._ttName?.setVisible(false);
    this._ttAlliance?.setVisible(false);
    this._ttPop?.setVisible(false);
  }

  // ── Camera split ─────────────────────────────────────────────────────────
  // Must be called after _buildNodes() and _buildChrome() so all objects exist.

  _setupCameras() {
    const { width: W, height: H } = this.cameras.main;

    // uiCam — overlay camera, zoom always 1, never scrolls.
    // Phaser's camera.ignore() also gates input hit-testing for that camera,
    // so UI buttons correctly resolve against uiCam's fixed transform.
    this.uiCam = this.cameras.add(0, 0, W, H);
    this.uiCam.transparent = true; // no solid background — composites on top of main

    // World-space objects: scrolls and zooms with cameras.main
    const worldObjs = [
      this._tileL, this._tileC, this._tileR,
      this._bgL, this._bgC, this._bgR,
      this._seamGfx,
      this.nodeSymG, this.selRing,
      ...(this._regionLabels || []),
      ...this.nodeObjs.flatMap(({ copies }) =>
        copies.flatMap(c => [c.glow, c.shadow, c.sprite, c.zone].filter(Boolean))),
    ].filter(Boolean);

    // Screen-space UI chrome: fixed size, rendered by uiCam only
    const uiObjs = [
      this.minimapG, this.infoBgG,
      this.titleTxt, this.subtitleTxt, this.backBtn,
      this.infoName, this.infoStatus, this.infoDesc,
      this.actBtn, this.actLabel,
      this.mmLbl, this.mmZone,
      this._musicCircle, this._musicLbl,
      this._mmBgImg,
      this._ttBg, this._ttName, this._ttAlliance, this._ttPop,
    ].filter(Boolean);

    // Each camera renders — and accepts input for — only its own layer
    this.cameras.main.ignore(uiObjs);
    this.uiCam.ignore(worldObjs);
  }

  // ── Audio ─────────────────────────────────────────────────────────────────

  _createAudio() {
    if (!this.game.audio) this.game.audio = new AudioManager();
    this.ambient = this.game.audio;
    this.ambient.prepare();
    this.ambient.setMusicState('residency');
    this.ambient.setAmbience('map');
    const start = () => this.ambient.start();
    this.input.once('pointerdown', start);
    this.input.keyboard.once('keydown', start);
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  _layout() {
    const cam = this.cameras.main;
    const W = cam.width, H = cam.height;
    const PH = 150;
    const PW = Math.min(W - 24, 660);
    const PX = W / 2;
    const PY = H - 8;

    this.titleTxt.setPosition(W / 2, 14);
    this.subtitleTxt.setPosition(W / 2, 42);
    this.backBtn.setPosition(18, 14);

    // Info panel bg
    this.infoBgG.clear();
    this.infoBgG.fillStyle(0x0e0b07, 0.93);
    this.infoBgG.fillRect(PX - PW / 2, PY - PH, PW, PH);
    this.infoBgG.lineStyle(1, 0x9a7038, 0.48);
    this.infoBgG.strokeRect(PX - PW / 2, PY - PH, PW, PH);

    const left = PX - PW / 2 + 18;
    const top  = PY - PH + 16;
    this.infoName.setPosition(left, top);
    this.infoStatus.setPosition(left, top + 27);
    this.infoDesc.setPosition(left, top + 47).setWordWrapWidth(PW - 230);
    const bx = PX + PW / 2 - 108;
    const by = PY - PH / 2;
    this.actBtn.setPosition(bx, by); this.actLabel.setPosition(bx, by);

    // Minimap
    const mmX = W - MM_W - 14;
    const mmY = 68;
    this._mmX = mmX; this._mmY = mmY;
    this.mmLbl.setPosition(mmX + MM_W / 2, mmY + MM_H + 3);
    this.mmZone.setPosition(mmX + MM_W / 2, mmY + MM_H / 2);
    if (this._mmBgImg) this._mmBgImg.setPosition(mmX, mmY).setDisplaySize(MM_W, MM_H);

    // Keep the geometry mask in sync with the minimap position
    this.minimapMaskGfx.clear();
    this.minimapMaskGfx.fillStyle(0xffffff);
    this.minimapMaskGfx.fillRect(mmX, mmY, MM_W, MM_H);

    // Music
    this._musicCircle.setPosition(W - 34, H - PH - 36);
    this._musicLbl.setPosition(W - 34, H - PH - 36);
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  refreshSelection() {
    const { node } = this.nodeObjs[this.selected];
    const f = FACTION[node.faction];
    this.infoName.setText(node.name)
      .setColor(Phaser.Display.Color.IntegerToColor(f.color).rgba);
    this.infoStatus.setText(f.status).setColor('#9a8670');
    this.infoDesc.setText(node.desc);
    this.actLabel.setText(node.label);
    const locked = node.action === 'locked';
    const hideBtn = node.action === 'home';
    this.actBtn.setVisible(!hideBtn);
    this.actLabel.setVisible(!hideBtn);
    this.actBtn.setFillStyle(locked ? 0x1e1810 : 0x2a1e10, 1);
    this.actBtn.setStrokeStyle(1, locked ? 0x6a5a3a : 0xc8a050, locked ? 0.30 : 0.70);
    this.actLabel.setColor(locked ? '#7a6a4a' : '#ffe8c8');
    this._drawSelRing();
  }

  _drawSelRing() {
    const { node } = this.nodeObjs[this.selected];
    this.selRing.clear();
    const rw = 38, rh = 24; // ellipse semi-axes — wider than tall
    [-WORLD_W, 0, WORLD_W].forEach(off => {
      const x = node.wx + off, y = node.wy;
      this.selRing.lineStyle(2, 0xffe8c8, 0.80);
      this.selRing.strokeEllipse(x, y, rw * 2, rh * 2);
      // Cardinal tick marks along the ellipse perimeter
      this.selRing.lineStyle(2, 0xffe8c8, 0.50);
      for (let i = 0; i < 4; i++) {
        const a  = (i / 4) * Math.PI * 2;
        const ex = rw * Math.cos(a), ey = rh * Math.sin(a);
        const len = 9;
        // Outward normal direction for the ellipse at this angle
        const nx = Math.cos(a), ny = Math.sin(a);
        this.selRing.lineBetween(
          x + ex, y + ey,
          x + ex + nx * len, y + ey + ny * len);
      }
    });
  }

  cycle(dir) {
    this.selected = (this.selected + dir + NODES.length) % NODES.length;
    this.refreshSelection();
    this._panToNode(this.nodeObjs[this.selected].node);
  }

  act() {
    if (this.time.now < this.inputReadyAt) return;
    const { node } = this.nodeObjs[this.selected];
    if (node.action === 'home')            this.goHome();
    else if (node.action === 'expedition') this.goTo('ExpeditionScene');
    else                                   this._flashLocked();
  }

  _flashLocked() {
    this.cameras.main.shake(180, 0.004);
    this.infoStatus.setText('Too strong — win the Shadmen first.').setColor('#e0503c');
    this.time.delayedCall(2200, () => {
      const f = FACTION[this.nodeObjs[this.selected].node.faction];
      this.infoStatus.setText(f.status).setColor('#9a8670');
    });
  }

  goHome() {
    // Always return to the Communications room — that's where the map is accessed from.
    this.cameras.main.fadeOut(400, 6, 4, 12);
    this.uiCam?.fadeOut(400, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('ResidencyScene', { startRoom: 'comms' }));
  }

  goTo(scene) {
    this.cameras.main.fadeOut(400, 6, 4, 12);
    this.uiCam?.fadeOut(400, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // ── Minimap (updated each frame) ─────────────────────────────────────────

  _updateMinimap() {
    const cam = this.cameras.main;
    const g   = this.minimapG;
    const mx  = this._mmX || 0, my = this._mmY || 0;
    g.clear();

    // Background + terrain — use painted image if loaded, else procedural sketch
    if (!this._mmBgImg) {
      g.fillStyle(0x4a3820, 1); g.fillRect(mx, my, MM_W, MM_H);
      SAND_SEAS.forEach(([cfx, cfy, rw, rh, col, seed]) => {
        g.fillStyle(col, 0.95);
        this._sandPoly(g, mx + cfx * MM_W, my + cfy * MM_H, rw * MM_W * 0.5, rh * MM_H * 0.5, seed);
      });
      ROCK_PLATEAUS.forEach(([cfx, cfy, rw, rh, seed]) => {
        g.fillStyle(0x2e2418, 1);
        this._organicPoly(g, mx + cfx * MM_W, my + cfy * MM_H, rw * MM_W, rh * MM_H, seed);
      });
    }


    // Viewport rectangle — may span the wrap seam, draw up to 2 rects
    const vw = (cam.width  / WORLD_W) * MM_W;
    const vh = (cam.height / WORLD_H) * MM_H;
    const vx = mx + ((cam.scrollX % WORLD_W + WORLD_W) % WORLD_W / WORLD_W) * MM_W;
    const vy = my + (cam.scrollY / WORLD_H) * MM_H;

    g.lineStyle(1.5, 0xffe8c8, 0.65);
    if (vx + vw <= mx + MM_W) {
      g.strokeRect(vx, vy, vw, vh);
    } else {
      // Rect wraps around east edge — draw two partial rects
      const w1 = mx + MM_W - vx;
      const w2 = vw - w1;
      g.strokeRect(vx,  vy, w1, vh);
      g.strokeRect(mx, vy, w2, vh);
    }

    // ── Minimap cartographic frame ────────────────────────────────────────
    // Outer bright border
    g.lineStyle(2, 0xc8a050, 0.85);
    g.strokeRect(mx, my, MM_W, MM_H);
    // Inner faint double-line
    g.lineStyle(1, 0x9a7038, 0.32);
    g.strokeRect(mx + 4, my + 4, MM_W - 8, MM_H - 8);
    // Corner tick marks — matches the main map border aesthetic
    const tk = 6;
    g.lineStyle(1.5, 0xc8a050, 0.65);
    [[mx, my], [mx + MM_W, my], [mx, my + MM_H], [mx + MM_W, my + MM_H]].forEach(([cx, cy]) => {
      const sx = cx === mx ? 1 : -1;
      const sy = cy === my ? 1 : -1;
      g.lineBetween(cx, cy, cx + sx * tk, cy);
      g.lineBetween(cx, cy, cx, cy + sy * tk);
    });
  }

  // ── Keys ─────────────────────────────────────────────────────────────────

  _setupKeys() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.tabKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.escKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.entKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────


  // ── Update ────────────────────────────────────────────────────────────────

  update() {
    this._updateMinimap();
    this._wrapCamera();

    // Keyboard pan (arrows)
    const cam   = this.cameras.main;
    const speed = 10;
    if (this.cursors.left.isDown)  {
      cam.scrollX = ((cam.scrollX - speed) % WORLD_W + WORLD_W) % WORLD_W;
    }
    if (this.cursors.right.isDown) {
      cam.scrollX = ((cam.scrollX + speed) % WORLD_W + WORLD_W) % WORLD_W;
    }
    if (this.cursors.up.isDown)    cam.scrollY = Math.max(0, cam.scrollY - speed);
    if (this.cursors.down.isDown)  {
      cam.scrollY = Math.min(Math.max(0, WORLD_H - cam.height), cam.scrollY + speed);
    }

    // Tab → cycle, Enter → act, Esc → go home
    if (Phaser.Input.Keyboard.JustDown(this.tabKey)) this.cycle(1);
    if (Phaser.Input.Keyboard.JustDown(this.entKey)) this.act();
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) this.goHome();
  }
}
