// Keyboard and mouse input. One job: turn browser events into the small
// input object the sim reads each fixed step. Pointer lock is requested by
// the HUD's play button, never by the sim.
export function createInput() {
  const input = {
    keys: new Set(),
    lookDX: 0, lookDY: 0,
    firing: false, reload: false, select: null,
    menuOpen: false, locked: false,
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    input.keys.add(e.code);
    if (e.code === 'KeyR') input.reload = true;
    if (e.code === 'Digit1') input.select = '1';
    if (e.code === 'Digit2') input.select = '2';
    if (e.code === 'Digit3') input.select = '3';
    if (e.code === 'Digit4') input.select = '4';
    if (e.code === 'Digit5') input.select = '5';
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.firing = false; });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      input.lookDX += e.movementX;
      input.lookDY += e.movementY;
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement) input.firing = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = !!document.pointerLockElement;
    if (!input.locked) input.firing = false;
  });
  return input;
}

export function requestLock() {
  const el = document.body;
  if (el.requestPointerLock) el.requestPointerLock();
}
