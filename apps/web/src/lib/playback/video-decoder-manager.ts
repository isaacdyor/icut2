/**
 * VideoDecoderManager
 * Manages WebCodecs VideoDecoder with frame buffering and seeking
 */

import {
  type DemuxedSample,
  type DemuxerCallbacks,
  MP4Demuxer,
} from "./demuxer";
import { EventEmitter } from "./event-emitter";
import type { DecodedFrame, MediaInfo, PlaybackState } from "./types";

type VideoDecoderManagerEvents = {
  stateChange: (state: PlaybackState) => void;
  frameDecoded: (frame: DecodedFrame) => void;
  infoReady: (info: MediaInfo) => void;
  error: (error: Error) => void;
};

export class VideoDecoderManager extends EventEmitter<VideoDecoderManagerEvents> {
  private decoder: VideoDecoder | null = null;
  private demuxer: MP4Demuxer | null = null;
  private mediaInfo: MediaInfo | null = null;
  private state: PlaybackState = "idle";
  private pendingSamples: DemuxedSample[] = [];
  private decodedFrames: DecodedFrame[] = [];
  private readonly maxBufferedFrames: number;
  private isDecoding = false;
  private abortController: AbortController | null = null;
  private loadPromiseReject: ((error: Error) => void) | null = null;
  private sourceBuffer: ArrayBuffer | null = null;
  private hasFullSourceBuffered = false;
  private demuxerCallbacks: DemuxerCallbacks | null = null;
  private decodedFrameCounter = 0;

  constructor(maxBufferedFrames = 30) {
    super();
    this.maxBufferedFrames = maxBufferedFrames;
  }

