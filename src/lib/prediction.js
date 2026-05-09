// Prediction Engine V2 — transparent, client-safe, no async dependencies.
// Writes predicted_score + metadata.prediction; never mutates scoring weights directly.
// V2 adds performance_snapshots-based adjustment when snapshot data is available.

export function calculatePrediction(story, allStories = [], snapshots = []) {
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
    historicalAdj = Math.round((base - avgPeerScore) * 0.15);
    historicalAdj = Math.max(-10, Math.min(10, historicalAdj));
  }

  // V2: snapshot-based adjustment from real performance data
  let snapshotAdj = 0;
  let snapshotGroup = "none";
  if (snapshots.length >= 2) {
    const tSnaps = story.content_template_id
      ? snapshots.filter(s => s.content_template_id === story.content_template_id)
      : [];
    const cSnaps = story.content_type
      ? snapshots.filter(s => s.content_type === story.content_type)
      : [];
    const snapPeers = tSnaps.length >= 2 ? tSnaps : cSnaps.length >= 2 ? cSnaps : snapshots;
    snapshotGroup = tSnaps.length >= 2 ? "template_snaps"
      : cSnaps.length >= 2 ? "type_snaps"
      : "global_snaps";

    const withRate = snapPeers.filter(s => s.completion_rate != null);
    if (withRate.length >= 2) {
      const avg = withRate.reduce((sum, s) => sum + Number(s.completion_rate), 0) / withRate.length;
      const rate = avg > 1 ? avg / 100 : avg; // normalize to 0–1
      snapshotAdj = Math.round((rate - 0.4) * 20); // 0.4 → 0, 0.9 → +10
      snapshotAdj = Math.max(-10, Math.min(10, snapshotAdj));
    } else {
      const withViews = snapPeers.filter(s => s.views != null && s.views > 0);
      if (withViews.length >= 2) {
        const avg = withViews.reduce((sum, s) => sum + s.views, 0) / withViews.length;
        snapshotAdj = avg >= 10000 ? 8 : avg >= 5000 ? 5 : avg >= 2000 ? 2
          : avg < 300 ? -5 : avg < 800 ? -3 : 0;
      }
    }
  }

  // Blend V1 historical adj with V2 snapshot adj when snapshots available
  const effectiveAdj = snapshots.length >= 2
    ? Math.round(historicalAdj * 0.5 + snapshotAdj * 0.5)
    : historicalAdj;

  const raw = base - gatePenalty + effectiveAdj;
  const predicted_score = Math.max(0, Math.min(100, Math.round(raw)));

  const baseConfidence = story.score_total != null
    ? (peers.length >= 10 ? 0.85 : peers.length >= 5 ? 0.7 : peers.length >= 2 ? 0.55 : 0.4)
    : 0.3;
  const snapshotBoost = snapshots.length >= 5 ? 0.1 : snapshots.length >= 2 ? 0.05 : 0;
  const confidence = Math.min(0.92, baseConfidence + snapshotBoost);

  return {
    predicted_score,
    confidence,
    breakdown: {
      base, gatePenalty, historicalAdj: effectiveAdj,
      snapshotAdj, peerGroup, snapshotGroup,
      sampleSize: peers.length, snapshotCount: snapshots.length,
    },
  };
}

export function batchPredict(stories, snapshots = []) {
  return stories.map(story => {
    if (["rejected", "archived"].includes(story.status)) return story;
    const { predicted_score, confidence, breakdown } = calculatePrediction(story, stories, snapshots);
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
