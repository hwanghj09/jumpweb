import { CANVAS_W, CANVAS_H, FALL_DEATH_MARGIN } from './constants.js';
import { Camera } from './camera.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Platform, Cone, Water } from './world.js';
import { STAGES } from './levels.js';
import { aabbOverlap } from './collision.js';
import {
  drawPlatform,
  drawCone,
  drawWater,
  drawGoal,
  drawPlayerSprite,
  drawEnemySprite,
  drawHUD,
  drawButton,
} from './renderer.js';
import { playerSheet, enemySheet } from './sprites.js';
import { spawnBurst, updateParticles, drawParticles } from './particles.js';
import { music, MENU_TRACK, GAME_TRACK } from './audio.js';
import { drawBackground } from './background.js';
import { getCustomStages } from './customLevels.js';
import { getCachedFolderStages, refreshFolderStages } from './customFolder.js';

export class Game {
  constructor() {
    this.camera = new Camera();
    this.state = 'TITLE';
    this.stageIndex = 0;
    this.stages = STAGES;
    this.cleared = [];
    this.stagePage = 0;
    this.refreshStages();
    refreshFolderStages().then(() => this.refreshStages());
    this.mouse = { x: -1, y: -1 };
    this.buttons = [];
    this.time = 0;

    this.player = null;
    this.platforms = [];
    this.cones = [];
    this.enemies = [];
    this.water = [];
    this.goal = null;
    this.levelW = 0;
    this.levelH = 0;
    this.particles = [];
  }

  refreshStages() {
    this.stages = [...STAGES, ...getCustomStages(), ...getCachedFolderStages()];
    while (this.cleared.length < this.stages.length) this.cleared.push(false);
  }

  goToStageSelect() {
    this.refreshStages();
    refreshFolderStages().then(() => this.refreshStages());
    this.stagePage = 0;
    this.state = 'STAGE_SELECT';
    music.switchTrack(MENU_TRACK);
  }

  setMouse(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  click(x, y) {
    for (const b of this.buttons) {
      if (b.disabled) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        music.playClickSfx();
        b.action();
        return;
      }
    }
  }

  loadStage(i) {
    this.refreshStages();
    const def = this.stages[i];
    this.stageIndex = i;
    this.platforms = def.platforms.map((p) => new Platform(p));
    this.cones = def.cones.map((c) => new Cone(c));
    this.enemies = def.enemies.map((e) => new Enemy(e));
    this.water = (def.water || []).map((w) => new Water(w));
    this.player = new Player(def.spawn.x, def.spawn.y);
    this.goal = def.goal;
    this.levelW = def.width;
    this.levelH = def.height;
    this.camera.snap(this.player, this.levelW, this.levelH);
    this.particles = [];
    this.state = 'PLAYING';
    music.switchTrack(GAME_TRACK);
  }

  respawnPlayer() {
    const cx = this.player.x + this.player.w / 2;
    const cy = this.player.y + this.player.h / 2;
    spawnBurst(this.particles, cx, cy);
    music.playDeathSfx();
    this.player.respawn();
    this.camera.snap(this.player, this.levelW, this.levelH);
  }

  cheatNextStage() {
    this.cleared[this.stageIndex] = true;
    music.playClearSfx();
    const next = this.stageIndex + 1;
    if (next < this.stages.length) this.loadStage(next);
    else this.goToStageSelect();
  }

