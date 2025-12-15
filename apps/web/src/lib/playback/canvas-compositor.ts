/**
 * CanvasCompositor
 * Renders video frames and overlays to a canvas element
 * Supports layered compositing for text, subtitles, effects, etc.
 */

export type Layer = {
  id: string;
  zIndex: number;
  visible: boolean;
  render: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => void;
};

export type CompositorConfig = {
  /** Background color when no video frame is available */
  backgroundColor: string;
  /** Whether to maintain aspect ratio */
  maintainAspectRatio: boolean;
  /** Scaling mode */
  scalingMode: "contain" | "cover" | "fill";
};

const DEFAULT_CONFIG: CompositorConfig = {
  backgroundColor: "#000000",
  maintainAspectRatio: true,
  scalingMode: "contain",
};

export class CanvasCompositor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly config: CompositorConfig;
  private readonly layers: Map<string, Layer> = new Map();
  private currentFrame: VideoFrame | null = null;
  private frameToken = 0;
  private firstSuccessfulDrawLogged = false;
  private videoWidth = 0;
  private videoHeight = 0;

  constructor(
    canvas: HTMLCanvasElement,
    config: Partial<CompositorConfig> = {}
  ) {
    this.canvas = canvas;
    this.config = { ...DEFAULT_CONFIG, ...config };

    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true, // Reduces latency
    });

    if (!ctx) {
      throw new Error("Failed to get 2D canvas context");
    }

    this.ctx = ctx;
  }

  /**
   * Set the video dimensions (from the source video)
   */
  setVideoDimensions(width: number, height: number): void {
    this.videoWidth = width;
    this.videoHeight = height;
  }

  /**
   * Resize the canvas to match container
   */
  resize(width: number, height: number): void {
    // Use device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    // Reset transform before applying DPR scale (avoid cumulative scaling).
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Re-render after resize
    this.render();
  }

  /**
   * Add a compositing layer
   */
  addLayer(layer: Layer): void {
    this.layers.set(layer.id, layer);
  }

  /**
   * Remove a compositing layer
   */
  removeLayer(id: string): void {
    this.layers.delete(id);
  }

  /**
   * Update a layer's visibility
   */
  setLayerVisibility(id: string, visible: boolean): void {
    const layer = this.layers.get(id);
    if (layer) {
      layer.visible = visible;
    }
  }

  /**
   * Draw a video frame
   */
  drawFrame(frame: VideoFrame): void {
    // The decoder/buffer manager may close frames after they're displayed.
    // Clone here so the compositor owns a stable frame to render (and can safely
    // re-render on resize without hitting a closed VideoFrame).
    const cloned = frame.clone();
    if (this.currentFrame) {
      this.currentFrame.close();
    }
    this.currentFrame = cloned;
    this.frameToken += 1;
    this.render();
  }

  /**
   * Render current state to canvas
   */
  render(): void {
    const { width, height } = this.getDisplaySize();

    // Clear canvas
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);

    // Dev-only sanity border: if you can see this, the canvas is painting.
    if (import.meta.env.DEV) {
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(0, 255, 0, 0.6)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        1,
        1,
        Math.max(0, width - 2),
        Math.max(0, height - 2)
      );
      this.ctx.restore();
    }

    // Draw video frame if available
    if (this.currentFrame) {
      this.renderVideoFrame(width, height);
    }

    // Render layers in order
    this.renderLayers(width, height);
  }

  private getDisplaySize(): { width: number; height: number } {
    const dpr = window.devicePixelRatio || 1;
    return {
      width: this.canvas.width / dpr,
      height: this.canvas.height / dpr,
    };
  }

  private renderVideoFrame(canvasWidth: number, canvasHeight: number): void {
    if (!this.currentFrame) {
      return;
    }

    const frameWidth = this.videoWidth || this.currentFrame.displayWidth;
    const frameHeight = this.videoHeight || this.currentFrame.displayHeight;

    const { x, y, width, height } = this.calculateDrawRect(
      frameWidth,
      frameHeight,
      canvasWidth,
      canvasHeight
    );

    const token = this.frameToken;
    const cloned = this.currentFrame.clone();
    createImageBitmap(cloned)
      .then((bitmap) => {
        cloned.close();
        // Only draw if this is still the latest frame we attempted to render.
        if (token !== this.frameToken) {
          bitmap.close();
          return;
        }
        if (!this.firstSuccessfulDrawLogged) {
          this.firstSuccessfulDrawLogged = true;
          // eslint-disable-next-line no-console
          console.debug(
            `[playback] drew frame bitmap=${bitmap.width}x${bitmap.height} canvas=${canvasWidth}x${canvasHeight} rect=${Math.round(x)},${Math.round(y)},${Math.round(width)}x${Math.round(height)}`
          );
        }
        this.ctx.drawImage(bitmap, x, y, width, height);
        bitmap.close();
      })
      .catch((error) => {
        cloned.close();
        // eslint-disable-next-line no-console
        console.error("[playback] createImageBitmap(VideoFrame) failed", error);
      });
  }

  private calculateDrawRect(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number
  ): { x: number; y: number; width: number; height: number } {
    if (
      !this.config.maintainAspectRatio ||
      this.config.scalingMode === "fill"
    ) {
      return { x: 0, y: 0, width: targetWidth, height: targetHeight };
    }

    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = targetWidth / targetHeight;

    let width: number;
    let height: number;

    if (this.config.scalingMode === "contain") {
      // Fit entire video within canvas
      if (sourceAspect > targetAspect) {
        width = targetWidth;
        height = targetWidth / sourceAspect;
      } else {
        height = targetHeight;
        width = targetHeight * sourceAspect;
      }
    } else if (sourceAspect > targetAspect) {
      // Cover - fill canvas, potentially cropping video
      height = targetHeight;
      width = targetHeight * sourceAspect;
    } else {
      // Cover - fill canvas, potentially cropping video
      width = targetWidth;
      height = targetWidth / sourceAspect;
    }

    // Center the video
    const x = (targetWidth - width) / 2;
    const y = (targetHeight - height) / 2;

    return { x, y, width, height };
  }

  private renderLayers(width: number, height: number): void {
    // Sort layers by z-index
    const sortedLayers = Array.from(this.layers.values())
      .filter((layer) => layer.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      this.ctx.save();
      layer.render(this.ctx, width, height);
      this.ctx.restore();
    }
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    const { width, height } = this.getDisplaySize();
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);

    if (this.currentFrame) {
      this.currentFrame.close();
      this.currentFrame = null;
    }
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get the 2D context
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Export current frame as image
   */
  exportFrame(format: "png" | "jpeg" = "png", quality = 0.92): string {
    return this.canvas.toDataURL(`image/${format}`, quality);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.currentFrame) {
      this.currentFrame.close();
      this.currentFrame = null;
    }
    this.layers.clear();
  }
}

/**
 * Helper to create a text overlay layer
 */
export function createTextLayer(
  id: string,
  getText: () => string,
  options: {
    x?: number;
    y?: number;
    font?: string;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    zIndex?: number;
  } = {}
): Layer {
  return {
    id,
    zIndex: options.zIndex ?? 100,
    visible: true,
    render: (ctx, _width, _height) => {
      const text = getText();
      if (!text) {
        return;
      }

      ctx.font = options.font ?? "16px sans-serif";
      ctx.fillStyle = options.color ?? "white";
      ctx.textAlign = options.align ?? "left";
      ctx.textBaseline = options.baseline ?? "top";

      const x = options.x ?? 10;
      const y = options.y ?? 10;

      // Add text shadow for readability
      ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      ctx.fillText(text, x, y);
    },
  };
}
