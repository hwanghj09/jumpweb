import { Game } from './game.js';
import { Input } from './input.js';
import { CANVAS_W, CANVAS_H } from './constants.js';

const canvas = document.getElementById('game');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const game = new Game();

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

canvas.addEventListener('mousemove', (e) => {
  const { x, y } = toCanvasCoords(e);
  game.setMouse(x, y);
});

canvas.addEventListener('click', (e) => {
  const { x, y } = toCanvasCoords(e);
  game.click(x, y);
});

let last = performance.now();

function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 1 / 20) dt = 1 / 20;

  game.update(dt, Input);
  game.draw(ctx);
  Input.endFrame();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
