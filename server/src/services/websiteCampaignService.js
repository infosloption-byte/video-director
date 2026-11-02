// Convert one user-selected website video concept into the existing
// persisted research graph. No independent validation of business claims.
const text = (value, limit = 500) =>
  String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

export function buildWebsiteBrief(report, idea) {
  if (!report || !idea || !Array.isArray(report.pages)) {
    throw new Error("A completed website report and video concept are required.");
  }
  const scanned = new Map(report.pages.filter(p => p?.url).map(p => [p.url, p]));
  const urls = [...new Set((idea.evidenceUrls || []).filter(url => scanned.has(url)))].slice(0, 10);
  if (!urls.length) throw new Error("The chosen video concept has no readable website sources.");
  const selected = urls.map(url => scanned.get(url));
  const sources = selected.map((page, index) => ({
    index, url: page.url, title: page.title || page.headings?.[0] || report.name,
    source_class: "primary", source_reliability: "general_web",
    read_status: "read",
    read_excerpt: text(page.textPreview || page.description || page.highlights?.[0], 2400),
  }));
  const evidence_preview = selected.map((page, index) => ({
    source_index: index,
    excerpt: text(page.description || page.highlights?.[0] || page.textPreview, 500),
    locator: "Public business website page",
    evidence_type: "website_statement",
  })).filter(row => row.excerpt.length > 10);
  const key_findings = evidence_preview.map(row => ({
    claim: row.excerpt, evidence: row.excerpt,
    evidence_level: "business_published", confidence: 55,
    source_indexes: [row.source_index],
  }));
  const campaign = {
    type: "website_marketing",
    analysisUrl: report.url,
    brandName: report.name,
    ideaId: idea.id,
    ideaTitle: idea.title,
    angle: idea.angle,
    hook: idea.hook || "",
    focus: idea.focus || "",
    audience: idea.audience || "",
    cta: idea.cta || "",
    sourceUrls: urls,
    sourceFacts: (idea.sourceFacts || []).filter(fact => urls.includes(fact.url)).slice(0, 5),
    evidenceClassification: "business_published_not_independently_verified",
  };
  return {
    executive_summary: [
      "Business: " + text(report.name, 140),
      text(report.summary || report.description, 800),
      "Selected marketing video: " + text(idea.title, 135),
      "Creative direction: " + text(idea.angle, 350),
      "Specific product or service focus: " + text(idea.focus, 120),
      "Audience: " + text(idea.audience, 120),
      "Suggested hook (creative proposal, not a fact): " + text(idea.hook, 200),
      "Suggested CTA: " + text(idea.cta, 140),
      "Use only the source pages linked to this concept. Treat all website claims as business-published, not independently verified.",
      "Never invent performance metrics, benefits, testimonials, offers, scarcity, price, or guarantees.",
    ].filter(Boolean).join("\n\n"),
    sources, evidence_preview,
    key_findings,
    key_facts: key_findings.map(f => f.claim),
    verification: { claims: key_findings.map((claim, index) => ({
      claim: claim.claim, verification_status: "website_sourced",
      traceable: true,
      source_indexes: claim.source_indexes, evidence_indexes: [index],
      verified_confidence: 55, evidence_level: "business_published",
      verification_notes: "A statement from a public business website; independently unverified.",
    })) },
    research_plan: [{ name: "Source-linked business website video", scope: report.url }],
    websiteMarketing: campaign,
  };
}
