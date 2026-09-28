// One rating scale, for every screen that shows a rating.
//
// There used to be two, and they disagreed: classic mode read amber as the top
// band and green as the second, while the Overall figure on the pre-season and
// results screens read green as the top band and amber as the third. Both could
// be on screen inside one run, so the same colour meant "world class" in one
// place and "adequate" in another. See docs/desktop-ux.md, principle 8.
//
// Green is the top band, because green is what this game means by good
// everywhere else: the primary action, the selected option, the player's own
// row in the league table.
//
// The colours are CSS variables from globals.css, so a band keeps its hue in
// both themes but is darkened enough to read as text on a light ground. Use
// them only as a `color` or `background`; they cannot take an alpha suffix.

/** Rating bands, best first. A rating below the last one is unrated grey. */
const BANDS: { floor: number; color: string; label: string }[] = [
  { floor: 88, color: 'var(--c-accent)', label: 'World class' },
  { floor: 83, color: 'var(--c-sky)',    label: 'Excellent' },
  { floor: 78, color: 'var(--c-amber)',  label: 'Good' },
  { floor: 70, color: 'var(--c-orange)', label: 'Squad player' },
];

const UNRATED = 'var(--t-muted)';

/** The colour for a rating on the shared scale. */
export function ratingColor(rating: number): string {
  return BANDS.find(b => rating >= b.floor)?.color ?? UNRATED;
}

/** What the band means, for a legend or a label. */
export function ratingBand(rating: number): string {
  return BANDS.find(b => rating >= b.floor)?.label ?? 'Rated';
}
