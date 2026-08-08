import { GRAVITY } from './constants.js';

const BURST_COLORS = ['#3d4a63', '#4a5578', '#1a1f2e', '#5c6b8c', '#2b3550'];

export function spawnBurst(particles, x, y, count = 20) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 230;
    const life = 0.5 + Math.random() * 0.4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 130,
      size: 3 + Math.random() * 4,
      color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
      life,
      maxLife: life,
    });
  }
}

export function updateParticles(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += GRAVITY * 0.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

export function drawParticles(ctx, particles, camera) {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const x = Math.floor(p.x - camera.x - p.size / 2);
    const y = Math.floor(p.y - camera.y - p.size / 2);
    ctx.fillRect(x, y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
