/**
 * src/lib/providers/voice/providers-voice.js
 *
 * Voice provider implementations.
 * Each provider exports an execute(params) function returning:
 *   { blob, filename, provider_name, cost_estimate }
 *
 * To add a new provider: add a key to voiceProviders with an execute() function.
 * Never import this file directly — route through src/lib/providers/index.js executeProvider().
 *
 * Output: audio blob + filename for local download now.
 * Future: caller uploads blob to S3/GCS via assets layer.
 */

// ── ElevenLabs ──
const elevenlabs = {
  async execute({ script, lang, storySlug = "story", config, apiKey }) {
    if (!apiKey) throw new Error("ElevenLabs API key not configured. Add it in Settings → Providers.");
    if (!config?.voice_id) throw new Error("ElevenLabs voice ID not set. Add it in Settings → Providers.");

    const model = config.model_id || "eleven_multilingual_v2";
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.voice_id}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        model_id: model,
        voice_settings: {
          stability:        config.stability        ?? 0.5,
          similarity_boost: config.similarity_boost ?? 0.75,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`ElevenLabs error ${res.status}: ${err}`);
    }

    const blob = await res.blob();
    return {
      blob,
      filename: `UC-${storySlug}-${lang.toUpperCase()}-elevenlabs.mp3`,
      cost_estimate: null, // ElevenLabs charges per character — log separately
    };
  },
};

// ── PlayHT ──
const playht = {
  async execute({ script, lang, storySlug = "story", config, apiKey }) {
    if (!apiKey) throw new Error("PlayHT API key not configured. Add it in Settings → Providers.");

    const res = await fetch("https://api.play.ht/api/v2/tts/stream", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-User-Id": config.user_id || "",
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        voice: config.voice_id || "",
        output_format: "mp3",
        voice_engine: config.model_id || "play3.0-mini",
        language: lang,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`PlayHT error ${res.status}: ${err}`);
    }

    const blob = await res.blob();
    return {
      blob,
      filename: `UC-${storySlug}-${lang.toUpperCase()}-playht.mp3`,
      cost_estimate: null,
    };
  },
};

// ── Stub — silent WAV for pipeline testing without a real API key ──
const stub = {
  async execute({ lang, storySlug = "story" }) {
    const sampleRate = 44100;
    const numSamples = sampleRate; // 1 second silence
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4,  36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1,  true);
    view.setUint16(22, 1,  true);
    view.setUint32(24, sampleRate,     true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2,  true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);

    const blob = new Blob([buffer], { type: "audio/wav" });
    return {
      blob,
      filename: `UC-${storySlug}-${lang.toUpperCase()}-stub.wav`,
      cost_estimate: 0,
    };
  },
};

// ── Provider map — add new providers here ──
export const voiceProviders = { elevenlabs, playht, stub };

// ── Provider metadata — used by UI to show status/labels ──
export const VOICE_PROVIDER_CONFIG = {
  elevenlabs: { label: "ElevenLabs", requiresKey: true,  supportsLangs: ["en","fr","es","pt"] },
  playht:     { label: "PlayHT",     requiresKey: true,  supportsLangs: ["en","fr","es","pt"] },
  stub:       { label: "Stub",       requiresKey: false, supportsLangs: ["en","fr","es","pt"] },
};

// ── Helper: download blob locally (until cloud storage is wired) ──
export function downloadVoiceBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── Helper: get voice status from settings ──
export function getVoiceStatus(settings) {
  return settings?.providers?.voice?.status || "not_configured";
}

export function getVoiceProvider(settings) {
  return settings?.providers?.voice?.provider || "stub";
}
