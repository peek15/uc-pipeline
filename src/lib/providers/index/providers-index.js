// ═══════════════════════════════════════════════════════════
// PROVIDER ABSTRACTION LAYER
// All tool calls route through here — never call external
// tools directly. Provider read from brand_profiles.provider_config
// ═══════════════════════════════════════════════════════════

// ── Provider interfaces ──
// Each provider slot must implement:
//   execute(params) → { result, cost_estimate, provider_name }

import { voiceProviders  } from "../voice/providers-voice";
import { visualProviders } from "../visual/providers-visual";
import { assemblyProviders } from "../assembly/providers-assembly";

// ── Route to correct provider via config ──
export async function executeProvider(slot, brandProfileConfig, params) {
  const config = brandProfileConfig?.[slot];
  if (!config?.provider) throw new Error(`No provider configured for slot: ${slot}`);

  const providers = {
    voice:    voiceProviders,
    visual:   visualProviders,
    assembly: assemblyProviders,
  };

  const slotProviders = providers[slot];
  if (!slotProviders) throw new Error(`Unknown provider slot: ${slot}`);

  const provider = slotProviders[config.provider];
  if (!provider) throw new Error(`Unknown provider: ${config.provider} for slot: ${slot}`);

  const result = await provider.execute({ ...params, config });
  return {
    ...result,
    slot,
    provider_name: config.provider,
  };
}

export { voiceProviders, visualProviders, assemblyProviders };
