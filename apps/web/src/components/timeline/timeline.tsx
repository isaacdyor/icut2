import { useCallback, useRef, useState } from "react";
import type { createClipMutations } from "@/lib/collections/project";
import type { Asset, Track } from "@/lib/types";
import {
  DEFAULT_CLIP_DURATION_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  msToPx,
  pxToMs,
  TRACK_LABEL_WIDTH,
  ZOOM_STEP,
} from "./constants";
import { DroppableTrack } from "./droppable-track";
import { TimeRuler } from "./time-ruler";

type PreviewClip = {
  id: string;
  assetId: string;
  startMs: number;
  durationMs: number;
};

type TimelineProps = {
  assets: Asset[];
  tracks: Track[];
  clipMutations: ReturnType<typeof createClipMutations>;
  currentTimeMs: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (timeMs: number) => void;
  dragState: {
    activeClip: PreviewClip | null;
    previewTrackId: string | null;
    previewPositionMs: number | null;
    type: "asset" | "clip" | null;
  };
};

export function Timeline({
  assets,
  tracks,
  clipMutations,
  currentTimeMs,
  isPlaying,
  onPlayPause,
  onSeek,
  dragState,
}: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const sortedTracks = [...tracks].sort((a, b) => a.order - b.order);

  const maxClipEndMs = Math.max(
    ...tracks.flatMap((t) => t.clips.map((c) => c.startMs + c.durationMs)),
    30_000
  );
  const timelineDurationMs = Math.ceil(maxClipEndMs / 5000) * 5000 + 10_000;
  const timelineWidth = msToPx(timelineDurationMs, zoom);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  function handleClipDelete(clipId: string) {
    clipMutations.delete(clipId);
  }

  const getPreviewForTrack = useCallback(
    (trackId: string) => {
      if (dragState.previewTrackId !== trackId) {
        return null;
      }
      if (dragState.previewPositionMs === null) {
        return null;
      }

      const durationMs =
        dragState.activeClip?.durationMs ?? DEFAULT_CLIP_DURATION_MS;

      return {
        positionMs: dragState.previewPositionMs,
        durationMs,
        isClip: dragState.type === "clip",
      };
    },
    [dragState]
  );

  const playheadPosition = msToPx(currentTimeMs, zoom);

  // Calculate time from mouse position
  const getTimeFromMouseEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!timelineContentRef.current) {
        return 0;
      }
      const rect = timelineContentRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left - TRACK_LABEL_WIDTH;
      const timeMs = pxToMs(Math.max(0, relativeX), zoom);
      return Math.max(0, Math.min(timeMs, timelineDurationMs));
    },
    [zoom, timelineDurationMs]
  );

  // Handle click on timeline to seek
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't seek if clicking on a clip or control
      if ((e.target as HTMLElement).closest("[data-clip]")) {
        return;
      }
      const timeMs = getTimeFromMouseEvent(e);
      onSeek(timeMs);
    },
    [getTimeFromMouseEvent, onSeek]
  );

  // Handle scrubbing (drag to seek)
  const handleScrubStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsScrubbing(true);
      const timeMs = getTimeFromMouseEvent(e);
      onSeek(timeMs);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newTimeMs = getTimeFromMouseEvent(moveEvent);
        onSeek(newTimeMs);
      };

      const handleMouseUp = () => {
        setIsScrubbing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [getTimeFromMouseEvent, onSeek]
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border bg-card">
      {/* Timeline Header with Playback and Zoom Controls */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <button
            aria-label="Skip to start"
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
            type="button"
          >
            <SkipBackIcon className="h-4 w-4" />
          </button>
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onPlayPause}
            type="button"
          >
            {isPlaying ? (
              <PauseIcon className="h-3 w-3" />
            ) : (
              <PlayIcon className="ml-0.5 h-3 w-3" />
            )}
          </button>
          <button
            aria-label="Skip to end"
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
            type="button"
          >
            <SkipForwardIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded border bg-background text-sm transition-colors hover:bg-muted disabled:opacity-50"
            disabled={zoom <= MIN_ZOOM}
            onClick={handleZoomOut}
            type="button"
          >
            −
          </button>
          <span className="min-w-12 text-center font-mono text-muted-foreground text-xs">
            {Math.round(zoom * 100)}%
          </span>
          <button
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded border bg-background text-sm transition-colors hover:bg-muted disabled:opacity-50"
            disabled={zoom >= MAX_ZOOM}
            onClick={handleZoomIn}
            type="button"
          >
            +
          </button>
        </div>
      </div>

      {/* Scrollable Timeline Container */}
      <div className="min-h-0 flex-1 overflow-auto" ref={scrollContainerRef}>
        <div
          aria-label="Timeline scrubber"
          aria-valuemax={timelineDurationMs}
          aria-valuemin={0}
          aria-valuenow={currentTimeMs}
          className={`relative ${isScrubbing ? "cursor-grabbing" : "cursor-pointer"}`}
          onClick={handleTimelineClick}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              onSeek(Math.max(0, currentTimeMs - 1000));
            } else if (e.key === "ArrowRight") {
              onSeek(Math.min(timelineDurationMs, currentTimeMs + 1000));
            }
          }}
          onMouseDown={handleScrubStart}
          ref={timelineContentRef}
          role="slider"
          style={{
            width: `${timelineWidth + TRACK_LABEL_WIDTH}px`,
          }}
          tabIndex={0}
        >
          {/* Time Ruler */}
          <TimeRuler durationMs={timelineDurationMs} zoom={zoom} />

          {/* Tracks */}
          {sortedTracks.map((track) => (
            <div id={`track-${track.id}`} key={track.id}>
              <DroppableTrack
                assets={assets}
                draggedClipId={dragState.activeClip?.id ?? null}
                onClipDelete={handleClipDelete}
                preview={getPreviewForTrack(track.id)}
                timelineWidth={timelineWidth}
                track={track}
                zoom={zoom}
              />
            </div>
          ))}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-red-500"
            style={{
              left: `${TRACK_LABEL_WIDTH + playheadPosition}px`,
            }}
          >
            <div className="-translate-x-1/2 -top-1 absolute h-3 w-3 rounded-full bg-red-500" />
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
