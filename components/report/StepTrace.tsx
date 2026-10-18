type StepTraceProps = {
  steps: readonly string[];
  current: number;
};

/** The dotted trace across the top of the report wizard, filling in as you go. */
export function StepTrace({ steps, current }: StepTraceProps) {
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Report progress">
      {steps.map((label, i) => {
        const reached = i <= current;
        return (
          <li key={label} className="relative flex flex-col items-center gap-2" aria-current={i === current ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-1 left-[calc(50%+12px)] w-[calc(100%-24px)] border-t-[3px] border-dotted ${i < current ? "border-marking-400" : "border-asphalt-700"}`}
              />
            )}
            <span className={`size-3 rounded-full ${reached ? "bg-marking-400" : "bg-asphalt-700"}`} />
            <span className={`kicker text-center leading-tight max-sm:tracking-[0.04em] ${reached ? "text-chalk-50" : "text-mist-300"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
