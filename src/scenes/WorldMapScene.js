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

// Zoom limits
// ZOOM_FLOOR: the game design height is 720. At zoom = 720/WORLD_H the
// world fills the viewport exactly.  Add 8% margin so floating-point
// rounding can never reveal a black bar above or below the terrain.
const ZOOM_FLOOR = (720 / WORLD_H) * 1.08; // ≈ 0.38 at WORLD_H=2048
const ZOOM_MAX   = 2.0;
const ZOOM_SPD   = 0.0012;

// Drag threshold (px) before we commit to a pan (not a click)
const DRAG_THR = 7;

// Escarpment: [fracX, fracY] across one tile.
// Left-edge (0,0.55) and right-edge (1.0,0.55) MATCH so the tile loops.
const ESC_FRACS = [
  [0.00, 0.55], [0.04, 0.52], [0.09, 0.57], [0.14, 0.53], [0.20, 0.58],
  [0.26, 0.54], [0.32, 0.59], [0.39, 0.55], [0.46, 0.51], [0.53, 0.56],
  [0.60, 0.52], [0.67, 0.57], [0.74, 0.53], [0.81, 0.58], [0.88, 0.54],
  [0.94, 0.57], [1.00, 0.55],
];

const FACTION = {
  calder:  { color: 0x6fb0ff, status: 'Held — House Calder' },
  shadmen: { color: 0xffce86, status: 'Unmet — First Contact awaits' },
  vorrin:  { color: 0xe05030, status: 'Enemy — House Vorrin' },
};

// Nodes in world space.  All wrapped at ±WORLD_W automatically.
const NODES = [
  {
    key: 'saltspire', name: 'Saltspire', faction: 'calder', type: 'city',
    wx: 580, wy: 920,
    desc: 'The capital of Aridun. Seat of House Calder — your Residency.',
    action: 'home', label: '‹ Return to Communications',
  },
  {
    key: 'hollow', name: "Tamir's Hollow", faction: 'shadmen', type: 'hollow',
    wx: 2048, wy: 1180,
    desc: "A Shadmen Hollow carved into the rockbed at the bluff edge. Tamir's people watch from the stone. Ride out and make first contact.",
    action: 'expedition', label: 'Ride out  (Corsair)',
  },
  {
    key: 'ashmaw', name: 'Ashmaw', faction: 'vorrin', type: 'fort',
    wx: 3100, wy: 640,
    desc: "A Vorrin watchpost deep in the Keth Rockbed. Boring rigs run day and night. Too strong to assault — win the Shadmen first.",
    action: 'locked', label: 'Assault  (locked)',
  },
];

const ROUTES = [
  ['saltspire', 'hollow'],
  ['saltspire', 'ashmaw'],
];

export default class WorldMapScene extends Phaser.Scene {
  constructor() { super('WorldMapScene'); }

  // ── Boot ─────────────────────────────────────────────────────────────────

  create() {
    this.escPts    = ESC_FRACS.map(([fx, fy]) => [fx * WORLD_W, fy * WORLD_H]);
    this.selected  = 0;
    this.isDrag    = false;

    // Build the terrain tile once into a texture so we can repeat it cheaply
    this._buildTerrainTexture();

    // Layer order
    this.routesG   = this.add.graphics().setDepth(1);
    this.nodeSymG  = this.add.graphics().setDepth(3);
    this.selRing   = this.add.graphics().setDepth(11);
    this.minimapG  = this.add.graphics().setScrollFactor(0).setDepth(500);
    this.infoBgG   = this.add.graphics().setScrollFactor(0).setDepth(200);

    this._buildNodes();
    this._buildChrome();
    this._setupCamera();
    this._setupDrag();
    this._setupZoom();
    this._setupKeys();
    this._createAudio();
    this._layout();
    this.refreshSelection();

    this.cameras.main.fadeIn(500, 6, 4, 12);
    this.inputReadyAt = this.time.now + 500;
    this.input.keyboard.on('keydown-K', () => togglePainterly(this));
    this.scale.on('resize', () => this._layout(), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off('resize', this._layout, this));
  }

  // ── Terrain ───────────────────────────────────────────────────────────────

