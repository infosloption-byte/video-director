// A single schema-aligned payload builder used by the live website-to-video
// endpoint and the rollback-only Prisma smoke check. Nested signal.create
// requires Prisma's *checked* ProjectCreateInput, so other relations must
// use nested connect; passing pipelineVersionId here causes a runtime 500.
export function buildWebsiteVideoProjectData({ id, userId, report, idea, brief, pipelineVersionId }) {
  if (!id || !userId || !pipelineVersionId) {
    throw new Error("Project, user and pipeline identifiers are required.");
  }
  if (!report?.url || !report?.name || !idea?.id || !brief?.executive_summary) {
    throw new Error("A sourced website campaign brief is required.");
  }
  return {
    id,
    userId,
    title: (report.name + " — " + idea.title).slice(0, 250),
    signal: { create: {
      origin: "search",
      sourceType: "brave",
      sourceReliability: "general_web",
      category: "WEBSITE_MARKETING",
      title: report.name.slice(0, 255),
      description: idea.angle,
      sourceUrl: report.url,
      sourceName: new URL(report.url).hostname,
      whyReasoning: "Created from bounded website research and selected video concept.",
      status: "used",
    } },
    status: "setup",
    pipelineVersion: { connect: { id: pipelineVersionId } },
    researchSummary: brief.executive_summary,
    researchSources: brief,
    suggestedFramework: "EXPLAINER",
    suggestedLengthSeconds: idea.durationSeconds,
    suggestedTone: "Conversational",
  };
}
