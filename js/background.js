const CLOUDS = [
  { baseX: 40, y: 60, scale: 1.1, speed: 10 },
  { baseX: 260, y: 110, scale: 0.8, speed: 7 },
  { baseX: 480, y: 50, scale: 1.3, speed: 12 },
  { baseX: 700, y: 140, scale: 0.9, speed: 8 },
  { baseX: 920, y: 80, scale: 1.0, speed: 11 },
  { baseX: 1140, y: 120, scale: 0.7, speed: 6 },
];

const BIRDS = [
  { baseX: 100, y: 90, speed: 46, flapSeed: 0 },
  { baseX: 500, y: 150, speed: 60, flapSeed: 1.7 },
  { baseX: 900, y: 70, speed: 52, flapSeed: 3.1 },
];

function drawCloud(ctx, x, y, scale) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(x, y, 26 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 22 * scale, y - 8 * scale, 20 * scale, 14 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 22 * scale, y - 4 * scale, 18 * scale, 13 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 6 * scale, y - 14 * scale, 16 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBird(ctx, x, y, time, flapSeed) {
  const flap = Math.sin(time * 8 + flapSeed) * 6;
  ctx.strokeStyle = 'rgba(60,60,70,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 8, y - flap);
  ctx.quadraticCurveTo(x - 3, y + 4, x, y);
  ctx.quadraticCurveTo(x + 3, y + 4, x + 8, y - flap);
  ctx.stroke();
}

export function drawBackground(ctx, w, h, time, parallax = 0) {
  ctx.fillStyle = '#bfe6ff';
  ctx.fillRect(0, 0, w, h);

  const cloudSpan = w + 240;
  for (const c of CLOUDS) {
    const x = (((c.baseX + time * c.speed - parallax * 0.05) % cloudSpan) + cloudSpan) % cloudSpan - 120;
    drawCloud(ctx, x, c.y, c.scale);
  }

  const birdSpan = w + 500;
  for (const b of BIRDS) {
    const x = (((b.baseX + time * b.speed - parallax * 0.15) % birdSpan) + birdSpan) % birdSpan - 60;
    const bobY = b.y + Math.sin(time * 1.3 + b.flapSeed) * 10;
    drawBird(ctx, x, bobY, time, b.flapSeed);
  }
}
