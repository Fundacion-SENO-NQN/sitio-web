// @ts-check
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

import sitemap from '@astrojs/sitemap'

// https://astro.build/config
export default defineConfig({
  site: 'https://fundacionseno.org',
  output: 'static',

  adapter: cloudflare({
    imageService: 'compile'
  }),

  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/plataforma') && !page.includes('/login')
    })
  ]
})