  update(dt, input) {
    this.time += dt;

    if (this.state === 'PLAYING') {
      if (input.pressed('Escape')) {
        this.state = 'PAUSED';
        return;
      }
      if (input.pressed('KeyN')) {
        this.cheatNextStage();
        return;
      }

      for (const p of this.platforms) p.update(dt, this.time);
      this.player.update(dt, input, this.platforms, this.enemies, this.water);
      if (this.player.justJumped) music.playJumpSfx();
      if (this.player.justJabbed) music.playJabSfx();
      if (this.player.justEnteredWater) music.playSplashSfx();
      for (const e of this.enemies) e.update(dt, this.player, this.platforms);
      updateParticles(this.particles, dt);

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
        music.playClearSfx();
        return;
      }

      this.camera.follow(this.player, this.levelW, this.levelH, dt);
    } else if (this.state === 'PAUSED') {
      if (input.pressed('Escape')) this.state = 'PLAYING';
    } else if (this.state === 'SETTINGS') {
      if (input.pressed('Escape')) this.state = 'PAUSED';
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
      else if (this.state === 'SETTINGS') this.drawSettings(ctx);
    }
  }

  drawGame(ctx) {
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time, this.camera.x);
    for (const p of this.platforms) drawPlatform(ctx, p, this.camera);
    for (const c of this.cones) drawCone(ctx, c, this.camera);
    for (const w of this.water) drawWater(ctx, w, this.camera);
    drawGoal(ctx, this.goal, this.camera);
    for (const e of this.enemies) drawEnemySprite(ctx, e, enemySheet, this.camera);
    drawPlayerSprite(ctx, this.player, playerSheet, this.camera);
    drawParticles(ctx, this.particles, this.camera);
    drawHUD(ctx, this.stages[this.stageIndex].hint, this.stages[this.stageIndex].name);
  }

  drawTitle(ctx) {
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('JUMP MAP', CANVAS_W / 2, 160);
    ctx.font = '16px monospace';
    ctx.fillText('8-BIT PIXEL PLATFORMER', CANVAS_W / 2, 200);
    this.addButton(ctx, CANVAS_W / 2 - 100, 260, 200, 46, 'PLAY', () => this.loadStage(0));
    this.addButton(ctx, CANVAS_W / 2 - 100, 320, 200, 46, 'STAGE SELECT', () => this.goToStageSelect());
    this.addButton(ctx, CANVAS_W / 2 - 100, 380, 200, 46, '맵 에디터', () => {
      window.location.href = 'editor.html';
    });
  }

  drawStageSelect(ctx) {
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('STAGE SELECT', CANVAS_W / 2, 80);

    const cols = 4;
    const rows = 2;
    const pageSize = cols * rows;
    const totalPages = Math.max(1, Math.ceil(this.stages.length / pageSize));
    this.stagePage = Math.max(0, Math.min(this.stagePage, totalPages - 1));

    const boxW = 100;
    const boxH = 100;
    const gap = 26;
    const gridW = cols * boxW + (cols - 1) * gap;
    const startX = (CANVAS_W - gridW) / 2;
    const startY = 140;

    const pageStart = this.stagePage * pageSize;
    const pageStages = this.stages.slice(pageStart, pageStart + pageSize);

    pageStages.forEach((s, localI) => {
      const i = pageStart + localI;
      const unlocked = i === 0 || i >= STAGES.length || this.cleared[i - 1];
      const col = localI % cols;
      const row = Math.floor(localI / cols);
      const x = startX + col * (boxW + gap);
      const y = startY + row * (boxH + gap);
      const label = `${i + 1}` + (this.cleared[i] ? ' *' : '');
      this.addButton(ctx, x, y, boxW, boxH, label, unlocked ? () => this.loadStage(i) : () => {}, !unlocked);
    });

    const gridBottom = startY + rows * (boxH + gap) - gap;
    if (totalPages > 1) {
      ctx.fillStyle = '#111';
      ctx.font = '16px monospace';
      ctx.fillText(`PAGE ${this.stagePage + 1} / ${totalPages}`, CANVAS_W / 2, gridBottom + 30);
    }

    const navY = gridBottom + 46;
    if (this.stagePage > 0) {
      this.addButton(ctx, CANVAS_W / 2 - 260, navY, 100, 40, '< PREV', () => {
        this.stagePage -= 1;
      });
    }
    if (this.stagePage < totalPages - 1) {
      this.addButton(ctx, CANVAS_W / 2 + 160, navY, 100, 40, 'NEXT >', () => {
        this.stagePage += 1;
      });
    }
    this.addButton(ctx, CANVAS_W / 2 - 70, navY, 140, 40, 'BACK', () => {
      this.state = 'TITLE';
      music.switchTrack(MENU_TRACK);
    });
  }

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('PAUSED', CANVAS_W / 2, 150);
    this.addButton(ctx, CANVAS_W / 2 - 110, 205, 220, 44, 'RESUME', () => {
      this.state = 'PLAYING';
    });
    this.addButton(ctx, CANVAS_W / 2 - 110, 258, 220, 44, 'RESTART STAGE', () => this.loadStage(this.stageIndex));
    this.addButton(ctx, CANVAS_W / 2 - 110, 311, 220, 44, 'SETTINGS', () => {
      this.state = 'SETTINGS';
    });
    this.addButton(ctx, CANVAS_W / 2 - 110, 364, 220, 44, 'STAGE SELECT', () => this.goToStageSelect());
  }

  drawSettings(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('SETTINGS', CANVAS_W / 2, 150);

    ctx.font = '16px monospace';
    ctx.fillText(`VOLUME: ${Math.round(music.volume * 100)}%`, CANVAS_W / 2, 205);

    const barX = CANVAS_W / 2 - 110;
    const barY = 222;
    const barW = 220;
    const barH = 16;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#3ecf5b';
    ctx.fillRect(barX + 2, barY + 2, (barW - 4) * music.volume, barH - 4);

    this.addButton(ctx, CANVAS_W / 2 - 160, 258, 60, 44, '-', () => music.setVolume(music.volume - 0.1));
    this.addButton(ctx, CANVAS_W / 2 - 90, 258, 180, 44, music.muted ? 'UNMUTE' : 'MUTE', () => music.toggleMute());
    this.addButton(ctx, CANVAS_W / 2 + 100, 258, 60, 44, '+', () => music.setVolume(music.volume + 0.1));

    this.addButton(ctx, CANVAS_W / 2 - 110, 330, 220, 46, 'BACK', () => {
      this.state = 'PAUSED';
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

    const isLast = this.stageIndex === this.stages.length - 1;
    if (isLast) {
      ctx.fillStyle = '#fff';
      ctx.font = '18px monospace';
      ctx.fillText('ALL STAGES CLEARED', CANVAS_W / 2, 220);
      this.addButton(ctx, CANVAS_W / 2 - 110, 260, 220, 46, 'STAGE SELECT', () => this.goToStageSelect());
    } else {
      this.addButton(ctx, CANVAS_W / 2 - 110, 260, 220, 46, 'NEXT STAGE', () => this.loadStage(this.stageIndex + 1));
      this.addButton(ctx, CANVAS_W / 2 - 110, 320, 220, 46, 'STAGE SELECT', () => this.goToStageSelect());
    }
  }
}
