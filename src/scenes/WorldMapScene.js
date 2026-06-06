import Phaser from 'phaser';
import Ambient from '../audio/Ambient.js';

// The War Map — Aridun seen from above. The first strategic screen: your seat,
// a Shamen Hollow where First Contact awaits, and a House Vorrin watchpost.
// Select a site and act: ride out, assault (later), or return home.

const FACTION = {
  calder: { color: 0x6fb0ff, status: 'Held — House Calder' },
  shamen: { color: 0xffce86, status: 'Unmet — First Contact awaits' },
  vorrin: { color: 0xe0503c, status: 'Enemy — House Vorrin' },
};

const NODES = [
  {
    key: 'saltspire',
    name: 'Saltspire',
    faction: 'calder',
    fx: 0.27,
    fy: 0.4,
    desc: 'The capital of Aridun and the seat of House Calder — your Residency.',
    action: 'home',
    label: 'Return to the Residency',
  },
  {
    key: 'hollow',
    name: "Tamir's Hollow",
    faction: 'shamen',
    fx: 0.66,
    fy: 0.5,
    desc: 'A Shamen Hollow in the deep desert. Tamir’s people watch, and wait. Ride out to make first contact.',
    action: 'expedition',
    label: 'Ride out  (Corsair)',
  },
  {
    key: 'ashmaw',
    name: 'Ashmaw Watchpost',
    faction: 'vorrin',
    fx: 0.6,
    fy: 0.26,
    desc: 'A House Vorrin watchpost, its eyes on the dunes. Too strong to assault — win the Shamen first.',
    action: 'locked',
    label: 'Assault  (locked)',
  },
];

const ROUTES = [
  ['saltspire', 'hollow'],
  ['saltspire', 'ashmaw'],
];

export default class WorldMapScene extends Phaser.Scene {
  constructor() {
    super('WorldMapScene');
  }

