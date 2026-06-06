import Phaser from 'phaser';
import Ambient from '../audio/Ambient.js';

// The Residency — House Calder's seat in Saltspire, and the game's hub.
// Navigated by the same side-scroll method as the desert: Eren walks the palace
// cutaway left and right; each room is a station he enters with ↑ / tap.

const START_X = 280;
const ROOM_GAP = 340;

// Rooms, left to right. `who` adds a court figure; `action: 'depart'` launches an
// expedition; everything else opens a placeholder panel for now.
const ROOMS = [
  {
    key: 'quarters',
    name: "Eren's Quarters",
    accent: 0x6fb0ff,
    body: 'Where Eren rests, and the Aurun-dreams come. (Save & reflect — coming soon.)',
  },
  {
    key: 'veil',
    name: "The Veil's Sanctum",
    accent: 0xb98cff,
    who: 'Mother Ysolde',
    body: 'Mother Ysolde of the Veil reads the threads of what may come. Prophecy and counsel. (Coming soon.)',
  },
  {
    key: 'infirmary',
    name: 'The Infirmary',
    accent: 0x7fd0a0,
    who: 'Master Orlin',
    body: 'Master Orlin tends the house. He smiles, and bows, and something behind his eyes does not settle. (Coming soon.)',
  },
  {
    key: 'court',
    name: 'The Court',
    accent: 0xffd27a,
    who: 'Lord Aldric',
    body: 'Lord Aldric Calder holds audience. The business of the house, the weight of the Imperium. (Decisions — coming soon.)',
  },
  {
    key: 'war',
    name: 'The War Room',
    accent: 0xff8a5a,
    body: 'The map of Aridun. Direct the Saltguard, mark House Vorrin’s forts, plan the campaign.',
    action: 'map',
  },
  {
    key: 'yard',
    name: "The Bladewarden's Yard",
    accent: 0xd0a070,
    who: 'Brannic',
    body: 'Brannic drills the Saltguard. Train and muster your forces. (Military — coming soon.)',
  },
  {
    key: 'deck',
    name: 'The Corsair Deck',
    accent: 0xffce86,
    body: 'A corsair waits, wings folded against the dusk. Ride out into Aridun.',
    action: 'depart',
  },
];

const RESIDENCY_WIDTH = START_X * 2 + ROOM_GAP * (ROOMS.length - 1);
const INTERACT_RANGE = 95;

export default class ResidencyScene extends Phaser.Scene {
  constructor() {
    super('ResidencyScene');
  }

  create() {
    this.touchButtons = [];
    this.panelOpen = false;
    this.roomObjs = [];

    const { width, height } = this.scale;
    this.cameras.main.setBounds(0, 0, RESIDENCY_WIDTH, height);
    this.cameras.main.roundPixels = true;

    this.buildInterior();
    this.buildRooms();
    this.createPlayer(height);
    this.createHud();
    this.setupInput();
    this.createTouchControls();
    this.createAudio();

    this.prompt = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffe8c8',
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(900)
      .setVisible(false);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(width * 0.3, height);

    this.layout(width, height);
    this.cameras.main.fadeIn(600, 6, 4, 12);
    // Ignore input briefly so a ghost click from the previous scene's tap can't
    // immediately trigger a room here.
    this.inputReadyAt = this.time.now + 400;
    this.showEntryTitle();

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
  }

  // --- Interior shell -------------------------------------------------------

  buildInterior() {
    // Static, warm back wall fixed to the camera (parallax behind the pillars).
    this.wall = this.add
      .image(0, 0, 'interiorWall')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-100);

    // Painterly architecture, all drawn across the palace in layout().
    this.ceiling = this.add.graphics().setDepth(-82);
    this.alcoves = this.add.graphics().setDepth(-72);
    this.banners = this.add.graphics().setDepth(-38);
    this.frieze = this.add.graphics().setDepth(-54);
    this.floor = this.add.graphics().setDepth(-50);
    this.lightpools = this.add
      .graphics()
      .setDepth(-44)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.columns = this.add.graphics().setDepth(-40);
    this.props = this.add.graphics().setDepth(0);

