// Shared utility for deriving studio_blocks rows from script text.
// Used by both /api/studio/session (initial seeding) and /api/studio/regenerate.

function formatTc(totalSec) {
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Split script text into block partials (no story_id/version_id/workspace_id).
// Returns null if the script has no usable content.
export function deriveBlocksFromScript(script) {
  if (!script?.trim()) return null;

  const paragraphs = script
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.split(/\s+/).length >= 3);
  if (!paragraphs.length) return null;

  const WPS = 2.5; // words per second at voiceover pace
  let t = 0;

  return paragraphs.map((para, i) => {
    const words = para.split(/\s+/).length;
    const dur = Math.max(3, Math.round(words / WPS));
    const start_tc = formatTc(t);
    t += dur;
    const end_tc = formatTc(t);

    let label;
    if (paragraphs.length === 1) label = "Script";
    else if (i === 0) label = "Hook";
    else if (i === paragraphs.length - 1) label = "CTA";
    else label = paragraphs.length === 3 ? "Body" : `Body ${i}`;

    return {
      position: i,
      label,
      start_tc,
      end_tc,
      source_type: "text",
      editable: true,
      locked_reason: null,
      status: "ok",
      metadata_json: {
        derived_from: "script",
        text: para.substring(0, 600),
        word_count: words,
      },
    };
  });
}

// Convenience wrapper — extracts the EN script from a story row.
export function deriveBlocksFromStory(story) {
  const script =
    (story?.scripts && typeof story.scripts === "object" ? story.scripts["en"] : null) ||
    story?.script ||
    "";
  return deriveBlocksFromScript(script);
}
