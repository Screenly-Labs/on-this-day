import { describe, expect, test } from 'bun:test'
import fallback from '../assets/static/data/fallback.json'
import {
  type OnThisDayEvent,
  formatYear,
  isEvent,
  monthDay,
  parseFeed,
  pickRandomIndex,
  selectEvent,
  upscaleThumbnail,
  yearsAgo
} from '../assets/static/js/events'

describe('monthDay', () => {
  test('zero-pads local month and day', () => {
    expect(monthDay(new Date(2026, 0, 5))).toEqual({ mm: '01', dd: '05' })
    expect(monthDay(new Date(2026, 11, 31))).toEqual({ mm: '12', dd: '31' })
    expect(monthDay(new Date(2026, 5, 30))).toEqual({ mm: '06', dd: '30' })
  })
})

describe('pickRandomIndex', () => {
  test('returns an in-range integer for every rng value', () => {
    for (const r of [0, 0.001, 0.25, 0.5, 0.999999, 1]) {
      const i = pickRandomIndex(50, () => r)
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(50)
    }
  })

  test('maps the rng range across the full index range', () => {
    expect(pickRandomIndex(10, () => 0)).toBe(0)
    expect(pickRandomIndex(10, () => 0.99)).toBe(9)
    expect(pickRandomIndex(10, () => 1)).toBe(9) // clamped, never out of range
  })

  test('guards against empty or invalid lengths', () => {
    expect(pickRandomIndex(0)).toBe(0)
    expect(pickRandomIndex(-5)).toBe(0)
    expect(pickRandomIndex(Number.NaN)).toBe(0)
  })
})

describe('upscaleThumbnail', () => {
  test('rewrites the Wikimedia size token to the requested width', () => {
    const url =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Photo.jpg/330px-Photo.jpg'
    expect(upscaleThumbnail(url, 800)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Photo.jpg/800px-Photo.jpg'
    )
  })

  test('only rewrites the size token, not directory digits in the path', () => {
    const url =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Insignia.svg/330px-Insignia.svg.png'
    expect(upscaleThumbnail(url, 640)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Insignia.svg/640px-Insignia.svg.png'
    )
  })

  test('clamps the request to the original width (Wikimedia 400s on over-upscale)', () => {
    const url =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Photo.jpg/330px-Photo.jpg'
    // desired 800 but the source is only 480 wide → request 480, not 800.
    expect(upscaleThumbnail(url, 800, 480)).toContain('/480px-')
  })

  test('does not upscale when the source is already at or above the target', () => {
    const url =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Photo.jpg/330px-Photo.jpg'
    expect(upscaleThumbnail(url, 800, 300)).toBe(url) // max below current → unchanged
    expect(upscaleThumbnail(url, 200)).toBe(url) // desired below current → unchanged
  })

  test('returns non-thumbnail URLs unchanged', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/4/47/Photo.jpg'
    expect(upscaleThumbnail(url)).toBe(url)
  })
})

describe('formatYear', () => {
  test('renders CE years plainly and BCE years with a suffix', () => {
    expect(formatYear(1969)).toBe('1969')
    expect(formatYear(44)).toBe('44')
    expect(formatYear(-44)).toBe('44 BC')
  })
})

describe('yearsAgo', () => {
  const now = new Date(2026, 5, 30)
  test('counts whole years back from now', () => {
    expect(yearsAgo(1969, now)).toBe(57)
    expect(yearsAgo(1, now)).toBe(2025)
  })
  test('accounts for the missing year 0 with BCE years', () => {
    expect(yearsAgo(-44, now)).toBe(2069) // 44 BC → 2026, not 2070
  })
  test('returns null for this year or a future/invalid year', () => {
    expect(yearsAgo(2026, now)).toBeNull()
    expect(yearsAgo(2030, now)).toBeNull()
    expect(yearsAgo(Number.NaN, now)).toBeNull()
  })
})

describe('isEvent', () => {
  test('accepts a well-formed event with or without an image', () => {
    expect(isEvent({ year: 1969, text: 'A', title: 'B', url: 'https://x' })).toBe(true)
    expect(isEvent({ year: 1969, text: 'A', title: 'B', url: 'https://x', imageUrl: 'i' })).toBe(
      true
    )
  })

  test('rejects malformed values', () => {
    expect(isEvent(null)).toBe(false)
    expect(isEvent('nope')).toBe(false)
    expect(isEvent({ year: 1969, text: 'A', title: 'B' })).toBe(false) // no url
    expect(isEvent({ year: '1969', text: 'A', title: 'B', url: 'u' })).toBe(false)
    expect(isEvent({ year: Number.NaN, text: 'A', title: 'B', url: 'u' })).toBe(false)
    expect(isEvent({ year: 1969, text: '', title: 'B', url: 'u' })).toBe(false)
    expect(isEvent({ year: 1969, text: 'A', title: 'B', url: 'u', imageUrl: 5 })).toBe(false)
  })
})

