import { describe, expect, test } from 'bun:test'
// The signage-app manifest is the source of truth for how the app store and
// players render/launch this app (docs/app-manifest.md). These assertions mirror
// the manifest schema's invariants so a malformed edit fails CI here rather than
// being rejected by the store's index build.
import manifest from '../.well-known/signage-app.json'

const BASE_URL = 'https://on-this-day.srly.io/'

describe('signage-app manifest', () => {
  test('declares the required top-level fields', () => {
    expect(manifest.manifestVersion).toBe('1')
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(manifest.description.length).toBeGreaterThan(0)
    expect(manifest.launch.baseUrl).toBe(BASE_URL)
  })

  test('id is a store-legal slug', () => {
    expect(manifest.id).toBe('on-this-day')
    expect(manifest.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  test('every declared URL is on the app origin or its repo', () => {
    for (const url of [manifest.homepage, manifest.source, manifest.support]) {
      expect(() => new URL(url)).not.toThrow()
    }
    expect(manifest.homepage).toBe(BASE_URL)
    expect(manifest.source).toContain('github.com/Screenly-Labs/on-this-day')
    expect(manifest.support).toContain('github.com/Screenly-Labs/on-this-day')
  })

  test('takes no settings, so it carries no launch template', () => {
    // A single-shot page (one event per load, no rotation or refresh): omit
    // settings and template, and the baseUrl alone is the launch URL.
    expect('settings' in manifest).toBe(false)
    expect('template' in manifest.launch).toBe(false)
  })
})
