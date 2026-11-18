// Azura Bay — keyboard + mouse input with edge detection.
// Written fresh for the gta6-01 round-3 entry.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.anyKey = false;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.key.toLowerCase())) this.pressed.add(e.key.toLowerCase());
      this.keys.add(e.key.toLowerCase());
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); });
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    window.addEventListener('mousedown', () => { this.mouse.down = true; this.anyKey = true; });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }
  hit(...names) { return names.some((n) => this.pressed.has(n)); }
  endFrame() { this.pressed.clear(); this.anyKey = false; }
}
