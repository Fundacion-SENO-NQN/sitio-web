import config from './astro.config.mjs'

// Las páginas se generan de forma estática; Cloudflare solo interviene en el build.
export default {
  ...config,
  adapter: undefined
}
