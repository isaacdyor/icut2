/**
 * MP4 Demuxer using mp4box.js v2
 * Extracts video/audio samples from MP4 containers for WebCodecs
 */

import {
  createFile,
  type ISOFile,
  type Movie,
  type Sample,
  type Track,
} from "mp4box";
import type { AudioTrackInfo, MediaInfo, VideoTrackInfo } from "./types";

export type DemuxedSample = {
  data: Uint8Array;
  timestampUs: number;
  durationUs: number;
  isKeyframe: boolean;
};

export type DemuxerCallbacks = {
  onVideoConfig: (config: VideoDecoderConfig) => void;
  onAudioConfig: (config: AudioDecoderConfig) => void;
  onVideoSamples: (samples: DemuxedSample[]) => void;
  onAudioSamples: (samples: DemuxedSample[]) => void;
  onInfo: (info: MediaInfo) => void;
  onError: (error: Error) => void;
};

// mp4box buffer type with fileStart property
type MP4ArrayBuffer = ArrayBuffer & { fileStart: number };

export class MP4Demuxer {
  private readonly mp4File: ISOFile;
  private readonly callbacks: DemuxerCallbacks;
  private videoTrackId: number | null = null;
  private audioTrackId: number | null = null;
  private fileOffset = 0;

  constructor(callbacks: DemuxerCallbacks) {
    this.callbacks = callbacks;
    this.mp4File = createFile();
    this.setupMP4Box();
  }

