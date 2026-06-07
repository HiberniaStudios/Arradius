import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager.js';
import { togglePainterly } from '../shaders/KuwaharaPostFX.js';

// ── World dimensions ──────────────────────────────────────────────────────
const WORLD_W = 2560;
const WORLD_H = 1440;

// ── Minimap ───────────────────────────────────────────────────────────────
const MM_W = 220;
const MM_H = Math.round(MM_W * WORLD_H / WORLD_W); // ≈ 123

// ── Escarpment — jagged bluff dividing rockbed from dune sea ──────────────
// Control points [fracX, fracY] of world dimensions
const ESC_FRACS = [
  [0.00, 0.55], [0.05, 0.52], [0.10, 0.57], [0.15, 0.53], [0.21, 0.58],
  [0.27, 0.54], [0.33, 0.59], [0.40, 0.55], [0.47, 0.52], [0.54, 0.56],
  [0.61, 0.53], [0.67, 0.58], [0.74, 0.54], [0.81, 0.57], [0.88, 0.53],
  [0.94, 0.56], [1.00, 0.54],
];

// ── Factions ──────────────────────────────────────────────────────────────
const FACTION = {
  calder:  { color: 0x6fb0ff, status: 'Held — House Calder' },
  shadmen: { color: 0xffce86, status: 'Unmet — First Contact awaits' },
  vorrin:  { color: 0xe05030, status: 'Enemy — House Vorrin' },
};

// ── Nodes in world space (wx, wy) ─────────────────────────────────────────
const NODES = [
  {
    key: 'saltspire', name: 'Saltspire', faction: 'calder', type: 'city',
    wx: 490, wy: 530,
    desc: 'The capital of Aridun. Seat of House Calder — your Residency.',
    action: 'home', label: 'Return to the Residency',
  },
  {
    key: 'hollow', name: "Tamir's Hollow", faction: 'shadmen', type: 'hollow',
    wx: 1300, wy: 800,
    desc: "A Shadmen Hollow carved into the rockbed at the bluff edge. Tamir's people watch from the stone. Ride out and make first contact.",
    action: 'expedition', label: 'Ride out  (Corsair)',
  },
  {
    key: 'ashmaw', name: 'Ashmaw', faction: 'vorrin', type: 'fort',
    wx: 1980, wy: 370,
    desc: "A Vorrin watchpost deep in the Keth Rockbed. Boring rigs run day and night. Too strong to assault — win the Shadmen first.",
    action: 'locked', label: 'Assault  (locked)',
  },
];

const ROUTES = [
  ['saltspire', 'hollow'],
  ['saltspire', 'ashmaw'],
];

// ── Drag threshold (px) — below this a pointer event is a click ───────────
const DRAG_THRESHOLD = 8;

export default class WorldMapScene extends Phaser.Scene {
  constructor() { super('WorldMapScene'); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create() {
    this.escPts   = ESC_FRACS.map(([fx, fy]) => [fx * WORLD_W, fy * WORLD_H]);
    this.selected = 0;
    this.isDragging = false;

    // World-space graphics layers
    this.terrainG  = this.add.graphics().setDepth(-100);
    this.routesG   = this.add.graphics().setDepth(-50);
    this.nodeSymG  = this.add.graphics().setDepth(2);
    this.selRing   = this.add.graphics().setDepth(10);

    // UI (viewport-fixed) graphics
    this.minimapG  = this.add.graphics().setScrollFactor(0).setDepth(500);
    this.infoBgG   = this.add.graphics().setScrollFactor(0).setDepth(200);

    this.drawTerrain();
    this.drawRoutes();
    this.buildNodes();
    this.buildChrome();
    this.setupCamera();
    this.setupDrag();
    this.setupInput();
    this.createAudio();
    this.layoutChrome();
    this.refreshSelection();

    this.cameras.main.fadeIn(500, 6, 4, 12);
    this.inputReadyAt = this.time.now + 500;
    this.input.keyboard.on('keydown-K', () => togglePainterly(this));
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off('resize', this.onResize, this));
  }

