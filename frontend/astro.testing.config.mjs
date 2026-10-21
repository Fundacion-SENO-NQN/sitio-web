// @ts-check
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site:
    process.env.TESTING_SITE_URL ||
    'https://sitio-web-testing.sieghartsantiago.workers.dev',

  output: 'static',

  adapter: cloudflare({
    imageService: 'compile',
  }),

  build: {
    inlineStylesheets: 'always',
  },

  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev https://media.fundacionseno.org https://pub-e64d42a022df404ab667f9307dd13463.r2.dev",
        "font-src 'self' data:",
        "connect-src 'self' https://sitio-web-testing.fly.dev",
        "frame-src 'self' https://www.google.com https://maps.google.com",
      ],
    },
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
      },
    }),
  ],
})