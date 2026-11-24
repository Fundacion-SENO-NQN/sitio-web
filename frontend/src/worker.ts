import { handle } from '@astrojs/cloudflare/handler'
import { applyCsp } from './middleware'

export default {
  async fetch(request, env, ctx) {
    const response: Response = await handle(request, env, ctx)

    return applyCsp(response)
  }
} satisfies ExportedHandler<Env>