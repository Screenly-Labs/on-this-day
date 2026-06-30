// Browser entry. Bun bundles this (inlining ./events) into a self-contained
// classic script with no exports, so it loads from a plain <script>. Keep it
// export-free and free of top-level await.
//
// Flow: read today's local date → fetch the Wikipedia "On this day" feed → pick
// an event (preferring one with an image) → render. If the live fetch fails
// (offline signage, API hiccup), fall back to the small bundled dataset, and
// finally to one inlined event, so the screen is never blank.

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

const FEED_BASE = 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected'
const FALLBACK_URL = '/static/data/fallback.json'
const FETCH_TIMEOUT_MS = 8000

// Last-resort event if even the bundled fallback can't be read.
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

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // no-cache: revalidate so the day's events aren't masked by a stale copy,
    // while still serving from cache when the network is unreachable.
    const res = await fetch(url, { cache: 'no-cache', signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const loadFromFallback = async (): Promise<OnThisDayEvent> => {
  try {
    const data = await fetchJson(FALLBACK_URL)
    const events = Array.isArray(data) ? data.filter(isEvent) : []
    if (events.length === 0) throw new Error('no valid events in fallback')
    return events[pickRandomIndex(events.length)]
  } catch (error) {
    console.error('On This Day: using inline fallback —', error)
    return INLINE_FALLBACK
  }
}

const loadEvent = async (today: Date): Promise<OnThisDayEvent> => {
  const { mm, dd } = monthDay(today)
  try {
    const data = await fetchJson(`${FEED_BASE}/${mm}/${dd}`)
    const event = selectEvent(parseFeed(data))
    if (!event) throw new Error('no usable events in feed')
    return event
  } catch (error) {
    console.error('On This Day: live feed unavailable, falling back —', error)
    return loadFromFallback()
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
