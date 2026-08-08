export class Platform {
  constructor(def) {
    this.x = def.x;
    this.y = def.y;
    this.w = def.w;
    this.h = def.h;
    this.baseX = def.x;
    this.baseY = def.y;
    this.moving = def.moving || null;
    this.dx = 0;
    this.dy = 0;
  }

  update(dt, t) {
    if (!this.moving) return;
    const prevX = this.x;
    const prevY = this.y;
    const offset = Math.sin(t * this.moving.speed + (this.moving.phase || 0)) * this.moving.range;
    if (this.moving.axis === 'x') this.x = this.baseX + offset;
    else this.y = this.baseY + offset;
    this.dx = this.x - prevX;
    this.dy = this.y - prevY;
  }
}

export class Cone {
  constructor(def) {
    this.x = def.x;
    this.y = def.y;
    this.w = 24;
    this.h = 28;
  }
}

export class Water {
  constructor(def) {
    this.x = def.x;
    this.y = def.y;
    this.w = def.w;
    this.h = def.h;
  }
}
