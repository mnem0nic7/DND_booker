import type {
  AgentRun,
  AgentScorecard,
  CritiqueBacklogItem,
  CreatorReport,
  DesignerUxNotes,
  EditorFinalReport,
  EngineeringApplyResult,
  EngineeringImprovement,
  EngineeringReport,
  ImprovementLoopInput,
} from '@dnd-booker/shared';

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function summarizeBacklog(backlog: CritiqueBacklogItem[]) {
  const grouped = new Map<string, number>();
  for (const item of backlog) {
    grouped.set(item.code, (grouped.get(item.code) ?? 0) + 1);
  }
  return [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code, count]) => `${code} (${count})`);
}

export function buildCreatorReport(input: {
  mode: CreatorReport['mode'];
  prompt: string | null;
  substantialContentDetected: boolean;
  linkedGenerationRunId: string | null;
  projectTitle: string;
}): CreatorReport {
  const notes = input.mode === 'generated_campaign'
    ? [
      `Started from the loop prompt and generated a fresh campaign scaffold for "${input.projectTitle}".`,
      input.linkedGenerationRunId ? `Tracked generation child run ${input.linkedGenerationRunId}.` : 'No linked generation run was recorded.',
    ]
    : [
      `Detected existing authored material in "${input.projectTitle}" and preserved it.`,
      'Creator stage synthesized planning context from the current project instead of reseeding the campaign.',
    ];

  return {
    mode: input.mode,
    summary: input.mode === 'generated_campaign'
      ? `Creator generated a campaign starting point for "${input.projectTitle}".`
      : `Creator synthesized planning context for the existing project "${input.projectTitle}".`,
    prompt: input.prompt,
    substantialContentDetected: input.substantialContentDetected,
    linkedGenerationRunId: input.linkedGenerationRunId,
    notes,
  };
}

export function buildDesignerUxNotes(input: {
  childAgentRun: AgentRun;
  scorecard: AgentScorecard | null;
  backlog: CritiqueBacklogItem[];
}): DesignerUxNotes {
  const scorecard = input.scorecard;
  const observations = uniqueStrings([
    scorecard ? `Latest autonomous score: ${scorecard.overallScore}/100.` : 'No scorecard was produced during the designer stage.',
    `Creative director cycles completed: ${input.childAgentRun.cycleCount}.`,
    `Export reviews executed: ${input.childAgentRun.exportCount}.`,
    input.backlog.length > 0 ? `Most common review signals: ${summarizeBacklog(input.backlog).join(', ')}.` : 'The designer stage ended without an actionable critique backlog.',
  ]);

  const frictionPoints = uniqueStrings([
    scorecard && scorecard.blockingFindingCount > 0
      ? `${scorecard.blockingFindingCount} blocking export issue(s) remained after the designer pass.`
      : '',
    scorecard && scorecard.thinRandomTableCount > 0
      ? 'Random table support remains thin in parts of the campaign.'
      : '',
    scorecard && scorecard.lowUtilityDensityCount > 0
      ? 'Some sections still lean too heavily on prose over table-ready DM utility.'
      : '',
    scorecard && scorecard.suspiciousStatBlockCount > 0
      ? 'Stat block confidence is still below the desired publication bar.'
      : '',
  ]);

  const recommendations = uniqueStrings([
    scorecard && scorecard.blockingFindingCount > 0
      ? 'Surface the highest-severity export findings more prominently before the final editor rating.'
      : 'Keep the current export-review summary visible through the whole loop.',
    input.backlog.some((item) => item.code === 'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT')
      ? 'Tighten preview/export parity diagnostics so layout drift is easier to act on without a manual export deep dive.'
      : 'Bundle the final scorecard and top backlog items into a single summary card for faster review.',
    'Show child generation and child agent lineage together so users can tell which stage changed the project.',
  ]);

  return {
    summary: frictionPoints.length > 0
      ? 'Designer pass improved the campaign package but still exposed product UX friction in how quality signals are surfaced.'
      : 'Designer pass completed cleanly and mostly highlighted presentation improvements for the product UI.',
    observations,
    frictionPoints,
    recommendations,
  };
}

