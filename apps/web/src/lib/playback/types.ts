/**
 * Core types for the playback engine
 */

export type PlaybackState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "seeking"
  | "error";

export type DecodedFrame = {
  frame: VideoFrame;
  timestampUs: number;
  durationUs: number;
};

export type VideoTrackInfo = {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  durationMs: number;
  frameRate: number;
  bitrate: number;
};

export type AudioTrackInfo = {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  durationMs: number;
  bitrate: number;
};

export type MediaInfo = {
  durationMs: number;
  video: VideoTrackInfo | null;
  audio: AudioTrackInfo | null;
};

export type SeekMode = "keyframe" | "precise";

export type PlaybackEngineConfig = {
  /** Maximum number of frames to buffer ahead */
  bufferSize: number;
  /** Target frame rate for playback (0 = use source fps) */
  targetFps: number;
  /** Whether to loop playback */
  loop: boolean;
};

export const DEFAULT_CONFIG: PlaybackEngineConfig = {
  bufferSize: 30,
  targetFps: 0,
  loop: false,
};

/** Events emitted by the playback engine */
export type PlaybackEngineEvents = {
  stateChange: (state: PlaybackState) => void;
  timeUpdate: (timeMs: number) => void;
  durationChange: (durationMs: number) => void;
  error: (error: Error) => void;
  frameReady: (frame: DecodedFrame) => void;
};