    // Drifting dust caught in the lamplight.
    this.dust = this.add
      .particles(0, 0, 'glow', {
        x: { min: 0, max: RESIDENCY_WIDTH },
        y: { min: 60, max: this.scale.height * 0.9 },
        lifespan: 9000,
        speedX: { min: -5, max: 5 },
        speedY: { min: -7, max: 4 },
        scale: { start: 0.05, end: 0 },
        alpha: { start: 0.22, end: 0 },
        tint: 0xffe0b0,
        blendMode: Phaser.BlendModes.ADD,
        frequency: 260,
        quantity: 1,
      })
      .setDepth(6)
      .setScrollFactor(0.4);

    // Edge vignette for mood.
    this.vignette = this.add
      .image(0, 0, 'vignette')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(940);
  }

  buildRooms() {
    ROOMS.forEach((room, i) => {
      const x = START_X + i * ROOM_GAP;
      room.x = x;

      // A coloured glow filling the room's alcove.
      const accent = this.add
        .image(x, 0, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(room.accent)
        .setAlpha(0.22)
        .setDepth(-71);

      // A hanging lamp with a soft flicker.
      const lamp = this.add
        .image(x, 0, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd9a0)
        .setAlpha(0.55)
        .setDepth(-30);
      this.tweens.add({
        targets: lamp,
        alpha: { from: 0.45, to: 0.62 },
        duration: 1200 + Math.random() * 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });

      // The interaction marker — a pulsing Aurun mote.
      const marker = this.add
        .image(x, 0, 'aurun')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1)
        .setScale(0.9)
        .setInteractive({ useHandCursor: true });
      marker.on('pointerdown', (p, lx, ly, e) => {
        e?.stopPropagation();
        this.openRoom(room);
      });
      this.tweens.add({
        targets: marker,
        scale: { from: 0.85, to: 1.15 },
        alpha: { from: 0.8, to: 1 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });

      // Optional court figure.
      let figure = null;
      let nameLabel = null;
      if (room.who) {
        figure = this.add
          .image(x + 40, 0, 'figure')
          .setTint(room.accent)
          .setDepth(1);
        nameLabel = this.add
          .text(x + 40, 0, room.who, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#d8c4b0',
          })
          .setOrigin(0.5, 1)
          .setDepth(2);
      }

      // A faint etched room name on the wall.
      const label = this.add
        .text(x, 0, room.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '15px',
          color: '#9a86b0',
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.65)
        .setDepth(0);

      this.roomObjs.push({ room, accent, lamp, marker, figure, nameLabel, label });
    });
  }

  createPlayer(height) {
    const floorY = height - 70;
    this.player = this.add.image(ROOMS[3].x, floorY - 26, 'eren').setDepth(3);
    this.facing = 1;
  }

  createHud() {
    const aurun = this.registry.get('aurun') || 0;
    const water = this.registry.get('water') ?? 100;
    this.registry.set('water', water);
    this.hudText = this.add
      .text(16, 14, `Aurun  ${aurun}     Water  ${water}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffce86',
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  showEntryTitle() {
    const { width, height } = this.scale;
    const first = !this.registry.get('enteredResidency');
    this.registry.set('enteredResidency', true);

    const main = first ? 'ARRADIUS' : 'The Residency';
    const sub = first ? 'House Calder · the Residency at Saltspire' : 'Saltspire';

    const t1 = this.add
      .text(width / 2, height * 0.38, main, {
        fontFamily: 'Georgia, serif',
        fontSize: first ? '46px' : '30px',
        color: '#f0e3d0',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);
    const t2 = this.add
      .text(width / 2, height * 0.38 + 38, sub, {
        fontFamily: 'Georgia, serif',
        fontSize: '15px',
        color: '#c8a98f',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);

    this.tweens.add({
      targets: [t1, t2],
      alpha: 1,
      duration: 1400,
      hold: 1800,
      yoyo: true,
      onComplete: () => {
        t1.destroy();
        t2.destroy();
      },
    });
  }

  // --- Input ----------------------------------------------------------------

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      interact: Phaser.Input.Keyboard.KeyCodes.W,
    });
    this.touch = { left: false, right: false };
  }

  createTouchControls() {
    const hasTouch =
      this.sys.game.device.input.touch ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0;
    if (!hasTouch) return;

    const makeButton = (anchor, label, opts) => {
      const circle = this.add
        .circle(0, 0, 38, 0xffffff, 0.14)
        .setStrokeStyle(2, 0xffce86, 0.5)
        .setScrollFactor(0)
        .setDepth(1000)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(0, 0, label, {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#ffe8c8',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1001);
      if (opts.down) circle.on('pointerdown', opts.down);
      if (opts.up) {
        circle.on('pointerup', opts.up);
        circle.on('pointerout', opts.up);
      }
      this.touchButtons.push({ circle, text, anchor });
    };

    const pad = 70;
    makeButton((w, h) => ({ x: pad, y: h - pad }), '◀', {
      down: () => (this.touch.left = true),
      up: () => (this.touch.left = false),
    });
    makeButton((w, h) => ({ x: pad + 92, y: h - pad }), '▶', {
      down: () => (this.touch.right = true),
      up: () => (this.touch.right = false),
    });
    makeButton((w, h) => ({ x: w - pad, y: h - pad }), '▲', {
      down: () => this.tryInteract(),
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
      .setScrollFactor(0)
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
      .setScrollFactor(0)
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

  // --- Interaction ----------------------------------------------------------

  nearestRoom() {
    let best = null;
    let bestDist = INTERACT_RANGE;
    this.roomObjs.forEach(({ room }) => {
      const d = Math.abs(room.x - this.player.x);
      if (d < bestDist) {
        bestDist = d;
        best = room;
      }
    });
    return best;
  }

  tryInteract() {
    if (this.time.now < this.inputReadyAt) return;
    if (this.panelOpen) {
      this.closePanel();
      return;
    }
    const room = this.nearestRoom();
    if (room) this.openRoom(room);
  }

  openRoom(room) {
    if (this.panelOpen) return;
    if (room.action === 'depart') {
      this.goTo('ExpeditionScene');
      return;
    }
    if (room.action === 'map') {
      this.goTo('WorldMapScene');
      return;
    }
    this.openPanel(room.name, room.body);
  }

  goTo(scene) {
    this.cameras.main.fadeOut(600, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  openPanel(title, body) {
    this.panelOpen = true;
    // Guard against the synthesized "ghost click" mobile browsers fire shortly
    // after a tap, which would otherwise dismiss the panel the instant it opens.
    this.panelOpenedAt = this.time.now;
    const { width, height } = this.scale;
    const pw = Math.min(width * 0.8, 460);
    const ph = Math.min(height * 0.6, 260);
    const cx = width / 2;
    const cy = height / 2;

    const scrim = this.add
      .rectangle(0, 0, width, height, 0x05030a, 0.62)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(3000)
      .setInteractive();
    scrim.on('pointerdown', () => this.closePanel());

    const box = this.add
      .rectangle(cx, cy, pw, ph, 0x1a1230, 0.96)
      .setStrokeStyle(2, 0xffce86, 0.6)
      .setScrollFactor(0)
      .setDepth(3001);

    const titleText = this.add
      .text(cx, cy - ph / 2 + 26, title, {
        fontFamily: 'Georgia, serif',
        fontSize: '24px',
        color: '#ffe8c8',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3002);

    const bodyText = this.add
      .text(cx, cy - 6, body, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#d8c8e0',
        align: 'center',
        wordWrap: { width: pw - 44 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3002);

    const hint = this.add
      .text(cx, cy + ph / 2 - 22, 'press ▲ / ↑ or tap to close', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9a86b0',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3002);

    this.panel = [scrim, box, titleText, bodyText, hint];
  }

  closePanel() {
    if (!this.panel) return;
    // Ignore dismiss attempts within the ghost-click window after opening.
    if (this.time.now - this.panelOpenedAt < 400) return;
    this.panel.forEach((o) => o.destroy());
    this.panel = null;
    this.panelOpen = false;
  }

  // --- Layout ---------------------------------------------------------------

  layout(width, height) {
    this.cameras.main.setBounds(0, 0, RESIDENCY_WIDTH, height);
    this.cameras.main.setDeadzone(width * 0.3, height);
    this.moveSpeed = Phaser.Math.Clamp(width * 0.32, 190, 460);

    this.wall.setDisplaySize(width, height);
    this.vignette.setDisplaySize(width, height);

    const floorY = height - 70;
    const colTop = height * 0.12;
    this.drawArchitecture(width, height, floorY, colTop);
    this.drawProps(floorY);

    // Per-room props.
    this.roomObjs.forEach(({ room, accent, lamp, marker, figure, nameLabel, label }) => {
      accent.setPosition(room.x, floorY - 80).setDisplaySize(280, 280);
      lamp.setPosition(room.x, colTop + 20).setDisplaySize(120, 120);
      marker.setPosition(room.x, floorY - 28);
      label.setPosition(room.x, colTop + 16);
      if (figure) figure.setPosition(room.x + 46, floorY - 27);
      if (nameLabel) nameLabel.setPosition(room.x + 46, floorY - 56);
    });

    this.player.y = floorY - 26;

    this.touchButtons.forEach(({ circle, text, anchor }) => {
      const { x, y } = anchor(width, height);
      circle.setPosition(x, y);
      text.setPosition(x, y);
    });
    if (this.musicButton) {
      const { x, y } = this.musicButton.anchor(width, height);
      this.musicButton.circle.setPosition(x, y);
      this.musicButton.label.setPosition(x, y);
    }
  }

  onResize(gameSize) {
    this.layout(gameSize.width, gameSize.height);
  }

  // --- Painterly architecture ----------------------------------------------

  drawArchitecture(width, height, floorY, colTop) {
    // Ceiling band.
    const c = this.ceiling;
    c.clear();
    c.fillStyle(0x130c20, 1);
    c.fillRect(0, 0, RESIDENCY_WIDTH, colTop);

    // Frieze: a gold line under the ceiling with a row of studs.
    const f = this.frieze;
    f.clear();
    f.fillStyle(0xc9a24a, 0.85);
    f.fillRect(0, colTop - 5, RESIDENCY_WIDTH, 3);
    f.fillStyle(0x7a5a26, 0.8);
    f.fillRect(0, colTop - 2, RESIDENCY_WIDTH, 2);
    f.fillStyle(0xc9a24a, 0.6);
    for (let x = 16; x < RESIDENCY_WIDTH; x += 30) f.fillCircle(x, colTop - 11, 1.6);

    // Arched alcoves behind each room.
    const a = this.alcoves;
    a.clear();
    ROOMS.forEach((room) => {
      const w = ROOM_GAP * 0.62;
      const top = colTop + 16;
      const r = w / 2;
      a.fillStyle(0x180f2c, 1);
      a.fillRoundedRect(room.x - r, top, w, floorY - top, { tl: r, tr: r, bl: 0, br: 0 });
      a.fillStyle(0x231541, 1);
      a.fillRoundedRect(room.x - r + 6, top + 6, w - 12, floorY - top - 6, {
        tl: r - 6,
        tr: r - 6,
        bl: 0,
        br: 0,
      });
    });

    // Floor: stone, seams, and a House Calder carpet runner.
    const fl = this.floor;
    fl.clear();
    fl.fillStyle(0x140d20, 1);
    fl.fillRect(0, floorY, RESIDENCY_WIDTH, height - floorY + 10);
    fl.fillStyle(0x2a1d3a, 1);
    fl.fillRect(0, floorY, RESIDENCY_WIDTH, 4);
    fl.fillStyle(0x1d1330, 0.6);
    for (let x = 0; x < RESIDENCY_WIDTH; x += 80) fl.fillRect(x, floorY + 6, 2, height - floorY);
    const ry = floorY + 12;
    fl.fillStyle(0x243a64, 0.95);
    fl.fillRect(0, ry, RESIDENCY_WIDTH, 16);
    fl.fillStyle(0xc9a24a, 0.7);
    fl.fillRect(0, ry, RESIDENCY_WIDTH, 2);
    fl.fillRect(0, ry + 14, RESIDENCY_WIDTH, 2);

    // Warm light pools on the floor beneath each lamp.
    const lp = this.lightpools;
    lp.clear();
    ROOMS.forEach((room) => {
      lp.fillStyle(0xffcaa0, 0.1);
      lp.fillEllipse(room.x, floorY + 8, ROOM_GAP * 0.72, 30);
    });

    // Fluted columns with gold capitals and bases.
    const co = this.columns;
    co.clear();
    const sw = 22;
    for (let i = 0; i <= ROOMS.length; i += 1) {
      const x = START_X - ROOM_GAP / 2 + i * ROOM_GAP;
      const colH = floorY - colTop;
      co.fillStyle(0x2a1c44, 1);
      co.fillRect(x - sw / 2, colTop, sw, colH);
      co.fillStyle(0x42306a, 1); // lit edge
      co.fillRect(x - sw / 2, colTop, 5, colH);
      co.fillStyle(0x180f28, 1); // shadowed edge
      co.fillRect(x + sw / 2 - 4, colTop, 4, colH);
      co.fillStyle(0x1d1334, 0.8); // fluting
      co.fillRect(x - 4, colTop, 1, colH);
      co.fillRect(x + 2, colTop, 1, colH);
      co.fillStyle(0x3a2858, 1); // capital
      co.fillRect(x - sw / 2 - 6, colTop - 14, sw + 12, 14);
      co.fillStyle(0xc9a24a, 0.8);
      co.fillRect(x - sw / 2 - 6, colTop - 14, sw + 12, 3);
      co.fillStyle(0x241640, 1); // base
      co.fillRect(x - sw / 2 - 6, floorY - 10, sw + 12, 10);
      co.fillStyle(0xc9a24a, 0.5);
      co.fillRect(x - sw / 2 - 6, floorY - 10, sw + 12, 2);
    }

    // House Calder banners on the interior columns.
    const b = this.banners;
    b.clear();
    const len = (floorY - colTop) * 0.42;
    for (let i = 1; i < ROOMS.length; i += 1) {
      const x = START_X - ROOM_GAP / 2 + i * ROOM_GAP;
      this.drawBanner(b, x, colTop + 6, len);
    }
  }

  drawBanner(g, x, topY, len) {
    const w = 26;
    g.fillStyle(0x3a2858, 1); // crossbar
    g.fillRect(x - w / 2 - 4, topY, w + 8, 4);
    g.fillStyle(0x243a64, 1); // field
    g.fillRect(x - w / 2, topY + 4, w, len);
    g.fillTriangle(x - w / 2, topY + 4 + len, x + w / 2, topY + 4 + len, x, topY + 4 + len + 12);
    g.fillStyle(0xc9a24a, 0.9); // gold borders
    g.fillRect(x - w / 2, topY + 4, 2, len);
    g.fillRect(x + w / 2 - 2, topY + 4, 2, len);
    // Sigil: a gold chevron over a disc.
    const cy = topY + 4 + len * 0.42;
    g.fillStyle(0xc9a24a, 1);
    g.fillTriangle(x - 8, cy, x + 8, cy, x, cy - 10);
    g.fillCircle(x, cy + 8, 3);
  }

  drawFlame(g, fx, fy) {
    g.fillStyle(0xddd0c0, 1);
    g.fillRect(fx - 2, fy - 14, 4, 14);
    g.fillStyle(0xff8a3a, 0.9);
    g.fillEllipse(fx, fy - 18, 6, 12);
    g.fillStyle(0xffe0a0, 1);
    g.fillEllipse(fx, fy - 18, 3, 7);
  }

  drawProps(floorY) {
    const p = this.props;
    p.clear();
    ROOMS.forEach((room) => {
      const x = room.x;
      switch (room.key) {
        case 'quarters':
          this.propQuarters(p, x, floorY);
          break;
        case 'veil':
          this.propVeil(p, x, floorY);
          break;
        case 'infirmary':
          this.propInfirmary(p, x, floorY);
          break;
        case 'court':
          this.propCourt(p, x, floorY);
          break;
        case 'war':
          this.propWar(p, x, floorY);
          break;
        case 'yard':
          this.propYard(p, x, floorY);
          break;
        case 'deck':
          this.propDeck(p, x, floorY);
          break;
        default:
          break;
      }
    });
  }

  propQuarters(p, x, floorY) {
    p.fillStyle(0x3a2850, 1);
    p.fillRect(x - 74, floorY - 22, 60, 22);
    p.fillStyle(0x5a466e, 1);
    p.fillRect(x - 74, floorY - 26, 60, 8);
    p.fillStyle(0xcfc0d8, 1);
    p.fillRect(x - 70, floorY - 28, 18, 8);
    // Arched night window.
    p.fillStyle(0x0c1430, 1);
    p.fillRoundedRect(x + 20, floorY - 120, 40, 96, { tl: 20, tr: 20, bl: 0, br: 0 });
    p.fillStyle(0x6fa0d0, 0.5);
    p.fillCircle(x + 40, floorY - 92, 7);
    p.fillStyle(0xffffff, 0.85);
    p.fillCircle(x + 28, floorY - 104, 1);
    p.fillCircle(x + 52, floorY - 110, 1);
    p.fillCircle(x + 48, floorY - 86, 1);
  }

  propVeil(p, x, floorY) {
    p.fillStyle(0x3a2a6a, 0.8);
    for (let k = -1; k <= 1; k += 1) p.fillRect(x - 52 + k * 38, floorY - 150, 14, 128);
    p.fillStyle(0xb98cff, 0.5);
    p.fillCircle(x, floorY - 110, 16);
    p.fillStyle(0x231541, 1);
    p.fillCircle(x, floorY - 110, 12);
    p.fillStyle(0xb98cff, 0.8);
    p.fillCircle(x, floorY - 110, 3);
    this.drawFlame(p, x - 60, floorY - 24);
    this.drawFlame(p, x + 60, floorY - 24);
  }

  propInfirmary(p, x, floorY) {
    const cols = [0x7fd0a0, 0xff8a5a, 0x6fb0ff, 0xffd27a];
    p.fillStyle(0x3a2850, 1);
    p.fillRect(x - 74, floorY - 92, 52, 6);
    p.fillRect(x - 74, floorY - 66, 52, 6);
    for (let i = 0; i < 4; i += 1) {
      p.fillStyle(cols[i], 0.9);
      p.fillRect(x - 72 + i * 12, floorY - 102, 7, 10);
      p.fillStyle(cols[(i + 1) % 4], 0.9);
      p.fillRect(x - 72 + i * 12, floorY - 76, 7, 10);
    }
    p.fillStyle(0x2e2142, 1);
    p.fillRect(x + 14, floorY - 14, 56, 14);
    p.fillStyle(0x4a3a5e, 1);
    p.fillRect(x + 14, floorY - 18, 56, 6);
  }

  propCourt(p, x, floorY) {
    p.fillStyle(0x2a1d40, 1);
    p.fillRect(x - 62, floorY - 10, 124, 10);
    p.fillStyle(0x33244e, 1);
    p.fillRect(x - 44, floorY - 20, 88, 10);
    p.fillStyle(0x3a2858, 1);
    p.fillRect(x - 16, floorY - 66, 32, 46);
    p.fillStyle(0x243a64, 1);
    p.fillRect(x - 14, floorY - 42, 28, 6);
    p.fillStyle(0xc9a24a, 1);
    p.fillCircle(x - 16, floorY - 68, 3);
    p.fillCircle(x + 16, floorY - 68, 3);
  }

  propWar(p, x, floorY) {
    p.fillStyle(0x2e2142, 1);
    p.fillRect(x - 50, floorY - 30, 100, 8);
    p.fillStyle(0x241a36, 1);
    p.fillRect(x - 46, floorY - 22, 8, 22);
    p.fillRect(x + 38, floorY - 22, 8, 22);
    p.fillStyle(0xb89a6a, 0.95);
    p.fillRect(x - 40, floorY - 35, 80, 6);
    p.fillStyle(0xe0503c, 1);
    p.fillCircle(x - 20, floorY - 32, 2);
    p.fillStyle(0x6fb0ff, 1);
    p.fillCircle(x + 6, floorY - 32, 2);
    p.fillStyle(0xffce86, 1);
    p.fillCircle(x + 24, floorY - 32, 2);
  }

  propYard(p, x, floorY) {
    p.fillStyle(0x3a2850, 1);
    p.fillRect(x - 66, floorY - 70, 6, 70);
    p.fillRect(x - 22, floorY - 70, 6, 70);
    p.fillRect(x - 66, floorY - 70, 50, 5);
    p.fillStyle(0xcfd0d8, 1);
    p.fillRect(x - 58, floorY - 64, 3, 54);
    p.fillRect(x - 48, floorY - 64, 3, 54);
    p.fillStyle(0xc9a24a, 1);
    p.fillRect(x - 59, floorY - 14, 5, 4);
    p.fillRect(x - 49, floorY - 14, 5, 4);
    // Training dummy.
    p.fillStyle(0x5a4632, 1);
    p.fillRect(x + 34, floorY - 44, 10, 44);
    p.fillStyle(0x7a5a3a, 1);
    p.fillCircle(x + 39, floorY - 50, 9);
    p.fillStyle(0x6a4a2a, 1);
    p.fillRect(x + 22, floorY - 40, 34, 8);
  }

  propDeck(p, x, floorY) {
    // Arched opening to the dusk sky.
    p.fillStyle(0x4a2858, 1);
    p.fillRoundedRect(x - 70, floorY - 152, 140, 142, { tl: 70, tr: 70, bl: 0, br: 0 });
    p.fillStyle(0x7a4a3a, 1);
    p.fillRoundedRect(x - 62, floorY - 144, 124, 134, { tl: 62, tr: 62, bl: 0, br: 0 });
    p.fillStyle(0xffce86, 0.5);
    p.fillCircle(x + 28, floorY - 102, 18);
    // Docked corsair silhouette.
    p.fillStyle(0x1a1224, 1);
    p.fillEllipse(x, floorY - 38, 54, 12);
    p.fillTriangle(x - 40, floorY - 44, x - 6, floorY - 50, x - 6, floorY - 36);
    p.fillTriangle(x + 40, floorY - 44, x + 6, floorY - 50, x + 6, floorY - 36);
  }

  // --- Loop -----------------------------------------------------------------

  update(_time, delta) {
    // Interact (keyboard, debounced).
    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.interact)
    ) {
      this.tryInteract();
    }

    if (this.panelOpen) {
      this.updatePrompt(null);
      return;
    }

    const left = this.cursors.left.isDown || this.keys.left.isDown || this.touch.left;
    const right =
      this.cursors.right.isDown || this.keys.right.isDown || this.touch.right;

    const step = (this.moveSpeed * delta) / 1000;
    if (left) {
      this.player.x -= step;
      this.player.setFlipX(true);
    } else if (right) {
      this.player.x += step;
      this.player.setFlipX(false);
    }
    this.player.x = Phaser.Math.Clamp(this.player.x, 60, RESIDENCY_WIDTH - 60);

    this.updatePrompt(this.nearestRoom());
  }

  updatePrompt(room) {
    if (!room) {
      this.prompt.setVisible(false);
      return;
    }
    const verb = room.action === 'depart' ? 'ride out' : 'enter';
    this.prompt
      .setText(`▲  ${room.name}  — ${verb}`)
      .setPosition(room.x, this.player.y - 40)
      .setVisible(true);
  }
}
