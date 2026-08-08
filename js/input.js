const keysDown = new Set();
const justPressed = new Set();

const PREVENT_DEFAULT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

window.addEventListener('keydown', (e) => {
  if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
  if (!keysDown.has(e.code)) justPressed.add(e.code);
  keysDown.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

export const Input = {
  isDown(code) {
    return keysDown.has(code);
  },
  pressed(code) {
    return justPressed.has(code);
  },
  endFrame() {
    justPressed.clear();
  },
};
