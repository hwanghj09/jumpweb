import { CANVAS_W, CANVAS_H, FALL_DEATH_MARGIN } from './constants.js';
import { Camera } from './camera.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Platform, Cone } from './world.js';
import { STAGES } from './levels.js';
import { aabbOverlap } from './collision.js';
import {
  clearBackground,
  drawPlatform,
  drawCone,
  drawGoal,
  drawPlayerSprite,
  drawEnemySprite,
  drawHUD,
  drawButton,
} from './renderer.js';
import { playerSheet, enemySheet } from './sprites.js';

export class Game {
  constructor() {
    this.camera = new Camera();
    this.state = 'TITLE';
    this.stageIndex = 0;
    this.cleared = STAGES.map(() => false);
    this.mouse = { x: -1, y: -1 };
    this.buttons = [];
    this.time = 0;

    this.player = null;
    this.platforms = [];
    this.cones = [];
    this.enemies = [];
    this.goal = null;
    this.levelW = 0;
    this.levelH = 0;
  }

  setMouse(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  click(x, y) {
    for (const b of this.buttons) {
      if (b.disabled) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        b.action();
        return;
      }
    }
  }

  loadStage(i) {
    const def = STAGES[i];
    this.stageIndex = i;
    this.platforms = def.platforms.map((p) => new Platform(p));
    this.cones = def.cones.map((c) => new Cone(c));
    this.enemies = def.enemies.map((e) => new Enemy(e));
    this.player = new Player(def.spawn.x, def.spawn.y);
    this.goal = def.goal;
    this.levelW = def.width;
    this.levelH = def.height;
    this.camera.snap(this.player, this.levelW, this.levelH);
    this.state = 'PLAYING';
  }

  respawnPlayer() {
    this.player.respawn();
    this.camera.snap(this.player, this.levelW, this.levelH);
  }

  update(dt, input) {
    this.time += dt;

    if (this.state === 'PLAYING') {
      if (input.pressed('Escape')) {
        this.state = 'PAUSED';
        return;
      }

      for (const p of this.platforms) p.update(dt, this.time);
      this.player.update(dt, input, this.platforms, this.enemies);
      for (const e of this.enemies) e.update(dt, this.player, this.platforms);

      if (this.player.invuln <= 0) {
        for (const c of this.cones) {
          if (aabbOverlap(this.player, c)) {
            this.respawnPlayer();
            return;
          }
        }
        for (const e of this.enemies) {
          if (e.stunTimer <= 0 && aabbOverlap(this.player, e)) {
            this.respawnPlayer();
            return;
          }
        }
        if (this.player.y > this.levelH + FALL_DEATH_MARGIN) {
          this.respawnPlayer();
          return;
        }
      }

      if (aabbOverlap(this.player, this.goal)) {
        this.cleared[this.stageIndex] = true;
        this.state = 'STAGE_CLEAR';
        return;
      }

      this.camera.follow(this.player, this.levelW, this.levelH, dt);
    } else if (this.state === 'PAUSED') {
      if (input.pressed('Escape')) this.state = 'PLAYING';
    }
  }

  addButton(ctx, x, y, w, h, label, action, disabled = false) {
    const hover =
      !disabled &&
      this.mouse.x >= x &&
      this.mouse.x <= x + w &&
      this.mouse.y >= y &&
      this.mouse.y <= y + h;
    drawButton(ctx, { x, y, w, h, label }, hover, disabled);
    this.buttons.push({ x, y, w, h, action, disabled });
  }

  draw(ctx) {
    this.buttons = [];
    if (this.state === 'TITLE') {
      this.drawTitle(ctx);
    } else if (this.state === 'STAGE_SELECT') {
      this.drawStageSelect(ctx);
    } else {
      this.drawGame(ctx);
      if (this.state === 'PAUSED') this.drawPause(ctx);
      else if (this.state === 'STAGE_CLEAR') this.drawStageClear(ctx);
    }
  }

  drawGame(ctx) {
    clearBackground(ctx, CANVAS_W, CANVAS_H);
    for (const p of this.platforms) drawPlatform(ctx, p, this.camera);
    for (const c of this.cones) drawCone(ctx, c, this.camera);
    drawGoal(ctx, this.goal, this.camera);
    for (const e of this.enemies) drawEnemySprite(ctx, e, enemySheet, this.camera);
    drawPlayerSprite(ctx, this.player, playerSheet, this.camera);
    drawHUD(ctx, STAGES[this.stageIndex].hint, STAGES[this.stageIndex].name);
  }

  drawTitle(ctx) {
    clearBackground(ctx, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('JUMP MAP', CANVAS_W / 2, 160);
    ctx.font = '16px monospace';
    ctx.fillText('8-BIT PIXEL PLATFORMER', CANVAS_W / 2, 200);
    this.addButton(ctx, CANVAS_W / 2 - 100, 260, 200, 46, 'PLAY', () => this.loadStage(0));
    this.addButton(ctx, CANVAS_W / 2 - 100, 320, 200, 46, 'STAGE SELECT', () => {
      this.state = 'STAGE_SELECT';
    });
  }

  drawStageSelect(ctx) {
    clearBackground(ctx, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('STAGE SELECT', CANVAS_W / 2, 80);

    STAGES.forEach((s, i) => {
      const unlocked = i === 0 || this.cleared[i - 1];
      const x = 100 + i * 155;
      const y = 200;
      const w = 120;
      const h = 120;
      const label = `${i + 1}` + (this.cleared[i] ? ' *' : '');
      this.addButton(ctx, x, y, w, h, label, unlocked ? () => this.loadStage(i) : () => {}, !unlocked);
    });

    this.addButton(ctx, CANVAS_W / 2 - 80, 380, 160, 40, 'BACK', () => {
      this.state = 'TITLE';
    });
  }

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('PAUSED', CANVAS_W / 2, 160);
    this.addButton(ctx, CANVAS_W / 2 - 110, 220, 220, 46, 'RESUME', () => {
      this.state = 'PLAYING';
    });
    this.addButton(ctx, CANVAS_W / 2 - 110, 280, 220, 46, 'RESTART STAGE', () => this.loadStage(this.stageIndex));
    this.addButton(ctx, CANVAS_W / 2 - 110, 340, 220, 46, 'STAGE SELECT', () => {
      this.state = 'STAGE_SELECT';
    });
  }

  drawStageClear(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#3ecf5b';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('STAGE CLEAR!', CANVAS_W / 2, 180);

    const isLast = this.stageIndex === STAGES.length - 1;
    if (isLast) {
      ctx.fillStyle = '#fff';
      ctx.font = '18px monospace';
      ctx.fillText('ALL STAGES CLEARED', CANVAS_W / 2, 220);
      this.addButton(ctx, CANVAS_W / 2 - 110, 260, 220, 46, 'STAGE SELECT', () => {
        this.state = 'STAGE_SELECT';
      });
    } else {
      this.addButton(ctx, CANVAS_W / 2 - 110, 260, 220, 46, 'NEXT STAGE', () => this.loadStage(this.stageIndex + 1));
      this.addButton(ctx, CANVAS_W / 2 - 110, 320, 220, 46, 'STAGE SELECT', () => {
        this.state = 'STAGE_SELECT';
      });
    }
  }
}