  private setupMP4Box(): void {
    this.mp4File.onReady = (info: Movie) => {
      // eslint-disable-next-line no-console
      console.debug(
        `[playback] mp4box ready (duration=${(info.duration / info.timescale).toFixed(3)}s, tracks v=${info.videoTracks.length} a=${info.audioTracks.length})`
      );
      try {
        this.handleReady(info);
      } catch (error) {
        // This commonly catches RangeError: "offset is out of bounds" from either
        // mp4box internals or codec description serialization.
        // eslint-disable-next-line no-console
        console.error("[playback] demuxer handleReady failed", error);
        this.callbacks.onError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    };

    this.mp4File.onError = (module: string, message: string) => {
      this.callbacks.onError(new Error(`MP4Box error [${module}]: ${message}`));
    };

    this.mp4File.onSamples = (
      trackId: number,
      _ref: unknown,
      samples: Sample[]
    ) => {
      this.handleSamples(trackId, samples);
    };
  }

  private handleReady(info: Movie): void {
    const mediaInfo: MediaInfo = {
      durationMs: (info.duration / info.timescale) * 1000,
      video: null,
      audio: null,
    };

    // Find and configure video track
    if (info.videoTracks.length > 0) {
      const track = info.videoTracks[0];
      this.videoTrackId = track.id;
      mediaInfo.video = this.extractVideoTrackInfo(track, info.timescale);

      const videoConfig = this.createVideoDecoderConfig(track);
      this.callbacks.onVideoConfig(videoConfig);

      this.mp4File.setExtractionOptions(track.id, null, {
        nbSamples: 100,
      });
    }

    // Find and configure audio track
    if (info.audioTracks.length > 0) {
      const track = info.audioTracks[0];
      this.audioTrackId = track.id;
      mediaInfo.audio = this.extractAudioTrackInfo(track, info.timescale);

      const audioConfig = this.createAudioDecoderConfig(track);
      this.callbacks.onAudioConfig(audioConfig);

      this.mp4File.setExtractionOptions(track.id, null, {
        nbSamples: 100,
      });
    }

    this.callbacks.onInfo(mediaInfo);
    this.mp4File.start();
  }

  private extractVideoTrackInfo(
    track: Track,
    timescale: number
  ): VideoTrackInfo {
    return {
      codec: track.codec,
      codedWidth: track.video?.width ?? 0,
      codedHeight: track.video?.height ?? 0,
      displayWidth: track.video?.width ?? 0,
      displayHeight: track.video?.height ?? 0,
      durationMs: (track.duration / timescale) * 1000,
      frameRate: track.nb_samples / (track.duration / timescale),
      bitrate: track.bitrate,
    };
  }

  private extractAudioTrackInfo(
    track: Track,
    timescale: number
  ): AudioTrackInfo {
    return {
      codec: track.codec,
      sampleRate: track.audio?.sample_rate ?? 0,
      numberOfChannels: track.audio?.channel_count ?? 0,
      durationMs: (track.duration / timescale) * 1000,
      bitrate: track.bitrate,
    };
  }

  private createVideoDecoderConfig(track: Track): VideoDecoderConfig {
    // Get codec description (avcC, hvcC, etc.)
    const trak = this.mp4File.getTrackById(track.id);
    let codecDescription: Uint8Array | undefined;
    try {
      codecDescription = this.getCodecDescription(trak);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[playback] getCodecDescription failed", error);
      codecDescription = undefined;
    }

    // For H.264 in MP4, WebCodecs requires `description` to decode AVC-formatted samples.
    if (track.codec.startsWith("avc1") && !codecDescription) {
      throw new Error(
        "Missing H.264 (avcC) codec description for VideoDecoderConfig"
      );
    }

    return {
      codec: track.codec,
      codedWidth: track.video?.width ?? 0,
      codedHeight: track.video?.height ?? 0,
      description: codecDescription,
    };
  }

  private createAudioDecoderConfig(track: Track): AudioDecoderConfig {
    const trak = this.mp4File.getTrackById(track.id);
    const codecDescription = this.getCodecDescription(trak);

    return {
      codec: track.codec,
      sampleRate: track.audio?.sample_rate ?? 0,
      numberOfChannels: track.audio?.channel_count ?? 0,
      description: codecDescription,
    };
  }

  private getCodecDescription(trak: unknown): Uint8Array | undefined {
    // Navigate the MP4 box structure to find codec-specific data
    // This handles avcC (H.264), hvcC (H.265), esds (AAC), etc.
    const stsd = (
      trak as {
        mdia?: { minf?: { stbl?: { stsd?: { entries?: unknown[] } } } };
      }
    )?.mdia?.minf?.stbl?.stsd;

    if (!stsd?.entries?.[0]) {
      return;
    }

    const entry = stsd.entries[0] as Record<string, unknown>;

    // Try different codec description box names
    const descriptionBoxNames = ["avcC", "hvcC", "vpcC", "av1C", "esds"];

    for (const boxName of descriptionBoxNames) {
      const box = entry[boxName];
      if (box) {
        // mp4box.js represents avcC/hvcC/etc as parsed objects (often without a raw `data` field).
        // WebCodecs expects the *configuration record* bytes for `description` (e.g. AVCDecoderConfigurationRecord).
        if (boxName === "avcC") {
          const desc = serializeAvcC(box as AvcCBox);
          if (desc) {
            return desc;
          }
        }

        const data = (box as { data?: Uint8Array }).data;
        if (data instanceof Uint8Array) {
          return data;
        }
      }
    }

    return;
  }

  private handleSamples(trackId: number, samples: Sample[]): void {
    const demuxedSamples: DemuxedSample[] = [];

    for (const sample of samples) {
      if (sample.data) {
        demuxedSamples.push({
          data: new Uint8Array(sample.data),
          timestampUs: (sample.cts * 1_000_000) / sample.timescale,
          durationUs: (sample.duration * 1_000_000) / sample.timescale,
          isKeyframe: sample.is_sync,
        });
      }
    }

    if (trackId === this.videoTrackId) {
      this.callbacks.onVideoSamples(demuxedSamples);
    } else if (trackId === this.audioTrackId) {
      this.callbacks.onAudioSamples(demuxedSamples);
    }
  }

  /**
   * Append data chunk to the demuxer
   */
  appendData(data: ArrayBuffer, fileStart?: number): void {
    const buffer = data as MP4ArrayBuffer;
    const start = fileStart ?? this.fileOffset;
    buffer.fileStart = start;
    this.fileOffset = start + data.byteLength;
    this.mp4File.appendBuffer(buffer);
  }

  /**
   * Signal that all data has been appended
   */
  flush(): void {
    this.mp4File.flush();
  }

  /**
   * Seek to a specific time
   */
  seek(timeMs: number): number {
    const timeSec = timeMs / 1000;
    const result = this.mp4File.seek(timeSec, true);

    // mp4box returns a byte offset from which data should be (re)appended.
    // When seeking we reset our notion of file offset accordingly.
    this.fileOffset = result.offset;
    this.mp4File.start();
    return result.offset;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.mp4File.stop();
    this.videoTrackId = null;
    this.audioTrackId = null;
  }
}

type AvcCBox = {
  configurationVersion: number;
  AVCProfileIndication: number;
  profile_compatibility: number;
  AVCLevelIndication: number;
  lengthSizeMinusOne: number;
  SPS: unknown[];
  PPS: unknown[];
  ext?: unknown;
};

function serializeAvcC(avcC: AvcCBox): Uint8Array | undefined {
  if (
    !avcC ||
    typeof avcC !== "object" ||
    !Array.isArray(avcC.SPS) ||
    !Array.isArray(avcC.PPS)
  ) {
    return;
  }

  // AVCDecoderConfigurationRecord:
  // https://github.com/w3c/webcodecs/issues/848
  const parts: Uint8Array[] = [];
  const spsList = avcC.SPS.map(toUint8Array).filter(
    (v): v is Uint8Array => v instanceof Uint8Array && v.byteLength > 0
  );
  const ppsList = avcC.PPS.map(toUint8Array).filter(
    (v): v is Uint8Array => v instanceof Uint8Array && v.byteLength > 0
  );

  if (spsList.length === 0 || ppsList.length === 0) {
    return;
  }

  // Per ISO/IEC 14496-15:
  // 6-byte header, then SPS array, then 1-byte PPS count, then PPS array, then optional extensions.
  const header = new Uint8Array(6);
  header[0] = normalizeByte(avcC.configurationVersion);
  header[1] = normalizeByte(avcC.AVCProfileIndication);
  header[2] = normalizeByte(avcC.profile_compatibility);
  header[3] = normalizeByte(avcC.AVCLevelIndication);
  // reserved(6=111111) + lengthSizeMinusOne(2)
  header[4] = 252 + (avcC.lengthSizeMinusOne % 4);
  // reserved(3=111) + numOfSPS(5)
  header[5] = 224 + (spsList.length % 32);
  parts.push(header);

  // SPS
  for (const sps of spsList) {
    parts.push(u16be(sps.byteLength));
    parts.push(sps);
  }

  // PPS count (1 byte)
  parts.push(new Uint8Array([normalizeByte(ppsList.length)]));

  // PPS
  for (const pps of ppsList) {
    parts.push(u16be(pps.byteLength));
    parts.push(pps);
  }

  // mp4box exposes the "high profile" extension bytes as `ext` (already serialized).
  const ext = toUint8Array(avcC.ext);
  if (ext && ext.byteLength > 0) {
    parts.push(ext);
  }

  const out = concat(parts);
  return out.byteLength > 0 ? out : undefined;
}

function u16be(value: number): Uint8Array {
  const out = new Uint8Array(2);
  const normalized = Math.max(0, Math.floor(value));
  out[0] = normalizeByte(Math.floor(normalized / 256));
  out[1] = normalizeByte(normalized);
  return out;
}

function normalizeByte(value: number): number {
  const normalized = Math.max(0, Math.floor(value));
  return normalized % 256;
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  // mp4box SPS/PPS entries are often objects like { length, data: Uint8Array }
  if (typeof value === "object") {
    const maybeData = (value as { data?: unknown }).data;
    if (maybeData) {
      return toUint8Array(maybeData);
    }
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (Array.isArray(value)) {
    // number[]
    return new Uint8Array(value.map((n) => normalizeByte(Number(n))));
  }
  return null;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) {
    total += c.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