  private setState(newState: PlaybackState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit("stateChange", newState);
    }
  }

  /**
   * Load a video from URL
   */
  load(url: string): Promise<MediaInfo> {
    // Important: do not remove external listeners when reloading.
    this.reset();
    this.setState("loading");
    this.abortController = new AbortController();

    return new Promise((resolve, reject) => {
      this.loadPromiseReject = reject;
      this.demuxerCallbacks = {
        onVideoConfig: (config) => {
          // On seeks we may recreate the demuxer; don't recreate/reconfigure the decoder
          // if it's already configured.
          if (this.decoder?.state === "configured") {
            return;
          }
          this.initializeDecoder(config);
        },
        onAudioConfig: () => {
          // Audio decoder will be handled separately
        },
        onVideoSamples: (samples) => {
          this.pendingSamples.push(...samples);
          this.processQueue();
        },
        onAudioSamples: () => {
          // Audio samples will be handled separately
        },
        onInfo: (info) => {
          this.mediaInfo = info;
          this.setState("ready");
          this.emit("infoReady", info);
          this.loadPromiseReject = null;
          resolve(info);
        },
        onError: (error) => {
          this.failLoad(error);
        },
      };
      this.demuxer = new MP4Demuxer(this.demuxerCallbacks);

      this.fetchAndDemux(url).catch((error: Error) => {
        if (error.name !== "AbortError") {
          this.failLoad(error);
        }
      });
    });
  }

  private async fetchAndDemux(url: string): Promise<void> {
    const startedAt = performance.now();
    const timeoutMs = 15_000;
    const timeoutId = window.setTimeout(() => {
      this.abortController?.abort();
    }, timeoutMs);

    const response = await fetch(url, {
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      window.clearTimeout(timeoutId);
      throw new Error(`Failed to fetch video: ${response.status}`);
    }

    // For now, buffer the full file then demux.
    // This avoids subtle stream/chunking/cache issues that can cause mp4box to never reach onReady.
    // Once stable, we can reintroduce progressive demux + range requests for large assets.
    const buffer = await response.arrayBuffer();
    window.clearTimeout(timeoutId);
    this.sourceBuffer = buffer;
    this.hasFullSourceBuffered = true;
    // eslint-disable-next-line no-console
    console.debug(
      `[playback] fetched ${buffer.byteLength} bytes in ${Math.round(performance.now() - startedAt)}ms`
    );
    this.demuxer?.appendData(buffer, 0);
    this.demuxer?.flush();
  }

  private initializeDecoder(config: VideoDecoderConfig): void {
    try {
      this.decoder = new VideoDecoder({
        output: (frame) => {
          this.handleDecodedFrame(frame);
        },
        error: (error) => {
          this.failLoad(new Error(`Decoder error: ${error.message}`));
        },
      });

      this.decoder.configure(config);
      // If samples arrived before configure, kick decoding now.
      this.processQueue();
    } catch (err) {
      this.failLoad(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleDecodedFrame(frame: VideoFrame): void {
    const decodedFrame: DecodedFrame = {
      frame,
      timestampUs: frame.timestamp,
      durationUs: frame.duration ?? 0,
    };

    this.decodedFrameCounter += 1;
    if (this.decodedFrameCounter === 1) {
      // eslint-disable-next-line no-console
      console.debug(
        `[playback] first frame decoded (ts=${Math.round(frame.timestamp)}us, ${frame.displayWidth}x${frame.displayHeight})`
      );
    }

    this.decodedFrames.push(decodedFrame);
    this.emit("frameDecoded", decodedFrame);

    // Continue processing queue if we have room
    if (this.decodedFrames.length < this.maxBufferedFrames) {
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.isDecoding || !this.decoder || this.pendingSamples.length === 0) {
      return;
    }

    // Don't buffer too far ahead
    if (this.decodedFrames.length >= this.maxBufferedFrames) {
      return;
    }

    this.isDecoding = true;

    while (
      this.pendingSamples.length > 0 &&
      this.decodedFrames.length < this.maxBufferedFrames
    ) {
      const sample = this.pendingSamples.shift();
      if (!sample) {
        break;
      }

      const chunk = new EncodedVideoChunk({
        type: sample.isKeyframe ? "key" : "delta",
        timestamp: sample.timestampUs,
        duration: sample.durationUs,
        data: sample.data,
      });

      try {
        this.decoder.decode(chunk);
      } catch (err) {
        this.failLoad(err instanceof Error ? err : new Error(String(err)));
        break;
      }
    }

    this.isDecoding = false;
  }

  /**
   * Get the next frame for the given timestamp
   * Returns null if no frame is available
   */
  getFrameAtTime(timeUs: number): DecodedFrame | null {
    // Find the frame closest to the requested time
    let bestFrame: DecodedFrame | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (const frame of this.decodedFrames) {
      const diff = Math.abs(frame.timestampUs - timeUs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestFrame = frame;
      }
    }

    return bestFrame;
  }

  /**
   * Consume and remove frames up to the given timestamp
   * Returns the frames that were consumed
   */
  consumeFramesUpTo(timeUs: number): DecodedFrame[] {
    const consumed: DecodedFrame[] = [];

    while (this.decodedFrames.length > 0) {
      const frame = this.decodedFrames[0];
      if (frame.timestampUs + frame.durationUs <= timeUs) {
        const shiftedFrame = this.decodedFrames.shift();
        if (shiftedFrame) {
          consumed.push(shiftedFrame);
        }
      } else {
        break;
      }
    }

    // Process more samples if we have room now
    this.processQueue();

    return consumed;
  }

  /**
   * Release frames that are no longer needed
   */
  releaseFrame(frame: DecodedFrame): void {
    frame.frame.close();
  }

  /**
   * Seek to a specific time in milliseconds
   */
  async seek(timeMs: number): Promise<void> {
    this.setState("seeking");

    // Clear current buffers
    this.clearBuffers();

    // Reset decoder
    if (this.decoder?.state === "configured") {
      await this.decoder.flush();
    }

    // If we're seeking to the start, the simplest/most robust behavior is to
    // rebuild mp4box state and re-append the full source buffer once.
    if (timeMs <= 0 && this.sourceBuffer && this.demuxerCallbacks) {
      this.demuxer?.dispose();
      this.demuxer = new MP4Demuxer(this.demuxerCallbacks);
      this.demuxer.appendData(this.sourceBuffer, 0);
      this.demuxer.flush();
      this.hasFullSourceBuffered = true;
      this.setState("ready");
      return;
    }

    // Seek in demuxer. mp4box returns a byte offset that needs data re-appended from there.
    const offset = this.demuxer?.seek(timeMs) ?? 0;
    // If mp4box requests offset=0 and we already buffered the entire file once,
    // do NOT re-append; re-appending the full file at 0 can corrupt mp4box’s internal state.
    if (offset !== 0) {
      if (
        this.sourceBuffer &&
        offset >= 0 &&
        offset < this.sourceBuffer.byteLength
      ) {
        const slice = this.sourceBuffer.slice(offset);
        this.demuxer?.appendData(slice, offset);
        this.demuxer?.flush();
      }
    } else if (!this.hasFullSourceBuffered && this.sourceBuffer) {
      // Extremely defensive: if we somehow didn't append yet, append once.
      this.demuxer?.appendData(this.sourceBuffer, 0);
      this.demuxer?.flush();
      this.hasFullSourceBuffered = true;
    }

    this.setState("ready");
  }

  private failLoad(error: Error): void {
    this.setState("error");
    this.emit("error", error);
    this.abortController?.abort();
    this.loadPromiseReject?.(error);
    this.loadPromiseReject = null;
  }

  private clearBuffers(): void {
    // Close all buffered frames
    for (const frame of this.decodedFrames) {
      frame.frame.close();
    }
    this.decodedFrames = [];
    this.pendingSamples = [];
  }

  /**
   * Get current media info
   */
  getMediaInfo(): MediaInfo | null {
    return this.mediaInfo;
  }

  /**
   * Get current state
   */
  getState(): PlaybackState {
    return this.state;
  }

  /**
   * Get number of buffered frames
   */
  getBufferedFrameCount(): number {
    return this.decodedFrames.length;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.reset();
    this.removeAllListeners();
  }

  /**
   * Reset internal state without removing external listeners.
   * This is used when reloading a new URL in the same PlaybackEngine instance.
   */
  private reset(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.loadPromiseReject = null;
    this.sourceBuffer = null;
    this.hasFullSourceBuffered = false;
    this.demuxerCallbacks = null;

    this.clearBuffers();

    if (this.decoder?.state !== "closed") {
      this.decoder?.close();
    }
    this.decoder = null;

    this.demuxer?.dispose();
    this.demuxer = null;

    this.mediaInfo = null;
    this.setState("idle");
  }
}
