/**
 * Provider selection. See docs/specs/06a-provider.md §2.
 *
 * A missing key never throws here — it surfaces as kind:'config' from generate(),
 * so a deploy fault is never reported to a user as a failed edit.
 */

import { createGeminiProvider } from './gemini'
import { createMockProvider } from './mock'
import type { AiProvider } from './types'

export type ProviderId = 'gemini' | 'mock'

/**
 * `apiKey` is the bring-your-own-key path (docs/specs/12-agent-actions.md §9). It
 * is used for this one call and then discarded with the provider instance — never
 * logged, never persisted. When absent, the deployment's own key is used.
 */
export function getProvider(id?: string, apiKey?: string): AiProvider {
  const which = (id ?? process.env.AI_PROVIDER ?? 'gemini').toLowerCase()
  switch (which) {
    case 'mock':
      return createMockProvider()
    case 'gemini':
      return createGeminiProvider(apiKey || process.env.GEMINI_API_KEY)
    case 'anthropic':
    case 'openrouter':
      // Declared in the spec, deliberately not installed. Returning a config
      // error beats throwing — the caller path is identical to a missing key.
      return {
        id: which,
        schemaFlavour: 'loose',
        model: async () => which,
        generate: async () => ({
          ok: false as const,
          kind: 'config' as const,
          message: `the "${which}" adapter is not installed in this build`,
        }),
      }
    default:
      return {
        id: which,
        schemaFlavour: 'loose',
        model: async () => which,
        generate: async () => ({
          ok: false as const,
          kind: 'config' as const,
          message: `unknown AI_PROVIDER "${which}"`,
        }),
      }
  }
}

export * from './types'