  _buildTerrainTexture() {
    // Draw one tile of terrain into a Graphics object, bake to a RenderTexture
    // so we can repeat it (3 copies east-west) for a seamless wrap.
    const g = this.add.graphics();
    this._drawTerrainTile(g, 0);

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

    // Region labels (world-space text, duplicated for each tile)
    this._makeRegionLabels();
  }

  _drawTerrainTile(g, xOff) {
    const W = WORLD_W, H = WORLD_H;
    const x0 = xOff;
    const esc = this.escPts;

    // Void bg
    g.fillStyle(0x080604, 1);
    g.fillRect(x0, 0, W, H);

    // ── Polar ridge ───────────────────────────────────────────────────────
    g.fillStyle(0x100c08, 1);
    g.fillRect(x0, 0, W, H * 0.13);
    for (let i = 0; i < 24; i++) {
      const fy  = (i / 24) * H * 0.13;
      const lx  = x0 + ((Math.sin(i * 2.7) * 0.15) + 0.5) * W;
      g.lineStyle(1, 0x3a2c1c, 0.18 + Math.abs(Math.sin(i * 1.7)) * 0.12);
      g.lineBetween(lx - W * 0.35, fy, lx + W * 0.45, fy + 14);
    }
    // Top vignette
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x000000, 0.28 * (1 - i / 10));
      g.fillRect(x0, 0, W, H * 0.015 * (10 - i));
    }

    // ── Dune sea fill (below escarpment) ──────────────────────────────────
    g.fillStyle(0x2c1e0e, 1);
    g.beginPath();
    g.moveTo(x0, H); g.lineTo(x0 + W, H);
    for (let i = esc.length - 1; i >= 0; i--) g.lineTo(x0 + esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Warm band near bluff base
    const escMinY = Math.min(...esc.map(p => p[1]));
    g.fillStyle(0x3e2810, 0.38);
    g.beginPath();
    g.moveTo(x0, H); g.lineTo(x0 + W, H);
    g.lineTo(x0 + W, escMinY + H * 0.22); g.lineTo(x0, escMinY + H * 0.22);
    g.closePath(); g.fillPath();

    // Deep desert darkening (bottom 20%)
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0x060400, 0.15 * (i / 12));
      g.fillRect(x0, H * (0.80 + i * 0.017), W, H * 0.017 + 1);
    }

    // Dune ripple lines
    for (let w = 0; w < 56; w++) {
      const t      = (w + 1) / 57;
      const baseY  = escMinY + 24 + t * (H - escMinY) * 0.88;
      if (baseY >= H - 4) continue;
      const freq   = 0.0020 + t * 0.001;
      const amp    = 8 - t * 4;
      const crest  = w % 2 === 0;
      const alpha  = (crest ? 0.22 : 0.10) * (1 - t * 0.42) * (baseY < H * 0.82 ? 1 : 0.45);
      g.lineStyle(1, crest ? 0xb07828 : 0x6e3e12, alpha);
      g.beginPath();
      for (let px = 0; px <= W; px += 6) {
        const py = baseY + Math.sin(px * freq + w * 1.3) * amp;
        if (px === 0) g.moveTo(x0 + px, py); else g.lineTo(x0 + px, py);
      }
      g.strokePath();
    }

    // ── Keth Rockbed fill (above escarpment) ─────────────────────────────
    g.fillStyle(0x1a1208, 1);
    g.beginPath();
    g.moveTo(x0, 0); g.lineTo(x0 + W, 0);
    for (let i = esc.length - 1; i >= 0; i--) g.lineTo(x0 + esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Rock-formation hill marks
    const seeds = [
      [0.03,0.19],[0.07,0.32],[0.11,0.16],[0.15,0.42],[0.19,0.26],
      [0.23,0.17],[0.27,0.46],[0.31,0.30],[0.35,0.19],[0.38,0.50],
      [0.42,0.24],[0.46,0.38],[0.50,0.15],[0.53,0.44],[0.57,0.28],
      [0.61,0.18],[0.64,0.43],[0.68,0.23],[0.72,0.36],[0.75,0.15],
      [0.78,0.47],[0.82,0.21],[0.85,0.38],[0.88,0.17],[0.92,0.44],
      [0.95,0.27],[0.98,0.14],[0.05,0.47],[0.13,0.49],[0.21,0.50],
      [0.30,0.48],[0.40,0.51],[0.50,0.49],[0.59,0.47],[0.70,0.50],
      [0.80,0.48],[0.90,0.51],
    ];
    seeds.forEach(([fx, fy]) => {
      const rx    = x0 + fx * W;
      const ry    = fy * H;
      const escY  = this.escYAt(fx * W);
      if (ry > escY - 22) return;
      const s = 10 + Math.abs(Math.sin(fx * 19 + fy * 13)) * 7;
      const a = 0.38 + Math.abs(Math.sin(fx * 7.1)) * 0.22;
      g.lineStyle(1, 0x8a6030, a);
      g.beginPath();
      g.moveTo(rx - s * 0.85, ry + s * 0.65);
      g.lineTo(rx - s * 0.08, ry - s * 0.90);
      g.lineTo(rx + s * 0.58, ry + s * 0.65);
      g.strokePath();
      g.lineStyle(1, 0x8a6030, a * 0.60);
      g.beginPath();
      g.moveTo(rx + s * 0.38, ry + s * 0.65);
      g.lineTo(rx + s * 0.95, ry - s * 0.42);
      g.lineTo(rx + s * 1.60, ry + s * 0.65);
      g.strokePath();
    });

    // Faction washes
    g.fillStyle(0x2050a0, 0.060);
    g.fillRect(x0, 0, W * 0.28, H * 0.62);
    g.fillStyle(0xc02010, 0.055);
    g.fillRect(x0 + W * 0.62, 0, W * 0.38, H * 0.60);
    g.fillStyle(0xc09010, 0.045);
    g.fillEllipse(x0 + W * 0.50, H * 0.57, W * 0.38, H * 0.26);

    // Vorrin boring-rig markers
    [[0.65,0.16],[0.71,0.28],[0.77,0.14],[0.83,0.31],[0.89,0.20]].forEach(([fx,fy]) => {
      const rx = x0 + fx * W, ry = fy * H;
      if (ry > this.escYAt(fx * W) - 12) return;
      g.lineStyle(1, 0xe05030, 0.26);
      g.strokeRect(rx - 5, ry - 5, 10, 10);
      g.lineBetween(rx - 9, ry, rx + 9, ry);
      g.lineBetween(rx, ry - 9, rx, ry + 9);
    });

    // ── Escarpment bluff edge ─────────────────────────────────────────────
    g.lineStyle(12, 0x060402, 0.65);
    g.beginPath();
    g.moveTo(x0 + esc[0][0], esc[0][1] + 8);
    esc.slice(1).forEach(p => g.lineTo(x0 + p[0], p[1] + 8));
    g.strokePath();
    g.lineStyle(3, 0xc09040, 0.95);
    g.beginPath();
    g.moveTo(x0 + esc[0][0], esc[0][1]);
    esc.slice(1).forEach(p => g.lineTo(x0 + p[0], p[1]));
    g.strokePath();
    // Hatch marks
    for (let i = 0; i < esc.length - 1; i++) {
      const steps = Math.floor((esc[i+1][0] - esc[i][0]) / 26);
      for (let j = 0; j <= steps; j++) {
        const hx  = esc[i][0] + j * 26;
        const hy  = this.escYAt(hx);
        const len = 5 + (j % 3) * 3;
        g.lineStyle(1, 0xa07840, 0.20);
        g.lineBetween(x0 + hx, hy + 1, x0 + hx + 2, hy + len);
      }
    }

    // ── Cartographic border ───────────────────────────────────────────────
    g.lineStyle(2, 0x9a7038, 0.65);
    g.strokeRect(x0 + 4, 4, W - 8, H - 8);
    g.lineStyle(1, 0x9a7038, 0.22);
    g.strokeRect(x0 + 10, 10, W - 20, H - 20);
    // Top/bottom ticks
    for (let i = 0; i <= 40; i++) {
      const tx = x0 + 4 + (i / 40) * (W - 8);
      g.lineStyle(1, 0x9a7038, 0.28);
      g.lineBetween(tx, 4, tx, 14); g.lineBetween(tx, H - 4, tx, H - 14);
    }
    // Side ticks
    for (let i = 0; i <= 24; i++) {
      const ty = 4 + (i / 24) * (H - 8);
      g.lineStyle(1, 0x9a7038, 0.28);
      g.lineBetween(x0 + 4, ty, x0 + 14, ty); g.lineBetween(x0 + W - 4, ty, x0 + W - 14, ty);
    }

    // No edge fade — the cartographic border lines at x=0 and x=W already
    // provide a natural visual seam that reads as a map frame, not a glitch.
  }

  _makeRegionLabels() {
    (this._regionLabels || []).forEach(t => t.destroy());
    this._regionLabels = [];

    const lbl = (wx, wy, txt, size, color, alpha, style) => {
      // Place at canonical wx AND at wx±WORLD_W for seamless wrap display
      [-WORLD_W, 0, WORLD_W].forEach(offset => {
        const t = this.add.text(wx + offset, wy, txt, {
          fontFamily: 'Georgia, serif',
          fontStyle: style || 'italic',
          fontSize: `${size}px`,
          color,
        }).setOrigin(0.5).setAlpha(alpha).setDepth(-20);
        this._regionLabels.push(t);
      });
    };

    lbl(WORLD_W * 0.50, WORLD_H * 0.32, 'ARIDUN',             130, '#7a5428', 0.06, 'bold italic');
    lbl(WORLD_W * 0.14, WORLD_H * 0.08, 'POLAR RIDGE',         14, '#b08040', 0.34);
    lbl(WORLD_W * 0.14, WORLD_H * 0.24, 'CALDER HOLD',         13, '#80b0e8', 0.44);
    lbl(WORLD_W * 0.76, WORLD_H * 0.13, 'KETH ROCKBED',        14, '#d4a860', 0.52);
    lbl(WORLD_W * 0.50, WORLD_H * 0.74, 'THE GREAT DUNE SEA',  18, '#d4a860', 0.48);
    lbl(WORLD_W * 0.82, WORLD_H * 0.89, 'DEEP DESERT',         13, '#9a7040', 0.30);
    lbl(WORLD_W * 0.04, WORLD_H * 0.66, 'WESTERN MARGIN',      11, '#7a6030', 0.20);
    // Compass N (world-space, wraps with tile)
    [-WORLD_W, 0, WORLD_W].forEach(off => {
      const c = this.add.text(WORLD_W + off - 40, 38, 'N', {
        fontFamily: 'Georgia, serif', fontSize: '16px', color: '#b08040',
      }).setOrigin(0.5).setAlpha(0.50).setDepth(-20);
      this._regionLabels.push(c);
    });
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  _drawRoutes() {
    this.routesG.clear();
    this.routesG.lineStyle(1, 0xb09050, 0.32);
    // Draw routes across all 3 tiles so they always visible near seams
    [-WORLD_W, 0, WORLD_W].forEach(off => {
      ROUTES.forEach(([a, b]) => {
        const na = NODES.find(n => n.key === a);
        const nb = NODES.find(n => n.key === b);
        this._dashedLine(this.routesG,
          na.wx + off, na.wy, nb.wx + off, nb.wy, 11, 6);
      });
    });
  }

  _dashedLine(g, x1, y1, x2, y2, dash, gap) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = dx / len, ny = dy / len;
    let t = 0, on = true;
    while (t < len) {
      const seg = Math.min(on ? dash : gap, len - t);
      if (on) g.lineBetween(
        x1 + nx * t, y1 + ny * t,
        x1 + nx * (t + seg), y1 + ny * (t + seg));
      t += seg; on = !on;
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────
  // Each node exists on all 3 tile copies so it's always visible.

  _buildNodes() {
    this.nodeObjs = NODES.map((node, idx) => {
      const color = FACTION[node.faction].color;
      const copies = []; // one entry per tile copy

      [-WORLD_W, 0, WORLD_W].forEach(off => {
        const nx = node.wx + off;

        const glow = this.add.image(nx, node.wy, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD).setTint(color)
          .setDisplaySize(110, 110).setAlpha(0.30).setDepth(2);

        const zone = this.add.circle(nx, node.wy, 26, 0xffffff, 0)
          .setInteractive({ useHandCursor: true }).setDepth(7);

        const label = this.add.text(nx, node.wy + 22, node.name, {
          fontFamily: 'Georgia, serif', fontSize: '13px', color: '#e8d8b8',
        }).setOrigin(0.5, 0).setDepth(8);

        zone.on('pointerdown', (p, lx, ly, e) => {
          e?.stopPropagation();
          this.time.delayedCall(20, () => {
            if (this.isDrag) return;
            if (this.selected === idx) { this.act(); }
            else { this.selected = idx; this.refreshSelection(); this._panToNode(node); }
          });
        });

        copies.push({ glow, zone, label, nx, off });
      });

      this.tweens.add({
        targets: copies.map(c => c.glow),
        alpha: { from: 0.20, to: 0.50 },
        duration: 1900 + idx * 380, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      this._drawNodeSymbol(this.nodeSymG, node.wx, node.wy, node);
      [-WORLD_W, WORLD_W].forEach(off =>
        this._drawNodeSymbol(this.nodeSymG, node.wx + off, node.wy, node));

      return { node, copies };
    });

    this._drawRoutes();
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
    cam.zoom = Math.max(1.20, ZOOM_FLOOR);
    // Centre on Saltspire
    this._setCamWorld(NODES[0].wx, NODES[0].wy);
  }

  // Set camera to look at world position (wx, wy), accounting for zoom & wrap
  _setCamWorld(wx, wy) {
    const cam = this.cameras.main;
    const vw  = cam.width  / cam.zoom;
    const vh  = cam.height / cam.zoom;
    cam.scrollX = wx - vw / 2;
    cam.scrollY = Phaser.Math.Clamp(wy - vh / 2, 0, WORLD_H - vh);
    this._wrapCamera();
  }

  // Clamp / wrap the camera so it always looks at a valid slice of the tiled world.
  // scrollX wraps modulo WORLD_W; scrollY is clamped pole-to-pole.
  _wrapCamera() {
    const cam  = this.cameras.main;
    if (cam.zoom < ZOOM_FLOOR) cam.zoom = ZOOM_FLOOR;
    const vh   = cam.height / cam.zoom;
    // Horizontal wrap — tiles endlessly, no clamping needed
    cam.scrollX = ((cam.scrollX % WORLD_W) + WORLD_W) % WORLD_W;
    // Vertical clamp — poles are hard edges
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, WORLD_H - vh));
  }

  // Pan camera smoothly to the node that's nearest the current viewport centre
  _panToNode(node) {
    const cam    = this.cameras.main;
    const vw     = cam.width  / cam.zoom;
    const vh     = cam.height / cam.zoom;
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
      cam.scrollX = ((camX - dx / cam.zoom) % WORLD_W + WORLD_W) % WORLD_W;
      cam.scrollY = Phaser.Math.Clamp(camY - dy / cam.zoom, 0,
        Math.max(0, WORLD_H - cam.height / cam.zoom));
    });

    this.input.on('pointerup', () => {
      this.time.delayedCall(20, () => { this.isDrag = false; });
    });
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────

  _setupZoom() {
    this.input.on('wheel', (pointer, objs, dx, dy) => {
      const cam    = this.cameras.main;
      const oldZ   = cam.zoom;
      const newZ   = Phaser.Math.Clamp(oldZ * (1 - dy * ZOOM_SPD), ZOOM_FLOOR, ZOOM_MAX);
      if (newZ === oldZ) return;

      // Zoom toward the cursor
      const worldX = cam.scrollX + pointer.x / oldZ;
      const worldY = cam.scrollY + pointer.y / oldZ;
      cam.zoom = newZ;
      cam.scrollX = ((worldX - pointer.x / newZ) % WORLD_W + WORLD_W) % WORLD_W;
      cam.scrollY = Phaser.Math.Clamp(
        worldY - pointer.y / newZ,
        0, Math.max(0, WORLD_H - cam.height / newZ));

      if (this._zoomTxt) this._zoomTxt.setText(`${Math.round(newZ * 100)}%`);
    });
  }

  // ── Chrome / UI ───────────────────────────────────────────────────────────

  _buildChrome() {
    const SF = 0;
    this.titleTxt    = this.add.text(0, 0, 'ARRADIUS', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#f0e3d0',
    }).setOrigin(0.5, 0).setScrollFactor(SF).setDepth(300);

    this.subtitleTxt = this.add.text(0, 0, 'the War Map · Aridun', {
      fontFamily: 'Georgia, serif', fontStyle: 'italic',
      fontSize: '13px', color: '#b09070',
    }).setOrigin(0.5, 0).setScrollFactor(SF).setDepth(300);

    this.backBtn = this.add.text(0, 0, '‹ Communications', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe8c8',
      backgroundColor: '#1a1010', padding: { x: 10, y: 6 },
    }).setScrollFactor(SF).setDepth(300).setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerover', () => this.backBtn.setColor('#ffffff'));
    this.backBtn.on('pointerout',  () => this.backBtn.setColor('#ffe8c8'));
    this.backBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.goHome(); });

    this.hintTxt = this.add.text(0, 0,
      'drag to pan  ·  scroll to zoom  ·  Tab to cycle nodes', {
        fontFamily: 'monospace', fontSize: '11px', color: '#6a5a3a',
      }).setOrigin(0.5, 1).setScrollFactor(SF).setDepth(300);

    // Zoom indicator
    this._zoomTxt = this.add.text(0, 0, '55%', {
      fontFamily: 'monospace', fontSize: '11px', color: '#7a6a4a',
    }).setOrigin(0, 0).setScrollFactor(SF).setDepth(300);

    // Info panel
    this.infoName   = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontSize: '19px',
    }).setScrollFactor(SF).setOrigin(0, 0).setDepth(301);
    this.infoStatus = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px',
    }).setScrollFactor(SF).setOrigin(0, 0).setDepth(301);
    this.infoDesc   = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontStyle: 'italic',
      fontSize: '13px', color: '#c8b898',
    }).setScrollFactor(SF).setOrigin(0, 0).setDepth(301);
    this.actBtn   = this.add.rectangle(0, 0, 192, 40, 0x2a1e10, 1)
      .setStrokeStyle(1, 0xc8a050, 0.70).setScrollFactor(SF).setOrigin(0.5).setDepth(301)
      .setInteractive({ useHandCursor: true });
    this.actLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe8c8',
    }).setScrollFactor(SF).setOrigin(0.5).setDepth(302);
    this.actBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.act(); });

    // Minimap label & click zone
    this.mmLbl  = this.add.text(0, 0, 'ARIDUN', {
      fontFamily: 'monospace', fontSize: '9px', color: '#7a6030',
    }).setScrollFactor(SF).setOrigin(0.5, 0).setDepth(510);
    this.mmZone = this.add.rectangle(0, 0, MM_W, MM_H, 0xffffff, 0)
      .setScrollFactor(SF).setDepth(511).setInteractive({ useHandCursor: true });
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
      .setStrokeStyle(2, 0xc8a050, 0.50).setScrollFactor(SF).setDepth(300)
      .setAlpha(on0 ? 1 : 0.5).setInteractive({ useHandCursor: true });
    this._musicLbl = this.add.text(0, 0, on0 ? '♪' : '♪̷', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffe8c8',
    }).setScrollFactor(SF).setOrigin(0.5).setDepth(301);
    this._musicCircle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      if (this.ambient) {
        this.ambient.start();
        const on = this.ambient.toggle();
        this._musicCircle.setAlpha(on ? 1 : 0.5);
        this._musicLbl.setText(on ? '♪' : '♪̷');
      }
    });
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
    this.hintTxt.setPosition(W / 2, H - PH - 8);
    this._zoomTxt.setPosition(18, H - PH - 24);

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
    this.actBtn.setFillStyle(locked ? 0x1e1810 : 0x2a1e10, 1);
    this.actBtn.setStrokeStyle(1, locked ? 0x6a5a3a : 0xc8a050, locked ? 0.30 : 0.70);
    this.actLabel.setColor(locked ? '#7a6a4a' : '#ffe8c8');
    this._drawSelRing();
  }

  _drawSelRing() {
    const { node } = this.nodeObjs[this.selected];
    this.selRing.clear();
    // Draw on all 3 tile copies so the ring is always visible
    [-WORLD_W, 0, WORLD_W].forEach(off => {
      const x = node.wx + off, y = node.wy;
      this.selRing.lineStyle(2, 0xffe8c8, 0.80);
      this.selRing.strokeCircle(x, y, 30);
      this.selRing.lineStyle(2, 0xffe8c8, 0.50);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        this.selRing.lineBetween(
          x + Math.cos(a) * 30, y + Math.sin(a) * 30,
          x + Math.cos(a) * 39, y + Math.sin(a) * 39);
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
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('ResidencyScene', { startRoom: 'comms' }));
  }

  goTo(scene) {
    this.cameras.main.fadeOut(400, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // ── Minimap (updated each frame) ─────────────────────────────────────────

  _updateMinimap() {
    const cam = this.cameras.main;
    const g   = this.minimapG;
    const mx  = this._mmX || 0, my = this._mmY || 0;
    g.clear();

    // Background + terrain sketch
    g.fillStyle(0x0a0806, 0.90); g.fillRect(mx, my, MM_W, MM_H);
    g.fillStyle(0x100c08, 1);    g.fillRect(mx, my, MM_W, MM_H * 0.13); // polar
    g.fillStyle(0x1a1208, 1);
    g.fillRect(mx, my + MM_H * 0.13, MM_W, MM_H * (0.55 - 0.13));       // rockbed
    g.fillStyle(0x2c1e0e, 1);
    g.fillRect(mx, my + MM_H * 0.55, MM_W, MM_H * 0.45);                // dune sea

    // Faction washes
    g.fillStyle(0x2050a0, 0.10); g.fillRect(mx, my, MM_W * 0.28, MM_H * 0.62);
    g.fillStyle(0xc02010, 0.08); g.fillRect(mx + MM_W * 0.62, my, MM_W * 0.38, MM_H * 0.60);

    // Escarpment sketch
    g.lineStyle(1, 0xc09040, 0.50);
    g.beginPath();
    ESC_FRACS.forEach(([fx, fy], i) => {
      if (i === 0) g.moveTo(mx + fx * MM_W, my + fy * MM_H);
      else         g.lineTo(mx + fx * MM_W, my + fy * MM_H);
    });
    g.strokePath();

    // Node dots
    NODES.forEach(node => {
      const col = FACTION[node.faction].color;
      const px  = mx + (node.wx / WORLD_W) * MM_W;
      const py  = my + (node.wy / WORLD_H) * MM_H;
      g.fillStyle(col, 0.85); g.fillCircle(px, py, 3.5);
      g.lineStyle(1, col, 0.38); g.strokeCircle(px, py, 5.5);
    });

    // Viewport rectangle — may span the wrap seam, draw up to 2 rects
    const vw = (cam.width  / cam.zoom / WORLD_W) * MM_W;
    const vh = (cam.height / cam.zoom / WORLD_H) * MM_H;
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

    g.lineStyle(1, 0x9a7038, 0.52); g.strokeRect(mx, my, MM_W, MM_H);
  }

  // ── Keys ─────────────────────────────────────────────────────────────────

  _setupKeys() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.tabKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.escKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.entKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  escYAt(worldX) {
    const pts = this.escPts;
    const x   = ((worldX % WORLD_W) + WORLD_W) % WORLD_W;
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i][0] && x <= pts[i + 1][0]) {
        const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
      }
    }
    return pts[pts.length - 1][1];
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update() {
    this._updateMinimap();
    this._wrapCamera();

    // Keyboard pan (arrows) — speed scales with zoom so feel is consistent
    const cam   = this.cameras.main;
    const speed = 10 / cam.zoom;
    if (this.cursors.left.isDown)  {
      cam.scrollX = ((cam.scrollX - speed) % WORLD_W + WORLD_W) % WORLD_W;
    }
    if (this.cursors.right.isDown) {
      cam.scrollX = ((cam.scrollX + speed) % WORLD_W + WORLD_W) % WORLD_W;
    }
    if (this.cursors.up.isDown)    cam.scrollY = Math.max(0, cam.scrollY - speed);
    if (this.cursors.down.isDown)  {
      cam.scrollY = Math.min(Math.max(0, WORLD_H - cam.height / cam.zoom), cam.scrollY + speed);
    }

    // Tab → cycle, Enter → act, Esc → go home
    if (Phaser.Input.Keyboard.JustDown(this.tabKey)) this.cycle(1);
    if (Phaser.Input.Keyboard.JustDown(this.entKey)) this.act();
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) this.goHome();

    // Zoom readout
    if (this._zoomTxt) {
      this._zoomTxt.setText(`zoom ${Math.round(cam.zoom * 100)}%`);
    }
  }
}
