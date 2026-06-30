// Browser entry. Bun bundles this (inlining ./events) into a self-contained
// classic script with no exports, so it loads from a plain <script>. Keep it
// export-free and free of top-level await.
//
// Flow: read today's local date → fetch the Wikipedia "On this day" feed → pick
// an event (preferring one with an image) → render. If the live fetch fails
// (offline signage, API hiccup), fall back to the dataset bundled into this
// script, and finally to one inlined event, so the screen is never blank.

import {
  type OnThisDayEvent,
  MONTHS_LONG,
  MONTHS_SHORT,
  formatYear,
  isEvent,
  monthDay,
  parseFeed,
  pickRandomIndex,
  selectEvent,
  yearsAgo
} from './events'
// Inlined into the bundle at build time, so the offline fallback needs no fetch
// and works on a network-isolated screen.
import fallbackEvents from '../data/fallback.json'

const FEED_BASE = 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected'
const FETCH_TIMEOUT_MS = 8000

// Last-resort event if the bundled dataset is somehow empty/invalid. Keep this
// in sync with the inline seed in index.html (the no-JS / pre-fetch screen).
const INLINE_FALLBACK: OnThisDayEvent = {
  year: 1969,
  text: 'The first message is sent over ARPANET, the forerunner of the Internet.',
  title: 'ARPANET',
  url: 'https://en.wikipedia.org/wiki/ARPANET'
}

const text = (id: string, value: string): void => {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

const renderImage = (event: OnThisDayEvent): void => {
  const figure = document.getElementById('otd-figure')
  const image = document.getElementById('otd-image') as HTMLImageElement | null
  if (!figure || !image) return

  if (!event.imageUrl) {
    figure.dataset.state = 'empty'
    return
  }
  // If the article photo fails to load, collapse to the text-only layout
  // rather than leaving a broken frame on screen.
  image.onerror = () => {
    figure.dataset.state = 'empty'
  }
  image.onload = () => {
    figure.dataset.state = 'ready'
  }
  image.src = event.imageUrl
  image.alt = event.title
  text('otd-caption', event.title)
}

const render = (event: OnThisDayEvent, today: Date): void => {
  const month = today.getMonth()
  text('otd-stamp-month', MONTHS_SHORT[month])
  text('otd-stamp-day', String(today.getDate()))
  text('otd-date', `${MONTHS_LONG[month]} ${today.getDate()}`)

  text('otd-year', formatYear(event.year))
  const ago = yearsAgo(event.year, today)
  text('otd-distance', ago === null ? '' : `${ago.toLocaleString()} years ago`)

  text('otd-text', event.text)

  const source = document.getElementById('otd-source') as HTMLAnchorElement | null
  if (source) source.href = event.url

  renderImage(event)
  document.documentElement.dataset.state = 'ready'
}

const fetchFeed = async (url: string): Promise<unknown> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // no-cache: revalidate so a new day's events aren't masked by a stale copy.
    // When the network is unreachable this rejects, and we fall back below.
    const res = await fetch(url, { cache: 'no-cache', signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Picks from the dataset bundled into this script — no network, so it works on
// an offline screen. Falls back to the single inline event only if that data is
// somehow unusable.
const pickFromFallback = (): OnThisDayEvent => {
  const events = Array.isArray(fallbackEvents) ? fallbackEvents.filter(isEvent) : []
  if (events.length === 0) return INLINE_FALLBACK
  return events[pickRandomIndex(events.length)]
}

const loadEvent = async (today: Date): Promise<OnThisDayEvent> => {
  const { mm, dd } = monthDay(today)
  try {
    const data = await fetchFeed(`${FEED_BASE}/${mm}/${dd}`)
    const event = selectEvent(parseFeed(data))
    if (!event) throw new Error('no usable events in feed')
    return event
  } catch (error) {
    console.error('On This Day: live feed unavailable, using bundled fallback —', error)
    return pickFromFallback()
  }
}

const init = (): void => {
  const today = new Date()
  loadEvent(today).then((event) => render(event, today))
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
