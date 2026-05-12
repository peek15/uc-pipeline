const BLOCKED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "crunchbase.com",
  "glassdoor.com",
  "wikipedia.org",
  "bloomberg.com",
];

export function extractCompanyName(text = "") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:i own|i run|i founded|my company is|my brand is|company is|brand is|we are|we're)\s+([A-Z0-9][A-Za-z0-9&.'’\- ]{1,70})/i,
    /\bcompany\s+([A-Z0-9][A-Za-z0-9&.'’\- ]{1,70})/i,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return tidyCompanyName(match[1]);
  }
  return "";
}

export async function researchCompanyFromText(text = "") {
  const company = extractCompanyName(text);
  if (!company) return null;
  const website = await findLikelyOfficialWebsite(company);
  if (!website) return { company, status: "not_found" };
  const page = await fetchReadablePage(website);
  return {
    company,
    url: website,
    title: page.title,
    summary: page.summary,
    status: page.summary ? "read" : "stored",
  };
}

async function findLikelyOfficialWebsite(company) {
  const query = encodeURIComponent(`${company} official website`);
  const res = await fetch(`https://duckduckgo.com/html/?q=${query}`, {
    headers: { "User-Agent": "CreativeEngineBot/1.0 (+https://creative-engine.local)" },
    signal: AbortSignal.timeout(6500),
  }).catch(() => null);
  if (!res?.ok) return null;
  const html = await res.text();
  const candidates = [];
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = decodeHtml(match[1]);
    const normalized = normalizeSearchHref(href);
    if (normalized && isLikelyOfficial(normalized)) candidates.push(normalized);
  }
  return unique(candidates)[0] || null;
}

async function fetchReadablePage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "CreativeEngineBot/1.0 (+https://creative-engine.local)" },
    signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  if (!res?.ok) return { title: "", summary: "" };
  const html = await res.text();
  const title = textFromMatch(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = textFromMatch(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || "");
  const body = textFromMatch(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
  const summary = [description, body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 2200);
  return { title, summary };
}

function normalizeSearchHref(href) {
  if (!href) return null;
  if (href.startsWith("//duckduckgo.com/l/?")) {
    try {
      const url = new URL(`https:${href}`);
      const target = url.searchParams.get("uddg");
      return target ? normalizeUrl(target) : null;
    } catch { return null; }
  }
  if (href.startsWith("/l/?")) {
    try {
      const url = new URL(`https://duckduckgo.com${href}`);
      const target = url.searchParams.get("uddg");
      return target ? normalizeUrl(target) : null;
    } catch { return null; }
  }
  if (/^https?:\/\//i.test(href)) return normalizeUrl(href);
  return null;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyOfficial(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) return false;
    return !/duckduckgo|google|bing|yahoo|search/i.test(host);
  } catch {
    return false;
  }
}

function tidyCompanyName(value) {
  return String(value || "")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\b(and|but|with|that|because|for|to|in|on)\b.*$/i, "")
    .trim()
    .slice(0, 80);
}

function textFromMatch(value) {
  return decodeHtml(String(value || "").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function unique(values) {
  return [...new Set(values)];
}
