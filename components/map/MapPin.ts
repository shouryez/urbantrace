import type { Status } from "@/lib/ai/schemas";

/**
 * HTML for an L.divIcon pin: a circle in the status colour with the backer count inside.
 * `fresh` pins (just arrived over Realtime) pulse once; `active` is the pin linked to the
 * hovered or selected list card.
 */
export function mapPinHtml(status: Status, backers: number, opts: { active?: boolean; fresh?: boolean } = {}): string {
  const classes = ["map-pin", `map-pin--${status}`];
  if (opts.active) classes.push("is-active");
  if (opts.fresh) classes.push("is-fresh");
  const label = backers > 99 ? "99+" : String(backers);
  return `<span class="${classes.join(" ")}"><span class="map-pin__count">${label}</span></span>`;
}

export const MAP_PIN_SIZE = 34;
