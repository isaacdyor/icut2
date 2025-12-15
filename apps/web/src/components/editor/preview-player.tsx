import { useCallback, useEffect, useRef } from "react";
import type { UsePlaybackEngineReturn } from "@/lib/playback";
import type { Asset } from "@/lib/types";

function getDebugText(
  playback: UsePlaybackEngineReturn,
  clipTimeMs: number
): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const buffered = playback.debugStats?.bufferedFrames ?? 0;
  return `state=${playback.state} playing=${playback.isPlaying} clipMs=${Math.round(clipTimeMs)} buf=${buffered} err=${playback.error?.message ?? "none"}`;
}

type PreviewPlayerProps = {
  playback: UsePlaybackEngineReturn;
  /** Current playback time in milliseconds (controlled externally) */
  currentTimeMs: number;
  /** Local clip time in milliseconds (video time, not timeline time) */
  clipTimeMs: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Called when user seeks */
  onSeek?: (timeMs: number) => void;
  /** The video asset to play (if any) */
  videoAsset?: Asset | null;
};

export function PreviewPlayer({
  playback,
  currentTimeMs,
  clipTimeMs,
  durationMs,
  onSeek,
  videoAsset,
}: PreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSeekedClipTimeRef = useRef<number | null>(null);

  const {
    state,
    isPlaying,
    attachCanvas,
    togglePlayback,
    seek,
    goToStart,
    goToEnd,
    resizeCanvas,
  } = playback;

  // Attach canvas on mount
  useEffect(() => {
    if (canvasRef.current) {
      attachCanvas(canvasRef.current);
    }
    // Ensure we do an initial size sync; ResizeObserver may not fire immediately.
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      resizeCanvas(width, height);
    }
  }, [attachCanvas, resizeCanvas]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Ignore transient zero sizes which would make the canvas permanently black.
        if (width < 1 || height < 1) {
          continue;
        }
        resizeCanvas(width, height);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [resizeCanvas]);

  // Sync external time to engine (only when not playing to avoid conflicts)
  useEffect(() => {
    if (!isPlaying && (state === "ready" || state === "paused")) {
      // Avoid an immediate seek to 0 right after load; mp4box seek semantics require
      // careful buffer management and can throw "offset is out of bounds" if we seek too early.
      if (clipTimeMs === 0 && playback.currentTimeMs === 0) {
        return;
      }
      if (lastSeekedClipTimeRef.current === clipTimeMs) {
        return;
      }
      lastSeekedClipTimeRef.current = clipTimeMs;
      seek(clipTimeMs);
    }
  }, [clipTimeMs, state, seek, isPlaying, playback.currentTimeMs]);

  const handlePlayPause = useCallback(() => {
    togglePlayback();
  }, [togglePlayback]);

  const handleSkipBack = useCallback(() => {
    goToStart();
    onSeek?.(0);
  }, [goToStart, onSeek]);

  const handleSkipForward = useCallback(() => {
    goToEnd();
    onSeek?.(durationMs);
  }, [goToEnd, durationMs, onSeek]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const frames = Math.floor((ms % 1000) / (1000 / 30)); // Assuming 30fps
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const progressPercent =
    durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  const isLoading = state === "loading";
  const hasError = state === "error";
  const isReady =
    state === "ready" || state === "playing" || state === "paused";
  const errorMessage =
    playback.error?.message ?? "Failed to load video (check CORS/network)";
  const debugText = getDebugText(playback, clipTimeMs);

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="shrink-0 border-b px-3 py-2">
        <h3 className="font-medium text-muted-foreground text-sm">Preview</h3>
      </div>

      {/* Preview area */}
      <div
        className="relative flex flex-1 items-center justify-center bg-black"
        ref={containerRef}
      >
        {/* Canvas for video rendering */}
        <canvas className="h-full w-full" ref={canvasRef} />

        {debugText ? (
          <div className="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
            {debugText}
          </div>
        ) : null}

        {/* Loading overlay */}
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex flex-col items-center gap-2 text-white">
              <LoadingSpinner />
              <p className="text-sm">Loading video...</p>
            </div>
          </div>
        ) : null}

        {/* Error overlay */}
        {hasError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex flex-col items-center gap-2 text-red-400">
              <ErrorIcon />
              <p className="max-w-[80%] text-center text-sm">{errorMessage}</p>
            </div>
          </div>
        ) : null}

        {/* Empty state */}
        {!videoAsset && state === "idle" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground/50 text-sm">
              Add a video to the timeline to preview
            </p>
          </div>
        ) : null}

        {/* Play button overlay */}
        {isReady ? (
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100"
            onClick={handlePlayPause}
            type="button"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform hover:scale-110">
              {isPlaying ? (
                <PauseIcon className="h-8 w-8 text-white" />
              ) : (
                <PlayIcon className="ml-1 h-8 w-8 text-white" />
              )}
            </div>
          </button>
        ) : null}
      </div>

      {/* Playback controls */}
      <div className="shrink-0 border-t bg-muted/30 p-2">
        {/* Progress bar */}
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* Skip back */}
            <button
              aria-label="Skip to start"
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted"
              onClick={handleSkipBack}
              type="button"
            >
              <SkipBackIcon className="h-4 w-4" />
            </button>

            {/* Play/Pause */}
            <button
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handlePlayPause}
              type="button"
            >
              {isPlaying ? (
                <PauseIcon className="h-4 w-4" />
              ) : (
                <PlayIcon className="ml-0.5 h-4 w-4" />
              )}
            </button>

            {/* Skip forward */}
            <button
              aria-label="Skip to end"
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted"
              onClick={handleSkipForward}
              type="button"
            >
              <SkipForwardIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Timecode */}
          <div className="font-mono text-muted-foreground text-xs">
            {formatTime(currentTimeMs)} / {formatTime(durationMs)}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      aria-label="Loading"
      className="h-8 w-8 animate-spin text-white"
      fill="none"
      role="img"
      viewBox="0 0 24 24"
    >
      <title>Loading</title>
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      aria-label="Error"
      className="h-8 w-8"
      fill="none"
      role="img"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <title>Error</title>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

function PlayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <rect height="16" rx="1" width="4" x="6" y="4" />
      <rect height="16" rx="1" width="4" x="14" y="4" />
    </svg>
  );
}

function SkipBackIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" x2="5" y1="19" y2="5" />
    </svg>
  );
}

function SkipForwardIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" x2="19" y1="5" y2="19" />
    </svg>
  );
}
