// ── Visual Provider Slot ──
// Supported: replicate (SDXL, DALL-E via Replicate), dalle, stub
// MidJourney has no official API — use Replicate for automation

export const visualProviders = {

  // Replicate — hosts multiple image models, easiest to swap
  replicate: {
    name: "Replicate",
    async execute({ prompt, negative_prompt, aspect_ratio, config }) {
      const apiKey = process.env.REPLICATE_API_KEY;
      if (!apiKey) throw new Error("REPLICATE_API_KEY not configured");

      const model = config.params?.model || "stability-ai/sdxl:39ed52f2319f9f..."; // replace with actual version

      const res = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          version: model,
          input: {
            prompt,
            negative_prompt: negative_prompt || "blurry, low quality, text, watermark",
            width:  aspect_ratio==="9:16" ? 768 : 1024,
            height: aspect_ratio==="9:16" ? 1344 : 1024,
            num_outputs: config.params?.num_outputs || 4,
          },
        }),
      });

      if (!res.ok) throw new Error(`Replicate API ${res.status}`);
      const prediction = await res.json();

      // Poll for result
      let result = prediction;
      while (result.status !== "succeeded" && result.status !== "failed") {
        await new Promise(r => setTimeout(r, 1500));
        const poll = await fetch(result.urls.get, {
          headers: { "Authorization": `Bearer ${apiKey}` }
        });
        result = await poll.json();
      }

      if (result.status === "failed") throw new Error(`Replicate generation failed: ${result.error}`);

      return {
        result: result.output, // array of image URLs
        cost_estimate: 0.05 * (config.params?.num_outputs||4),
        format: "url",
      };
    }
  },

  // DALL-E 3 via OpenAI
  dalle: {
    name: "DALL-E 3",
    async execute({ prompt, aspect_ratio, config }) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

      const size = aspect_ratio==="9:16" ? "1024x1792" : aspect_ratio==="16:9" ? "1792x1024" : "1024x1024";

      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          size,
          n: 1,
          quality: config.params?.quality || "standard",
        }),
      });

      if (!res.ok) throw new Error(`DALL-E API ${res.status}`);
      const data = await res.json();

      return {
        result: data.data.map(d => d.url),
        cost_estimate: size==="1024x1024" ? 0.04 : 0.08,
        format: "url",
      };
    }
  },

  // Stub
  stub: {
    name: "Stub (test)",
    async execute({ prompt, config }) {
      await new Promise(r => setTimeout(r, 800));
      return { result: [], cost_estimate: 0, format: "url", stub: true };
    }
  },
};
