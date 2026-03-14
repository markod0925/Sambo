import { GameScene } from './game/GameScene.js';
import { StartScene } from './game/StartScene.js';

const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'game',
  pixelArt: false,
  backgroundColor: '#05070f',
  scene: [StartScene, GameScene]
};

new Phaser.Game(config);
