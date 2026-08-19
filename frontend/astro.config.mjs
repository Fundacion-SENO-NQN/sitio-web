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

  build: {
    inlineStylesheets: 'always'
  },

  security: {
    csp: {
      scriptDirective: {
        resources: ["'self'", 'https://static.cloudflareinsights.com']
      },

      directives: [
        "default-src 'self'",

        "img-src 'self' data: blob: https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev https://img.fundacionseno.org",

        "font-src 'self' data:",

        "connect-src 'self' https://cloudflareinsights.com https://sitio-web-fundacion-seno.fly.dev https://api.fundacionseno.org",

        "frame-src 'self' https://www.google.com https://maps.google.com"
      ]
    }
  },

  integrations: [
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname

        return (
          !pathname.startsWith('/plataforma') &&
          !pathname.startsWith('/login') &&
          pathname !== '/404' &&
          pathname !== '/404/'
        )
      }
    })
  ]
})