// A trimmed fixture in the shape of the Wikipedia "On this day" feed.
const FEED_FIXTURE = {
  selected: [
    {
      year: 1969,
      text: 'A historic event with a photo.',
      pages: [
        {
          normalizedtitle: 'Photo Event',
          thumbnail: {
            source:
              'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/P.jpg/330px-P.jpg',
            width: 330
          },
          originalimage: { width: 500 },
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Photo_Event' } }
        }
      ]
    },
    {
      year: 1900,
      text: 'A historic event with no image.',
      pages: [
        {
          normalizedtitle: 'Text Event',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Text_Event' } }
        }
      ]
    },
    // Invalid entries that must be skipped:
    { text: 'No year here.', pages: [] },
    { year: 1850, text: 'No linkable page.', pages: [{ normalizedtitle: 'Orphan' }] }
  ]
}

describe('parseFeed', () => {
  const events = parseFeed(FEED_FIXTURE)

  test('keeps only entries with a year, text, and a linkable source', () => {
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.year)).toEqual([1969, 1900])
  })

  test('derives title, source URL, and an upscaled image', () => {
    expect(events[0]).toEqual({
      year: 1969,
      text: 'A historic event with a photo.',
      title: 'Photo Event',
      url: 'https://en.wikipedia.org/wiki/Photo_Event',
      // clamped to the 500px original, not the 800px default
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/P.jpg/500px-P.jpg'
    })
  })

  test('leaves imageUrl undefined when no thumbnail is present', () => {
    expect(events[1].imageUrl).toBeUndefined()
  })

  test('keeps the original thumbnail when no width cap is known (no over-upscale)', () => {
    const src =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/T.jpg/330px-T.jpg'
    const parsed = parseFeed({
      selected: [
        {
          year: 2000,
          text: 'No width metadata on the thumbnail.',
          pages: [
            {
              normalizedtitle: 'T',
              thumbnail: { source: src },
              content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/T' } }
            }
          ]
        }
      ]
    })
    expect(parsed).toHaveLength(1)
    expect(parsed[0].imageUrl).toBe(src) // unchanged — not blindly upscaled to 800px
  })

  test('returns an empty array for junk input', () => {
    expect(parseFeed(null)).toEqual([])
    expect(parseFeed({})).toEqual([])
    expect(parseFeed({ selected: 'nope' })).toEqual([])
  })
})

describe('selectEvent', () => {
  const withImage: OnThisDayEvent = {
    year: 1,
    text: 't',
    title: 'a',
    url: 'u',
    imageUrl: 'i'
  }
  const noImage: OnThisDayEvent = { year: 2, text: 't', title: 'b', url: 'u' }

  test('prefers an event that has an image', () => {
    // rng→0 would pick index 0 (the imageless one) without the preference.
    expect(selectEvent([noImage, withImage], () => 0)).toBe(withImage)
  })

  test('falls back to any event when none have images', () => {
    expect(selectEvent([noImage], () => 0)).toBe(noImage)
  })

  test('returns undefined for an empty list', () => {
    expect(selectEvent([])).toBeUndefined()
  })
})

describe('fallback.json dataset', () => {
  const data = fallback as OnThisDayEvent[]

  test('ships a handful of offline-safe events', () => {
    expect(data.length).toBeGreaterThanOrEqual(10)
    expect(data.length).toBeLessThanOrEqual(30)
  })

  test('every entry is a valid event linking an https Wikipedia article', () => {
    for (const e of data) {
      expect(isEvent(e)).toBe(true)
      expect(e.url.startsWith('https://en.wikipedia.org/wiki/')).toBe(true)
    }
  })

  test('has no duplicate articles', () => {
    const urls = new Set(data.map((e) => e.url))
    expect(urls.size).toBe(data.length)
  })

  test('every entry can be selected', () => {
    expect(isEvent(data[pickRandomIndex(data.length, () => 0)])).toBe(true)
    expect(isEvent(data[pickRandomIndex(data.length, () => 0.999999)])).toBe(true)
  })
})
