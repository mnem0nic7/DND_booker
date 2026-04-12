import { describe, expect, it } from 'vitest';
import type { AgentRun, AgentScorecard, CritiqueBacklogItem } from '@dnd-booker/shared';
import {
  buildDesignerUxNotes,
  buildEditorFinalReport,
  buildEngineeringApplyMarkdown,
  buildEngineeringReport,
} from '../services/improvement-loop/report.service.js';

const FIXTURE_SCORECARD: AgentScorecard = {
  overallScore: 84,
  exportScore: 86,
  blockingFindingCount: 0,
  warningFindingCount: 2,
  utilityDensityAverage: 0.74,
  sparsePageCount: 1,
  lowUtilityDensityCount: 1,
  thinRandomTableCount: 1,
  suspiciousStatBlockCount: 0,
  generatedAt: new Date().toISOString(),
  summary: 'The campaign is close, but still needs another pass on utility density and table support.',
  latestExportJobId: null,
};

const FIXTURE_BACKLOG: CritiqueBacklogItem[] = [
  {
    id: 'backlog-1',
    code: 'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
    severity: 'warning',
    title: 'Preview/export page counts drift',
    detail: 'Preview and export page counts no longer match.',
    priority: 90,
    targetTitle: 'Chapter 1',
    page: 2,
  },
  {
    id: 'backlog-2',
    code: 'EXPORT_THIN_RANDOM_TABLE',
    severity: 'warning',
    title: 'Random tables remain thin',
    detail: 'A few tables still need denser outcomes.',
    priority: 60,
    targetTitle: 'Appendix A',
    page: 11,
  },
];

const FIXTURE_AGENT_RUN: AgentRun = {
  id: 'agent-run-1',
  projectId: 'project-1',
  userId: 'user-1',
  linkedGenerationRunId: null,
  mode: 'persistent_editor',
  status: 'completed',
  currentStage: null,
  progressPercent: 100,
  goal: {
    objective: 'Improve the project.',
    successDefinition: 'Deliver a DM-ready campaign.',
    prompt: 'Strengthen the campaign.',
    targetFormat: 'pdf',
    primaryObjective: 'dm_ready_quality',
    modeIntent: 'persistent_editor',
    generationMode: 'campaign',
    generationQuality: 'polished',
    pageTarget: null,
  },
  budget: {
    maxCycles: 6,
    maxExports: 6,
    maxImagePassesPerDocument: 1,
    maxNoImprovementStreak: 2,
    maxDurationMs: 60_000,
  },
  cycleCount: 4,
  exportCount: 3,
  latestScorecard: FIXTURE_SCORECARD,
  critiqueBacklog: FIXTURE_BACKLOG,
  designProfile: null,
  bestCheckpointId: null,
  latestCheckpointId: null,
  currentStrategy: 'Focus on layout and utility density.',
  noImprovementStreak: 0,
  failureReason: null,
  graphThreadId: null,
  graphCheckpointKey: null,
  graphStateJson: null,
  resumeToken: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
};

describe('Improvement loop report service', () => {
  it('builds designer notes, editor report, and engineering report from loop telemetry', () => {
    const designerNotes = buildDesignerUxNotes({
      childAgentRun: FIXTURE_AGENT_RUN,
      scorecard: FIXTURE_SCORECARD,
      backlog: FIXTURE_BACKLOG,
    });

    expect(designerNotes.summary).toContain('Designer pass');
    expect(designerNotes.observations.some((value) => value.includes('Latest autonomous score: 84/100.'))).toBe(true);
    expect(designerNotes.frictionPoints.some((value) => value.includes('DM utility'))).toBe(true);

    const editorReport = buildEditorFinalReport({
      scorecard: FIXTURE_SCORECARD,
      critiqueBacklog: FIXTURE_BACKLOG,
      generationEvaluationCount: 2,
      projectTitle: 'Ashes of the Hollow Crown',
    });

    expect(editorReport.overallScore).toBe(84);
    expect(editorReport.recommendation).toBe('needs_revision');
    expect(editorReport.summary).toContain('another revision pass');

    const engineeringReport = buildEngineeringReport({
      loopInput: {
        mode: 'current_project',
        prompt: 'Strengthen the campaign.',
        objective: 'Run the full improvement loop.',
        projectTitle: null,
        generationMode: 'campaign',
        generationQuality: 'polished',
        agentMode: 'persistent_editor',
      },
      editorFinalReport: editorReport,
      designerUxNotes: designerNotes,
      critiqueBacklog: FIXTURE_BACKLOG,
      applyPathEligible: true,
    });

    expect(engineeringReport.improvements.some((item) => item.id === 'layout-parity-audit')).toBe(true);
    expect(engineeringReport.improvements.some((item) => item.id === 'table-density-feedback')).toBe(true);
    expect(engineeringReport.improvements.some((item) => item.autoApplyEligible)).toBe(true);

    const markdown = buildEngineeringApplyMarkdown({
      projectTitle: 'Ashes of the Hollow Crown',
      report: engineeringReport,
      editorFinalReport: editorReport,
      designerUxNotes: designerNotes,
      applyResult: {
        status: 'applied',
        message: 'Applied the report.',
        branchName: 'improvement-loop/run-1',
        baseBranch: 'main',
        headSha: 'abc123',
        pullRequestNumber: 42,
        pullRequestUrl: 'https://github.com/openai/dnd-booker/pull/42',
        appliedPaths: ['docs/improvement-loops/run-1.md'],
        deferredPaths: ['client/src/components/ai'],
      },
    });

    expect(markdown).toContain('Improvement Loop Engineering Report');
    expect(markdown).toContain('Ashes of the Hollow Crown');
    expect(markdown).toContain('Applied the report.');
  });
});
