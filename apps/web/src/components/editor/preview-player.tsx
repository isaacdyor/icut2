import { useState } from "react";

type PreviewPlayerProps = {
  currentTimeMs: number;
  durationMs: number;
  onSeek?: (timeMs: number) => void;
};

export function PreviewPlayer({
  currentTimeMs,
  durationMs,
}: PreviewPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const frames = Math.floor((ms % 1000) / (1000 / 30)); // Assuming 30fps
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const progressPercent =
    durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="shrink-0 border-b px-3 py-2">
        <h3 className="font-medium text-muted-foreground text-sm">Preview</h3>
      </div>

      {/* Preview area */}
      <div className="relative flex flex-1 items-center justify-center bg-black">
        {/* Placeholder for video preview */}
        <div className="text-muted-foreground/50 text-sm">
          Preview will appear here
        </div>

        {/* Play button overlay */}
        <button
          aria-label={isPlaying ? "Pause" : "Play"}
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100"
          onClick={() => setIsPlaying(!isPlaying)}
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
              aria-label="Skip back"
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted"
              type="button"
            >
              <SkipBackIcon className="h-4 w-4" />
            </button>

            {/* Play/Pause */}
            <button
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setIsPlaying(!isPlaying)}
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
              aria-label="Skip forward"
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted"
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
