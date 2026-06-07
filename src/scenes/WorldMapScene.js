import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager.js';
import { togglePainterly } from '../shaders/KuwaharaPostFX.js';

const FACTION = {
  calder:  { color: 0x6fb0ff, status: 'Held — House Calder' },
  shadmen: { color: 0xffce86, status: 'Unmet — First Contact awaits' },
  vorrin:  { color: 0xe0503c, status: 'Enemy — House Vorrin' },
};

const NODES = [
  {
    key: 'saltspire', name: 'Saltspire', faction: 'calder', type: 'city',
    fx: 0.17, fy: 0.35,
    desc: 'The capital of Aridun. Seat of House Calder — your Residency.',
    action: 'home', label: 'Return to the Residency',
  },
  {
    key: 'hollow', name: "Tamir's Hollow", faction: 'shadmen', type: 'hollow',
    fx: 0.51, fy: 0.46,
    desc: "A Shadmen Hollow carved into the rockbed at the bluff edge. Tamir's people watch from the stone. Ride out and make first contact.",
    action: 'expedition', label: 'Ride out  (Corsair)',
  },
  {
    key: 'ashmaw', name: 'Ashmaw', faction: 'vorrin', type: 'fort',
    fx: 0.73, fy: 0.20,
    desc: "A Vorrin watchpost deep in the Keth Rockbed. Boring rigs run day and night. Too strong to assault — win the Shadmen first.",
    action: 'locked', label: 'Assault  (locked)',
  },
];

const ROUTES = [
  ['saltspire', 'hollow'],
  ['saltspire', 'ashmaw'],
];

// Escarpment — bluff edge between northern rockbed and the dune sea.
// Control points as [fracX, fracY] of canvas.
const ESC_FRACS = [
  [0.00, 0.50], [0.10, 0.48], [0.20, 0.51], [0.30, 0.49],
  [0.40, 0.53], [0.50, 0.50], [0.60, 0.47], [0.70, 0.52],
  [0.80, 0.49], [0.90, 0.53], [1.00, 0.51],
];

export default class WorldMapScene extends Phaser.Scene {
  constructor() { super('WorldMapScene'); }

