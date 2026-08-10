// PvP arenas: fixed-camera (960x540), no goal/cones/enemies.
// Falling off the platforms in any direction past the canvas bounds is a ring-out.
export const PVP_ARENAS = [
  {
    name: 'FLAT',
    platforms: [{ x: 160, y: 420, w: 640, h: 40 }],
    spawnP1: { x: 220, y: 380 },
    spawnP2: { x: 700, y: 380 },
  },
  {
    name: 'ISLANDS',
    platforms: [
      { x: 60, y: 440, w: 260, h: 32 },
      { x: 380, y: 340, w: 200, h: 32 },
      { x: 640, y: 440, w: 260, h: 32 },
    ],
    spawnP1: { x: 120, y: 400 },
    spawnP2: { x: 760, y: 400 },
  },
  {
    name: 'BRIDGE',
    platforms: [
      { x: 40, y: 440, w: 200, h: 32 },
      { x: 280, y: 460, w: 400, h: 16 },
      { x: 720, y: 440, w: 200, h: 32 },
    ],
    spawnP1: { x: 100, y: 400 },
    spawnP2: { x: 800, y: 400 },
  },
  {
    name: 'TOWER',
    platforms: [
      { x: 340, y: 460, w: 280, h: 32 },
      { x: 200, y: 360, w: 160, h: 24 },
      { x: 600, y: 360, w: 160, h: 24 },
      { x: 380, y: 260, w: 200, h: 24, moving: { axis: 'x', range: 60, speed: 1.1 } },
    ],
    spawnP1: { x: 380, y: 420 },
    spawnP2: { x: 560, y: 420 },
  },
  {
    name: 'PILLARS',
    platforms: [
      { x: 100, y: 440, w: 140, h: 28 },
      { x: 300, y: 380, w: 120, h: 28 },
      { x: 470, y: 460, w: 140, h: 28 },
      { x: 660, y: 380, w: 120, h: 28 },
      { x: 820, y: 440, w: 140, h: 28 },
    ],
    spawnP1: { x: 140, y: 400 },
    spawnP2: { x: 850, y: 400 },
  },
];
