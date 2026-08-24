/**
 * Provider selection. See docs/specs/06a-provider.md §2 and 18-provider-byok.md §4.
 *
 * A missing key never throws here — it surfaces as kind:'config' from generate(),
 * so a deploy fault is never reported to a user as a failed edit.
 */

import { createAnthropicProvider } from './anthropic'
import { createGeminiProvider } from './gemini'
import { createMockProvider } from './mock'
import type { ClientProfile, ClientProviderConfig } from './config'
import type { AiProvider } from './types'

export type ProviderId = 'gemini' | 'anthropic' | 'mock'

/**
 * The deployment's own configuration, from the environment. Read only on requests
 * that arrived WITHOUT a user key — spec 18 §4.1 is what keeps this key from ever
 * being sent to a host a browser named.
 */
function fromEnv(which: string): AiProvider {
  switch (which) {
    case 'mock':
      return createMockProvider()
    case 'anthropic':
      return createAnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.AGENTROUTER_API_KEY,
        baseUrl: process.env.ANTHROPIC_BASE_URL || process.env.AGENTROUTER_BASE_URL,
        model: process.env.ANTHROPIC_MODEL,
        profile: (process.env.ANTHROPIC_CLIENT_PROFILE as ClientProfile) || 'standard',
      })
    case 'gemini':
      return createGeminiProvider(process.env.GEMINI_API_KEY)
    default:
      return unknown(which)
  }
}

function unknown(which: string): AiProvider {
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

/**
 * `apiKey` is the bring-your-own-key path (docs/specs/12-agent-actions.md §9,
 * 18 §4). It is used for this one call and then discarded with the provider
 * instance — never logged, never persisted.
 *
 * `config` is the user's own provider choice and MUST have been validated by
 * parseClientProvider first. The route only ever passes it alongside a key: without
 * one, a browser could point this deployment's credential at a host it chose.
 */
export function getProvider(
  id?: string,
  apiKey?: string,
  config?: ClientProviderConfig,
): AiProvider {
  if (apiKey && config) {
    if (config.id === 'anthropic') {
      return createAnthropicProvider({
        apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        profile: config.profile,
      })
    }
    return createGeminiProvider(apiKey)
  }

  const which = (id ?? process.env.AI_PROVIDER ?? 'gemini').toLowerCase()

  // A key with no config is the legacy BYOK shape: a Gemini key, which is what
  // every saved key in a browser was before spec 18. It keeps working.
  if (apiKey) {
    if (which === 'mock') return createMockProvider()
    if (which === 'anthropic') {
      return createAnthropicProvider({
        apiKey,
        baseUrl: process.env.ANTHROPIC_BASE_URL || process.env.AGENTROUTER_BASE_URL,
        model: process.env.ANTHROPIC_MODEL,
        profile: (process.env.ANTHROPIC_CLIENT_PROFILE as ClientProfile) || 'standard',
      })
    }
    return createGeminiProvider(apiKey)
  }

  return fromEnv(which)
}

export * from './types'
export type { ClientProfile, ClientProviderConfig } from './config'
