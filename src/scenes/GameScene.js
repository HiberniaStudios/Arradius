import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../main.js';

const PLAYER_SPEED = 220;
const JUMP_VELOCITY = 520;

/**
 * The main playable scene: a static-platform level with a controllable player,
 * collectible coins, and a score readout. This is the place to grow the game.
 */
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.score = 0;
  }

  create() {
    this.score = 0;

    this.buildLevel();
    this.createPlayer();
    this.createCoins();
    this.createHud();
    this.setupInput();

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(
      this.player,
      this.coins,
      this.collectCoin,
      null,
      this
    );
  }

  buildLevel() {
    this.platforms = this.physics.add.staticGroup();

    // Solid ground across the bottom, tiled from the 64px ground texture.
    const groundY = GAME_HEIGHT - 32;
    for (let x = 32; x < GAME_WIDTH + 32; x += 64) {
      this.platforms.create(x, groundY, 'ground');
    }

    // Floating platforms — tweak these to design your level.
    const ledges = [
      { x: 140, y: 320 },
      { x: 400, y: 250 },
      { x: 640, y: 180 },
      { x: 250, y: 130 },
    ];
    ledges.forEach(({ x, y }) => this.platforms.create(x, y, 'platform'));
  }

  createPlayer() {
    this.player = this.physics.add.sprite(80, GAME_HEIGHT - 120, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.05);
  }

  createCoins() {
    this.coins = this.physics.add.group();
    const spots = [
      { x: 140, y: 280 },
      { x: 400, y: 210 },
      { x: 640, y: 140 },
      { x: 250, y: 90 },
      { x: 500, y: 400 },
    ];
    spots.forEach(({ x, y }) => {
      const coin = this.coins.create(x, y, 'coin');
      coin.body.setAllowGravity(false);
      coin.setData('baseY', y);
      // Gentle bob animation so coins feel alive.
      this.tweens.add({
        targets: coin,
        y: y - 8,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });
  }

  createHud() {
    this.scoreText = this.add
      .text(16, 12, 'Score: 0', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH - 16, 12, '← → move   ↑ / space jump', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#9aa0b5',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0);
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
  }

  collectCoin(player, coin) {
    coin.disableBody(true, true);
    this.score += 10;
    this.scoreText.setText(`Score: ${this.score}`);
  }

  update() {
    const left = this.cursors.left.isDown || this.keys.left.isDown;
    const right = this.cursors.right.isDown || this.keys.right.isDown;
    const jump =
      this.cursors.up.isDown ||
      this.cursors.space.isDown ||
      this.keys.jump.isDown;

    if (left) {
      this.player.setVelocityX(-PLAYER_SPEED);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setVelocityX(PLAYER_SPEED);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    const onGround = this.player.body.blocked.down;
    if (jump && onGround) {
      this.player.setVelocityY(-JUMP_VELOCITY);
    }
  }
}
