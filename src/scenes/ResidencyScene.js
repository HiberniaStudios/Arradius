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
    // Static back wall (interior dusk), fixed to the camera.
    this.wall = this.add
      .image(0, 0, 'sky')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-100)
      .setTint(0x4a3a66);

    // Floor and columns are drawn across the whole palace in layout().
    this.floor = this.add.graphics().setDepth(-10);
    this.columns = this.add.graphics().setDepth(-8);
  }

  buildRooms() {
    ROOMS.forEach((room, i) => {
      const x = START_X + i * ROOM_GAP;
      room.x = x;

      // A coloured wall-glow to code each room.
      const accent = this.add
        .image(x, 0, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(room.accent)
        .setAlpha(0.35)
        .setDepth(-9);

      // A hanging lamp.
      const lamp = this.add
        .image(x, 0, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd9a0)
        .setAlpha(0.6)
        .setDepth(-7);

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

    const floorY = height - 70;

    // Floor.
    this.floor.clear();
    this.floor.fillStyle(0x0f0a1c, 1);
    this.floor.fillRect(0, floorY, RESIDENCY_WIDTH, height - floorY + 10);
    this.floor.fillStyle(0x1d1330, 1);
    this.floor.fillRect(0, floorY, RESIDENCY_WIDTH, 5);

    // Columns between and around the rooms.
    this.columns.clear();
    const colTop = height * 0.12;
    for (let i = 0; i <= ROOMS.length; i += 1) {
      const x = START_X - ROOM_GAP / 2 + i * ROOM_GAP;
      this.columns.fillStyle(0x281a40, 1);
      this.columns.fillRect(x - 10, colTop, 20, floorY - colTop);
      this.columns.fillStyle(0x3a2858, 1);
      this.columns.fillRect(x - 10, colTop, 4, floorY - colTop);
      // Capital.
      this.columns.fillStyle(0x32224e, 1);
      this.columns.fillRect(x - 16, colTop - 10, 32, 12);
    }

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
