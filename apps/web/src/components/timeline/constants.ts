// Timeline configuration
export const BASE_PIXELS_PER_SECOND = 50;
export const DEFAULT_CLIP_DURATION_MS = 5000;
export const TRACK_LABEL_WIDTH = 64;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.25;

// Convert pixels to milliseconds (with zoom)
export function pxToMs(px: number, zoom = 1): number {
  return (px / (BASE_PIXELS_PER_SECOND * zoom)) * 1000;
}

// Convert milliseconds to pixels (with zoom)
export function msToPx(ms: number, zoom = 1): number {
  return (ms / 1000) * BASE_PIXELS_PER_SECOND * zoom;
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
