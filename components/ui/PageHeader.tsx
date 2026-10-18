import type { ReactNode } from "react";

type Props = {
  kicker: string;
  /** The title; `accent` is appended in the serif italic, like the landing headlines. */
  title: string;
  accent?: string;
  children?: ReactNode;
  aside?: ReactNode;
};

/** Page heading for app screens: kicker, display title with a serif accent, a short lede. */
export function PageHeader({ kicker, title, accent, children, aside }: Props) {
  return (
    <header className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="kicker flex items-center gap-2 text-fog-300">
          <span aria-hidden className="h-px w-6 bg-fog-500" />
          {kicker}
        </p>
        <h1 className="font-display text-[40px] leading-[1.02] font-bold tracking-tight md:text-[56px]">
          <span className="text-aurora">{title}</span>
          {accent && (
            <>
              {" "}
              <span className="font-serif font-normal italic">{accent}</span>
            </>
          )}
        </h1>
        {children && <div className="max-w-2xl text-fog-300">{children}</div>}
      </div>
      {aside}
    </header>
  );
}
