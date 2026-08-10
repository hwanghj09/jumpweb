import { Game } from './game.js';
import { Input } from './input.js';
import { CANVAS_W, CANVAS_H } from './constants.js';
import { music, MENU_TRACK } from './audio.js';

function tryStartMusic() {
  if (!music.started) music.start(MENU_TRACK);
  window.removeEventListener('keydown', tryStartMusic);
  window.removeEventListener('click', tryStartMusic);
}
window.addEventListener('keydown', tryStartMusic);
window.addEventListener('click', tryStartMusic);

const canvas = document.getElementById('game');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function applyFullscreenSizing() {
  if (document.fullscreenElement === canvas) {
    const scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
    canvas.style.width = `${CANVAS_W * scale}px`;
    canvas.style.height = `${CANVAS_H * scale}px`;
  } else {
    canvas.style.width = '';
    canvas.style.height = '';
  }
}
document.addEventListener('fullscreenchange', applyFullscreenSizing);
window.addEventListener('resize', applyFullscreenSizing);

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
