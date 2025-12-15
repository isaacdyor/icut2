import { formatTime, msToPx, TRACK_LABEL_WIDTH } from "./constants";

type TimeRulerProps = {
  durationMs: number;
  zoom: number;
};

export function TimeRuler({ durationMs, zoom }: TimeRulerProps) {
  // Adjust tick interval based on zoom level
  const getTickInterval = () => {
    if (zoom >= 2) {
      return 500;
    }
    if (zoom >= 1) {
      return 1000;
    }
    if (zoom >= 0.5) {
      return 2000;
    }
    return 5000;
  };

  const tickIntervalMs = getTickInterval();
  const majorTickInterval = zoom >= 1 ? 5000 : 10_000;

  const ticks: number[] = [];
  for (let ms = 0; ms <= durationMs; ms += tickIntervalMs) {
    ticks.push(ms);
  }

  return (
    <div
      className="sticky top-0 z-10 flex h-6 border-b bg-muted/50 backdrop-blur-sm"
      style={{ paddingLeft: `${TRACK_LABEL_WIDTH}px` }}
    >
      <div className="relative h-full flex-1">
        {ticks.map((ms) => {
          const leftPx = msToPx(ms, zoom);
          const isMajor = ms % majorTickInterval === 0;

          return (
            <div
              className="absolute top-0 flex h-full flex-col items-center"
              key={ms}
              style={{ left: `${leftPx}px` }}
            >
              <div
                className={`w-px ${isMajor ? "h-full bg-border" : "h-2 bg-border/50"}`}
              />
              {isMajor ? (
                <span className="-translate-x-1/2 absolute bottom-0 font-mono text-[10px] text-muted-foreground">
                  {formatTime(ms)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
