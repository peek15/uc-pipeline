const PDF_TEXT_MARKERS = [
  /\(([^()]{8,500})\)\s*Tj/g,
  /\(([^()]{8,500})\)\s*'/g,
  /\(([^()]{8,500})\)\s*"/g,
  /\[((?:\([^()]{1,300}\)\s*){1,80})\]\s*TJ/g,
];

export async function extractFileTextForOnboarding(file) {
  const name = file?.name || "";
  const mime = file?.type || "";
  const isText = mime.startsWith("text/") || /\.(md|txt)$/i.test(name);
  const isPdf = /\.pdf$/i.test(name) || mime === "application/pdf";
  const isImage = mime.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(name);

  if (isText) {
    const text = await file.text();
    return {
      text,
      status: "parsed",
      note: "Text parsed for V1 source-aware analysis.",
      extraction_method: "text",
      ocr_status: "not_required",
      confidence: text.trim().length > 120 ? "high" : "medium",
    };
  }

  if (isPdf) {
    const raw = await file.text().catch(() => "");
    const text = extractPdfText(raw);
    if (text.length > 80) {
      return {
        text,
        status: "parsed",
        note: "PDF text was extracted with lightweight V1 parsing. Review important facts before approval.",
        extraction_method: "pdf-light",
        ocr_status: "pdf_text_extracted",
        confidence: text.length > 1200 ? "medium" : "low",
      };
    }
    return {
      text: "",
      status: "pending analysis",
      note: "Stored as a source record. This PDF did not expose readable text to the lightweight parser.",
      extraction_method: "pdf-light-failed",
      ocr_status: "requires_ocr",
      confidence: "low",
    };
  }

  if (isImage) {
    const imageBase64 = file.size <= 6 * 1024 * 1024
      ? await readFileAsDataUrl(file).catch(() => "")
      : "";
    return {
      image_base64: imageBase64,
      text: "",
      status: "pending analysis",
      note: imageBase64
        ? "Stored as a source record. OCR can run server-side if a vision provider is configured."
        : "Stored as a source record. This image is too large for inline OCR handoff; paste key text or upload a smaller file.",
      extraction_method: "none",
      ocr_status: "requires_ocr",
      confidence: "low",
    };
  }

  return {
    text: "",
    status: "unsupported",
    note: "Stored, but this file type is not parsed in V1.",
    extraction_method: "none",
    ocr_status: "not_available",
    confidence: "low",
  };
}

export function analyzeDocumentText(text = "") {
  const clean = normalizeText(text);
  return {
    summary: summarize(clean),
    evidence_snippets: extractDocumentEvidence(clean),
    word_count: clean.split(/\s+/).filter(Boolean).length,
    confidence: clean.length > 1200 ? "high" : clean.length > 240 ? "medium" : clean.length ? "low" : "low",
  };
}

export function extractPdfText(raw = "") {
  const text = String(raw || "");
  if (!text) return "";
  const chunks = [];
  for (const marker of PDF_TEXT_MARKERS) {
    for (const match of text.matchAll(marker)) {
      if (match[1]) chunks.push(decodePdfString(match[1]));
    }
  }
  const streamText = [...text.matchAll(/stream\s*([\s\S]{40,4000}?)\s*endstream/g)]
    .map(match => decodePdfString(match[1]))
    .join(" ");
  return normalizeText([...chunks, streamText].join(" "));
}

function extractDocumentEvidence(text) {
  const keywords = ["we help", "service", "product", "solution", "customer", "client", "audience", "offer", "mission", "claim", "guarantee", "platform"];
  const snippets = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)) {
    const lower = sentence.toLowerCase();
    if (sentence.length > 40 && sentence.length < 280 && keywords.some(keyword => lower.includes(keyword))) {
      snippets.push(sentence);
    }
    if (snippets.length >= 8) break;
  }
  return snippets;
}

function summarize(text) {
  if (!text) return "No analyzable text was provided.";
  return text.slice(0, 900);
}

function decodePdfString(value) {
  return String(value || "")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => {
      try { return String.fromCharCode(parseInt(octal, 8)); } catch { return ""; }
    });
}

function normalizeText(value) {
  return String(value || "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
