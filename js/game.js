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
import { getCachedServerStages, refreshServerCustomStages } from './customServerMaps.js';
import { PvpMatch } from './pvpGame.js';
import { JumpRaceMatch } from './jumpRaceGame.js';
import { drawTitleFight } from './titleFight.js';
import { isFullscreen, toggleFullscreen } from './fullscreen.js';

export class Game {
  constructor() {
    this.camera = new Camera();
    this.state = 'TITLE';
    this.stageIndex = 0;
    this.stages = STAGES;
    this.cleared = new Array(STAGES.length).fill(false);
    this.stagePage = 0;

    this.customMaps = [];
    this.customIndex = 0;
    this.customPage = 0;
    this.playingCustom = false;
    this.refreshCustomMaps();
    refreshFolderStages().then(() => this.refreshCustomMaps());
    refreshServerCustomStages().then(() => this.refreshCustomMaps());

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
    this.pvp = null;
    this.jumpRace = null;
    this.settingsReturnState = 'PAUSED';
  }

  startPvp() {
    this.pvp = new PvpMatch();
    this.state = 'PVP';
  }

  exitPvp() {
    if (this.pvp) this.pvp.destroy();
    this.pvp = null;
    this.state = 'MULTI_SELECT';
    music.switchTrack(MENU_TRACK);
  }

  startJumpRace() {
    this.jumpRace = new JumpRaceMatch();
    this.state = 'JUMP_RACE';
  }

  exitJumpRace() {
    if (this.jumpRace) this.jumpRace.destroy();
    this.jumpRace = null;
    this.state = 'MULTI_SELECT';
    music.switchTrack(MENU_TRACK);
  }

  refreshCustomMaps() {
    this.customMaps = [...getCustomStages(), ...getCachedFolderStages(), ...getCachedServerStages()];
  }

  goToStageSelect() {
    this.stagePage = 0;
    this.state = 'STAGE_SELECT';
    music.switchTrack(MENU_TRACK);
  }

  goToCustomSelect() {
    this.refreshCustomMaps();
    refreshFolderStages().then(() => this.refreshCustomMaps());
    refreshServerCustomStages().then(() => this.refreshCustomMaps());
    this.customPage = 0;
    this.state = 'CUSTOM_SELECT';
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
    const def = this.stages[i];
    this.playingCustom = false;
    this.stageIndex = i;
    this.enemyDefs = def.enemies;
    this.platforms = def.platforms.map((p) => new Platform(p));
    this.cones = def.cones.map((c) => new Cone(c));
    this.enemies = this.enemyDefs.map((e) => new Enemy(e));
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

  loadCustomStage(i) {
    const def = this.customMaps[i];
    if (!def) {
      this.goToCustomSelect();
      return;
    }
    this.playingCustom = true;
    this.customIndex = i;
    this.enemyDefs = def.enemies;
    this.platforms = def.platforms.map((p) => new Platform(p));
    this.cones = def.cones.map((c) => new Cone(c));
    this.enemies = this.enemyDefs.map((e) => new Enemy(e));
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
    this.enemies = this.enemyDefs.map((e) => new Enemy(e));
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

    if (this.state === 'PVP') {
      this.pvp.update(dt, input);
      if (this.pvp.exitRequested) this.exitPvp();
      return;
    }

    if (this.state === 'JUMP_RACE') {
      this.jumpRace.update(dt, input);
      if (this.jumpRace.exitRequested) this.exitJumpRace();
      return;
    }

    if (this.state === 'PLAYING') {
      if (input.pressed('Escape')) {
        this.state = 'PAUSED';
        return;
      }
      if (input.pressed('KeyN') && !this.playingCustom) {
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
        if (this.playingCustom) {
          this.state = 'CUSTOM_CLEAR';
        } else {
          this.cleared[this.stageIndex] = true;
          this.state = 'STAGE_CLEAR';
        }
        music.playClearSfx();
        return;
      }

      this.camera.follow(this.player, this.levelW, this.levelH, dt);
    } else if (this.state === 'PAUSED') {
      if (input.pressed('Escape')) this.state = 'PLAYING';
    } else if (this.state === 'SETTINGS') {
      if (input.pressed('Escape')) this.state = this.settingsReturnState;
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
    } else if (this.state === 'MULTI_SELECT') {
      this.drawMultiSelect(ctx);
    } else if (this.state === 'CUSTOM_SELECT') {
      this.drawCustomSelect(ctx);
    } else if (this.state === 'PVP') {
      this.pvp.setMouse(this.mouse.x, this.mouse.y);
      this.pvp.draw(ctx);
      this.buttons = this.pvp.buttons;
    } else if (this.state === 'JUMP_RACE') {
      this.jumpRace.setMouse(this.mouse.x, this.mouse.y);
      this.jumpRace.draw(ctx);
      this.buttons = this.jumpRace.buttons;
    } else if (this.state === 'SETTINGS') {
      if (this.settingsReturnState === 'TITLE') drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);
      else this.drawGame(ctx);
      this.drawSettings(ctx);
    } else {
      this.drawGame(ctx);
      if (this.state === 'PAUSED') this.drawPause(ctx);
      else if (this.state === 'STAGE_CLEAR') this.drawStageClear(ctx);
      else if (this.state === 'CUSTOM_CLEAR') this.drawCustomClear(ctx);
    }
    this.drawFullscreenButton(ctx);
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
    const meta = this.playingCustom ? this.customMaps[this.customIndex] : this.stages[this.stageIndex];
    drawHUD(ctx, meta.hint, meta.name);
  }

