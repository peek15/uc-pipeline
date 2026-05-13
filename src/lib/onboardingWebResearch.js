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

const PRIORITY_PAGE_HINTS = [
  "about",
  "services",
  "products",
  "solutions",
  "platform",
  "pricing",
  "customers",
  "case-studies",
  "work",
];

const EVIDENCE_KEYWORDS = [
  "we help",
  "we build",
  "services",
  "platform",
  "solution",
  "customers",
  "clients",
  "teams",
  "businesses",
  "brands",
  "content",
  "marketing",
  "software",
  "ai",
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
  const ranked = await findLikelyOfficialWebsite(company);
  if (!ranked?.url) return { company, status: "not_found", confidence: "low", candidates: ranked?.candidates || [] };
  return researchWebsiteUrl(ranked.url, { company, candidates: ranked.candidates, discovery: "search" });
}

export async function researchWebsiteUrl(url, options = {}) {
  const normalized = normalizeUrl(url);
  if (!normalized) return { company: options.company || "", url, status: "failed", confidence: "low", limitation: "Invalid URL." };

  const homepage = await fetchReadablePage(normalized);
  const relatedUrls = pickRelatedPageUrls(homepage.links || [], normalized);
  const relatedPages = await Promise.all(relatedUrls.map(pageUrl => fetchReadablePage(pageUrl)));
  const pages = [homepage, ...relatedPages]
    .filter(page => page.url && (page.summary || page.title))
    .slice(0, 4);

  const summary = pages.map(page => {
    const label = page.url === normalized ? "Homepage" : page.title || page.url;
    return `${label}: ${page.summary || ""}`;
  }).join("\n\n").slice(0, 5200);
  const evidence = extractEvidenceSnippets(pages);
  const confidence = scoreSourceConfidence({ company: options.company, url: normalized, pages, candidates: options.candidates || [] });
  const status = pages.some(page => page.summary) ? "read" : "stored";

  return {
    company: options.company || "",
    url: normalized,
    title: homepage.title,
    summary,
    status,
    confidence,
    evidence_snippets: evidence,
    source_pages: pages.map(page => ({
      url: page.url,
      title: page.title,
      summary: truncate(page.summary, 700),
      status: page.summary ? "read" : "stored",
    })),
    candidates: options.candidates || [],
    limitation: pages.length <= 1 ? "Only the homepage was readable in this pass." : "",
    discovery: options.discovery || "provided_url",
  };
}

async function findLikelyOfficialWebsite(company) {
  const query = encodeURIComponent(`${company} official website`);
  const res = await fetch(`https://duckduckgo.com/html/?q=${query}`, {
    headers: { "User-Agent": "CreativeEngineBot/1.0 (+https://creative-engine.local)" },
    signal: AbortSignal.timeout(6500),
  }).catch(() => null);
  if (!res?.ok) return { url: null, candidates: [] };
  const html = await res.text();
  const candidates = [];
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = decodeHtml(match[1]);
    const normalized = normalizeSearchHref(href);
    if (normalized && isLikelyOfficial(normalized)) {
      candidates.push({
        url: normalized,
        score: scoreOfficialCandidate(normalized, company),
        host: safeHost(normalized),
      });
    }
  }
  const ranked = uniqueByUrl(candidates)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return { url: ranked[0]?.url || null, candidates: ranked };
}

async function fetchReadablePage(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return { url, title: "", summary: "", links: [] };
  const res = await fetch(normalized, {
    headers: { "User-Agent": "CreativeEngineBot/1.0 (+https://creative-engine.local)" },
    signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  if (!res?.ok) return { url: normalized, title: "", summary: "", links: [] };
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
  const summary = [description, body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 2400);
  return { url: normalized, title, summary, links: extractLinks(html, normalized) };
}

function pickRelatedPageUrls(links, baseUrl) {
  const baseHost = safeHost(baseUrl);
  return unique(
    (links || [])
      .filter(link => safeHost(link) === baseHost)
      .map(link => normalizeUrl(link))
      .filter(Boolean)
      .sort((a, b) => linkPriority(b) - linkPriority(a))
  )
    .filter(link => link !== normalizeUrl(baseUrl))
    .slice(0, 3);
}

function linkPriority(url) {
  const path = new URL(url).pathname.toLowerCase();
  let score = 0;
  PRIORITY_PAGE_HINTS.forEach((hint, index) => {
    if (path.includes(hint)) score += 20 - index;
  });
  if (path.split("/").filter(Boolean).length <= 2) score += 4;
  return score;
}

function extractEvidenceSnippets(pages) {
  const snippets = [];
  for (const page of pages || []) {
    const sentences = String(page.summary || "")
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 50 && sentence.length < 260);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (EVIDENCE_KEYWORDS.some(keyword => lower.includes(keyword))) {
        snippets.push({ source_url: page.url, text: sentence });
      }
      if (snippets.length >= 6) return snippets;
    }
  }
  return snippets;
}

function scoreSourceConfidence({ company, url, pages, candidates }) {
  let score = 20;
  const host = safeHost(url);
  const compactCompany = compact(company);
  if (compactCompany && compact(host).includes(compactCompany.slice(0, Math.min(8, compactCompany.length)))) score += 30;
  if ((candidates || [])[0]?.url === url) score += 15;
  if ((pages || []).some(page => page.summary?.length > 400)) score += 20;
  if ((pages || []).length > 1) score += 10;
  if (BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) score -= 50;
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function extractLinks(html, baseUrl) {
  const links = [];
  for (const match of String(html || "").matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    try {
      const href = decodeHtml(match[1]);
      if (!href || href.startsWith("#") || /^mailto:|^tel:/i.test(href)) continue;
      links.push(normalizeUrl(new URL(href, baseUrl).toString()));
    } catch {}
  }
  return unique(links.filter(Boolean));
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
    const host = safeHost(value);
    if (BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) return false;
    return !/duckduckgo|google|bing|yahoo|search/i.test(host);
  } catch {
    return false;
  }
}

function scoreOfficialCandidate(value, company) {
  const host = safeHost(value);
  const path = new URL(value).pathname;
  let score = 20;
  const compactHost = compact(host);
  const compactCompany = compact(company);
  if (compactCompany && compactHost.includes(compactCompany)) score += 55;
  if (compactCompany && compactHost.includes(compactCompany.slice(0, Math.min(8, compactCompany.length)))) score += 25;
  if (path === "/" || path === "") score += 10;
  if (/\b(blog|news|careers|jobs|support|docs)\b/i.test(path)) score -= 10;
  return score;
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

function safeHost(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function compact(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function truncate(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}...`;
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueByUrl(values) {
  const seen = new Set();
  return values.filter(item => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
