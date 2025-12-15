/**
 * PlaybackEngine
 * Main orchestrator that combines VideoDecoderManager, FrameScheduler, and CanvasCompositor
 * Provides a high-level API for video playback
 */

import { CanvasCompositor, type Layer } from "./canvas-compositor";
import { EventEmitter } from "./event-emitter";
import { FrameScheduler } from "./frame-scheduler";
import {
  DEFAULT_CONFIG,
  type DecodedFrame,
  type MediaInfo,
  type PlaybackEngineConfig,
  type PlaybackState,
} from "./types";
import { VideoDecoderManager } from "./video-decoder-manager";

type PlaybackEngineEvents = {
  stateChange: (state: PlaybackState) => void;
  timeUpdate: (timeMs: number) => void;
  durationChange: (durationMs: number) => void;
  error: (error: Error) => void;
};

export class PlaybackEngine extends EventEmitter<PlaybackEngineEvents> {
  private readonly decoder: VideoDecoderManager;
  private readonly scheduler: FrameScheduler;
  private compositor: CanvasCompositor | null = null;

  private readonly config: PlaybackEngineConfig;
  private state: PlaybackState = "idle";
  private mediaInfo: MediaInfo | null = null;
  private lastRenderedFrame: DecodedFrame | null = null;

  constructor(config: Partial<PlaybackEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.decoder = new VideoDecoderManager(this.config.bufferSize);
    this.scheduler = new FrameScheduler();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Decoder events
    // IMPORTANT: decoder "state" is *not* the same as playback engine state.
    // Do not mirror decoder stateChange into engine state, or we'll overwrite
    // "playing"/"paused" with "ready" continuously.
    this.decoder.on("error", (error) => {
      this.setState("error");
      this.emit("error", error);
    });

    this.decoder.on("infoReady", (info) => {
      this.mediaInfo = info;
      this.scheduler.setDuration(info.durationMs * 1000);
      this.emit("durationChange", info.durationMs);

      if (info.video) {
        this.compositor?.setVideoDimensions(
          info.video.codedWidth,
          info.video.codedHeight
        );
      }

      // If we were loading, we're now ready to render/seek/play.
      if (this.state === "loading" || this.state === "idle") {
        this.setState("ready");
      }
    });

    // When paused/ready, render the first available decoded frame so the canvas isn't black.
    this.decoder.on("frameDecoded", () => {
      if (!(this.state === "ready" || this.state === "paused")) {
        return;
      }
      const timeUs = this.scheduler.getCurrentTimeUs();
      const frame = this.decoder.getFrameAtTime(timeUs);
      if (frame && frame !== this.lastRenderedFrame) {
        this.compositor?.drawFrame(frame.frame);
        this.lastRenderedFrame = frame;
      }
    });

    // Scheduler events
    this.scheduler.on("tick", (currentTimeUs) => {
      this.onPlaybackTick(currentTimeUs);
    });

    this.scheduler.on("seek", (timeUs) => {
      this.onSeek(timeUs);
    });
  }

