import { createClient } from "@supabase/supabase-js";

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";

export async function POST(request) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const airtableKey = process.env.AIRTABLE_API_KEY;
  const airtableBase = process.env.AIRTABLE_BASE_ID;
  const airtableTable = process.env.AIRTABLE_TABLE || "Stories";

  if (!airtableKey || !airtableBase) {
    return Response.json({ ok: true, synced: false, reason: "Airtable not configured" });
  }

  try {
    const story = await request.json();

    const fields = {
      Title: story.title || "",
      "Player(s)": story.players || "",
      Era: story.era || "",
      Archetype: story.archetype || "",
      "Obscurity Score": story.obscurity || 3,
      "Story Angle": story.angle || "",
      Hook: story.hook || "",
      Status: story.status || "accepted",
    };

    if (story.script) fields["Script"] = story.script;
    if (story.script_fr) fields["Script FR"] = story.script_fr;
    if (story.script_es) fields["Script ES"] = story.script_es;
    if (story.script_pt) fields["Script PT"] = story.script_pt;
    if (story.scheduled_date) fields["Publish Date"] = story.scheduled_date;
    if (story.metrics_views) fields["Views"] = parseInt(story.metrics_views) || 0;
    if (story.metrics_completion) fields["Completion Rate"] = parseFloat(story.metrics_completion) || 0;
    if (story.metrics_saves) fields["Saves"] = parseInt(story.metrics_saves) || 0;

    const url = `https://api.airtable.com/v0/${airtableBase}/${encodeURIComponent(airtableTable)}`;

    // Check existing
    const searchRes = await fetch(
      `${url}?filterByFormula=${encodeURIComponent(`{Title}="${story.title}"`)}`,
      { headers: { Authorization: `Bearer ${airtableKey}` } }
    );
    const searchData = await searchRes.json();

    if (searchData.records?.length > 0) {
      await fetch(`${url}/${searchData.records[0].id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${airtableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
    } else {
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${airtableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
    }

    return Response.json({ ok: true, synced: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