export function buildEditorFinalReport(input: {
  scorecard: AgentScorecard | null;
  critiqueBacklog: CritiqueBacklogItem[];
  generationEvaluationCount: number;
  projectTitle: string;
}): EditorFinalReport {
  const score = input.scorecard?.overallScore ?? 62;
  const blocking = input.scorecard?.blockingFindingCount ?? input.critiqueBacklog.filter((item) => item.severity === 'error').length;
  const recommendation: EditorFinalReport['recommendation'] = blocking > 0
    ? 'blocked'
    : score >= 90
      ? 'ready'
      : 'needs_revision';

  const strengths = uniqueStrings([
    score >= 80 ? 'The package reached a strong DM-ready quality bar.' : '',
    input.generationEvaluationCount > 0 ? `The creator stage produced ${input.generationEvaluationCount} evaluation-backed artifact signal(s).` : '',
    input.scorecard?.thinRandomTableCount === 0 ? 'Random table coverage is no longer a primary weakness.' : '',
    input.scorecard?.suspiciousStatBlockCount === 0 ? 'No suspicious stat block findings remained in the final scorecard.' : '',
  ]);

  const issues = uniqueStrings([
    blocking > 0 ? `${blocking} blocking finding(s) remain before this project is publication-ready.` : '',
    input.scorecard && input.scorecard.lowUtilityDensityCount > 0 ? 'Some sections still need more encounter-facing utility density.' : '',
    input.scorecard && input.scorecard.sparsePageCount > 0 ? 'Several pages still read as underfilled in export review.' : '',
    input.critiqueBacklog.length > 0 ? `Top backlog signals: ${summarizeBacklog(input.critiqueBacklog).join(', ')}.` : '',
  ]);

  return {
    overallScore: score,
    recommendation,
    summary: recommendation === 'ready'
      ? `Editor review considers "${input.projectTitle}" ready for release.`
      : recommendation === 'blocked'
        ? `Editor review blocked release for "${input.projectTitle}" until the remaining critical issues are addressed.`
        : `Editor review recommends another revision pass for "${input.projectTitle}".`,
    strengths,
    issues,
    latestScorecard: input.scorecard,
    critiqueBacklog: input.critiqueBacklog,
  };
}

