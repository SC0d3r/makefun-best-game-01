// Keyboard input for LUMENWING.
//
// The game reads two kinds of edges from this module:
//   - held()    is true for as long as a key is down;
//   - hit()     is true only for the frame in which the key went down.
// endFrame() is called once at the end of every game loop iteration, so pressed
// and released always describe exactly one frame.

const PREVENT_DEFAULT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export class Input {
  /**
   * @param {EventTarget} [target] element (or window) that receives key events.
   */
  constructor(target = typeof window !== 'undefined' ? window : null) {
    this.target = target;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.any = false;

    this.onKeyDown = (event) => {
      const code = event.code;
      if (!code) return;
      // Arrows scroll the page and Space activates focused buttons; neither is
      // wanted while flying.
      if (PREVENT_DEFAULT.has(code)) event.preventDefault();
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      this.any = true;
    };

    this.onKeyUp = (event) => {
      const code = event.code;
      if (!code) return;
      this.down.delete(code);
      this.released.add(code);
    };

    // Losing focus mid-key would otherwise leave the moth flying forever.
    this.onBlur = () => {
      this.down.clear();
      this.pressed.clear();
      this.released.clear();
      this.any = false;
    };

    if (this.target && typeof this.target.addEventListener === 'function') {
      this.target.addEventListener('keydown', this.onKeyDown);
      this.target.addEventListener('keyup', this.onKeyUp);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', this.onBlur);
    }
  }

  /** True while `code` is held down. */
  held(code) {
    return this.down.has(code);
  }

  /** True only on the frame `code` first went down. */
  hit(code) {
    return this.pressed.has(code);
  }

  /**
   * Movement direction from WASD and the arrow keys.
   * Diagonals are normalised so they are not faster than a single axis.
   */
  axis() {
    const left = this.held('KeyA') || this.held('ArrowLeft');
    const right = this.held('KeyD') || this.held('ArrowRight');
    const up = this.held('KeyW') || this.held('ArrowUp');
    const down = this.held('KeyS') || this.held('ArrowDown');

    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let y = (down ? 1 : 0) - (up ? 1 : 0);
    const length = Math.sqrt(x * x + y * y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** Retire this frame's one-shot edges. Call after updating the game. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.any = false;
  }

  /** Remove every listener (used when the game view is torn down). */
  destroy() {
    if (this.target && typeof this.target.removeEventListener === 'function') {
      this.target.removeEventListener('keydown', this.onKeyDown);
      this.target.removeEventListener('keyup', this.onKeyUp);
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('blur', this.onBlur);
    }
  }
}
