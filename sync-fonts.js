#!/usr/bin/env bun
// Vendor this app's webfonts into ./assets/static/fonts. The files, versions,
// and copy logic all live in @screenly-labs/signage-kit — this just names the
// families "The Record" uses (Newsreader serif + JetBrains Mono record voice).

import { syncFonts } from '@screenly-labs/signage-kit/sync-fonts'

export const run = () => syncFonts(['newsreader', 'jetbrains-mono'])

if (import.meta.main) {
  await run()
}
