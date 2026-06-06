import Phaser from 'phaser';
import Music from '../audio/Music.js';

// Movement feel is derived from the live screen size in layout(), so the game
// plays consistently whether the canvas is a short landscape phone or a tall
// portrait one. These constants tune that derivation.
const JUMP_HEIGHT_RATIO = 0.32; // peak jump height as a fraction of screen height
const GRAVITY = 900;

// Level geometry expressed as fractions of the screen (0..1), so it scales to
// any resolution or aspect ratio. fx/fy are centre positions; fw is width.
const GROUND_HEIGHT = 44;
const PLATFORM_HEIGHT = 18;
const LEDGES = [
  { fx: 0.2, fy: 0.72, fw: 0.22 },
  { fx: 0.52, fy: 0.56, fw: 0.22 },
  { fx: 0.82, fy: 0.42, fw: 0.2 },
  { fx: 0.34, fy: 0.3, fw: 0.2 },
];
const COINS = [
  { fx: 0.2, fy: 0.6 },
  { fx: 0.52, fy: 0.44 },
  { fx: 0.82, fy: 0.3 },
  { fx: 0.34, fy: 0.18 },
  { fx: 0.66, fy: 0.86 },
];

/**
 * Responsive platformer scene. Everything is positioned from the live canvas
 * size and re-laid-out on resize, so the game fills the device screen.
 */
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.score = 0;
  }

  create() {
    this.score = 0;
    this.solids = [];
    this.touchButtons = [];

    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, width, height);

    this.buildLevel(width, height);
    this.createPlayer(width, height);
    this.createCoins(width, height);
    this.createHud();
    this.setupInput();
    this.createTouchControls();
    this.createMusic();

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.overlap(
      this.player,
      this.coins,
      this.collectCoin,
      null,
      this
    );

    this.layout(width, height);

    // Re-layout whenever the canvas changes (orientation, window resize).
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
  }

  /** Create a static, resizable rectangle solid and register it for collisions. */
  makeSolid(color) {
    const rect = this.add.rectangle(0, 0, 10, 10, color);
    this.physics.add.existing(rect, true);
    this.solids.push(rect);
    return rect;
  }

  buildLevel() {
    this.ground = this.makeSolid(0x37474f);
    this.ledges = LEDGES.map((def) => {
      const rect = this.makeSolid(0x6d4c41);
      rect.setData('def', def);
      return rect;
    });
  }

  createPlayer(width, height) {
    this.player = this.physics.add.sprite(width * 0.1, height * 0.4, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.05);
  }

  createCoins(width, height) {
    this.coins = this.physics.add.group();
    COINS.forEach((def, i) => {
      const coin = this.coins.create(def.fx * width, def.fy * height, 'coin');
      coin.body.setAllowGravity(false);
      coin.setData('def', def);
      coin.setData('baseY', def.fy * height);
      coin.setData('phase', i * 1.3); // stagger the bob so they're not in sync
    });
  }

  createHud() {
    this.scoreText = this.add
      .text(16, 12, 'Score: 0', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.touch = { left: false, right: false, jump: false };
  }

  /**
   * On-screen buttons for touch devices. Each button stores an `anchor`
   * callback so layout() can reposition it for the current screen size.
   */
  createTouchControls() {
    const hasTouch =
      this.sys.game.device.input.touch ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0;
    if (!hasTouch) return;

    const makeButton = (anchor, label, onDown, onUp) => {
      const circle = this.add
        .circle(0, 0, 38, 0xffffff, 0.18)
        .setStrokeStyle(2, 0xffffff, 0.4)
        .setScrollFactor(0)
        .setDepth(1000)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(0, 0, label, {
          fontFamily: 'monospace',
          fontSize: '30px',
          color: '#ffffff',
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

    this.input.addPointer(2); // allow move + jump simultaneously
  }

  /**
   * Start the chiptune track on the first user gesture (browsers block audio
   * until then) and add a mute toggle in the top-right corner.
   */
  createMusic() {
    this.music = new Music();

    const startOnce = () => this.music.start();
    this.input.once('pointerdown', startOnce);
    this.input.keyboard.once('keydown', startOnce);

    const circle = this.add
      .circle(0, 0, 22, 0xffffff, 0.18)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, '♪', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    circle.on('pointerdown', (pointer, x, y, event) => {
      event?.stopPropagation();
      this.music.start();
      const on = this.music.toggle();
      circle.setAlpha(on ? 1 : 0.5);
      label.setText(on ? '♪' : '♪̷');
    });

    this.musicButton = {
      circle,
      label,
      anchor: (w) => ({ x: w - 36, y: 36 }),
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music.stop());
  }

  /** Position and size everything for the given canvas dimensions. */
  layout(width, height) {
    this.physics.world.setBounds(0, 0, width, height);

    // Derive movement feel from screen size so jumps clear the (proportional)
    // platform gaps on any device.
    this.moveSpeed = Phaser.Math.Clamp(width * 0.3, 180, 460);
    this.jumpVel = Math.sqrt(2 * GRAVITY * (height * JUMP_HEIGHT_RATIO));

    // Ground spans the full width along the bottom.
    this.ground.setSize(width, GROUND_HEIGHT);
    this.ground.setPosition(width / 2, height - GROUND_HEIGHT / 2);
    this.ground.body.updateFromGameObject();

    // Floating ledges.
    this.ledges.forEach((rect) => {
      const def = rect.getData('def');
      rect.setSize(def.fw * width, PLATFORM_HEIGHT);
      rect.setPosition(def.fx * width, def.fy * height);
      rect.body.updateFromGameObject();
    });

    // Coin positions (their bob baseline updates too).
    this.coins.getChildren().forEach((coin) => {
      const def = coin.getData('def');
      coin.x = def.fx * width;
      coin.setData('baseY', def.fy * height);
    });

    // Keep the player inside the new bounds.
    this.player.x = Phaser.Math.Clamp(this.player.x, 20, width - 20);
    if (this.player.y > height) this.player.y = height * 0.4;

    // Touch buttons.
    this.touchButtons.forEach(({ circle, text, anchor }) => {
      const { x, y } = anchor(width, height);
      circle.setPosition(x, y);
      text.setPosition(x, y);
    });

    // Music toggle.
    if (this.musicButton) {
      const { x, y } = this.musicButton.anchor(width, height);
      this.musicButton.circle.setPosition(x, y);
      this.musicButton.label.setPosition(x, y);
    }
  }

  onResize(gameSize) {
    this.layout(gameSize.width, gameSize.height);
  }

  collectCoin(player, coin) {
    coin.disableBody(true, true);
    this.score += 10;
    this.scoreText.setText(`Score: ${this.score}`);
  }

  update(time) {
    // Bob the coins using a time-based sine so it survives re-layout.
    this.coins.getChildren().forEach((coin) => {
      if (!coin.active) return;
      const baseY = coin.getData('baseY');
      const phase = coin.getData('phase');
      coin.y = baseY + Math.sin(time / 350 + phase) * 6;
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
