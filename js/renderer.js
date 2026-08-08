import { TILE, CANVAS_W, JAB_DURATION } from './constants.js';
import { FRAME_W, FRAME_H } from './sprites.js';

const DISPLAY_H = 56;
const DISPLAY_W = Math.round((DISPLAY_H * FRAME_W) / FRAME_H);

function frameCycle(t, fps, frames) {
  return Math.floor(t * fps) % frames;
}

function drawFrame(ctx, sheet, row, frameIndex, cx, feetY, facing, heightScale = 1) {
  if (!sheet.ready) return;
  const sx = frameIndex * FRAME_W;
  const sy = row * FRAME_H;
  const dh = DISPLAY_H * heightScale;
  const dy = feetY - dh;
  if (facing < 0) {
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, -DISPLAY_W / 2, dy, DISPLAY_W, dh);
    ctx.restore();
  } else {
    ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, cx - DISPLAY_W / 2, dy, DISPLAY_W, dh);
  }
}

export function drawPlayerSprite(ctx, player, sheet, camera) {
  const x = player.x - camera.x;
  const y = player.y - camera.y;
  const cx = x + player.w / 2;
  const feetY = y + player.h;

  let row = 1;
  let frameIndex = 0;
  let heightScale = 1;

  switch (player.state) {
    case 'idle':
      row = 0;
      frameIndex = frameCycle(player.animTime, 3, 2);
      break;
    case 'crouch':
      row = 0;
      frameIndex = 0;
      heightScale = 0.65;
      break;
    case 'walk':
      row = 1;
      frameIndex = frameCycle(player.animTime, 8, 4);
      break;
    case 'run':
      row = 1;
      frameIndex = frameCycle(player.animTime, 14, 4);
      break;
    case 'jump':
      row = 2;
      frameIndex = player.vy < 0 ? 0 : 1;
      break;
    case 'jab': {
      row = 3;
      const progress = 1 - Math.max(0, player.jabTimer) / JAB_DURATION;
      frameIndex = progress < 0.4 ? 0 : 1;
      break;
    }
  }
  drawFrame(ctx, sheet, row, frameIndex, cx, feetY, player.facing, heightScale);
}

export function drawEnemySprite(ctx, enemy, sheet, camera) {
  const x = enemy.x - camera.x;
  const y = enemy.y - camera.y;
  const cx = x + enemy.w / 2;
  const feetY = y + enemy.h;

  let row = 0;
  let frameIndex = 0;

  if (enemy.stunTimer > 0) {
    row = 0;
    frameIndex = 0;
  } else if (enemy.state === 'patrol') {
    row = 0;
    frameIndex = frameCycle(enemy.animTime, 8, 4);
  } else if (enemy.state === 'alert') {
    row = 1;
    frameIndex = 0;
  } else {
    row = 1;
    frameIndex = frameCycle(enemy.animTime, 12, 4);
  }
  drawFrame(ctx, sheet, row, frameIndex, cx, feetY, enemy.facing);
}

export function drawPlatform(ctx, p, camera) {
  const startX = Math.floor(p.x - camera.x);
  const startY = Math.floor(p.y - camera.y);
  const cols = p.w / TILE;
  const rows = p.h / TILE;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const tx = startX + c * TILE;
      const ty = startY + r * TILE;
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(tx, ty, TILE, TILE);
      ctx.fillStyle = '#5c5c5c';
      ctx.fillRect(tx, ty + TILE - 4, TILE, 4);
      ctx.fillRect(tx + TILE - 4, ty, 4, TILE);
      ctx.fillStyle = '#a9a9a9';
      ctx.fillRect(tx, ty, TILE, 4);
      ctx.fillRect(tx, ty, 4, TILE);
    }
  }

  if (p.moving) {
    const cx = startX + p.w / 2;
    const cy = startY + p.h / 2;
    ctx.fillStyle = '#2b6cb0';
    ctx.beginPath();
    if (p.moving.axis === 'x') {
      ctx.moveTo(cx - 6, cy);
      ctx.lineTo(cx + 6, cy - 5);
      ctx.lineTo(cx + 6, cy + 5);
    } else {
      ctx.moveTo(cx, cy - 6);
      ctx.lineTo(cx - 5, cy + 6);
      ctx.lineTo(cx + 5, cy + 6);
    }
    ctx.closePath();
    ctx.fill();
  }
}

export function drawCone(ctx, cone, camera) {
  const x = Math.floor(cone.x - camera.x);
  const y = Math.floor(cone.y - camera.y);
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(x - 2, y + cone.h - 4, cone.w + 4, 4);
  ctx.fillStyle = '#d3382c';
  ctx.beginPath();
  ctx.moveTo(x + cone.w / 2, y);
  ctx.lineTo(x + cone.w, y + cone.h - 4);
  ctx.lineTo(x, y + cone.h - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8f1f17';
  ctx.fillRect(x + 4, y + cone.h * 0.55, cone.w - 8, 4);
}

export function drawGoal(ctx, goal, camera) {
  const x = Math.floor(goal.x - camera.x);
  const y = Math.floor(goal.y - camera.y);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x + goal.w / 2 - 2, y - TILE, 4, TILE + goal.h);
  ctx.fillStyle = '#3ecf5b';
  ctx.beginPath();
  ctx.moveTo(x + goal.w / 2 + 2, y - TILE);
  ctx.lineTo(x + goal.w / 2 + 22, y - TILE + 8);
  ctx.lineTo(x + goal.w / 2 + 2, y - TILE + 16);
  ctx.closePath();
  ctx.fill();
}

export function drawHUD(ctx, hint, stageName) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, CANVAS_W, 28);
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, 10, 14);
  ctx.textAlign = 'right';
  ctx.fillText(stageName, CANVAS_W - 10, 14);
  ctx.textAlign = 'left';
}

export function drawButton(ctx, btn, hover, disabled) {
  ctx.fillStyle = disabled ? '#888' : hover ? '#f2f2f2' : '#dddddd';
  ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
  ctx.fillStyle = disabled ? '#555' : '#111';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
}
