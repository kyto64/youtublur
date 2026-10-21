// Ambient declarations for the Chrome extension's flat-script setup.
// `storage-mode.js` is loaded before `content.js` via the manifest, exposing
// these helpers on `globalThis`. Declare them so type-checking sees them.

type BackgroundMode = 'blur' | 'solid';

declare function saveModeToStorage(mode: BackgroundMode): Promise<boolean>;
declare function loadModeFromStorage(): Promise<BackgroundMode>;
declare function saveBlurStrengthToStorage(px: number): Promise<boolean>;
declare function loadBlurStrengthFromStorage(): Promise<number>;
declare function loadBlurStrengthRecordFromStorage(): Promise<{ px: number; timestamp: number }>;
declare function clampBlurStrengthPx(raw: unknown): number;
declare function normalizeSolidColor(raw: unknown): string | null;
declare function sanitizeSolidColorForCss(raw: unknown): string;
declare function saveSolidColorToStorage(color: string): Promise<boolean>;
declare function loadSolidColorFromStorage(): Promise<string | null>;
declare function loadSolidColorRecordFromStorage(): Promise<{ color: string | null; timestamp: number }>;
declare function reconcileStorageCopies(): void;
declare function wireSolidColorControl(): void;

declare function ensureFirstUseTimestamp(): Promise<number | null>;
declare function shouldShowReviewNudge(now?: number): Promise<boolean>;
declare function markReviewNudgeShown(): Promise<boolean>;
declare function dismissReviewNudgePermanently(): Promise<boolean>;
declare function markReviewNudgeHandled(): Promise<boolean>;
declare function getReviewStoreUrl(): string;
declare function openReviewStorePage(): void;
declare function clearReviewBadge(): void;

interface Navigator {
  /** Non-standard but widely available; used for device-performance heuristics. */
  deviceMemory?: number;
}

// CommonJS globals — used only inside `if (typeof module !== 'undefined')` test-export shims.
declare var module: { exports: any } | undefined;
declare function require(id: string): any;
