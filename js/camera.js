import { CANVAS_W, CANVAS_H } from './constants.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.w = CANVAS_W;
    this.h = CANVAS_H;
  }

  follow(target, levelW, levelH, dt) {
    const desiredX = target.x + target.w / 2 - this.w / 2;
    const desiredY = target.y + target.h / 2 - this.h / 2;
    const smooth = 1 - Math.pow(0.0005, dt);
    this.x += (desiredX - this.x) * smooth;
    this.y += (desiredY - this.y) * smooth;
    this.x = clamp(this.x, 0, Math.max(0, levelW - this.w));
    this.y = clamp(this.y, 0, Math.max(0, levelH - this.h));
  }

  snap(target, levelW, levelH) {
    this.x = clamp(target.x + target.w / 2 - this.w / 2, 0, Math.max(0, levelW - this.w));
    this.y = clamp(target.y + target.h / 2 - this.h / 2, 0, Math.max(0, levelH - this.h));
  }
}
