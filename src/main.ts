import './styles.css';
import { Game } from './systems/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');

if (!canvas) {
  throw new Error('Game canvas was not found.');
}

const game = new Game(canvas);
game.boot();