  // ── Camera & drag ─────────────────────────────────────────────────────────

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    // Start looking at Saltspire, left of centre
    cam.scrollX = Math.max(0, NODES[0].wx - cam.width  * 0.35);
    cam.scrollY = Math.max(0, NODES[0].wy - cam.height * 0.45);
  }

  setupDrag() {
    let startX = 0, startY = 0, camX = 0, camY = 0, moved = 0;

    this.input.on('pointerdown', (p) => {
      startX = p.x; startY = p.y; moved = 0;
      camX = this.cameras.main.scrollX;
      camY = this.cameras.main.scrollY;
      this.isDragging = false;
    });

    this.input.on('pointermove', (p) => {
      const dx = startX - p.x;
      const dy = startY - p.y;
      moved = Math.sqrt(dx * dx + dy * dy);
      if (moved > DRAG_THRESHOLD) {
        this.isDragging = true;
        this.cameras.main.scrollX = Phaser.Math.Clamp(camX + dx, 0, WORLD_W - this.cameras.main.width);
        this.cameras.main.scrollY = Phaser.Math.Clamp(camY + dy, 0, WORLD_H - this.cameras.main.height);
      }
    });

    this.input.on('pointerup', () => {
      // Give a tick before clearing so node pointerdown can read the flag
      this.time.delayedCall(16, () => { this.isDragging = false; });
    });
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.tabKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.escKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.entKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  // ── Terrain ───────────────────────────────────────────────────────────────

  drawTerrain() {
    const g = this.terrainG;
    const W = WORLD_W, H = WORLD_H;
    const esc = this.escPts;

    // ── Void background
    g.fillStyle(0x080604, 1);
    g.fillRect(0, 0, W, H);

    // ── Polar rock shelf (far north — 0 to 14% world height)
    g.fillStyle(0x100c08, 1);
    g.fillRect(0, 0, W, H * 0.14);
    // Fractured plate lines
    for (let i = 0; i < 18; i++) {
      const y  = (i / 18) * H * 0.14;
      const x0 = (Math.sin(i * 2.3) * 0.15 + 0.5) * W;
      g.lineStyle(1, 0x3a2c1c, 0.22 + Math.abs(Math.sin(i * 1.7)) * 0.14);
      g.lineBetween(x0 - W * 0.3, y, x0 + W * 0.4, y + 12);
    }
    // Top vignette
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.25 * (1 - i / 8));
      g.fillRect(0, 0, W, H * 0.02 * (8 - i));
    }

    // ── Dune sea fill (below escarpment)
    g.fillStyle(0x2c1e0e, 1);
    g.beginPath();
    g.moveTo(0, H); g.lineTo(W, H);
    g.lineTo(esc[esc.length - 1][0], esc[esc.length - 1][1]);
    for (let i = esc.length - 2; i >= 0; i--) g.lineTo(esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Warm band near escarpment base
    g.fillStyle(0x3e2810, 0.40);
    const escMinY = Math.min(...esc.map(p => p[1]));
    g.beginPath();
    g.moveTo(0, escMinY + H * 0.18); g.lineTo(W, escMinY + H * 0.18);
    g.lineTo(esc[esc.length - 1][0], esc[esc.length - 1][1]);
    for (let i = esc.length - 2; i >= 0; i--) g.lineTo(esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Deep desert darkening (bottom 20%)
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x060400, 0.18 * (i / 10));
      g.fillRect(0, H * (0.80 + i * 0.02), W, H * 0.02 + 1);
    }

    // Dune ripple lines
    for (let w = 0; w < 48; w++) {
      const t      = (w + 1) / 49;
      const baseY  = escMinY + 20 + t * (H - escMinY) * 0.88;
      if (baseY >= H - 4) continue;
      const freq   = 0.0028 + t * 0.0015;
      const amp    = 7 - t * 3.5;
      const crest  = w % 2 === 0;
      g.lineStyle(1, crest ? 0xb07828 : 0x6e3e12,
        (crest ? 0.20 : 0.09) * (1 - t * 0.45) * (baseY < H * 0.82 ? 1 : 0.5));
      g.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = baseY + Math.sin(x * freq + w * 1.3) * amp;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
    }

    // ── Rockbed fill (above escarpment)
    g.fillStyle(0x1a1208, 1);
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(W, 0);
    g.lineTo(esc[esc.length - 1][0], esc[esc.length - 1][1]);
    for (let i = esc.length - 2; i >= 0; i--) g.lineTo(esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Rock-formation hill marks (cartographic symbols)
    const rockSeeds = [
      [0.05,0.20],[0.09,0.32],[0.14,0.17],[0.18,0.40],[0.22,0.26],
      [0.26,0.18],[0.30,0.44],[0.34,0.30],[0.38,0.20],[0.41,0.48],
      [0.45,0.24],[0.49,0.38],[0.53,0.16],[0.56,0.44],[0.60,0.28],
      [0.64,0.19],[0.67,0.42],[0.71,0.24],[0.74,0.36],[0.77,0.16],
      [0.80,0.45],[0.84,0.22],[0.87,0.38],[0.90,0.18],[0.93,0.44],
      [0.96,0.27],[0.03,0.44],[0.11,0.48],[0.20,0.50],[0.35,0.46],
      [0.50,0.50],[0.65,0.48],[0.79,0.50],[0.92,0.46],
    ];
    rockSeeds.forEach(([fx, fy]) => {
      const x    = fx * W;
      const y    = fy * H;
      const escY = this.escYAt(x);
      if (y > escY - 18) return;
      const s = 9 + Math.abs(Math.sin(fx * 19 + fy * 13)) * 6;
      const a = 0.38 + Math.abs(Math.sin(fx * 7.1)) * 0.20;
      g.lineStyle(1, 0x8a6030, a);
      // Left peak
      g.beginPath();
      g.moveTo(x - s * 0.85, y + s * 0.65);
      g.lineTo(x - s * 0.10, y - s * 0.90);
      g.lineTo(x + s * 0.55, y + s * 0.65);
      g.strokePath();
      // Right peak (offset)
      g.lineStyle(1, 0x8a6030, a * 0.65);
      g.beginPath();
      g.moveTo(x + s * 0.35, y + s * 0.65);
      g.lineTo(x + s * 0.90, y - s * 0.40);
      g.lineTo(x + s * 1.55, y + s * 0.65);
      g.strokePath();
    });

    // ── Faction territory washes (faint colour tints)
    // Calder — western rockbed
    g.fillStyle(0x2050a0, 0.065);
    g.fillRect(0, 0, W * 0.32, H * 0.60);
    // Vorrin — eastern rockbed
    g.fillStyle(0xc02010, 0.055);
    g.fillRect(W * 0.60, 0, W * 0.40, H * 0.58);
    // Shadmen — centre margin around escarpment
    g.fillStyle(0xc09010, 0.048);
    g.fillEllipse(W * 0.51, H * 0.56, W * 0.40, H * 0.28);

    // Vorrin boring-rig markers (cross in square)
    [[0.64,0.18],[0.70,0.28],[0.76,0.15],[0.82,0.30],[0.88,0.20]].forEach(([fx,fy]) => {
      const x = fx * W, y = fy * H;
      const escY = this.escYAt(x);
      if (y > escY - 10) return;
      g.lineStyle(1, 0xe05030, 0.28);
      g.strokeRect(x - 5, y - 5, 10, 10);
      g.lineBetween(x - 8, y,     x + 8, y);
      g.lineBetween(x,     y - 8, x,     y + 8);
    });

    // ── Escarpment bluff edge
    // Drop shadow
    g.lineStyle(10, 0x060402, 0.70);
    g.beginPath();
    g.moveTo(esc[0][0], esc[0][1] + 7);
    esc.slice(1).forEach(p => g.lineTo(p[0], p[1] + 7));
    g.strokePath();
    // Main cliff line
    g.lineStyle(3, 0xc09040, 0.95);
    g.beginPath();
    g.moveTo(esc[0][0], esc[0][1]);
    esc.slice(1).forEach(p => g.lineTo(p[0], p[1]));
    g.strokePath();
    // Cliff hatch marks below the bluff
    for (let i = 0; i < esc.length - 1; i++) {
      const steps = Math.floor((esc[i+1][0] - esc[i][0]) / 22);
      for (let j = 0; j <= steps; j++) {
        const hx  = esc[i][0] + j * 22;
        const hy  = this.escYAt(hx);
        const len = 5 + (j % 3) * 3;
        g.lineStyle(1, 0xa07840, 0.22);
        g.lineBetween(hx, hy + 1, hx + 2, hy + len);
      }
    }

    // ── Cartographic border (world-space, inner edge of terrain)
    g.lineStyle(2, 0x9a7038, 0.70);
    g.strokeRect(4, 4, W - 8, H - 8);
    g.lineStyle(1, 0x9a7038, 0.25);
    g.strokeRect(10, 10, W - 20, H - 20);
    // Tick marks
    for (let i = 0; i <= 32; i++) {
      const tx = 4 + (i / 32) * (W - 8);
      g.lineStyle(1, 0x9a7038, 0.30); g.lineBetween(tx, 4, tx, 12);
      g.lineBetween(tx, H - 4, tx, H - 12);
    }
    for (let i = 0; i <= 18; i++) {
      const ty = 4 + (i / 18) * (H - 8);
      g.lineStyle(1, 0x9a7038, 0.30); g.lineBetween(4, ty, 12, ty);
      g.lineBetween(W - 4, ty, W - 12, ty);
    }

    // ── Region labels (drawn directly as Graphics text is not available;
    //    use separate Text objects stored for layout)
    this._drawRegionLabels();
  }

  _drawRegionLabels() {
    (this._regionLabels || []).forEach(t => t.destroy());
    this._regionLabels = [];
    const lbl = (wx, wy, text, size, color, alpha, style) => {
      const t = this.add.text(wx, wy, text, {
        fontFamily: 'Georgia, serif',
        fontStyle:  style || 'italic',
        fontSize:   `${size}px`,
        color,
      }).setOrigin(0.5).setAlpha(alpha).setDepth(-20);
      this._regionLabels.push(t);
    };
    // Big watermark
    lbl(WORLD_W * 0.50, WORLD_H * 0.32, 'ARIDUN', 120, '#7a5428', 0.06, 'bold italic');
    // Region names
    lbl(WORLD_W * 0.18, WORLD_H * 0.08, 'POLAR RIDGE',          14, '#b08040', 0.35);
    lbl(WORLD_W * 0.16, WORLD_H * 0.25, 'CALDER HOLD',          13, '#80b0e8', 0.45);
    lbl(WORLD_W * 0.73, WORLD_H * 0.14, 'KETH ROCKBED',         14, '#d4a860', 0.55);
    lbl(WORLD_W * 0.50, WORLD_H * 0.72, 'THE GREAT DUNE SEA',   18, '#d4a860', 0.50);
    lbl(WORLD_W * 0.82, WORLD_H * 0.88, 'DEEP DESERT',          13, '#9a7040', 0.32);
    lbl(WORLD_W * 0.05, WORLD_H * 0.65, 'WESTERN MARGIN',       11, '#7a6030', 0.22);
    // Compass
    const compass = this.add.text(WORLD_W - 36, 36, 'N', {
      fontFamily: 'Georgia, serif', fontStyle: 'normal',
      fontSize: '16px', color: '#b08040',
    }).setOrigin(0.5).setAlpha(0.55).setDepth(-20);
    this._regionLabels.push(compass);
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  drawRoutes() {
    this.routesG.clear();
    this.routesG.lineStyle(1, 0xb09050, 0.35);
    ROUTES.forEach(([a, b]) => {
      const na = NODES.find(n => n.key === a);
      const nb = NODES.find(n => n.key === b);
      this.dashedLine(this.routesG, na.wx, na.wy, nb.wx, nb.wy, 10, 6);
    });
  }

  dashedLine(g, x1, y1, x2, y2, dash, gap) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = dx / len, ny = dy / len;
    let t = 0, on = true;
    while (t < len) {
      const seg = Math.min(on ? dash : gap, len - t);
      if (on) g.lineBetween(x1 + nx * t, y1 + ny * t,
                             x1 + nx * (t + seg), y1 + ny * (t + seg));
      t += seg; on = !on;
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  buildNodes() {
    this.nodeObjs = NODES.map((node, idx) => {
      const color = FACTION[node.faction].color;

      const glow = this.add.image(node.wx, node.wy, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(color)
        .setDisplaySize(100, 100).setAlpha(0.35).setDepth(1);

      const zone = this.add.circle(node.wx, node.wy, 24, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(6);

      const label = this.add.text(node.wx, node.wy + 20, node.name, {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#e8d8b8',
      }).setOrigin(0.5, 0).setDepth(7);

      zone.on('pointerdown', (p, lx, ly, e) => {
        e?.stopPropagation();
        // Only act on click (not end of drag)
        this.time.delayedCall(20, () => {
          if (this.isDragging) return;
          if (this.selected === idx) this.act();
          else { this.selected = idx; this.refreshSelection(); this.panTo(node.wx, node.wy); }
        });
      });

      this.tweens.add({
        targets: glow, alpha: { from: 0.22, to: 0.55 },
        duration: 1800 + idx * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      this.drawNodeSymbol(node);
      return { node, glow, zone, label };
    });
  }

  drawNodeSymbol(node) {
    const g = this.nodeSymG;
    const { wx: x, wy: y, type, faction, action } = node;
    const color = FACTION[faction].color;
    const locked = action === 'locked';
    const a = locked ? 0.38 : 0.92;
    g.lineStyle(2, color, a);
    g.fillStyle(color, 0.15 * a);

    if (type === 'city') {
      // Diamond — capital
      const r = 12;
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r * 0.65, y);
      g.lineTo(x, y + r); g.lineTo(x - r * 0.65, y);
      g.closePath(); g.fillPath(); g.strokePath();
      g.lineStyle(1, color, 0.40 * a);
      g.lineBetween(x - r * 0.40, y, x + r * 0.40, y);
      g.lineBetween(x, y - r * 0.55, x, y + r * 0.55);
    } else if (type === 'hollow') {
      // Triangle — Shadmen hollow
      const r = 13;
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.87, y + r * 0.5);
      g.lineTo(x - r * 0.87, y + r * 0.5);
      g.closePath(); g.fillPath(); g.strokePath();
    } else if (type === 'fort') {
      // Square with corner ticks — fort
      const r = 10;
      g.strokeRect(x - r, y - r, r * 2, r * 2);
      g.fillRect(x - r, y - r, r * 2, r * 2);
      const t = 6;
      g.lineStyle(1, color, 0.45 * a);
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => {
        g.lineBetween(x + sx * (r + t), y + sy * r,      x + sx * r, y + sy * r);
        g.lineBetween(x + sx * r,       y + sy * (r + t), x + sx * r, y + sy * r);
      });
    }
  }

  // Smooth camera pan to a world position
  panTo(wx, wy, duration = 400) {
    const cam = this.cameras.main;
    const tx = Phaser.Math.Clamp(wx - cam.width  / 2, 0, WORLD_W - cam.width);
    const ty = Phaser.Math.Clamp(wy - cam.height / 2, 0, WORLD_H - cam.height);
    this.tweens.add({
      targets: cam, scrollX: tx, scrollY: ty,
      duration, ease: 'Cubic.out',
    });
  }

  // ── Chrome ────────────────────────────────────────────────────────────────

  buildChrome() {
    const SF = 0; // scrollFactor

    this.titleTxt = this.add.text(0, 0, 'ARRADIUS', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#f0e3d0',
    }).setOrigin(0.5, 0).setScrollFactor(SF).setDepth(300);

    this.subtitleTxt = this.add.text(0, 0, 'the War Map · Aridun', {
      fontFamily: 'Georgia, serif', fontStyle: 'italic',
      fontSize: '13px', color: '#b09070',
    }).setOrigin(0.5, 0).setScrollFactor(SF).setDepth(300);

    this.backBtn = this.add.text(0, 0, '‹ Residency', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe8c8',
      backgroundColor: '#1a1010', padding: { x: 10, y: 6 },
    }).setScrollFactor(SF).setDepth(300).setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerover', () => this.backBtn.setColor('#ffffff'));
    this.backBtn.on('pointerout',  () => this.backBtn.setColor('#ffe8c8'));
    this.backBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.goHome(); });

    // Hint text
    this.hintTxt = this.add.text(0, 0, 'drag to pan  ·  click to select  ·  Tab to cycle', {
      fontFamily: 'monospace', fontSize: '11px', color: '#6a5a3a',
    }).setOrigin(0.5, 1).setScrollFactor(SF).setDepth(300);

    // Info panel (bottom)
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

    this.actBtn = this.add.rectangle(0, 0, 192, 40, 0x2a1e10, 1)
      .setStrokeStyle(1, 0xc8a050, 0.7).setScrollFactor(SF).setOrigin(0.5).setDepth(301)
      .setInteractive({ useHandCursor: true });
    this.actLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe8c8',
    }).setScrollFactor(SF).setOrigin(0.5).setDepth(302);
    this.actBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.act(); });

    // Minimap label
    this.mmLabel = this.add.text(0, 0, 'ARIDUN', {
      fontFamily: 'monospace', fontSize: '9px', color: '#7a6030',
    }).setScrollFactor(SF).setOrigin(0.5, 0).setDepth(510);

    // Minimap click zone
    this.mmZone = this.add.rectangle(0, 0, MM_W, MM_H, 0xffffff, 0)
      .setScrollFactor(SF).setDepth(511).setInteractive({ useHandCursor: true });
    this.mmZone.on('pointerdown', (p) => {
      // Convert viewport click → world coords
      const mmX = p.x - (this._mmX || 0);
      const mmY = p.y - (this._mmY || 0);
      const wx  = (mmX / MM_W) * WORLD_W;
      const wy  = (mmY / MM_H) * WORLD_H;
      this.panTo(wx, wy, 300);
    });

    // Music toggle
    const on0 = this.game.audio ? this.game.audio.enabled : false;
    this.musicCircle = this.add.circle(0, 0, 20, 0xffffff, 0.10)
      .setStrokeStyle(2, 0xc8a050, 0.5).setScrollFactor(SF).setDepth(300)
      .setAlpha(on0 ? 1 : 0.5).setInteractive({ useHandCursor: true });
    this.musicLbl = this.add.text(0, 0, on0 ? '♪' : '♪̷', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffe8c8',
    }).setScrollFactor(SF).setOrigin(0.5).setDepth(301);
    this.musicCircle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      if (this.ambient) { this.ambient.start(); const on = this.ambient.toggle(); this.musicCircle.setAlpha(on ? 1 : 0.5); this.musicLbl.setText(on ? '♪' : '♪̷'); }
    });
  }

  // ── Audio ─────────────────────────────────────────────────────────────────

  createAudio() {
    if (!this.game.audio) this.game.audio = new AudioManager();
    this.ambient = this.game.audio;
    this.ambient.prepare();
    this.ambient.setMusicState('residency');
    this.ambient.setAmbience('map');
    const start = () => this.ambient.start();
    this.input.once('pointerdown', start);
    this.input.keyboard.once('keydown', start);
  }

  // ── Layout (viewport-space UI) ────────────────────────────────────────────

  layoutChrome() {
    const cam = this.cameras.main;
    const W = cam.width, H = cam.height;
    const PH = 148; // info panel height

    this.titleTxt.setPosition(W / 2, 14);
    this.subtitleTxt.setPosition(W / 2, 42);
    this.backBtn.setPosition(18, 14);
    this.hintTxt.setPosition(W / 2, H - PH - 6);

    // Info panel background (redrawn)
    const PW = Math.min(W - 24, 640);
    const PX = W / 2;
    const PY = H - 8;
    this.infoBgG.clear();
    this.infoBgG.fillStyle(0x0e0b07, 0.93);
    this.infoBgG.fillRect(PX - PW / 2, PY - PH, PW, PH);
    this.infoBgG.lineStyle(1, 0x9a7038, 0.50);
    this.infoBgG.strokeRect(PX - PW / 2, PY - PH, PW, PH);

    const left = PX - PW / 2 + 18;
    const top  = PY - PH + 16;
    this.infoName.setPosition(left, top);
    this.infoStatus.setPosition(left, top + 26);
    this.infoDesc.setPosition(left, top + 46).setWordWrapWidth(PW - 230);
    const bx = PX + PW / 2 - 108;
    const by = PY - PH / 2;
    this.actBtn.setPosition(bx, by);
    this.actLabel.setPosition(bx, by);

    // Minimap (top-right)
    const mmX = W - MM_W - 14;
    const mmY = 70;
    this._mmX = mmX; this._mmY = mmY;
    this.mmLabel.setPosition(mmX + MM_W / 2, mmY + MM_H + 3);
    this.mmZone.setPosition(mmX + MM_W / 2, mmY + MM_H / 2);

    // Music button
    this.musicCircle.setPosition(W - 34, H - PH - 34);
    this.musicLbl.setPosition(W - 34, H - PH - 34);

    this.selRing && this.drawSelRing();
  }

  // ── Update minimap each frame ─────────────────────────────────────────────

  updateMinimap() {
    const cam = this.cameras.main;
    const g   = this.minimapG;
    const mx  = this._mmX || 0;
    const my  = this._mmY || 0;
    g.clear();

    // Background + simple terrain thumbnail
    g.fillStyle(0x0a0806, 0.90);
    g.fillRect(mx, my, MM_W, MM_H);

    // Polar strip
    g.fillStyle(0x100c08, 1);
    g.fillRect(mx, my, MM_W, MM_H * 0.14);

    // Rockbed
    const escFrac = 0.55;
    g.fillStyle(0x1a1208, 1);
    g.fillRect(mx, my + MM_H * 0.14, MM_W, MM_H * (escFrac - 0.14));

    // Dune sea
    g.fillStyle(0x2c1e0e, 1);
    g.fillRect(mx, my + MM_H * escFrac, MM_W, MM_H * (1 - escFrac));

    // Escarpment line on minimap
    g.lineStyle(1, 0xc09040, 0.55);
    g.beginPath();
    ESC_FRACS.forEach(([fx, fy], i) => {
      const px = mx + fx * MM_W;
      const py = my + fy * MM_H;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    });
    g.strokePath();

    // Faction washes on minimap
    g.fillStyle(0x2050a0, 0.10);
    g.fillRect(mx, my, MM_W * 0.32, MM_H * 0.60);
    g.fillStyle(0xc02010, 0.08);
    g.fillRect(mx + MM_W * 0.60, my, MM_W * 0.40, MM_H * 0.58);

    // Node dots
    NODES.forEach(node => {
      const px = mx + (node.wx / WORLD_W) * MM_W;
      const py = my + (node.wy / WORLD_H) * MM_H;
      const col = FACTION[node.faction].color;
      g.fillStyle(col, 0.85);
      g.fillCircle(px, py, 3.5);
      g.lineStyle(1, col, 0.40);
      g.strokeCircle(px, py, 5.5);
    });

    // Viewport rect
    const vx = mx + (cam.scrollX / WORLD_W) * MM_W;
    const vy = my + (cam.scrollY / WORLD_H) * MM_H;
    const vw = (cam.width  / WORLD_W) * MM_W;
    const vh = (cam.height / WORLD_H) * MM_H;
    g.lineStyle(1.5, 0xffe8c8, 0.60);
    g.strokeRect(vx, vy, vw, vh);

    // Border
    g.lineStyle(1, 0x9a7038, 0.55);
    g.strokeRect(mx, my, MM_W, MM_H);
  }

  // ── Selection & actions ───────────────────────────────────────────────────

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
    this.drawSelRing();
  }

  drawSelRing() {
    const { node } = this.nodeObjs[this.selected];
    this.selRing.clear();
    this.selRing.lineStyle(2, 0xffe8c8, 0.80);
    this.selRing.strokeCircle(node.wx, node.wy, 28);
    // Tick marks on ring
    this.selRing.lineStyle(2, 0xffe8c8, 0.55);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const r1 = 28, r2 = 35;
      this.selRing.lineBetween(
        node.wx + Math.cos(a) * r1, node.wy + Math.sin(a) * r1,
        node.wx + Math.cos(a) * r2, node.wy + Math.sin(a) * r2
      );
    }
  }

  cycle(dir) {
    this.selected = (this.selected + dir + NODES.length) % NODES.length;
    this.refreshSelection();
    const { node } = this.nodeObjs[this.selected];
    this.panTo(node.wx, node.wy);
  }

  act() {
    if (this.time.now < this.inputReadyAt) return;
    const { node } = this.nodeObjs[this.selected];
    if (node.action === 'home')           this.goHome();
    else if (node.action === 'expedition') this.goTo('ExpeditionScene');
    else                                   this.flashLocked();
  }

  flashLocked() {
    this.cameras.main.shake(180, 0.004);
    this.infoStatus.setText('Too strong — win the Shadmen first.').setColor('#e0503c');
    this.time.delayedCall(2200, () => {
      const f = FACTION[this.nodeObjs[this.selected].node.faction];
      this.infoStatus.setText(f.status).setColor('#9a8670');
    });
  }

  goHome() { this.goTo('ResidencyScene'); }

  goTo(scene) {
    this.cameras.main.fadeOut(400, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  escYAt(x) {
    const pts = this.escPts;
    if (!pts || pts.length === 0) return 0;
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i][0] && x <= pts[i + 1][0]) {
        const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
      }
    }
    return pts[pts.length - 1][1];
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  onResize() {
    this.layoutChrome();
  }

  // ── Update loop ───────────────────────────────────────────────────────────

  update() {
    this.updateMinimap();

    // Keyboard: Tab cycles nodes, Enter/Space acts, Esc goes home
    if (Phaser.Input.Keyboard.JustDown(this.tabKey))  this.cycle(1);
    if (Phaser.Input.Keyboard.JustDown(this.entKey))  this.act();
    if (Phaser.Input.Keyboard.JustDown(this.escKey))  this.goHome();

    // Arrow keys pan camera
    const cam   = this.cameras.main;
    const speed = 8;
    if (this.cursors.left.isDown)  cam.scrollX = Math.max(0,             cam.scrollX - speed);
    if (this.cursors.right.isDown) cam.scrollX = Math.min(WORLD_W - cam.width,  cam.scrollX + speed);
    if (this.cursors.up.isDown)    cam.scrollY = Math.max(0,             cam.scrollY - speed);
    if (this.cursors.down.isDown)  cam.scrollY = Math.min(WORLD_H - cam.height, cam.scrollY + speed);
  }
}