  private setState(newState: PlaybackState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit("stateChange", newState);
    }
  }

  private onPlaybackTick(currentTimeUs: number): void {
    // Emit time update
    this.emit("timeUpdate", currentTimeUs / 1000);

    // Get frame for current time
    const frame = this.decoder.getFrameAtTime(currentTimeUs);

    if (frame && frame !== this.lastRenderedFrame) {
      // Release previous frame
      if (this.lastRenderedFrame) {
        this.decoder.releaseFrame(this.lastRenderedFrame);
      }

      // Render new frame
      this.compositor?.drawFrame(frame.frame);
      this.lastRenderedFrame = frame;

      // Clean up old frames
      this.decoder.consumeFramesUpTo(currentTimeUs - 100_000); // Keep 100ms behind
    }
  }

  private async onSeek(timeUs: number): Promise<void> {
    await this.decoder.seek(timeUs / 1000);

    // Get and render the frame at the new position
    const frame = this.decoder.getFrameAtTime(timeUs);
    if (frame) {
      this.compositor?.drawFrame(frame.frame);
      this.lastRenderedFrame = frame;
    }
  }

  /**
   * Attach to a canvas element for rendering
   */
  attachCanvas(canvas: HTMLCanvasElement): void {
    this.compositor?.dispose();
    this.compositor = new CanvasCompositor(canvas);

    if (this.mediaInfo?.video) {
      this.compositor.setVideoDimensions(
        this.mediaInfo.video.codedWidth,
        this.mediaInfo.video.codedHeight
      );
    }
  }

  /**
   * Resize the canvas
   */
  resizeCanvas(width: number, height: number): void {
    this.compositor?.resize(width, height);
  }

  /**
   * Load a video from URL
   */
  load(url: string): Promise<MediaInfo> {
    this.setState("loading");
    return this.decoder.load(url).then((info) => {
      // infoReady also fires, but keep this as a safety net.
      this.mediaInfo = info;
      if (this.state === "loading" || this.state === "idle") {
        this.setState("ready");
      }
      return info;
    });
  }

  /**
   * Start playback
   */
  play(): void {
    if (this.state === "ready" || this.state === "paused") {
      this.setState("playing");
      this.scheduler.play();
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.state === "playing") {
      this.setState("paused");
      this.scheduler.pause();
    }
  }

  /**
   * Toggle play/pause
   */
  togglePlayback(): void {
    if (this.state === "playing") {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Seek to a specific time in milliseconds
   */
  seek(timeMs: number): void {
    const wasPlaying = this.state === "playing";
    if (wasPlaying) {
      this.scheduler.pause();
    }

    this.setState("seeking");
    this.scheduler.seekMs(timeMs);

    // The async decoder seek will resolve later; we keep UI responsive by transitioning
    // to paused/playing immediately, but decoder errors will flip to error state.
    if (wasPlaying) {
      this.scheduler.play();
      this.setState("playing");
    } else {
      this.setState("paused");
    }
  }

  /**
   * Skip forward by amount in milliseconds
   */
  skipForward(amountMs = 5000): void {
    const currentMs = this.scheduler.getCurrentTimeMs();
    this.seek(currentMs + amountMs);
  }

  /**
   * Skip backward by amount in milliseconds
   */
  skipBackward(amountMs = 5000): void {
    const currentMs = this.scheduler.getCurrentTimeMs();
    this.seek(Math.max(0, currentMs - amountMs));
  }

  /**
   * Go to the start
   */
  goToStart(): void {
    this.seek(0);
  }

  /**
   * Go to the end
   */
  goToEnd(): void {
    if (this.mediaInfo) {
      this.seek(this.mediaInfo.durationMs);
    }
  }

  /**
   * Set playback rate
   */
  setPlaybackRate(rate: number): void {
    this.scheduler.setPlaybackRate(rate);
  }

  /**
   * Set loop mode
   */
  setLoop(loop: boolean): void {
    this.scheduler.setLoop(loop);
    this.config.loop = loop;
  }

  /**
   * Add a compositing layer
   */
  addLayer(layer: Layer): void {
    this.compositor?.addLayer(layer);
  }

  /**
   * Remove a compositing layer
   */
  removeLayer(id: string): void {
    this.compositor?.removeLayer(id);
  }

  /**
   * Get current state
   */
  getState(): PlaybackState {
    return this.state;
  }

  /**
   * Get current time in milliseconds
   */
  getCurrentTimeMs(): number {
    return this.scheduler.getCurrentTimeMs();
  }

  /**
   * Get duration in milliseconds
   */
  getDurationMs(): number {
    return this.mediaInfo?.durationMs ?? 0;
  }

  /**
   * Get media info
   */
  getMediaInfo(): MediaInfo | null {
    return this.mediaInfo;
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.state === "playing";
  }

  /**
   * Debug stats (dev only)
   */
  getDebugStats(): { bufferedFrames: number } {
    return { bufferedFrames: this.decoder.getBufferedFrameCount() };
  }

  /**
   * Export current frame as image
   */
  exportFrame(format: "png" | "jpeg" = "png", quality = 0.92): string | null {
    return this.compositor?.exportFrame(format, quality) ?? null;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.scheduler.dispose();
    this.decoder.dispose();
    this.compositor?.dispose();
    this.removeAllListeners();
    this.mediaInfo = null;
    this.lastRenderedFrame = null;
    this.state = "idle";
  }
}
