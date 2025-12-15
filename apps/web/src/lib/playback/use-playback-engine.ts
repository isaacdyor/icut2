/**
 * React hook for PlaybackEngine
 * Provides reactive state and lifecycle management
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PlaybackEngine } from "./playback-engine";
import type { MediaInfo, PlaybackEngineConfig, PlaybackState } from "./types";

export type UsePlaybackEngineReturn = {
  /** Current playback state */
  state: PlaybackState;
  /** Current time in milliseconds */
  currentTimeMs: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether currently playing */
  isPlaying: boolean;
  /** Media info (available after loading) */
  mediaInfo: MediaInfo | null;
  /** Error if any */
  error: Error | null;

  /** Attach canvas element for rendering */
  attachCanvas: (canvas: HTMLCanvasElement | null) => void;
  /** Load a video from URL */
  load: (url: string) => Promise<void>;
  /** Start playback */
  play: () => void;
  /** Pause playback */
  pause: () => void;
  /** Toggle play/pause */
  togglePlayback: () => void;
  /** Seek to time in milliseconds */
  seek: (timeMs: number) => void;
  /** Skip forward */
  skipForward: (amountMs?: number) => void;
  /** Skip backward */
  skipBackward: (amountMs?: number) => void;
  /** Go to start */
  goToStart: () => void;
  /** Go to end */
  goToEnd: () => void;
  /** Set playback rate */
  setPlaybackRate: (rate: number) => void;
  /** Set loop mode */
  setLoop: (loop: boolean) => void;
  /** Resize canvas */
  resizeCanvas: (width: number, height: number) => void;
  /** Export current frame */
  exportFrame: (format?: "png" | "jpeg", quality?: number) => string | null;

  /** Debug stats (dev only) */
  debugStats: { bufferedFrames: number } | null;
};

export function usePlaybackEngine(
  config: Partial<PlaybackEngineConfig> = {}
): UsePlaybackEngineReturn {
  const engineRef = useRef<PlaybackEngine | null>(null);
  // Capture the initial config once. Passing `{}` inline would otherwise recreate the engine each render.
  const initialConfigRef = useRef(config);
  const pendingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [state, setState] = useState<PlaybackState>("idle");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [debugStats, setDebugStats] = useState<{
    bufferedFrames: number;
  } | null>(null);

  // Initialize engine
  useEffect(() => {
    const engine = new PlaybackEngine(initialConfigRef.current);
    engineRef.current = engine;

    // Apply any canvas/size captured before the engine existed.
    if (pendingCanvasRef.current) {
      engine.attachCanvas(pendingCanvasRef.current);
    }
    if (pendingSizeRef.current) {
      engine.resizeCanvas(
        pendingSizeRef.current.width,
        pendingSizeRef.current.height
      );
    }

    // Subscribe to events
    const unsubState = engine.on("stateChange", setState);
    const unsubTime = engine.on("timeUpdate", setCurrentTimeMs);
    const unsubDuration = engine.on("durationChange", setDurationMs);
    const unsubError = engine.on("error", setError);

    return () => {
      unsubState();
      unsubTime();
      unsubDuration();
      unsubError();
      engine.dispose();
      engineRef.current = null;
    };
  }, []); // Run once on mount

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    let rafId = 0;
    const tick = () => {
      const stats = engineRef.current?.getDebugStats() ?? null;
      setDebugStats(stats);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    pendingCanvasRef.current = canvas;
    if (canvas) {
      engineRef.current?.attachCanvas(canvas);
      if (pendingSizeRef.current) {
        engineRef.current?.resizeCanvas(
          pendingSizeRef.current.width,
          pendingSizeRef.current.height
        );
      }
    }
  }, []);

  const load = useCallback(async (url: string) => {
    if (!engineRef.current) {
      return;
    }
    setError(null);
    try {
      const info = await engineRef.current.load(url);
      setMediaInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const play = useCallback(() => {
    engineRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const togglePlayback = useCallback(() => {
    engineRef.current?.togglePlayback();
  }, []);

  const seek = useCallback((timeMs: number) => {
    engineRef.current?.seek(timeMs);
  }, []);

  const skipForward = useCallback((amountMs = 5000) => {
    engineRef.current?.skipForward(amountMs);
  }, []);

  const skipBackward = useCallback((amountMs = 5000) => {
    engineRef.current?.skipBackward(amountMs);
  }, []);

  const goToStart = useCallback(() => {
    engineRef.current?.goToStart();
  }, []);

  const goToEnd = useCallback(() => {
    engineRef.current?.goToEnd();
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    engineRef.current?.setPlaybackRate(rate);
  }, []);

  const setLoop = useCallback((loop: boolean) => {
    engineRef.current?.setLoop(loop);
  }, []);

  const resizeCanvas = useCallback((width: number, height: number) => {
    pendingSizeRef.current = { width, height };
    engineRef.current?.resizeCanvas(width, height);
  }, []);

  const exportFrame = useCallback(
    (format: "png" | "jpeg" = "png", quality = 0.92) =>
      engineRef.current?.exportFrame(format, quality) ?? null,
    []
  );

  return {
    state,
    currentTimeMs,
    durationMs,
    isPlaying: state === "playing",
    mediaInfo,
    error,

    attachCanvas,
    load,
    play,
    pause,
    togglePlayback,
    seek,
    skipForward,
    skipBackward,
    goToStart,
    goToEnd,
    setPlaybackRate,
    setLoop,
    resizeCanvas,
    exportFrame,
    debugStats,
  };
}
