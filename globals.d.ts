// Ambient declarations for the Chrome extension's flat-script setup.
// `storage-mode.js` is loaded before `content.js` via the manifest, exposing
// these helpers on `globalThis`. Declare them so type-checking sees them.

declare function saveModeToStorage(mode: string): Promise<boolean>;
declare function loadModeFromStorage(): Promise<string>;
declare function reconcileStorageCopies(): void;

interface Navigator {
  /** Non-standard but widely available; used for device-performance heuristics. */
  deviceMemory?: number;
}

// CommonJS globals — used only inside `if (typeof module !== 'undefined')` test-export shims.
declare var module: { exports: any } | undefined;
declare function require(id: string): any;
