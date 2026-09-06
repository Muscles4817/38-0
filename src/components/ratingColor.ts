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

/** Rating bands, best first. A rating below the last one is unrated grey. */
const BANDS: { floor: number; color: string; label: string }[] = [
  { floor: 88, color: '#00c896', label: 'World class' },
  { floor: 83, color: '#60a5fa', label: 'Excellent' },
  { floor: 78, color: '#fbbf24', label: 'Good' },
  { floor: 70, color: '#f97316', label: 'Squad player' },
];

const UNRATED = '#888';

/** The colour for a rating on the shared scale. */
export function ratingColor(rating: number): string {
  return BANDS.find(b => rating >= b.floor)?.color ?? UNRATED;
}

/** What the band means, for a legend or a label. */
export function ratingBand(rating: number): string {
  return BANDS.find(b => rating >= b.floor)?.label ?? 'Rated';
}
