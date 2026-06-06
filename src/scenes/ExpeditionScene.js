import Phaser from 'phaser';
import Ambient from '../audio/Ambient.js';

// The first painterly slice of Arradius — a hooded walk across the dunes toward
// a Hollow, gathering Aurun. A scrolling world wider than the screen, with
// parallax dune layers and an ambient soundbed.

const WORLD_WIDTH = 2800;
const GRAVITY = 900;
const JUMP_HEIGHT_RATIO = 0.34; // peak jump as a fraction of screen height
const GROUND_HEIGHT = 64;
const PLATFORM_HEIGHT = 16;

// Ledges and Aurun positioned in world space: fx is a fraction of WORLD_WIDTH,
// fy a fraction of screen height. The path climbs and falls toward the Hollow.
const LEDGES = [
  { fx: 0.07, fy: 0.7, w: 130 },
  { fx: 0.15, fy: 0.55, w: 110 },
  { fx: 0.23, fy: 0.64, w: 120 },
  { fx: 0.31, fy: 0.47, w: 120 },
  { fx: 0.41, fy: 0.6, w: 150 },
  { fx: 0.51, fy: 0.44, w: 120 },
  { fx: 0.61, fy: 0.56, w: 130 },
  { fx: 0.71, fy: 0.42, w: 120 },
  { fx: 0.81, fy: 0.54, w: 150 },
  { fx: 0.9, fy: 0.64, w: 170 },
];
const AURUN = [
  { fx: 0.15, fy: 0.46 },
  { fx: 0.31, fy: 0.38 },
  { fx: 0.41, fy: 0.5 },
  { fx: 0.51, fy: 0.35 },
  { fx: 0.61, fy: 0.46 },
  { fx: 0.71, fy: 0.33 },
  { fx: 0.81, fy: 0.45 },
  { fx: 0.46, fy: 0.74 },
];

// Parallax dune layers, far to near: baseline (fraction of height), wave
// amplitude, colour, and scroll factor (smaller = further away).
const DUNES = [
  { fy: 0.56, amp: 26, color: 0x3a2350, scroll: 0.2 },
  { fy: 0.67, amp: 34, color: 0x2a1838, scroll: 0.45 },
  { fy: 0.79, amp: 42, color: 0x180f24, scroll: 0.72 },
];

export default class ExpeditionScene extends Phaser.Scene {
  constructor() {
    super('ExpeditionScene');
    this.aurun = 0;
  }

