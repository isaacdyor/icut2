// Timeline configuration
export const PIXELS_PER_SECOND = 50;
export const DEFAULT_CLIP_DURATION_MS = 5000;
export const TRACK_LABEL_WIDTH = 64; // 16 * 4 = w-16

// Convert pixels to milliseconds
export function pxToMs(px: number): number {
  return (px / PIXELS_PER_SECOND) * 1000;
}

// Convert milliseconds to pixels
export function msToPx(ms: number): number {
  return (ms / 1000) * PIXELS_PER_SECOND;
}

// Format milliseconds to time string (MM:SS.ms)
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((ms % 1000) / 100);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${millis}`;
}

// Snap to grid (optional, for cleaner positioning)
export function snapToGrid(ms: number, gridMs = 100): number {
  return Math.round(ms / gridMs) * gridMs;
}
