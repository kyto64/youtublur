// Ambient declarations for the Chrome extension's flat-script setup.
// `storage-mode.js` is loaded before `content.js` via the manifest, exposing
// these helpers on `globalThis`. Declare them so type-checking sees them.

type BackgroundMode = 'blur' | 'solid';

declare function saveModeToStorage(mode: BackgroundMode): Promise<boolean>;
declare function loadModeFromStorage(): Promise<BackgroundMode>;
declare function saveBlurStrengthToStorage(px: number): Promise<boolean>;
declare function loadBlurStrengthFromStorage(): Promise<number>;
declare function clampBlurStrengthPx(raw: unknown): number;
declare function reconcileStorageCopies(): void;

declare function ensureFirstUseTimestamp(): Promise<number | null>;
declare function shouldShowReviewNudge(now?: number): Promise<boolean>;
declare function dismissReviewNudgeForNow(now?: number): Promise<boolean>;
declare function dismissReviewNudgePermanently(): Promise<boolean>;
declare function markReviewNudgeHandled(): Promise<boolean>;
declare function getReviewStoreUrl(): string;
declare function openReviewStorePage(): void;

interface Navigator {
  /** Non-standard but widely available; used for device-performance heuristics. */
  deviceMemory?: number;
}

// CommonJS globals — used only inside `if (typeof module !== 'undefined')` test-export shims.
declare var module: { exports: any } | undefined;
declare function require(id: string): any;
