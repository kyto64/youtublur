/**
 * Pure decisions for manifest `commands`. Storage I/O stays in the caller so
 * the saved keys (`playerBackgroundMode`, `playerBlurStrengthPx`) do not change shape.
 * Blur steps use `YOUTUBLUR_BLUR_RANGE` from storage-mode.js (8–72, step 4).
 */

const SHORTCUT_COMMAND_ORDER = Object.freeze([
  'toggle-mode',
  'increase-blur-strength',
  'decrease-blur-strength'
]);

type ShortcutEffect =
  | { kind: 'mode'; mode: BackgroundMode }
  | { kind: 'blur'; blurPx: number }
  | { kind: 'none' };

function applyShortcutCommand(
  command: string,
  state: { mode: BackgroundMode; blurPx: number }
): ShortcutEffect {
  if (command === 'toggle-mode') {
    // Same two values as the popup radios. Anything other than solid is blur.
    const mode: BackgroundMode = state.mode === 'solid' ? 'solid' : 'blur';
    return { kind: 'mode', mode: mode === 'solid' ? 'blur' : 'solid' };
  }

  if (command !== 'increase-blur-strength' && command !== 'decrease-blur-strength') {
    return { kind: 'none' };
  }

  const current = clampBlurStrengthPx(state.blurPx);
  const delta =
    command === 'increase-blur-strength' ? YOUTUBLUR_BLUR_RANGE.step : -YOUTUBLUR_BLUR_RANGE.step;
  const next = clampBlurStrengthPx(current + delta);
  if (next === current) return { kind: 'none' };
  return { kind: 'blur', blurPx: next };
}

const shortcutActionsApi = {
  SHORTCUT_COMMAND_ORDER,
  applyShortcutCommand
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = shortcutActionsApi;
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, shortcutActionsApi);
}
