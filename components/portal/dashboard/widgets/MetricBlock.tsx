/**
 * Stark-Warm KPI tile primitive.
 *
 * Renders a big display value, an optional delta chip and an optional mini
 * sparkline. The widget shell's header already carries the icon + label, so
 * the tile deliberately repeats neither — the duplication read as noise and
 * made every KPI card twice as tall as its data warranted.
 */
export default function MetricBlock({
  value,
  delta,
  deltaDirection,
  sparkBars,
  tone = 'default',
}: {
  value: string | number;
  /** e.g. "+12%" or "up 3" */
  delta?: string;
  /** Controls the status-tone color of the delta line */
  deltaDirection?: 'up' | 'down' | 'flat';
  /** Array of 0-1 heights for a mini sparkline (7-10 values typical) */
  sparkBars?: number[];
  /** Semantic tint for the value - warn/bad flag something that needs attention. */
  tone?: 'default' | 'ok' | 'warn' | 'bad';
}) {
  const deltaColors: Record<string, string> = {
    up:   'text-[var(--portal-ok)]',
    down: 'text-[var(--portal-bad)]',
    flat: 'text-muted-foreground',
  };
  const deltaIcons: Record<string, string> = {
    up: 'arrow_upward',
    down: 'arrow_downward',
    flat: 'remove',
  };
  const toneClass: Record<string, string> = {
    default: 'text-foreground',
    ok:   'text-[var(--portal-ok)]',
    warn: 'text-[var(--portal-warn)]',
    bad:  'text-[var(--portal-bad)]',
  };

  return (
    <div className="relative overflow-hidden py-0.5">
      <div className="flex items-baseline gap-2">
        {/* Big value - DM Sans display, matches the redesign KPI archetype */}
        <p className={`font-display tabular-nums tracking-[-0.02em] text-[26px] font-extrabold leading-none ${toneClass[tone] ?? toneClass.default}`}>
          {value}
        </p>

        {/* Delta chip */}
        {delta && deltaDirection && (
          <span className={`inline-flex items-center gap-0.5 text-[11.5px] font-medium font-mono ${deltaColors[deltaDirection] ?? 'text-muted-foreground'}`}>
            <span className="material-icons text-[13px] leading-none">{deltaIcons[deltaDirection] ?? 'remove'}</span>
            {delta}
          </span>
        )}
      </div>

      {/* Mini sparkline */}
      {sparkBars && sparkBars.length > 0 && (
        <div className="absolute right-0 bottom-0 flex items-end gap-[2px] h-[24px] opacity-85">
          {sparkBars.map((h, i) => (
            <span
              key={i}
              className={[
                'w-[3px] rounded-sm',
                i === sparkBars.length - 1
                  ? 'bg-primary'
                  : 'bg-[var(--portal-border-strong)]',
              ].join(' ')}
              style={{ height: `${Math.round(h * 24)}px` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
