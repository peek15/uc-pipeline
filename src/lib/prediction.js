// Prediction Engine V1 — transparent, client-safe, no async dependencies.
// Writes predicted_score + metadata.prediction; never mutates scoring weights directly.

export function calculatePrediction(story, allStories = []) {
  const base = story.score_total ?? 50;

  const blockers = (story.quality_gate_blockers || []).length;
  const warnings = (story.quality_gate_warnings || []).length;
  const gatePenalty = (blockers * 15) + (warnings * 5);

  const produced = allStories.filter(s =>
    s.id !== story.id &&
    s.status === "produced" &&
    s.score_total != null
  );

  const templatePeers = story.content_template_id
    ? produced.filter(s => s.content_template_id === story.content_template_id)
    : [];
  const formatPeers = story.format
    ? produced.filter(s => s.format === story.format)
    : [];

  const peers = templatePeers.length >= 3 ? templatePeers
    : formatPeers.length >= 3 ? formatPeers
    : produced;

  const peerGroup = templatePeers.length >= 3 ? "template"
    : formatPeers.length >= 3 ? "format"
    : produced.length >= 2 ? "global" : "none";

  let historicalAdj = 0;
  if (peers.length >= 2) {
    const avgPeerScore = peers.reduce((sum, s) => sum + s.score_total, 0) / peers.length;
    // Positive adj if this story scores above the peer average
    historicalAdj = Math.round((base - avgPeerScore) * 0.15);
    historicalAdj = Math.max(-10, Math.min(10, historicalAdj));
  }

  const raw = base - gatePenalty + historicalAdj;
  const predicted_score = Math.max(0, Math.min(100, Math.round(raw)));

  const confidence = story.score_total != null
    ? (peers.length >= 10 ? 0.85 : peers.length >= 5 ? 0.7 : peers.length >= 2 ? 0.55 : 0.4)
    : 0.3;

  return {
    predicted_score,
    confidence,
    breakdown: { base, gatePenalty, historicalAdj, peerGroup, sampleSize: peers.length },
  };
}

export function batchPredict(stories) {
  return stories.map(story => {
    if (["rejected", "archived"].includes(story.status)) return story;
    const { predicted_score, confidence, breakdown } = calculatePrediction(story, stories);
    return {
      ...story,
      predicted_score,
      metadata: {
        ...(story.metadata || {}),
        prediction: { ...breakdown, confidence, calculated_at: new Date().toISOString() },
      },
    };
  });
}