export function buildEngineeringReport(input: {
  loopInput: ImprovementLoopInput;
  editorFinalReport: EditorFinalReport;
  designerUxNotes: DesignerUxNotes | null;
  critiqueBacklog: CritiqueBacklogItem[];
  applyPathEligible: boolean;
}): EngineeringReport {
  const improvements: EngineeringImprovement[] = [];

  if (input.critiqueBacklog.some((item) => item.code.startsWith('EXPORT_TEXT_LAYOUT'))) {
    improvements.push({
      id: 'layout-parity-audit',
      title: 'Surface layout parity drift through the AI team dashboard',
      priority: 'high',
      rationale: 'The loop kept encountering export/layout drift signals, so the AI team surface should make preview/export parity problems easier to diagnose without dropping into editor-specific tooling.',
      affectedPaths: [
        'client/src/pages/AiTeamPage.tsx',
        'client/src/components/ai/ImprovementLoopPanel.tsx',
        'worker/src/jobs/export.job.ts',
        'shared/src/layout-runtime-v2.ts',
      ],
      proposedChanges: [
        'Promote parity drift counts into the AI team run UI before export.',
        'Persist stronger scope-level parity metadata so the engineer role can rank fixes without relying on editor context.',
      ],
      autoApplyEligible: false,
      deferredReason: 'Requires coordinated runtime changes beyond the safe report-file auto-apply boundary.',
    });
  }

  if (input.critiqueBacklog.some((item) => item.code === 'EXPORT_THIN_RANDOM_TABLE')) {
    improvements.push({
      id: 'table-density-feedback',
      title: 'Improve random-table expansion feedback loops',
      priority: 'medium',
      rationale: 'Repeated thin-table findings suggest the system should surface better authoring and repair guidance earlier.',
      affectedPaths: [
        'server/src/services/agent/random-table-expander.service.ts',
        'worker/src/jobs/agent-orchestrator.job.ts',
      ],
      proposedChanges: [
        'Expose stronger minimum-density thresholds before final review.',
        'Record which table repairs materially improved the scorecard.',
      ],
      autoApplyEligible: false,
      deferredReason: 'Needs coordinated service and runtime changes.',
    });
  }

  improvements.push({
    id: 'ai-team-dashboard-surface',
    title: 'Consolidate AI team reporting into a dashboard-first surface',
    priority: 'medium',
    rationale: 'The AI team produces creator, designer, editor, and engineer signals that should be easier to compare side by side without centering the WYSIWYG editor.',
    affectedPaths: [
      'client/src/pages/AiTeamPage.tsx',
      'client/src/stores/improvementLoopStore.ts',
      'shared/src/api/v1.ts',
    ],
    proposedChanges: [
      'Keep role lineage, final rating, and engineering follow-ups visible in the same dashboard.',
      'Retain report artifacts for later comparison across runs.',
    ],
    autoApplyEligible: false,
    deferredReason: 'Requires UI and API work beyond the safe report-file auto-apply boundary.',
  });

  if (input.applyPathEligible) {
    improvements.push({
      id: 'engineering-report-checkin',
      title: 'Check in the engineering report for follow-through',
      priority: 'low',
      rationale: 'Shipping the loop report into the bound repo creates a concrete change record and a draft PR for follow-up.',
      affectedPaths: ['docs/improvement-loops/<runId>.md'],
      proposedChanges: [
        'Create a repo-visible engineering report artifact on a dedicated branch.',
        'Open or update a draft PR so the follow-up work is actionable.',
      ],
      autoApplyEligible: true,
      deferredReason: null,
    });
  }

  const appliedCount = improvements.filter((item) => item.autoApplyEligible).length;
  const deferredCount = improvements.filter((item) => !item.autoApplyEligible).length;

  return {
    summary: input.editorFinalReport.recommendation === 'ready'
      ? 'Engineering report focused on product improvements revealed by a mostly successful creative loop.'
      : 'Engineering report focused on system improvements that would reduce the quality gaps exposed by this loop.',
    repoObservations: uniqueStrings([
      `Loop objective: ${input.loopInput.objective}`,
      `Final editor recommendation: ${input.editorFinalReport.recommendation}.`,
      input.designerUxNotes?.summary ?? '',
    ]),
    improvements,
    appliedCount,
    deferredCount,
  };
}

export function buildEngineeringApplyMarkdown(input: {
  projectTitle: string;
  report: EngineeringReport;
  editorFinalReport: EditorFinalReport;
  designerUxNotes: DesignerUxNotes | null;
  applyResult?: EngineeringApplyResult | null;
}): string {
  const lines = [
    `# Improvement Loop Engineering Report`,
    '',
    `Project: ${input.projectTitle}`,
    `Recommendation: ${input.editorFinalReport.recommendation}`,
    `Overall score: ${input.editorFinalReport.overallScore}`,
    '',
    '## Summary',
    input.report.summary,
    '',
    '## Editor Review',
    input.editorFinalReport.summary,
    '',
    '## Designer UX Notes',
    input.designerUxNotes?.summary ?? 'No designer UX notes were recorded.',
    '',
    '## Ranked Improvements',
  ];

  for (const improvement of input.report.improvements) {
    lines.push(`- [${improvement.priority.toUpperCase()}] ${improvement.title}`);
    lines.push(`  - Rationale: ${improvement.rationale}`);
    lines.push(`  - Affected paths: ${improvement.affectedPaths.join(', ') || 'n/a'}`);
    lines.push(`  - Proposed changes: ${improvement.proposedChanges.join('; ') || 'n/a'}`);
    if (improvement.deferredReason) {
      lines.push(`  - Deferred: ${improvement.deferredReason}`);
    }
  }

  if (input.applyResult) {
    lines.push('', '## Apply Result', input.applyResult.message);
  }

  return lines.join('\n');
}
