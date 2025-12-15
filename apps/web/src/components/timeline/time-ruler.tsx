import { formatTime, msToPx, TRACK_LABEL_WIDTH } from "./constants";

type TimeRulerProps = {
  durationMs: number;
  timelineWidth: number;
};

export function TimeRuler({ durationMs, timelineWidth }: TimeRulerProps) {
  // Generate tick marks every second
  const ticks: number[] = [];
  const tickIntervalMs = 1000;
  for (let ms = 0; ms <= durationMs; ms += tickIntervalMs) {
    ticks.push(ms);
  }

  return (
    <div
      className="relative flex h-6 border-b bg-muted/30"
      style={{ marginLeft: `${TRACK_LABEL_WIDTH}px` }}
    >
      <div
        className="relative h-full"
        style={{ width: `${timelineWidth}px`, minWidth: "100%" }}
      >
        {ticks.map((ms) => {
          const leftPx = msToPx(ms);
          const isMajor = ms % 5000 === 0;

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
