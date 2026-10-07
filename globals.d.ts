// Ambient declarations for the Chrome extension's flat-script setup.
// `storage-mode.js` is loaded before `content.js` via the manifest, exposing
// these helpers on `globalThis`. Declare them so type-checking sees them.

type BackgroundMode = 'blur' | 'solid';

declare function saveModeToStorage(mode: BackgroundMode): Promise<boolean>;
declare function loadModeFromStorage(): Promise<BackgroundMode>;
declare function reconcileStorageCopies(): void;

declare function ensureFirstUseTimestamp(): Promise<number>;
declare function shouldShowReviewNudge(now?: number): Promise<boolean>;
declare function dismissReviewNudgeForNow(now?: number): Promise<void>;
declare function dismissReviewNudgePermanently(): Promise<void>;
declare function markReviewNudgeHandled(): Promise<void>;
declare function getReviewStoreUrl(): string;
declare function openReviewStorePage(): void;

interface Navigator {
  /** Non-standard but widely available; used for device-performance heuristics. */
  deviceMemory?: number;
}

// CommonJS globals — used only inside `if (typeof module !== 'undefined')` test-export shims.
declare var module: { exports: any } | undefined;
declare function require(id: string): any;
