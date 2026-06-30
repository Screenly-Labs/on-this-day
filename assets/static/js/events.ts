// Pure, framework-free helpers for the On This Day app. Kept separate from
// main.ts so they can be unit-tested with `bun:test`; main.ts is the
// (untestable, no-exports) browser entry that wires these into the DOM.
//
// Data source: the Wikipedia "On this day" REST feed
//   https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/MM/DD
// `parseFeed` turns its untrusted JSON into our small, flat OnThisDayEvent.

// One historical event for a given calendar day. `imageUrl` is optional: the
// bundled offline fallback ships without images, and not every live entry has a
// usable thumbnail. `url` always points at the source Wikipedia article so the
// on-screen credit can link it.
export type OnThisDayEvent = {
  year: number
  text: string
  title: string
  url: string
  imageUrl?: string
}

export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const

export const MONTHS_SHORT = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC'
] as const

// Zero-padded local month/day for the feed path (…/selected/MM/DD). Uses the
// viewer's local date so the screen turns over at the viewer's midnight.
export const monthDay = (date: Date): { mm: string; dd: string } => {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return { mm, dd }
}

// Returns an integer in [0, length). `rng` is injectable so tests are
// deterministic. Guards against empty/invalid input and an rng that returns 1.
export const pickRandomIndex = (length: number, rng: () => number = Math.random): number => {
  if (!Number.isFinite(length) || length <= 0) return 0
  return Math.min(length - 1, Math.floor(rng() * length))
}

// Wikimedia thumbnail URLs embed their render width as a `/<n>px-` path token
// (e.g. …/Name.jpg/330px-Name.jpg). Rewrite it to request a sharper render for
// large signage. The request is clamped to `maxWidth` (the source's original
// width) because Wikimedia returns HTTP 400 for any thumbnail wider than the
// original — over-upscaling would make the image vanish. Returns the URL
// unchanged when it isn't a sized thumbnail or is already large enough.
export const upscaleThumbnail = (
  url: string,
  desired = 800,
  maxWidth = Number.POSITIVE_INFINITY
): string => {
  if (typeof url !== 'string' || !Number.isFinite(desired) || desired <= 0) return url
  const current = url.match(/\/(\d+)px-/)
  if (!current) return url
  const target = Math.min(Math.round(desired), Math.floor(maxWidth))
  if (!Number.isFinite(target) || target <= Number(current[1])) return url
  return url.replace(/\/\d+px-/, `/${target}px-`)
}

// Human label for a year, handling the feed's negative BCE years (e.g. -44 → "44 BC").
export const formatYear = (year: number): string => (year < 0 ? `${-year} BC` : `${year}`)

// Whole years between an event and "now", for the "— N years ago" line. Returns
// null when it wouldn't read sensibly (this year, or a future/invalid year).
export const yearsAgo = (year: number, now: Date): number | null => {
  if (!Number.isFinite(year)) return null
  // The feed (and the Gregorian calendar) has no year 0, so a BCE year is one
  // closer than the raw subtraction: 44 BC → 2026 is 2069 years, not 2070.
  const diff = now.getFullYear() - year - (year < 0 ? 1 : 0)
  return diff > 0 ? diff : null
}

// Runtime type guard — both the fetched feed and the bundled fallback are
// untrusted `unknown` until validated.
export const isEvent = (value: unknown): value is OnThisDayEvent => {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.year === 'number' &&
    Number.isFinite(e.year) &&
    typeof e.text === 'string' &&
    e.text.length > 0 &&
    typeof e.title === 'string' &&
    e.title.length > 0 &&
    typeof e.url === 'string' &&
    e.url.length > 0 &&
    (e.imageUrl === undefined || typeof e.imageUrl === 'string')
  )
}

// Picks the page to represent an entry: prefer the first one with a thumbnail
// (so the image-led layout has something to show), else the first page.
const leadPage = (pages: unknown[]): Record<string, unknown> | undefined => {
  const objects = pages.filter(
    (p): p is Record<string, unknown> => typeof p === 'object' && p !== null
  )
  const thumbnailUrl = (p: Record<string, unknown>): string | undefined => {
    const thumb = p.thumbnail as { source?: unknown } | undefined
    return typeof thumb?.source === 'string' ? thumb.source : undefined
  }
  return objects.find((p) => thumbnailUrl(p)) ?? objects[0]
}

// Maps the Wikipedia feed's untrusted JSON to our flat events. Skips anything
// missing the essentials (year, text, a linkable source article).
export const parseFeed = (data: unknown): OnThisDayEvent[] => {
  const selected = (data as { selected?: unknown })?.selected
  if (!Array.isArray(selected)) return []

  const events: OnThisDayEvent[] = []
  for (const entry of selected) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    if (typeof e.year !== 'number' || !Number.isFinite(e.year)) continue
    if (typeof e.text !== 'string' || e.text.length === 0) continue
    if (!Array.isArray(e.pages)) continue

    const page = leadPage(e.pages)
    if (!page) continue

    const titles = page.titles as { normalized?: unknown } | undefined
    const title =
      (typeof page.normalizedtitle === 'string' && page.normalizedtitle) ||
      (typeof titles?.normalized === 'string' && titles.normalized) ||
      (typeof page.title === 'string' && page.title) ||
      ''

    const urls = page.content_urls as { desktop?: { page?: unknown } } | undefined
    const url = typeof urls?.desktop?.page === 'string' ? urls.desktop.page : ''
    if (title.length === 0 || url.length === 0) continue

    const thumb = page.thumbnail as { source?: unknown; width?: unknown } | undefined
    const original = page.originalimage as { width?: unknown } | undefined
    // Clamp to the original width (or, lacking that, the thumbnail's own width)
    // so we never request a render Wikimedia would reject with HTTP 400.
    const maxWidth =
      (typeof original?.width === 'number' && original.width) ||
      (typeof thumb?.width === 'number' && thumb.width) ||
      undefined
    const source = typeof thumb?.source === 'string' ? thumb.source : undefined
    // Only upscale when we know a safe cap; without one, keep the given
    // thumbnail rather than risk an over-upscale that 400s and hides the image.
    const imageUrl = source && maxWidth ? upscaleThumbnail(source, 800, maxWidth) : source

    events.push({ year: e.year, text: e.text, title, url, imageUrl })
  }
  return events
}

// Chooses the event to show. Prefers entries with an image so the image-led
// layout lands; falls back to any event when none have one. Returns undefined
// only for an empty list.
export const selectEvent = (
  events: OnThisDayEvent[],
  rng: () => number = Math.random
): OnThisDayEvent | undefined => {
  if (events.length === 0) return undefined
  const withImage = events.filter((e) => typeof e.imageUrl === 'string' && e.imageUrl.length > 0)
  const pool = withImage.length > 0 ? withImage : events
  return pool[pickRandomIndex(pool.length, rng)]
}