  create() {
    this.touchButtons = [];
    this.selected = 1; // start on Tamir's Hollow — the actionable site

    const { width, height } = this.scale;

    this.bg = this.add.graphics().setDepth(-100);
    this.routesG = this.add.graphics().setDepth(-50);
    this.selRing = this.add.graphics().setDepth(0);

    this.buildNodes();
    this.buildChrome();
    this.createAudio();

    this.setupInput();
    this.layout(width, height);
    this.refreshSelection();
    this.cameras.main.fadeIn(500, 6, 4, 12);
    // Ignore input briefly so a ghost click from the War Room tap can't act here.
    this.inputReadyAt = this.time.now + 450;

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off('resize', this.onResize, this)
    );
  }

  buildNodes() {
    this.nodeObjs = NODES.map((node) => {
      const color = FACTION[node.faction].color;
      const glow = this.add
        .image(0, 0, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setAlpha(0.5)
        .setDepth(1);
      const dot = this.add
        .circle(0, 0, 11, color, 1)
        .setStrokeStyle(2, 0x0a0612, 0.8)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(0, 0, node.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '16px',
          color: '#f0e3d0',
        })
        .setOrigin(0.5, 0)
        .setDepth(2);

      const idx = NODES.indexOf(node);
      dot.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        if (this.selected === idx) this.act();
        else {
          this.selected = idx;
          this.refreshSelection();
        }
      });

      this.tweens.add({
        targets: glow,
        alpha: { from: 0.4, to: 0.7 },
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });

      return { node, glow, dot, label };
    });
  }

  buildChrome() {
    // Title.
    this.title = this.add
      .text(0, 0, 'ARIDUN', {
        fontFamily: 'Georgia, serif',
        fontSize: '26px',
        color: '#f0e3d0',
      })
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.subtitle = this.add
      .text(0, 0, 'the War Map', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#c8a98f',
      })
      .setOrigin(0.5, 0)
      .setDepth(100);

    // Back button.
    this.backBtn = this.add
      .text(16, 14, '‹ Residency', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffe8c8',
        backgroundColor: '#1a1230',
        padding: { x: 10, y: 6 },
      })
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.goHome();
    });

    // Info panel (bottom).
    this.infoBox = this.add
      .rectangle(0, 0, 10, 10, 0x140f24, 0.92)
      .setStrokeStyle(2, 0xffce86, 0.4)
      .setOrigin(0.5, 1)
      .setDepth(100);
    this.infoName = this.add
      .text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '20px' })
      .setOrigin(0, 0)
      .setDepth(101);
    this.infoStatus = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px' })
      .setOrigin(0, 0)
      .setDepth(101);
    this.infoDesc = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#d8c8e0',
      })
      .setOrigin(0, 0)
      .setDepth(101);

    // Action button.
    this.actBtn = this.add
      .rectangle(0, 0, 220, 42, 0x3a2858, 1)
      .setStrokeStyle(2, 0xffce86, 0.6)
      .setOrigin(0.5, 0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.actLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffe8c8',
      })
      .setOrigin(0.5)
      .setDepth(102);
    this.actBtn.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.act();
    });
  }

  createAudio() {
    if (!this.game.ambient) this.game.ambient = new Ambient();
    this.ambient = this.game.ambient;
    const startOnce = () => this.ambient.start();
    this.input.once('pointerdown', startOnce);
    this.input.keyboard.once('keydown', startOnce);

    const on0 = this.ambient.enabled;
    const circle = this.add
      .circle(0, 0, 22, 0xffffff, 0.14)
      .setStrokeStyle(2, 0xffce86, 0.5)
      .setDepth(1000)
      .setAlpha(on0 ? 1 : 0.5)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, on0 ? '♪' : '♪̷', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffe8c8',
      })
      .setOrigin(0.5)
      .setDepth(1001);
    circle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.ambient.start();
      const on = this.ambient.toggle();
      circle.setAlpha(on ? 1 : 0.5);
      label.setText(on ? '♪' : '♪̷');
    });
    this.musicButton = { circle, label, anchor: (w) => ({ x: w - 36, y: 36 }) };
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.escKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC
    );
  }

  // --- Selection & actions --------------------------------------------------

  refreshSelection() {
    const { node } = this.nodeObjs[this.selected];
    const f = FACTION[node.faction];

    this.infoName.setText(node.name).setColor(
      Phaser.Display.Color.IntegerToColor(f.color).rgba
    );
    this.infoStatus.setText(node.status || f.status).setColor('#9a86b0');
    this.infoDesc.setText(node.desc);
    this.actLabel.setText(node.label);

    const locked = node.action === 'locked';
    this.actBtn.setFillStyle(locked ? 0x2a2238 : 0x3a2858, 1);
    this.actBtn.setStrokeStyle(2, locked ? 0x6a5a7a : 0xffce86, locked ? 0.4 : 0.6);
    this.actLabel.setColor(locked ? '#8a7a9a' : '#ffe8c8');

    this.drawSelRing();
  }

  drawSelRing() {
    const { dot } = this.nodeObjs[this.selected];
    this.selRing.clear();
    this.selRing.lineStyle(2, 0xffe8c8, 0.9);
    this.selRing.strokeCircle(dot.x, dot.y, 20);
  }

  cycle(dir) {
    this.selected = (this.selected + dir + NODES.length) % NODES.length;
    this.refreshSelection();
  }

  act() {
    if (this.time.now < this.inputReadyAt) return;
    const { node } = this.nodeObjs[this.selected];
    if (node.action === 'home') this.goHome();
    else if (node.action === 'expedition') this.goTo('ExpeditionScene');
    else this.flashLocked();
  }

  flashLocked() {
    this.cameras.main.shake(180, 0.004);
    this.infoStatus.setText('Too strong — win the Shamen first.').setColor('#e0503c');
  }

  goHome() {
    this.goTo('ResidencyScene');
  }

  goTo(scene) {
    this.cameras.main.fadeOut(500, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // --- Layout ---------------------------------------------------------------

  layout(width, height) {
    this.drawMap(width, height);

    this.title.setPosition(width / 2, 14);
    this.subtitle.setPosition(width / 2, 44);

    // Nodes.
    this.nodeObjs.forEach(({ node, glow, dot, label }) => {
      const x = node.fx * width;
      const y = node.fy * height;
      glow.setPosition(x, y).setDisplaySize(120, 120);
      dot.setPosition(x, y);
      label.setPosition(x, y + 16);
    });

    // Routes.
    this.routesG.clear();
    this.routesG.lineStyle(2, 0xc8a98f, 0.35);
    ROUTES.forEach(([a, b]) => {
      const na = NODES.find((n) => n.key === a);
      const nb = NODES.find((n) => n.key === b);
      this.routesG.lineBetween(
        na.fx * width,
        na.fy * height,
        nb.fx * width,
        nb.fy * height
      );
    });

    // Info panel.
    const pw = Math.min(width - 32, 560);
    const ph = 150;
    const px = width / 2;
    const py = height - 16;
    this.infoBox.setPosition(px, py).setSize(pw, ph);
    const left = px - pw / 2 + 18;
    const top = py - ph + 14;
    this.infoName.setPosition(left, top);
    this.infoStatus.setPosition(left, top + 28);
    this.infoDesc.setPosition(left, top + 48).setWordWrapWidth(pw - 36);
    const bw = Math.min(pw - 36, 300);
    this.actBtn.setPosition(px, py - 26).setSize(bw, 40);
    this.actLabel.setPosition(px, py - 26);

    if (this.musicButton) {
      const { x, y } = this.musicButton.anchor(width, height);
      this.musicButton.circle.setPosition(x, y);
      this.musicButton.label.setPosition(x, y);
    }

    this.drawSelRing();
  }

  drawMap(width, height) {
    const g = this.bg;
    g.clear();
    // Base desert.
    g.fillStyle(0x251a38, 1);
    g.fillRect(0, 0, width, height);
    // Dune bands.
    for (let i = 0; i < 7; i += 1) {
      const y = (i / 7) * height;
      g.fillStyle(i % 2 ? 0x2c1f42 : 0x22182f, 0.6);
      g.fillRect(0, y, width, height / 14);
    }
    // The deep desert (lower-right) and the northern reach (Vorrin).
    g.fillStyle(0x1a1228, 0.6);
    g.fillRect(width * 0.45, height * 0.5, width * 0.55, height * 0.5);
    g.fillStyle(0x3a1f24, 0.25);
    g.fillRect(0, 0, width, height * 0.32);
    // Frame.
    g.lineStyle(3, 0x3a2858, 0.8);
    g.strokeRect(6, 6, width - 12, height - 12);
  }

  onResize(gameSize) {
    this.layout(gameSize.width, gameSize.height);
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) this.cycle(-1);
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.cycle(1);
    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space)
    ) {
      this.act();
    }
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) this.goHome();
  }
}
