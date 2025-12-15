/**
 * FrameScheduler
 * Manages playback timing with requestAnimationFrame
 * Provides precise frame timing for smooth video playback
 */

import { EventEmitter } from "./event-emitter";

type FrameSchedulerEvents = {
  tick: (currentTimeUs: number, deltaMs: number) => void;
  play: () => void;
  pause: () => void;
  seek: (timeUs: number) => void;
};

export class FrameScheduler extends EventEmitter<FrameSchedulerEvents> {
  private isPlaying = false;
  private currentTimeUs = 0;
  private durationUs = 0;
  private playbackRate = 1.0;
  private loop = false;

  private rafId: number | null = null;
  private lastFrameTime: number | null = null;

  /**
   * Set the duration of the media in microseconds
   */
  setDuration(durationUs: number): void {
    this.durationUs = durationUs;
  }

  /**
   * Set the playback rate (1.0 = normal speed)
   */
  setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.1, Math.min(4.0, rate));
  }

  /**
   * Set whether playback should loop
   */
  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  /**
   * Start playback
   */
  play(): void {
    if (this.isPlaying) {
      return;
    }

    this.isPlaying = true;
    this.lastFrameTime = null;
    this.emit("play");
    this.scheduleFrame();
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.isPlaying) {
      return;
    }

    this.isPlaying = false;
    this.cancelFrame();
    this.emit("pause");
  }

  /**
   * Toggle play/pause
   */
  togglePlayback(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Seek to a specific time in microseconds
   */
  seek(timeUs: number): void {
    const clampedTime = Math.max(0, Math.min(timeUs, this.durationUs));
    this.currentTimeUs = clampedTime;
    this.emit("seek", clampedTime);

    // If playing, continue from new position
    if (this.isPlaying) {
      this.lastFrameTime = null;
    }
  }

  /**
   * Seek to a specific time in milliseconds
   */
  seekMs(timeMs: number): void {
    this.seek(timeMs * 1000);
  }

  /**
   * Get current time in microseconds
   */
  getCurrentTimeUs(): number {
    return this.currentTimeUs;
  }

  /**
   * Get current time in milliseconds
   */
  getCurrentTimeMs(): number {
    return this.currentTimeUs / 1000;
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Skip forward by the specified amount in milliseconds
   */
  skipForward(amountMs: number): void {
    this.seek(this.currentTimeUs + amountMs * 1000);
  }

  /**
   * Skip backward by the specified amount in milliseconds
   */
  skipBackward(amountMs: number): void {
    this.seek(this.currentTimeUs - amountMs * 1000);
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
    this.seek(this.durationUs);
  }

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame((timestamp) => {
      this.onFrame(timestamp);
    });
  }

  private cancelFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private onFrame(timestamp: number): void {
    if (!this.isPlaying) {
      return;
    }

    // Calculate delta time
    const deltaMs =
      this.lastFrameTime !== null ? timestamp - this.lastFrameTime : 0;
    this.lastFrameTime = timestamp;

    // Advance current time based on playback rate
    const advanceUs = deltaMs * 1000 * this.playbackRate;
    this.currentTimeUs += advanceUs;

    // Handle end of media
    if (this.currentTimeUs >= this.durationUs) {
      if (this.loop) {
        this.currentTimeUs %= this.durationUs;
      } else {
        this.currentTimeUs = this.durationUs;
        this.pause();
        return;
      }
    }

    // Emit tick event
    this.emit("tick", this.currentTimeUs, deltaMs);

    // Schedule next frame
    this.scheduleFrame();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.pause();
    this.removeAllListeners();
    this.currentTimeUs = 0;
    this.durationUs = 0;
  }
}