  drawTitle(ctx) {
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);
    drawTitleFight(ctx, this.time);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('점프맵', CANVAS_W / 2, 150);
    ctx.font = '16px monospace';
    ctx.fillText('8비트 픽셀 플랫포머', CANVAS_W / 2, 184);

    const wideW = 320;
    const wideH = 64;
    const wideX = CANVAS_W / 2 - wideW / 2;
    const bar1Y = 228;
    const bar2Y = bar1Y + wideH + 14;
    this.addButton(ctx, wideX, bar1Y, wideW, wideH, '싱글 플레이', () => this.goToStageSelect());
    this.addButton(ctx, wideX, bar2Y, wideW, wideH, '멀티 플레이', () => {
      this.state = 'MULTI_SELECT';
    });

    const smallW = 152;
    const smallH = 56;
    const smallGap = 16;
    const smallY = bar2Y + wideH + 28;
    const smallX = CANVAS_W / 2 - (smallW * 2 + smallGap) / 2;
    this.addButton(ctx, smallX, smallY, smallW, smallH, '설정', () => {
      this.settingsReturnState = 'TITLE';
      this.state = 'SETTINGS';
    });
    this.addButton(ctx, smallX + smallW + smallGap, smallY, smallW, smallH, '맵 에디터', () => {
      window.location.href = 'editor.html';
    });
  }

  drawFullscreenButton(ctx) {
    const size = 28;
    const x = CANVAS_W - size - 8;
    const y = 8;
    const hover =
      this.mouse.x >= x && this.mouse.x <= x + size && this.mouse.y >= y && this.mouse.y <= y + size;
    ctx.fillStyle = hover ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const pad = 6;
    const arm = 6;
    if (isFullscreen()) {
      // "restore" icon: brackets pointing inward, offset from the corners
      ctx.moveTo(x + pad + arm, y + pad);
      ctx.lineTo(x + pad, y + pad);
      ctx.lineTo(x + pad, y + pad + arm);
      ctx.moveTo(x + size - pad - arm, y + pad);
      ctx.lineTo(x + size - pad, y + pad);
      ctx.lineTo(x + size - pad, y + pad + arm);
      ctx.moveTo(x + pad + arm, y + size - pad);
      ctx.lineTo(x + pad, y + size - pad);
      ctx.lineTo(x + pad, y + size - pad - arm);
      ctx.moveTo(x + size - pad - arm, y + size - pad);
      ctx.lineTo(x + size - pad, y + size - pad);
      ctx.lineTo(x + size - pad, y + size - pad - arm);
    } else {
      // "expand" icon: brackets at the corners
      ctx.moveTo(x + pad, y + pad + arm);
      ctx.lineTo(x + pad, y + pad);
      ctx.lineTo(x + pad + arm, y + pad);
      ctx.moveTo(x + size - pad - arm, y + pad);
      ctx.lineTo(x + size - pad, y + pad);
      ctx.lineTo(x + size - pad, y + pad + arm);
      ctx.moveTo(x + pad, y + size - pad - arm);
      ctx.lineTo(x + pad, y + size - pad);
      ctx.lineTo(x + pad + arm, y + size - pad);
      ctx.moveTo(x + size - pad - arm, y + size - pad);
      ctx.lineTo(x + size - pad, y + size - pad);
      ctx.lineTo(x + size - pad, y + size - pad - arm);
    }
    ctx.stroke();
    this.buttons.push({ x, y, w: size, h: size, action: () => toggleFullscreen(), disabled: false });
  }

  drawMultiSelect(ctx) {
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('멀티 플레이', CANVAS_W / 2, 110);

    const wideW = 320;
    const wideH = 64;
    const wideX = CANVAS_W / 2 - wideW / 2;
    const btn1Y = 170;
    const btn2Y = btn1Y + wideH + 14;
    const btn3Y = btn2Y + wideH + 14;
    this.addButton(ctx, wideX, btn1Y, wideW, wideH, '매칭 찾기 (1:1 대결)', () => this.startPvp());
    this.addButton(ctx, wideX, btn2Y, wideW, wideH, '멀티 경주', () => this.startJumpRace());
    this.addButton(ctx, wideX, btn3Y, wideW, wideH, '커스텀 맵 플레이', () => this.goToCustomSelect());

    this.addButton(ctx, CANVAS_W / 2 - 70, btn3Y + wideH + 28, 140, 44, '뒤로', () => {
      this.state = 'TITLE';
    });
  }

  drawStageSelect(ctx) {
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('스테이지 선택', CANVAS_W / 2, 80);

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
      const unlocked = i === 0 || this.cleared[i - 1];
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
      ctx.fillText(`${this.stagePage + 1} / ${totalPages} 페이지`, CANVAS_W / 2, gridBottom + 30);
    }

    const navY = gridBottom + 46;
    if (this.stagePage > 0) {
      this.addButton(ctx, CANVAS_W / 2 - 260, navY, 100, 40, '< 이전', () => {
        this.stagePage -= 1;
      });
    }
    if (this.stagePage < totalPages - 1) {
      this.addButton(ctx, CANVAS_W / 2 + 160, navY, 100, 40, '다음 >', () => {
        this.stagePage += 1;
      });
    }
    this.addButton(ctx, CANVAS_W / 2 - 70, navY, 140, 40, '뒤로', () => {
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
    ctx.fillText('일시정지', CANVAS_W / 2, 150);
    this.addButton(ctx, CANVAS_W / 2 - 110, 205, 220, 44, '계속하기', () => {
      this.state = 'PLAYING';
    });
    this.addButton(ctx, CANVAS_W / 2 - 110, 258, 220, 44, '스테이지 재시작', () =>
      this.playingCustom ? this.loadCustomStage(this.customIndex) : this.loadStage(this.stageIndex)
    );
    this.addButton(ctx, CANVAS_W / 2 - 110, 311, 220, 44, '설정', () => {
      this.settingsReturnState = 'PAUSED';
      this.state = 'SETTINGS';
    });
    this.addButton(ctx, CANVAS_W / 2 - 110, 364, 220, 44, this.playingCustom ? '커스텀 맵 목록' : '스테이지 선택', () =>
      this.playingCustom ? this.goToCustomSelect() : this.goToStageSelect()
    );
  }

  drawSettings(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('설정', CANVAS_W / 2, 150);

    ctx.font = '16px monospace';
    ctx.fillText(`음량: ${Math.round(music.volume * 100)}%`, CANVAS_W / 2, 205);

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
    this.addButton(ctx, CANVAS_W / 2 - 90, 258, 180, 44, music.muted ? '소리 켜기' : '소리 끄기', () => music.toggleMute());
    this.addButton(ctx, CANVAS_W / 2 + 100, 258, 60, 44, '+', () => music.setVolume(music.volume + 0.1));

    this.addButton(ctx, CANVAS_W / 2 - 110, 330, 220, 46, '뒤로', () => {
      this.state = this.settingsReturnState;
    });
  }

  drawStageClear(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#3ecf5b';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('스테이지 클리어!', CANVAS_W / 2, 180);

    const isLast = this.stageIndex === this.stages.length - 1;
    if (isLast) {
      ctx.fillStyle = '#fff';
      ctx.font = '18px monospace';
      ctx.fillText('모든 스테이지 클리어', CANVAS_W / 2, 220);
      this.addButton(ctx, CANVAS_W / 2 - 110, 260, 220, 46, '스테이지 선택', () => this.goToStageSelect());
    } else {
      this.addButton(ctx, CANVAS_W / 2 - 110, 260, 220, 46, '다음 스테이지', () => this.loadStage(this.stageIndex + 1));
      this.addButton(ctx, CANVAS_W / 2 - 110, 320, 220, 46, '스테이지 선택', () => this.goToStageSelect());
    }
  }

  drawCustomSelect(ctx) {
    drawBackground(ctx, CANVAS_W, CANVAS_H, this.time);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('커스텀 맵', CANVAS_W / 2, 68);
    ctx.font = '12px monospace';
    ctx.fillText('유저들이 만들어 서버에 올린 맵입니다 (일반 스테이지 진행과는 무관합니다)', CANVAS_W / 2, 90);

    this.addButton(ctx, CANVAS_W - 168, 16, 112, 32, '새로고침', () => this.goToCustomSelect());

    if (!this.customMaps.length) {
      ctx.fillStyle = '#333';
      ctx.font = '15px monospace';
      ctx.fillText('아직 커스텀 맵이 없습니다.', CANVAS_W / 2, CANVAS_H / 2 - 20);
      ctx.fillText("맵 에디터에서 맵을 만들고 '서버에 업로드'해보세요.", CANVAS_W / 2, CANVAS_H / 2 + 6);
      this.addButton(ctx, CANVAS_W / 2 - 70, CANVAS_H / 2 + 50, 140, 44, '뒤로', () => {
        this.state = 'MULTI_SELECT';
        music.switchTrack(MENU_TRACK);
      });
      return;
    }

    const cols = 4;
    const rows = 2;
    const pageSize = cols * rows;
    const totalPages = Math.max(1, Math.ceil(this.customMaps.length / pageSize));
    this.customPage = Math.max(0, Math.min(this.customPage, totalPages - 1));

    const boxW = 100;
    const boxH = 100;
    const gap = 26;
    const gridW = cols * boxW + (cols - 1) * gap;
    const startX = (CANVAS_W - gridW) / 2;
    const startY = 122;

    const pageStart = this.customPage * pageSize;
    const pageMaps = this.customMaps.slice(pageStart, pageStart + pageSize);

    pageMaps.forEach((m, localI) => {
      const i = pageStart + localI;
      const col = localI % cols;
      const row = Math.floor(localI / cols);
      const x = startX + col * (boxW + gap);
      const y = startY + row * (boxH + gap);
      const rawName = m.name || `맵 ${i + 1}`;
      const label = rawName.length > 8 ? `${rawName.slice(0, 7)}…` : rawName;
      this.addButton(ctx, x, y, boxW, boxH, label, () => this.loadCustomStage(i));
    });

    const gridBottom = startY + rows * (boxH + gap) - gap;
    if (totalPages > 1) {
      ctx.fillStyle = '#111';
      ctx.font = '16px monospace';
      ctx.fillText(`${this.customPage + 1} / ${totalPages} 페이지`, CANVAS_W / 2, gridBottom + 30);
    }

    const navY = gridBottom + 46;
    if (this.customPage > 0) {
      this.addButton(ctx, CANVAS_W / 2 - 260, navY, 100, 40, '< 이전', () => {
        this.customPage -= 1;
      });
    }
    if (this.customPage < totalPages - 1) {
      this.addButton(ctx, CANVAS_W / 2 + 160, navY, 100, 40, '다음 >', () => {
        this.customPage += 1;
      });
    }
    this.addButton(ctx, CANVAS_W / 2 - 70, navY, 140, 40, '뒤로', () => {
      this.state = 'MULTI_SELECT';
      music.switchTrack(MENU_TRACK);
    });
  }

  drawCustomClear(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#3ecf5b';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('맵 클리어!', CANVAS_W / 2, 180);

    const hasNext = this.customIndex + 1 < this.customMaps.length;
    this.addButton(ctx, CANVAS_W / 2 - 110, 230, 220, 46, '다시하기', () => this.loadCustomStage(this.customIndex));
    if (hasNext) {
      this.addButton(ctx, CANVAS_W / 2 - 110, 288, 220, 46, '다음 맵', () => this.loadCustomStage(this.customIndex + 1));
      this.addButton(ctx, CANVAS_W / 2 - 110, 346, 220, 46, '커스텀 맵 목록', () => this.goToCustomSelect());
    } else {
      this.addButton(ctx, CANVAS_W / 2 - 110, 288, 220, 46, '커스텀 맵 목록', () => this.goToCustomSelect());
    }
  }
}
