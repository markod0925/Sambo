import { GameScene } from './game/GameScene.js';
import { StartScene } from './game/StartScene.js';

const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'game',
  pixelArt: false,
  backgroundColor: '#0b0f1a',
  scene: [StartScene, GameScene]
};

new Phaser.Game(config);
