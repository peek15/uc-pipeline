// ── Voice Provider Slot ──
// Supported: elevenlabs, playht, stub
// Add new providers here — zero pipeline changes needed

export const voiceProviders = {

  // ElevenLabs — primary
  elevenlabs: {
    name: "ElevenLabs",
    async execute({ text, language, config }) {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

      const voiceId = config.params?.voice_id || config.profile_id;
      if (!voiceId) throw new Error("No voice_id in provider config");

      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: config.params?.model_id || "eleven_multilingual_v2",
          voice_settings: {
            stability:        config.params?.stability        ?? 0.5,
            similarity_boost: config.params?.similarity_boost ?? 0.75,
            style:            config.params?.style            ?? 0.0,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        throw new Error(err.detail?.message || `ElevenLabs API ${res.status}`);
      }

      const audioBuffer = await res.arrayBuffer();
      const chars = text.length;
      // ElevenLabs charges per character — estimate
      const cost_estimate = (chars / 1000) * 0.30;

      return {
        result: audioBuffer,
        cost_estimate,
        duration_estimate: Math.ceil(chars / 15), // ~15 chars/sec
        format: "mp3",
      };
    }
  },

  // PlayHT — alternative
  playht: {
    name: "PlayHT",
    async execute({ text, language, config }) {
      throw new Error("PlayHT provider not yet configured. Add PLAYHT_API_KEY to environment.");
    }
  },

  // Stub — for testing without API keys
  stub: {
    name: "Stub (test)",
    async execute({ text, language, config }) {
      await new Promise(r => setTimeout(r, 500)); // simulate delay
      return {
        result: null,
        cost_estimate: 0,
        duration_estimate: Math.ceil(text.length / 15),
        format: "mp3",
        stub: true,
      };
    }
  },
};