  create() {
    this.aurun = 0;
    this.returning = false;
    this.solids = [];
    this.touchButtons = [];

    const { width, height } = this.scale;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, height);
    this.cameras.main.roundPixels = true;
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, height);

    this.buildAtmosphere(width, height);
    this.buildLevel();
    this.createPlayer(height);
    this.createAurun(height);
    this.createHud();
    this.setupInput();
    this.createTouchControls();
    this.createAudio();
    this.createTitle();

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.overlap(
      this.player,
      this.aurunGroup,
      this.collectAurun,
      null,
      this
    );

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(width * 0.25, height);

    this.layout(width, height);

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
  }

  // --- Atmosphere -----------------------------------------------------------

  buildAtmosphere(width, height) {
    // Sky: fixed to the camera, stretched to fill.
    this.sky = this.add
      .image(0, 0, 'sky')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-100);

    // A faint scatter of stars across the night half of the sky.
    this.starField = Array.from({ length: 70 }, () => ({
      fx: Math.random(),
      fy: Math.random() * 0.45,
      r: Math.random() * 1.4 + 0.4,
      a: Math.random() * 0.5 + 0.3,
    }));
    this.stars = this.add.graphics().setScrollFactor(0).setDepth(-99);
    this.tweens.add({
      targets: this.stars,
      alpha: { from: 0.7, to: 1 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Sun: a hazy glow low in the sky, with a brighter core.
    this.sun = this.add
      .image(0, 0, 'glow')
      .setScrollFactor(0)
      .setDepth(-90)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sunCore = this.add
      .image(0, 0, 'glow')
      .setScrollFactor(0)
      .setDepth(-89)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffe9c0);

    // God-rays fanning from the sun (redrawn on resize).
    this.rays = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(-88)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Horizon haze band.
    this.haze = this.add
      .image(0, 0, 'glow')
      .setScrollFactor(0)
      .setDepth(-82)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0x9a5fb0);

    // Distant rock spires — hazy landmarks far behind the dunes.
    this.spireDefs = [
      { fx: 0.12, h: 0.16, w: 34 },
      { fx: 0.28, h: 0.1, w: 26 },
      { fx: 0.44, h: 0.21, w: 42 },
      { fx: 0.58, h: 0.13, w: 30 },
      { fx: 0.73, h: 0.23, w: 46 },
      { fx: 0.88, h: 0.12, w: 28 },
    ];
    this.spires = this.add.graphics().setScrollFactor(0.15).setDepth(-86);

    // Parallax dune silhouettes.
    this.duneLayers = DUNES.map((def) =>
      this.add.graphics().setScrollFactor(def.scroll).setDepth(-80 + def.scroll * 10)
    );

    // Drifting Aurun motes in the air.
    this.motes = this.add
      .particles(0, 0, 'aurun', {
        x: { min: 0, max: WORLD_WIDTH },
        y: { min: height * 0.3, max: height },
        lifespan: 7000,
        speedY: { min: -14, max: -4 },
        speedX: { min: -8, max: 8 },
        scale: { start: 0.18, end: 0 },
        alpha: { start: 0.5, end: 0 },
        frequency: 240,
        quantity: 1,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setScrollFactor(0.5)
      .setDepth(-55);
  }

  redrawAtmosphere(width, height) {
    this.sky.setDisplaySize(width, height);

    // Stars.
    this.stars.clear();
    this.starField.forEach((s) => {
      this.stars.fillStyle(0xfff4e0, s.a);
      this.stars.fillCircle(s.fx * width, s.fy * height, s.r);
    });

    const sunX = width * 0.72;
    const sunY = height * 0.26;
    const sunSize = Math.max(width, height) * 1.0;
    this.sun.setPosition(sunX, sunY).setDisplaySize(sunSize, sunSize);
    this.sunCore
      .setPosition(sunX, sunY)
      .setDisplaySize(sunSize * 0.42, sunSize * 0.42);

    this.haze
      .setPosition(width * 0.5, height * 0.72)
      .setDisplaySize(width * 1.7, height * 0.55);

    // Distant spires (drawn across the world; hazy atmospheric colour).
    this.spires.clear();
    const spireBase = height * 0.64;
    this.spireDefs.forEach((s) => {
      const x = s.fx * WORLD_WIDTH;
      const peak = s.h * height;
      this.spires.fillStyle(0x4a3360, 1);
      this.spires.fillTriangle(
        x - s.w,
        spireBase,
        x + s.w,
        spireBase,
        x,
        spireBase - peak
      );
    });

    // God-rays: a soft fan of translucent wedges from the sun toward the ground.
    this.rays.clear();
    const rayTopY = sunY + sunSize * 0.04;
    for (let i = -7; i <= 7; i += 1) {
      const t = Math.abs(i) / 7;
      const spread = i * width * 0.05;
      const halfW = 16 + (1 - t) * 26;
      this.rays.fillStyle(0xffe2b0, 0.06 * (1 - t * 0.7));
      this.rays.fillTriangle(
        sunX,
        rayTopY,
        sunX + spread - halfW,
        height,
        sunX + spread + halfW,
        height
      );
    }

    // Dune silhouettes across the whole world width.
    this.duneLayers.forEach((g, idx) => {
      const def = DUNES[idx];
      g.clear();
      g.fillStyle(def.color, 1);
      const baseY = height * def.fy;
      const points = [];
      const step = 24;
      for (let x = 0; x <= WORLD_WIDTH; x += step) {
        const y =
          baseY +
          Math.sin(x * 0.0016 + idx * 1.7) * def.amp +
          Math.sin(x * 0.006 + idx) * (def.amp * 0.4);
        points.push({ x, y });
      }
      points.push({ x: WORLD_WIDTH, y: height + 50 });
      points.push({ x: 0, y: height + 50 });
      g.fillPoints(points, true);
    });
  }

  // --- Level ----------------------------------------------------------------

  makeSolid(color, highlight) {
    const rect = this.add.rectangle(0, 0, 10, 10, color);
    this.physics.add.existing(rect, true);
    this.solids.push(rect);
    if (highlight) {
      // A thin Aurun-tinted lip so ledges read against the dark dunes.
      rect.lip = this.add.rectangle(0, 0, 10, 3, 0xc88a4a, 0.5).setDepth(1);
    }
    return rect;
  }

  buildLevel() {
    this.ground = this.makeSolid(0x120b1c, false);
    this.ledges = LEDGES.map((def) => {
      const rect = this.makeSolid(0x241634, true);
      rect.setData('def', def);
      return rect;
    });
    this.buildHollow();
  }

  /** The glowing Hollow entrance at the far end of the slice. */
  buildHollow() {
    const x = WORLD_WIDTH - 150;
    this.hollowGlow = this.add
      .image(x, 0, 'glow')
      .setDepth(-12)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffb24a);
    this.hollowArch = this.add.graphics().setDepth(-11);
    this.hollowX = x;

    this.tweens.add({
      targets: this.hollowGlow,
      alpha: { from: 0.5, to: 0.9 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  createPlayer(height) {
    this.player = this.physics.add.sprite(120, height * 0.4, 'eren');
    this.player.body.setSize(15, 44).setOffset(8, 8);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(2);
  }

  createAurun(height) {
    this.aurunGroup = this.physics.add.group();
    AURUN.forEach((def, i) => {
      const a = this.aurunGroup.create(def.fx * WORLD_WIDTH, def.fy * height, 'aurun');
      a.body.setAllowGravity(false);
      a.setBlendMode(Phaser.BlendModes.ADD);
      a.setScale(0.8);
      a.setDepth(1);
      a.setData('def', def);
      a.setData('baseY', def.fy * height);
      a.setData('phase', i * 1.3);
    });
  }

  createHud() {
    this.hudText = this.add
      .text(16, 14, `Aurun  ${this.registry.get('aurun') || 0}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffce86',
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  createTitle() {
    const { width, height } = this.scale;
    const title = this.add
      .text(width / 2, height * 0.4, 'ARIDUN', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        color: '#f0e3d0',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);
    const sub = this.add
      .text(width / 2, height * 0.4 + 38, '— the deep desert —', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#c8a98f',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);

    this.titleObjects = [title, sub];
    this.tweens.add({
      targets: this.titleObjects,
      alpha: 1,
      duration: 1800,
      hold: 2200,
      yoyo: true,
      onComplete: () => this.titleObjects.forEach((o) => o.destroy()),
    });
  }

  // --- Input ----------------------------------------------------------------

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.touch = { left: false, right: false, jump: false };
  }

  createTouchControls() {
    const hasTouch =
      this.sys.game.device.input.touch ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0;
    if (!hasTouch) return;

    const makeButton = (anchor, label, onDown, onUp) => {
      const circle = this.add
        .circle(0, 0, 38, 0xffffff, 0.14)
        .setStrokeStyle(2, 0xffce86, 0.5)
        .setScrollFactor(0)
        .setDepth(1000)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(0, 0, label, {
          fontFamily: 'monospace',
          fontSize: '30px',
          color: '#ffe8c8',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1001);
      circle.on('pointerdown', onDown);
      circle.on('pointerup', onUp);
      circle.on('pointerout', onUp);
      this.touchButtons.push({ circle, text, anchor });
    };

    const pad = 70;
    makeButton(
      (w, h) => ({ x: pad, y: h - pad }),
      '◀',
      () => (this.touch.left = true),
      () => (this.touch.left = false)
    );
    makeButton(
      (w, h) => ({ x: pad + 92, y: h - pad }),
      '▶',
      () => (this.touch.right = true),
      () => (this.touch.right = false)
    );
    makeButton(
      (w, h) => ({ x: w - pad, y: h - pad }),
      '▲',
      () => (this.touch.jump = true),
      () => (this.touch.jump = false)
    );

    this.input.addPointer(2);
  }

  createAudio() {
    // One ambient bed for the whole game, persisting across scene changes.
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

    circle.on('pointerdown', (pointer, x, y, event) => {
      event?.stopPropagation();
      this.ambient.start();
      const on = this.ambient.toggle();
      circle.setAlpha(on ? 1 : 0.5);
      label.setText(on ? '♪' : '♪̷');
    });

    this.musicButton = { circle, label, anchor: (w) => ({ x: w - 36, y: 36 }) };
  }

  // --- Layout ---------------------------------------------------------------

  layout(width, height) {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, height);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, height);
    this.cameras.main.setDeadzone(width * 0.25, height);

    this.moveSpeed = Phaser.Math.Clamp(width * 0.32, 190, 460);
    this.jumpVel = Math.sqrt(2 * GRAVITY * (height * JUMP_HEIGHT_RATIO));

    this.redrawAtmosphere(width, height);

    // Ground spans the world along the bottom.
    this.ground.setSize(WORLD_WIDTH, GROUND_HEIGHT);
    this.ground.setPosition(WORLD_WIDTH / 2, height - GROUND_HEIGHT / 2);
    this.ground.body.updateFromGameObject();

    // Ledges.
    this.ledges.forEach((rect) => {
      const def = rect.getData('def');
      const x = def.fx * WORLD_WIDTH;
      const y = def.fy * height;
      rect.setSize(def.w, PLATFORM_HEIGHT);
      rect.setPosition(x, y);
      rect.body.updateFromGameObject();
      if (rect.lip) {
        rect.lip.setSize(def.w, 3);
        rect.lip.setPosition(x, y - PLATFORM_HEIGHT / 2);
      }
    });

    // Aurun bob baselines.
    this.aurunGroup.getChildren().forEach((a) => {
      const def = a.getData('def');
      a.x = def.fx * WORLD_WIDTH;
      a.setData('baseY', def.fy * height);
    });

    // Hollow entrance.
    const archTop = height - GROUND_HEIGHT - height * 0.34;
    this.hollowGlow.setPosition(this.hollowX, archTop + 40).setDisplaySize(220, 260);
    this.hollowArch.clear();
    this.hollowArch.fillStyle(0x0a0612, 1);
    this.hollowArch.fillRoundedRect(
      this.hollowX - 46,
      archTop,
      92,
      height - GROUND_HEIGHT - archTop,
      { tl: 46, tr: 46, bl: 0, br: 0 }
    );

    if (this.player.y > height) this.player.y = height * 0.4;

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

  collectAurun(player, a) {
    a.disableBody(true, true);
    this.aurun += 1;
    this.registry.inc('aurun', 1);
    this.hudText.setText(`Aurun  ${this.registry.get('aurun')}`);
    // A brief burst of light where it was gathered.
    this.motes.emitParticleAt(a.x, a.y, 6);
  }

  /** Fade out and hand back to the Residency hub. */
  returnToResidency() {
    if (this.returning) return;
    this.returning = true;
    this.cameras.main.fadeOut(700, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('ResidencyScene')
    );
  }

  update(time) {
    // Reaching the Hollow ends the expedition and returns home.
    if (!this.returning && this.player.x >= this.hollowX - 24) {
      this.returnToResidency();
      return;
    }

    this.aurunGroup.getChildren().forEach((a) => {
      if (!a.active) return;
      const baseY = a.getData('baseY');
      const phase = a.getData('phase');
      a.y = baseY + Math.sin(time / 600 + phase) * 7;
      a.setScale(0.78 + Math.sin(time / 400 + phase) * 0.06);
    });

    const left =
      this.cursors.left.isDown || this.keys.left.isDown || this.touch.left;
    const right =
      this.cursors.right.isDown || this.keys.right.isDown || this.touch.right;
    const jump =
      this.cursors.up.isDown ||
      this.cursors.space.isDown ||
      this.keys.jump.isDown ||
      this.touch.jump;

    if (left) {
      this.player.setVelocityX(-this.moveSpeed);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setVelocityX(this.moveSpeed);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    if (jump && this.player.body.blocked.down) {
      this.player.setVelocityY(-this.jumpVel);
    }
  }
}
