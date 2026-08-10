function getCanvas() {
  return document.getElementById('game');
}

export function isFullscreen() {
  return !!document.fullscreenElement;
}

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    const canvas = getCanvas();
    if (canvas && canvas.requestFullscreen) canvas.requestFullscreen().catch(() => {});
  }
}
