export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveAxis(entity, platforms, axis) {
  for (const p of platforms) {
    if (!aabbOverlap(entity, p)) continue;
    if (axis === 'x') {
      if (entity.vx > 0) entity.x = p.x - entity.w;
      else if (entity.vx < 0) entity.x = p.x + p.w;
      entity.vx = 0;
    } else {
      if (entity.vy > 0) {
        entity.y = p.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
        entity.ridingPlatform = p.moving ? p : null;
      } else if (entity.vy < 0) {
        entity.y = p.y + p.h;
        entity.vy = 0;
      }
    }
  }
}

export function moveAndCollide(entity, platforms, dt) {
  entity.x += entity.vx * dt;
  resolveAxis(entity, platforms, 'x');

  entity.y += entity.vy * dt;
  entity.onGround = false;
  entity.ridingPlatform = null;
  resolveAxis(entity, platforms, 'y');
}

export function lineOfSightBlocked(x1, y1, x2, y2, platforms) {
  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const p of platforms) {
      if (px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h) return true;
    }
  }
  return false;
}