  create() {
    this.mapLabels = [];
    this.escPts    = [];
    this.selected  = 1;

    const { width, height } = this.scale;
    this.bg       = this.add.graphics().setDepth(-100);
    this.routesG  = this.add.graphics().setDepth(-50);
    this.nodeSymG = this.add.graphics().setDepth(2);
    this.selRing  = this.add.graphics().setDepth(10);

    this.buildNodes();
    this.buildChrome();
    this.createAudio();
    this.setupInput();
    this.layout(width, height);
    this.refreshSelection();
    this.cameras.main.fadeIn(500, 6, 4, 12);
    this.inputReadyAt = this.time.now + 450;
    this.input.keyboard.on('keydown-K', () => togglePainterly(this));
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off('resize', this.onResize, this));
  }

  // ── Nodes ────────────────────────────────────────────────────────────────

  buildNodes() {
    this.nodeObjs = NODES.map((node, idx) => {
      const color = FACTION[node.faction].color;
      const glow = this.add.image(0, 0, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(color)
        .setAlpha(0.35).setDepth(1);
      const zone = this.add.circle(0, 0, 22, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(6);
      const label = this.add.text(0, 0, node.name, {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#e8d8b8',
      }).setOrigin(0.5, 0).setDepth(7);

      zone.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        if (this.selected === idx) this.act();
        else { this.selected = idx; this.refreshSelection(); }
      });
      this.tweens.add({
        targets: glow, alpha: { from: 0.25, to: 0.58 },
        duration: 1800 + idx * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
      return { node, glow, zone, label };
    });
  }

  placeNodes(width, height) {
    this.nodeSymG.clear();
    this.nodeObjs.forEach(({ node, glow, zone, label }) => {
      const x = Math.round(node.fx * width);
      const y = Math.round(node.fy * height);
      glow.setPosition(x, y).setDisplaySize(88, 88);
      zone.setPosition(x, y);
      label.setPosition(x, y + 17);
      this.drawNodeSymbol(node, x, y);
    });
  }

  drawNodeSymbol(node, x, y) {
    const g = this.nodeSymG;
    const color = FACTION[node.faction].color;
    const locked = node.action === 'locked';
    const a = locked ? 0.42 : 0.95;
    g.lineStyle(1.5, color, a);
    g.fillStyle(color, 0.18 * a);

    if (node.type === 'city') {
      // Diamond — capital city
      const r = 10;
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r * 0.65, y);
      g.lineTo(x, y + r); g.lineTo(x - r * 0.65, y);
      g.closePath(); g.fillPath(); g.strokePath();
      g.lineStyle(1, color, 0.4 * a);
      g.lineBetween(x - r * 0.38, y, x + r * 0.38, y);
      g.lineBetween(x, y - r * 0.5, x, y + r * 0.5);
    } else if (node.type === 'hollow') {
      // Triangle — Shadmen hollow
      const r = 11;
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.87, y + r * 0.5);
      g.lineTo(x - r * 0.87, y + r * 0.5);
      g.closePath(); g.fillPath(); g.strokePath();
    } else if (node.type === 'fort') {
      // Square with corner ticks — Vorrin fort
      const r = 9;
      g.strokeRect(x - r, y - r, r * 2, r * 2);
      g.fillRect(x - r, y - r, r * 2, r * 2);
      const t = 5;
      g.lineStyle(1, color, 0.5 * a);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        g.lineBetween(x + sx * (r + t), y + sy * r,     x + sx * r, y + sy * r);
        g.lineBetween(x + sx * r,       y + sy * (r + t), x + sx * r, y + sy * r);
      });
    }
  }

  // ── Chrome ───────────────────────────────────────────────────────────────

  buildChrome() {
    this.title = this.add.text(0, 0, 'ARRADIUS', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#f0e3d0',
    }).setOrigin(0.5, 0).setDepth(100);

    this.subtitle = this.add.text(0, 0, 'the War Map · Aridun', {
      fontFamily: 'Georgia, serif', fontStyle: 'italic',
      fontSize: '13px', color: '#b09070',
    }).setOrigin(0.5, 0).setDepth(100);

    this.backBtn = this.add.text(0, 0, '‹ Residency', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe8c8',
      backgroundColor: '#1a1010', padding: { x: 10, y: 6 },
    }).setDepth(100).setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerover', () => this.backBtn.setColor('#ffffff'));
    this.backBtn.on('pointerout',  () => this.backBtn.setColor('#ffe8c8'));
    this.backBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.goHome(); });

    this.infoBox = this.add.rectangle(0, 0, 10, 10, 0x120e08, 0.95)
      .setStrokeStyle(1, 0xa07840, 0.55).setOrigin(0.5, 1).setDepth(100);

    this.infoName   = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontSize: '18px',
    }).setOrigin(0, 0).setDepth(101);
    this.infoStatus = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px',
    }).setOrigin(0, 0).setDepth(101);
    this.infoDesc   = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontStyle: 'italic',
      fontSize: '13px', color: '#c8b898',
    }).setOrigin(0, 0).setDepth(101);

    this.actBtn = this.add.rectangle(0, 0, 190, 38, 0x2a1e10, 1)
      .setStrokeStyle(1, 0xc8a050, 0.7).setOrigin(0.5).setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.actLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe8c8',
    }).setOrigin(0.5).setDepth(102);
    this.actBtn.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.act(); });
  }

  // ── Audio ─────────────────────────────────────────────────────────────────

  createAudio() {
    if (!this.game.audio) this.game.audio = new AudioManager();
    this.ambient = this.game.audio;
    this.ambient.prepare();
    this.ambient.setMusicState('residency');
    this.ambient.setAmbience('map');
    const startOnce = () => this.ambient.start();
    this.input.once('pointerdown', startOnce);
    this.input.keyboard.once('keydown', startOnce);

    const on0    = this.ambient.enabled;
    const circle = this.add.circle(0, 0, 22, 0xffffff, 0.10)
      .setStrokeStyle(2, 0xc8a050, 0.5).setDepth(1000)
      .setAlpha(on0 ? 1 : 0.5).setInteractive({ useHandCursor: true });
    const lbl = this.add.text(0, 0, on0 ? '♪' : '♪̷', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffe8c8',
    }).setOrigin(0.5).setDepth(1001);
    circle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation(); this.ambient.start();
      const on = this.ambient.toggle();
      circle.setAlpha(on ? 1 : 0.5); lbl.setText(on ? '♪' : '♪̷');
    });
    this.musicButton = { circle, label: lbl, anchor: (w) => ({ x: w - 36, y: 36 }) };
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.escKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
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
    this.actBtn.setStrokeStyle(1, locked ? 0x6a5a3a : 0xc8a050, locked ? 0.35 : 0.7);
    this.actLabel.setColor(locked ? '#7a6a4a' : '#ffe8c8');
    this.drawSelRing();
  }

  drawSelRing() {
    const { zone } = this.nodeObjs[this.selected];
    this.selRing.clear();
    this.selRing.lineStyle(1.5, 0xffe8c8, 0.75);
    this.selRing.strokeCircle(zone.x, zone.y, 26);
  }

  cycle(dir) {
    this.selected = (this.selected + dir + NODES.length) % NODES.length;
    this.refreshSelection();
  }

  act() {
    if (this.time.now < this.inputReadyAt) return;
    const { node } = this.nodeObjs[this.selected];
    if (node.action === 'home')       this.goHome();
    else if (node.action === 'expedition') this.goTo('ExpeditionScene');
    else this.flashLocked();
  }

  flashLocked() {
    this.cameras.main.shake(180, 0.004);
    this.infoStatus.setText('Too strong — win the Shadmen first.').setColor('#e0503c');
  }

  goHome() { this.goTo('ResidencyScene'); }

  goTo(scene) {
    this.cameras.main.fadeOut(500, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  layout(width, height) {
    this.drawMap(width, height);
    this.placeNodes(width, height);
    this.drawRoutes(width, height);

    this.title.setPosition(width / 2, 16);
    this.subtitle.setPosition(width / 2, 44);
    this.backBtn.setPosition(20, 16);

    const pw   = Math.min(width - 32, 600);
    const ph   = 140;
    const px   = width / 2;
    const py   = height - 10;
    this.infoBox.setPosition(px, py).setSize(pw, ph);
    const left = px - pw / 2 + 18;
    const top  = py - ph + 16;
    this.infoName.setPosition(left, top);
    this.infoStatus.setPosition(left, top + 24);
    this.infoDesc.setPosition(left, top + 43).setWordWrapWidth(pw - 216);
    const bx = px + pw / 2 - 106;
    const by = py - ph / 2;
    this.actBtn.setPosition(bx, by).setSize(188, 38);
    this.actLabel.setPosition(bx, by);

    if (this.musicButton) {
      const { x, y } = this.musicButton.anchor(width);
      this.musicButton.circle.setPosition(x, y);
      this.musicButton.label.setPosition(x, y);
    }
    this.drawSelRing();
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  drawRoutes(width, height) {
    this.routesG.clear();
    this.routesG.lineStyle(1, 0xb09050, 0.38);
    ROUTES.forEach(([a, b]) => {
      const na = NODES.find(n => n.key === a);
      const nb = NODES.find(n => n.key === b);
      this.dashedLine(
        this.routesG,
        na.fx * width, na.fy * height,
        nb.fx * width, nb.fy * height,
        9, 5
      );
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
      if (on) g.lineBetween(
        x1 + nx * t,       y1 + ny * t,
        x1 + nx * (t + seg), y1 + ny * (t + seg)
      );
      t += seg; on = !on;
    }
  }

  // ── Map terrain ───────────────────────────────────────────────────────────

  drawMap(width, height) {
    const g = this.bg;
    g.clear();

    // Rebuild map labels
    (this.mapLabels || []).forEach(t => t.destroy());
    this.mapLabels = [];

    // Compute + cache escarpment points
    this.escPts = ESC_FRACS.map(([fx, fy]) => [fx * width, fy * height]);
    const esc = this.escPts;

    // ── Void background ────────────────────────────────────────────────────
    g.fillStyle(0x0e0b07, 1);
    g.fillRect(0, 0, width, height);

    // ── Dune sea — warm sandy fill below the escarpment ───────────────────
    g.fillStyle(0x2e2010, 1);
    g.beginPath();
    g.moveTo(0, height); g.lineTo(width, height);
    g.lineTo(esc[esc.length - 1][0], esc[esc.length - 1][1]);
    for (let i = esc.length - 2; i >= 0; i--) g.lineTo(esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Warmer band near the escarpment base
    g.fillStyle(0x3c2610, 0.35);
    g.beginPath();
    g.moveTo(0, height * 0.65); g.lineTo(width, height * 0.65);
    g.lineTo(esc[esc.length - 1][0], esc[esc.length - 1][1]);
    for (let i = esc.length - 2; i >= 0; i--) g.lineTo(esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Dune ripple lines
    const minEscY = Math.min(...esc.map(p => p[1]));
    for (let w = 0; w < 32; w++) {
      const t     = (w + 1) / 33;
      const baseY = minEscY + 18 + t * (height - minEscY) * 0.90;
      if (baseY >= height - 2) continue;
      const freq = 0.0055 + t * 0.003;
      const amp  = 5 - t * 2;
      // Alternate between two shades for crests/troughs
      const col = w % 2 === 0 ? 0xb07830 : 0x7a4e1c;
      const al  = (w % 2 === 0 ? 0.18 : 0.09) * (1 - t * 0.4);
      g.lineStyle(1, col, al);
      g.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const y = baseY + Math.sin(x * freq + w * 1.3) * amp;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
    }

    // ── Rockbed — dark hard fill above the escarpment ─────────────────────
    g.fillStyle(0x1c1309, 1);
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(width, 0);
    g.lineTo(esc[esc.length - 1][0], esc[esc.length - 1][1]);
    for (let i = esc.length - 2; i >= 0; i--) g.lineTo(esc[i][0], esc[i][1]);
    g.closePath(); g.fillPath();

    // Angular rock-formation marks (old cartographic "hill" symbols)
    const rockMarks = [
      [0.07,0.10],[0.13,0.23],[0.20,0.08],[0.27,0.33],[0.34,0.14],
      [0.40,0.38],[0.44,0.22],[0.50,0.10],[0.54,0.36],[0.60,0.17],
      [0.66,0.30],[0.72,0.09],[0.77,0.38],[0.81,0.24],[0.87,0.13],
      [0.91,0.36],[0.94,0.08],[0.23,0.40],[0.10,0.36],[0.96,0.28],
    ];
    rockMarks.forEach(([fx, fy]) => {
      const x    = fx * width;
      const y    = fy * height;
      const escY = this.escYAt(x);
      if (y > escY - 14) return;
      const s = 7 + Math.abs(Math.sin(fx * 19 + fy * 13)) * 4;
      const a = 0.40 + Math.abs(Math.sin(fx * 7)) * 0.20;
      g.lineStyle(1, 0x8a6030, a);
      g.beginPath();
      g.moveTo(x - s * 0.8, y + s * 0.6);
      g.lineTo(x - s * 0.05, y - s * 0.9);
      g.lineTo(x + s * 0.6,  y + s * 0.6);
      g.strokePath();
      g.beginPath();
      g.moveTo(x + s * 0.4,  y + s * 0.6);
      g.lineTo(x + s * 0.95, y - s * 0.4);
      g.lineTo(x + s * 1.55, y + s * 0.6);
      g.strokePath();
    });

    // ── Faction territory washes (very subtle colour tints) ───────────────
    g.fillStyle(0x3060c0, 0.055);
    g.fillRect(0, 0, width * 0.36, height * 0.56);

    g.fillStyle(0xd03018, 0.050);
    g.fillRect(width * 0.54, 0, width * 0.46, height * 0.50);

    g.fillStyle(0xd0a018, 0.050);
    g.fillEllipse(width * 0.50, height * 0.44, width * 0.38, height * 0.24);

    // Vorrin boring-rig markers (cross-in-square) in the Keth Rockbed
    [[0.60, 0.13], [0.67, 0.24], [0.77, 0.11]].forEach(([fx, fy]) => {
      const x = fx * width, y = fy * height;
      g.lineStyle(1, 0xe05030, 0.26);
      g.strokeRect(x - 4, y - 4, 8, 8);
      g.lineBetween(x - 7, y,     x + 7, y);
      g.lineBetween(x,     y - 7, x,     y + 7);
    });

    // ── Escarpment bluff edge ─────────────────────────────────────────────
    // Drop shadow
    g.lineStyle(8, 0x0e0b07, 0.70);
    g.beginPath();
    g.moveTo(esc[0][0], esc[0][1] + 6);
    esc.slice(1).forEach(p => g.lineTo(p[0], p[1] + 6));
    g.strokePath();
    // Main cliff line
    g.lineStyle(3, 0xc09040, 0.95);
    g.beginPath();
    g.moveTo(esc[0][0], esc[0][1]);
    esc.slice(1).forEach(p => g.lineTo(p[0], p[1]));
    g.strokePath();
    // Hatch marks below the bluff (cliff texture)
    for (let i = 0; i < esc.length - 1; i++) {
      const steps = Math.floor((esc[i+1][0] - esc[i][0]) / 18);
      for (let j = 0; j <= steps; j++) {
        const hx  = esc[i][0] + j * 18;
        const hy  = this.escYAt(hx);
        const len = 5 + (j % 2) * 3;
        g.lineStyle(1, 0xa07840, 0.20);
        g.lineBetween(hx, hy + 1, hx + 2, hy + len);
      }
    }

    // ── Cartographic border ────────────────────────────────────────────────
    g.lineStyle(2, 0x9a7038, 0.82);
    g.strokeRect(8, 8, width - 16, height - 16);
    g.lineStyle(1, 0x9a7038, 0.28);
    g.strokeRect(14, 14, width - 28, height - 28);
    for (let i = 0; i <= 24; i++) {
      const tx = 8 + (i / 24) * (width - 16);
      g.lineStyle(1, 0x9a7038, 0.38);
      g.lineBetween(tx, 8, tx, 15);
      g.lineBetween(tx, height - 8, tx, height - 15);
    }
    for (let i = 0; i <= 14; i++) {
      const ty = 8 + (i / 14) * (height - 16);
      g.lineStyle(1, 0x9a7038, 0.38);
      g.lineBetween(8, ty, 15, ty);
      g.lineBetween(width - 8, ty, width - 15, ty);
    }

    // ── Map labels ─────────────────────────────────────────────────────────
    const lbl = (fx, fy, text, size, color, alpha, style) => {
      const t = this.add.text(
        Math.round(fx * width), Math.round(fy * height), text, {
          fontFamily: 'Georgia, serif',
          fontStyle:  style || 'italic',
          fontSize:   `${size}px`,
          color,
        }
      ).setOrigin(0.5).setAlpha(alpha).setDepth(-10);
      this.mapLabels.push(t);
    };

    // Giant faint watermark
    lbl(0.50, 0.28, 'ARIDUN', 80, '#7a5428', 0.08, 'bold italic');
    // Region names
    lbl(0.73, 0.13, 'KETH ROCKBED',        12, '#d4a860', 0.60);
    lbl(0.18, 0.17, 'CALDER HOLD',         11, '#80b0e8', 0.50);
    lbl(0.50, 0.72, 'THE GREAT DUNE SEA',  15, '#d4a860', 0.55);
    lbl(0.80, 0.86, 'DEEP DESERT',         11, '#b08848', 0.36);

    // Compass N — top-right inside border
    const nLbl = this.add.text(width - 26, 26, 'N', {
      fontFamily: 'Georgia, serif', fontStyle: 'normal',
      fontSize: '14px', color: '#b08040',
    }).setOrigin(0.5).setAlpha(0.62).setDepth(-10);
    this.mapLabels.push(nLbl);
  }

  // Interpolate escarpment Y at canvas X
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

  // ── Resize & update ───────────────────────────────────────────────────────

  onResize(gameSize) { this.layout(gameSize.width, gameSize.height); }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left))  this.cycle(-1);
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.cycle(1);
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.space)) this.act();
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) this.goHome();
  }
}
