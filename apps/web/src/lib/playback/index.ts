/**
 * Playback Engine
 *
 * A WebCodecs-based video playback system for browser-based video editing.
 *
 * Architecture:
 * - MP4Demuxer: Parses MP4 containers using mp4box.js
 * - VideoDecoderManager: Manages WebCodecs VideoDecoder with buffering
 * - FrameScheduler: Handles playback timing with requestAnimationFrame
 * - CanvasCompositor: Renders frames and overlays to canvas
 * - PlaybackEngine: Orchestrates all components
 *
 * Usage:
 * ```tsx
 * const { attachCanvas, load, play, pause, currentTimeMs } = usePlaybackEngine();
 *
 * useEffect(() => {
 *   load(videoUrl);
 * }, [videoUrl]);
 *
 * return <canvas ref={attachCanvas} />;
 * ```
 */

export type { CompositorConfig, Layer } from "./canvas-compositor";
export { CanvasCompositor, createTextLayer } from "./canvas-compositor";
export type { DemuxedSample, DemuxerCallbacks } from "./demuxer";
export { MP4Demuxer } from "./demuxer";
export { FrameScheduler } from "./frame-scheduler";
// Core engine
export { PlaybackEngine } from "./playback-engine";
// Types
export type {
  AudioTrackInfo,
  DecodedFrame,
  MediaInfo,
  PlaybackEngineConfig,
  PlaybackEngineEvents,
  PlaybackState,
  SeekMode,
  VideoTrackInfo,
} from "./types";
export type { UsePlaybackEngineReturn } from "./use-playback-engine";
// React hook
export { usePlaybackEngine } from "./use-playback-engine";
// Components
export { VideoDecoderManager } from "./video-decoder-manager";
