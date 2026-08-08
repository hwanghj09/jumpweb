export const FRAME_W = 144;
export const FRAME_H = 192;

const WHITE_THRESHOLD = 235;

function loadKeyedSprite(src) {
  const canvas = document.createElement('canvas');
  canvas.ready = false;
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] >= WHITE_THRESHOLD && d[i + 1] >= WHITE_THRESHOLD && d[i + 2] >= WHITE_THRESHOLD) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    canvas.ready = true;
  };
  img.src = src;
  return canvas;
}

export const playerSheet = loadKeyedSprite('images/player-spritesheet.png');
export const enemySheet = loadKeyedSprite('images/enemy-spritesheet.png');
