// Keyboard state: held keys plus edge-triggered presses consumed once per
// frame. Also exposes the drive/foot control axes the game loop reads.
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.anyKey = false;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); });
  }
  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.anyKey = false; }
  // On-foot movement axis, normalized.
  moveAxis() {
    let x = 0, y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    if (x && y) { x *= 0.7071; y *= 0.7071; }
    return { x, y };
  }
  // Driving: throttle -1..1 (W/S), steer -1..1 (A/D).
  driveAxis() {
    let throttle = 0, steer = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) throttle += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) throttle -= 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) steer -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) steer += 1;
    return { throttle, steer };
  }
}
