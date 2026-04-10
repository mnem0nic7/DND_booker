import { z } from 'zod';
import {
  CanonicalTypstNodeSchema,
  EditorProjectionSchema,
  PublicationDocumentPatchSchema,
  PublicationDocumentSchema,
} from '../publication-document.js';
import { LayoutDocumentV2Schema } from '../layout-runtime-v2.js';

export const ApiProblemSchema = z.object({
  type: z.string().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.record(z.unknown()).optional(),
});

export type ApiProblem = z.infer<typeof ApiProblemSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ApiUser = z.infer<typeof UserSchema>;

export const AuthLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
});

export const AuthSessionResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string().min(1),
});

export const AuthLogoutResponseSchema = z.object({
  message: z.string().min(1),
});

export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>;
export type AuthRegisterRequest = z.infer<typeof AuthRegisterRequestSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
export type AuthLogoutResponse = z.infer<typeof AuthLogoutResponseSchema>;

export const ProjectTypeSchema = z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']);
export const ProjectStatusSchema = z.enum(['draft', 'in_progress', 'review', 'published']);
export const ProjectPageSizeSchema = z.enum(['letter', 'a4', 'a5']);
export const ProjectColumnsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const ProjectMarginsSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});
export const ProjectFontsSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
});
export const TextLayoutFallbackConfigSchema = z.object({
  scopeIds: z.array(z.string().regex(/^(group|unit):.+$/)).max(64),
}).strip();
export const ProjectSettingsSchema = z.object({
  pageSize: ProjectPageSizeSchema,
  margins: ProjectMarginsSchema,
  columns: ProjectColumnsSchema,
  theme: z.string().min(1),
  fonts: ProjectFontsSchema,
  textLayoutFallbacks: z.record(z.string().uuid(), TextLayoutFallbackConfigSchema),
});
export const RichTextContentSchema = z.object({
  type: z.string().max(50),
  content: z.array(z.any()).optional(),
  attrs: z.record(z.unknown()).optional(),
}).refine(
  (val) => JSON.stringify(val).length <= 5_000_000,
  { message: 'Content exceeds 5 MB limit' },
);
export const ProjectSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string(),
  type: ProjectTypeSchema,
  status: ProjectStatusSchema,
  coverImageUrl: z.string().nullable(),
  settings: ProjectSettingsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const ProjectDetailSchema = ProjectSummarySchema.extend({
  content: RichTextContentSchema.optional(),
});
export const ProjectCreateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: ProjectTypeSchema.optional(),
  templateId: z.string().uuid().optional(),
});
export const ProjectSettingsPatchSchema = z.object({
  pageSize: ProjectPageSizeSchema.optional(),
  margins: ProjectMarginsSchema.partial().optional(),
  columns: ProjectColumnsSchema.optional(),
  theme: z.enum([
    'classic-parchment',
    'gilded-folio',
    'dark-tome',
    'clean-modern',
    'fey-wild',
    'infernal',
    'dmguild',
  ]).optional(),
  fonts: ProjectFontsSchema.partial().optional(),
  textLayoutFallbacks: z.record(z.string().uuid(), TextLayoutFallbackConfigSchema).optional(),
}).strip();
export const ProjectUpdateRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  type: ProjectTypeSchema.optional(),
  status: ProjectStatusSchema.optional(),
  settings: ProjectSettingsPatchSchema.optional(),
  content: EditorProjectionSchema.optional(),
}).refine(
  (value) =>
    value.title !== undefined
    || value.description !== undefined
    || value.type !== undefined
    || value.status !== undefined
    || value.settings !== undefined
    || value.content !== undefined,
  { message: 'At least one field must be provided.' },
);

export const LayoutPlanBlockSchema = z.object({
  nodeId: z.string().min(1),
  presentationOrder: z.number().int(),
  span: z.enum(['column', 'both_columns', 'full_page']),
  placement: z.enum(['inline', 'hero_top', 'side_panel', 'bottom_panel', 'full_page_insert']),
  groupId: z.string().min(1).nullable(),
  keepTogether: z.boolean(),
  allowWrapBelow: z.boolean(),
});
export const LayoutPlanSchema = z.object({
  version: z.literal(1),
  sectionRecipe: z.enum([
    'chapter_hero_split',
    'intro_split_spread',
    'npc_roster_grid',
    'encounter_packet_spread',
    'utility_table_spread',
    'full_page_insert',
  ]).nullable(),
  columnBalanceTarget: z.enum(['balanced', 'dense_left', 'dense_right']),
  blocks: z.array(LayoutPlanBlockSchema),
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequestSchema>;
export type ProjectUpdateRequest = z.infer<typeof ProjectUpdateRequestSchema>;
export type DocumentLayout = z.infer<typeof LayoutPlanSchema>;

export const GenerationModeSchema = z.enum(['one_shot', 'module', 'campaign', 'sourcebook']);
export const GenerationQualitySchema = z.enum(['quick', 'polished']);
export const RunStatusSchema = z.enum([
  'queued',
  'planning',
  'generating_assets',
  'generating_prose',
  'evaluating',
  'revising',
  'assembling',
  'completed',
  'failed',
  'paused',
  'cancelled',
]);

export const GenerationConstraintsSchema = z.object({
  tone: z.string().optional(),
  levelRange: z.string().optional(),
  settingPreference: z.string().optional(),
  includeHandouts: z.boolean().optional(),
  includeMaps: z.boolean().optional(),
  strict5e: z.boolean().optional(),
});

export const GraphStateSchema = z.record(z.unknown());
export const GraphInterruptRunTypeSchema = z.enum(['generation', 'agent']);
export const GraphInterruptStatusSchema = z.enum(['pending', 'approved', 'edited', 'rejected']);
export const GraphInterruptResolutionActionSchema = z.enum(['approve', 'edit', 'reject']);

export const V1CreateGenerationRunRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  mode: GenerationModeSchema.optional(),
  quality: GenerationQualitySchema.optional(),
  pageTarget: z.number().int().min(1).max(500).optional(),
  constraints: GenerationConstraintsSchema.optional(),
});

export const V1GenerationRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  mode: GenerationModeSchema,
  quality: GenerationQualitySchema,
  status: RunStatusSchema,
  currentStage: z.string().nullable(),
  inputPrompt: z.string(),
  inputParameters: GenerationConstraintsSchema.nullable(),
  progressPercent: z.number().int().min(0).max(100),
  estimatedPages: z.number().int().nullable(),
  estimatedTokens: z.number().int().nullable(),
  estimatedCost: z.number().nullable(),
  actualTokens: z.number().int(),
  actualCost: z.number(),
  failureReason: z.string().nullable(),
  graphThreadId: z.string().nullable().optional(),
  graphCheckpointKey: z.string().nullable().optional(),
  graphStateJson: GraphStateSchema.nullable().optional(),
  resumeToken: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export const V1GenerationTaskSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable(),
  taskType: z.string(),
  artifactType: z.string().nullable(),
  artifactKey: z.string().nullable(),
  status: z.string(),
  priority: z.number().int(),
  attemptCount: z.number().int(),
  maxAttempts: z.number().int(),
  dependsOn: z.array(z.string()),
  inputPayload: z.unknown().nullable(),
  resultPayload: z.unknown().nullable(),
  errorMessage: z.string().nullable(),
  tokenCount: z.number().int().nullable(),
  costEstimate: z.number().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const V1GeneratedArtifactSchema = z.object({
  id: z.string(),
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceTaskId: z.string().uuid().nullable(),
  artifactType: z.string(),
  artifactKey: z.string(),
  parentArtifactId: z.string().uuid().nullable(),
  status: z.string(),
  version: z.number().int(),
  title: z.string(),
  summary: z.string().nullable(),
  jsonContent: z.unknown().nullable(),
  markdownContent: z.string().nullable(),
  tiptapContent: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  pageEstimate: z.number().int().nullable(),
  tokenCount: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const V1EvaluationFindingSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'informational']),
  code: z.string(),
  message: z.string(),
  affectedScope: z.string(),
  suggestedFix: z.string().optional(),
});

export const ArtifactEvaluationSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string(),
  artifactVersion: z.number().int(),
  evaluationType: z.string(),
  overallScore: z.number(),
  structuralCompleteness: z.number().nullable(),
  continuityScore: z.number().nullable(),
  dndSanity: z.number().nullable(),
  editorialQuality: z.number().nullable(),
  publicationFit: z.number().nullable(),
  passed: z.boolean(),
  findings: z.array(V1EvaluationFindingSchema),
  recommendedActions: z.array(z.string()).nullable(),
  evaluatorModel: z.string().nullable(),
  tokenCount: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});

export const V1GeneratedArtifactDetailSchema = V1GeneratedArtifactSchema.extend({
  evaluations: z.array(ArtifactEvaluationSchema).optional(),
});

export const CanonEntitySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
  entityType: z.enum(['npc', 'location', 'faction', 'item', 'quest', 'monster', 'encounter']),
  slug: z.string(),
  canonicalName: z.string(),
  aliases: z.array(z.string()),
  canonicalData: z.unknown(),
  summary: z.string(),
  sourceArtifactId: z.string().uuid().nullable(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AssemblyDocumentSpecSchema = z.object({
  documentSlug: z.string(),
  title: z.string(),
  kind: z.enum(['front_matter', 'chapter', 'appendix', 'back_matter']),
  artifactKeys: z.array(z.string()),
  sortOrder: z.number().int(),
  targetPageCount: z.number().int().optional(),
});

export const AssemblyManifestSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  version: z.number().int(),
  documents: z.array(AssemblyDocumentSpecSchema),
  assemblyRules: z.unknown().nullable(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const V1GenerationRunDetailSchema = V1GenerationRunSchema.extend({
  taskCount: z.number().int(),
  artifactCount: z.number().int(),
  latestExportReview: z.unknown().nullable(),
});

export type V1CreateGenerationRunRequest = z.infer<typeof V1CreateGenerationRunRequestSchema>;
export type V1GenerationRun = z.infer<typeof V1GenerationRunSchema>;
export type V1GenerationRunDetail = z.infer<typeof V1GenerationRunDetailSchema>;
export type V1GenerationTask = z.infer<typeof V1GenerationTaskSchema>;
export type V1GeneratedArtifact = z.infer<typeof V1GeneratedArtifactSchema>;
export type V1GeneratedArtifactDetail = z.infer<typeof V1GeneratedArtifactDetailSchema>;
export type ArtifactEvaluation = z.infer<typeof ArtifactEvaluationSchema>;
export type CanonEntity = z.infer<typeof CanonEntitySchema>;
export type AssemblyManifest = z.infer<typeof AssemblyManifestSchema>;

export const AgentRunModeSchema = z.enum(['background_producer', 'persistent_editor']);
export const AgentRunStatusSchema = z.enum([
  'queued',
  'seeding',
  'observing',
  'planning',
  'acting',
  'evaluating',
  'checkpointing',
  'completed',
  'failed',
  'paused',
  'cancelled',
]);

export const AgentBudgetSchema = z.object({
  maxCycles: z.number().int().min(1).max(20),
  maxExports: z.number().int().min(1).max(30),
  maxImagePassesPerDocument: z.number().int().min(0).max(10),
  maxNoImprovementStreak: z.number().int().min(1).max(10),
  maxDurationMs: z.number().int().min(30_000).max(4 * 60 * 60 * 1000),
});

export const AgentGoalSchema = z.object({
  objective: z.string(),
  successDefinition: z.string(),
  prompt: z.string().nullable(),
  targetFormat: z.literal('pdf'),
  primaryObjective: z.literal('dm_ready_quality'),
  modeIntent: AgentRunModeSchema,
  generationMode: GenerationModeSchema,
  generationQuality: GenerationQualitySchema,
  pageTarget: z.number().int().nullable(),
});

export const DesignReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(['layout', 'content', 'art', 'usability']),
  insight: z.string(),
  sourceLabel: z.string(),
  sourcePath: z.string().nullable(),
});

export const DesignConstraintSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['required', 'preferred']),
});

export const DesignProfileSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  references: z.array(DesignReferenceSchema),
  constraints: z.array(DesignConstraintSchema),
  houseStyle: z.object({
    openerStyle: z.string(),
    utilityBias: z.string(),
    artPolicy: z.string(),
    frontMatterPolicy: z.string(),
  }),
});

export const CritiqueBacklogItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  priority: z.number(),
  targetTitle: z.string().nullable(),
  page: z.number().int().nullable(),
});

export const AgentScorecardSchema = z.object({
  overallScore: z.number(),
  exportScore: z.number().nullable(),
  blockingFindingCount: z.number().int(),
  warningFindingCount: z.number().int(),
  utilityDensityAverage: z.number().nullable(),
  sparsePageCount: z.number().int(),
  thinRandomTableCount: z.number().int(),
  lowUtilityDensityCount: z.number().int(),
  suspiciousStatBlockCount: z.number().int(),
  generatedAt: z.string().datetime(),
  summary: z.string(),
  latestExportJobId: z.string().uuid().nullable(),
});

export const V1CreateAgentRunRequestSchema = z.object({
  mode: AgentRunModeSchema.optional(),
  objective: z.string().min(1).max(5000).optional(),
  prompt: z.string().min(1).max(5000).optional(),
  generationMode: GenerationModeSchema.optional(),
  generationQuality: GenerationQualitySchema.optional(),
  pageTarget: z.number().int().min(1).max(500).optional(),
  budget: AgentBudgetSchema.partial().optional(),
});

export const V1AgentRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  linkedGenerationRunId: z.string().uuid().nullable(),
  mode: AgentRunModeSchema,
  status: AgentRunStatusSchema,
  currentStage: z.string().nullable(),
  progressPercent: z.number().int().min(0).max(100),
  goal: AgentGoalSchema,
  budget: AgentBudgetSchema,
  critiqueBacklog: z.array(CritiqueBacklogItemSchema),
  latestScorecard: AgentScorecardSchema.nullable(),
  designProfile: DesignProfileSchema.nullable(),
  bestCheckpointId: z.string().uuid().nullable(),
  latestCheckpointId: z.string().uuid().nullable(),
  currentStrategy: z.string().nullable(),
  cycleCount: z.number().int(),
  exportCount: z.number().int(),
  noImprovementStreak: z.number().int(),
  failureReason: z.string().nullable(),
  graphThreadId: z.string().nullable().optional(),
  graphCheckpointKey: z.string().nullable().optional(),
  graphStateJson: GraphStateSchema.nullable().optional(),
  resumeToken: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export const V1AgentRunSummarySchema = z.object({
  id: z.string().uuid(),
  mode: AgentRunModeSchema,
  status: AgentRunStatusSchema,
  currentStage: z.string().nullable(),
  progressPercent: z.number().int().min(0).max(100),
  currentStrategy: z.string().nullable(),
  cycleCount: z.number().int(),
  exportCount: z.number().int(),
  graphThreadId: z.string().nullable().optional(),
  graphCheckpointKey: z.string().nullable().optional(),
  graphStateJson: GraphStateSchema.nullable().optional(),
  resumeToken: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const V1AgentRunDetailSchema = V1AgentRunSchema.extend({
  checkpointCount: z.number().int(),
  actionCount: z.number().int(),
});

export const AgentCheckpointSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  label: z.string(),
  summary: z.string().nullable(),
  cycleIndex: z.number().int(),
  isBest: z.boolean(),
  scorecard: AgentScorecardSchema.nullable(),
  createdAt: z.string().datetime(),
});

export const AgentActionSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  cycleIndex: z.number().int(),
  actionType: z.string(),
  status: z.string(),
  rationale: z.string().nullable(),
  input: z.unknown().nullable(),
  result: z.unknown().nullable(),
  scoreDelta: z.number().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type V1CreateAgentRunRequest = z.infer<typeof V1CreateAgentRunRequestSchema>;
export type V1AgentRun = z.infer<typeof V1AgentRunSchema>;
export type V1AgentRunSummary = z.infer<typeof V1AgentRunSummarySchema>;
export type V1AgentRunDetail = z.infer<typeof V1AgentRunDetailSchema>;
export type AgentCheckpoint = z.infer<typeof AgentCheckpointSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const GraphInterruptSchema = z.object({
  id: z.string().uuid(),
  runType: GraphInterruptRunTypeSchema,
  runId: z.string().uuid(),
  kind: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  status: GraphInterruptStatusSchema,
  payload: z.unknown(),
  resolutionPayload: z.unknown().nullable().optional(),
  resolvedByUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});

export const GraphInterruptResolutionRequestSchema = z.object({
  action: GraphInterruptResolutionActionSchema,
  payload: z.unknown().optional(),
});

export const AgentConfigSchema = z.object({
  agentKey: z.string().min(1),
  provider: z.enum(['openai', 'google', 'anthropic', 'ollama']),
  model: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
});

export type GraphInterrupt = z.infer<typeof GraphInterruptSchema>;
export type GraphInterruptStatus = z.infer<typeof GraphInterruptStatusSchema>;
export type GraphInterruptResolutionAction = z.infer<typeof GraphInterruptResolutionActionSchema>;
export type GraphInterruptResolutionRequest = z.infer<typeof GraphInterruptResolutionRequestSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const V1PublicationDocumentSummarySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  kind: z.enum(['front_matter', 'chapter', 'appendix', 'back_matter']),
  title: z.string(),
  slug: z.string(),
  sortOrder: z.number().int(),
  targetPageCount: z.number().int().nullable(),
  layoutPlan: LayoutPlanSchema.nullable().optional(),
  status: z.string(),
  sourceArtifactId: z.string().uuid().nullable(),
  layoutSnapshotJson: LayoutDocumentV2Schema.nullable().optional(),
  layoutEngineVersion: z.number().int().positive().nullable().optional(),
  layoutSnapshotUpdatedAt: z.string().datetime().nullable().optional(),
  canonicalVersion: z.number().int(),
  editorProjectionVersion: z.number().int(),
  typstVersion: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const V1PublicationDocumentSchema = PublicationDocumentSchema.extend({
  layoutPlan: LayoutPlanSchema.nullable().optional(),
});
export const V1PublicationDocumentPatchSchema = PublicationDocumentPatchSchema;
export const V1CanonicalTypstNodeSchema = CanonicalTypstNodeSchema;
export const V1EditorProjectionSchema = EditorProjectionSchema;
export const PublicationDocumentSummarySchema = V1PublicationDocumentSummarySchema;
export const PublicationDocumentTypstSchema = z.object({
  documentId: z.string().uuid(),
  typstSource: z.string(),
  typstVersion: z.number().int(),
  updatedAt: z.string().datetime(),
});

export const ExportFormatSchema = z.enum(['pdf', 'epub', 'print_pdf']);
export const ExportStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed']);
export const ExportReviewStatusSchema = z.enum(['passed', 'needs_attention', 'unavailable']);
export const ExportReviewSeveritySchema = z.enum(['info', 'warning', 'error']);
export const ExportReviewCodeSchema = z.enum([
  'EXPORT_CHAPTER_OPENER_LOW',
  'EXPORT_SECTION_TITLE_WRAP',
  'EXPORT_LAST_PAGE_UNDERFILLED',
  'EXPORT_UNUSED_PAGE_REGION',
  'EXPORT_MISSED_ART_OPPORTUNITY',
  'EXPORT_WEAK_HERO_PLACEMENT',
  'EXPORT_SPLIT_SCENE_PACKET',
  'EXPORT_UNBALANCED_COLUMNS',
  'EXPORT_MARGIN_COLLISION',
  'EXPORT_FOOTER_COLLISION',
  'EXPORT_ORPHAN_TAIL_PARAGRAPH',
  'EXPORT_EMPTY_ENCOUNTER_TABLE',
  'EXPORT_INCOMPLETE_ENCOUNTER_PACKET',
  'EXPORT_EMPTY_RANDOM_TABLE',
  'EXPORT_THIN_RANDOM_TABLE',
  'EXPORT_PLACEHOLDER_STAT_BLOCK',
  'EXPORT_INCOMPLETE_STAT_BLOCK',
  'EXPORT_SUSPICIOUS_STAT_BLOCK',
  'EXPORT_OVERSIZED_DISPLAY_HEADING',
  'EXPORT_LOW_UTILITY_DENSITY',
  'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
  'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
  'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
  'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
  'EXPORT_REVIEW_UNAVAILABLE',
]);
export const ExportReviewAutoFixSchema = z.enum([
  'shrink_h1_headings',
  'dedicated_end_page',
  'dedicated_chapter_openers',
  'refresh_layout_plan',
]);
export const ExportReviewSafeFixActionSchema = z.enum([
  'remove_empty_encounter_tables',
  'remove_empty_random_tables',
  'remove_placeholder_stat_blocks',
  'demote_oversized_display_headings',
  'generate_spot_art',
  'normalize_page_breaks',
  'configure_text_layout_fallbacks',
  'refresh_layout_plan',
]);
export const ExportReviewTextLayoutParityMetricsSchema = z.object({
  mode: z.enum(['legacy', 'shadow', 'pretext']),
  legacyPageCount: z.number().int(),
  enginePageCount: z.number().int(),
  supportedUnitCount: z.number().int(),
  unsupportedUnitCount: z.number().int(),
  totalHeightDeltaPx: z.number(),
  driftScopeIds: z.array(z.string()),
  unsupportedScopeIds: z.array(z.string()),
});
export const ExportSectionReviewMetricSchema = z.object({
  title: z.string(),
  kind: z.enum(['front_matter', 'chapter', 'appendix', 'back_matter']).nullable(),
  page: z.number().int().nullable(),
  topRatio: z.number().nullable(),
  lineCount: z.number().int().nullable(),
  hyphenated: z.boolean(),
});
export const ExportUtilityReviewMetricSchema = z.object({
  title: z.string(),
  kind: z.enum(['front_matter', 'chapter', 'appendix', 'back_matter']).nullable(),
  utilityBlockCount: z.number().int(),
  referenceBlockCount: z.number().int(),
  proseParagraphCount: z.number().int(),
  utilityDensity: z.number(),
});
export const ExportReviewMetricsSchema = z.object({
  pageCount: z.number().int(),
  pageWidthPts: z.number().nullable(),
  pageHeightPts: z.number().nullable(),
  lastPageFillRatio: z.number().nullable(),
  sectionStarts: z.array(ExportSectionReviewMetricSchema),
  utilityCoverage: z.array(ExportUtilityReviewMetricSchema),
  textLayoutParity: ExportReviewTextLayoutParityMetricsSchema.nullable().optional(),
});
export const ExportReviewFindingSchema = z.object({
  code: ExportReviewCodeSchema,
  severity: ExportReviewSeveritySchema,
  page: z.number().int().nullable(),
  message: z.string(),
  details: z.record(z.unknown()).nullable(),
});
export const ExportReviewSchema = z.object({
  status: ExportReviewStatusSchema,
  score: z.number(),
  generatedAt: z.string().datetime(),
  summary: z.string(),
  passCount: z.number().int(),
  appliedFixes: z.array(ExportReviewAutoFixSchema),
  findings: z.array(ExportReviewFindingSchema),
  metrics: ExportReviewMetricsSchema,
});
export const ExportJobResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  format: ExportFormatSchema,
  status: ExportStatusSchema,
  progress: z.number().int(),
  outputUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  review: ExportReviewSchema.nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export const ExportReviewFixChangeSchema = z.object({
  code: ExportReviewCodeSchema,
  action: ExportReviewSafeFixActionSchema,
  title: z.string().nullable(),
  count: z.number().int(),
});
export const ExportReviewFixResultSchema = z.object({
  status: z.enum(['started', 'no_review', 'no_fixes']),
  summary: z.string(),
  appliedFixCount: z.number().int(),
  documentsUpdated: z.number().int(),
  changes: z.array(ExportReviewFixChangeSchema),
  unsupportedFindingCount: z.number().int(),
  exportJob: ExportJobResponseSchema.nullable(),
});
export const ExportCreateRequestSchema = z.object({
  format: ExportFormatSchema,
});

export const GenerationRunCreateSchema = V1CreateGenerationRunRequestSchema;
export const GenerationRunSchema = V1GenerationRunSchema;
export const GenerationRunSummarySchema = V1GenerationRunSchema;
export const GenerationRunDetailSchema = V1GenerationRunDetailSchema;
export const AgentRunCreateSchema = V1CreateAgentRunRequestSchema;
export const AgentRunSchema = V1AgentRunSchema;
export const AgentRunSummarySchema = V1AgentRunSummarySchema;
export const AgentRunDetailSchema = V1AgentRunDetailSchema;

export type V1PublicationDocumentSummary = z.infer<typeof V1PublicationDocumentSummarySchema>;
export type V1PublicationDocument = z.infer<typeof V1PublicationDocumentSchema>;
export type V1PublicationDocumentPatch = z.infer<typeof V1PublicationDocumentPatchSchema>;

export const ProblemSchema = ApiProblemSchema;
export type Problem = ApiProblem;

export const ProjectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const DocumentIdParamsSchema = ProjectIdParamsSchema.extend({
  docId: z.string().uuid(),
});

export const GenerationRunIdParamsSchema = ProjectIdParamsSchema.extend({
  runId: z.string().uuid(),
});

export const AgentRunIdParamsSchema = ProjectIdParamsSchema.extend({
  runId: z.string().uuid(),
});

export const AgentCheckpointIdParamsSchema = AgentRunIdParamsSchema.extend({
  checkpointId: z.string().uuid(),
});
export const GraphInterruptIdParamsSchema = ProjectIdParamsSchema.extend({
  runId: z.string().uuid(),
  interruptId: z.string().uuid(),
});
export const GenerationArtifactIdParamsSchema = GenerationRunIdParamsSchema.extend({
  artifactId: z.string().min(1),
});
export const ExportJobIdParamsSchema = z.object({
  jobId: z.string().uuid(),
});

export type ProjectIdParams = z.infer<typeof ProjectIdParamsSchema>;
export type DocumentIdParams = z.infer<typeof DocumentIdParamsSchema>;
export type GenerationRunIdParams = z.infer<typeof GenerationRunIdParamsSchema>;
export type AgentRunIdParams = z.infer<typeof AgentRunIdParamsSchema>;
export type AgentCheckpointIdParams = z.infer<typeof AgentCheckpointIdParamsSchema>;
export type GraphInterruptIdParams = z.infer<typeof GraphInterruptIdParamsSchema>;
export type GenerationArtifactIdParams = z.infer<typeof GenerationArtifactIdParamsSchema>;
export type ExportJobIdParams = z.infer<typeof ExportJobIdParamsSchema>;

export const PublicationDocumentDetailSchema = V1PublicationDocumentSchema;

export type PublicationDocumentSummary = V1PublicationDocumentSummary;
export type PublicationDocumentDetail = z.infer<typeof PublicationDocumentDetailSchema>;
export type PublicationDocumentTypst = z.infer<typeof PublicationDocumentTypstSchema>;
export type PublicationDocumentPatchRequest = z.infer<typeof V1PublicationDocumentPatchSchema>;
export type ProjectCreateRequestBody = ProjectCreateRequest;
export type ProjectUpdateRequestBody = ProjectUpdateRequest;
export type GenerationRunCreateRequest = V1CreateGenerationRunRequest;
export type GenerationRun = V1GenerationRun;
export type GenerationRunDetail = V1GenerationRunDetail;
export type AgentRunCreateRequest = V1CreateAgentRunRequest;
export type AgentRun = V1AgentRun;
export type AgentRunSummary = V1AgentRunSummary;
export type AgentRunDetail = V1AgentRunDetail;
export type GraphInterruptResolutionRequestBody = z.infer<typeof GraphInterruptResolutionRequestSchema>;

export interface ApiV1RouteContract {
  tag: 'auth' | 'projects' | 'documents' | 'generationRuns' | 'agentRuns' | 'graphInterrupts' | 'exports';
  operationId: string;
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  summary: string;
  paramsSchema?: z.ZodTypeAny;
  requestBodySchema?: z.ZodTypeAny;
  responseSchema?: z.ZodTypeAny;
  axiosResponseType?: 'blob';
  successStatusCode?: 200 | 201 | 204;
  paramsTypeName?: string;
  requestTypeName?: string;
  responseTypeName?: string;
}

export const V1_ROUTE_CONTRACTS: ApiV1RouteContract[] = [
  {
    tag: 'auth',
    operationId: 'login',
    method: 'post',
    path: '/api/v1/auth/login',
    summary: 'Log in and receive an access token.',
    requestBodySchema: AuthLoginRequestSchema,
    responseSchema: AuthSessionResponseSchema,
    requestTypeName: 'AuthLoginRequest',
    responseTypeName: 'AuthSessionResponse',
  },
  {
    tag: 'auth',
    operationId: 'register',
    method: 'post',
    path: '/api/v1/auth/register',
    summary: 'Register a new account and receive an access token.',
    requestBodySchema: AuthRegisterRequestSchema,
    responseSchema: AuthSessionResponseSchema,
    requestTypeName: 'AuthRegisterRequest',
    responseTypeName: 'AuthSessionResponse',
  },
  {
    tag: 'auth',
    operationId: 'refresh',
    method: 'post',
    path: '/api/v1/auth/refresh',
    summary: 'Refresh the current session.',
    responseSchema: AuthSessionResponseSchema,
    responseTypeName: 'AuthSessionResponse',
  },
  {
    tag: 'auth',
    operationId: 'logout',
    method: 'post',
    path: '/api/v1/auth/logout',
    summary: 'Log out the current session.',
    responseSchema: AuthLogoutResponseSchema,
    responseTypeName: 'AuthLogoutResponse',
  },
  {
    tag: 'projects',
    operationId: 'listProjects',
    method: 'get',
    path: '/api/v1/projects',
    summary: 'List the current user projects.',
    responseSchema: ProjectSummarySchema.array(),
    responseTypeName: 'ProjectSummary[]',
  },
  {
    tag: 'projects',
    operationId: 'createProject',
    method: 'post',
    path: '/api/v1/projects',
    summary: 'Create a new project.',
    requestBodySchema: ProjectCreateRequestSchema,
    responseSchema: ProjectSummarySchema,
    successStatusCode: 201,
    requestTypeName: 'ProjectCreateRequest',
    responseTypeName: 'ProjectSummary',
  },
  {
    tag: 'projects',
    operationId: 'getProject',
    method: 'get',
    path: '/api/v1/projects/{projectId}',
    summary: 'Get a single project.',
    paramsSchema: ProjectIdParamsSchema,
    responseSchema: ProjectDetailSchema,
    paramsTypeName: 'ProjectIdParams',
    responseTypeName: 'ProjectDetail',
  },
  {
    tag: 'projects',
    operationId: 'updateProject',
    method: 'patch',
    path: '/api/v1/projects/{projectId}',
    summary: 'Update project metadata or settings.',
    paramsSchema: ProjectIdParamsSchema,
    requestBodySchema: ProjectUpdateRequestSchema,
    responseSchema: ProjectDetailSchema,
    paramsTypeName: 'ProjectIdParams',
    requestTypeName: 'ProjectUpdateRequest',
    responseTypeName: 'ProjectDetail',
  },
  {
    tag: 'projects',
    operationId: 'deleteProject',
    method: 'delete',
    path: '/api/v1/projects/{projectId}',
    summary: 'Delete a project.',
    paramsSchema: ProjectIdParamsSchema,
    successStatusCode: 204,
    paramsTypeName: 'ProjectIdParams',
  },
  {
    tag: 'documents',
    operationId: 'listDocuments',
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents',
    summary: 'List publication documents for a project.',
    paramsSchema: ProjectIdParamsSchema,
    responseSchema: z.array(PublicationDocumentSummarySchema),
    paramsTypeName: 'ProjectIdParams',
    responseTypeName: 'PublicationDocumentSummary[]',
  },
  {
    tag: 'documents',
    operationId: 'getDocument',
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents/{docId}',
    summary: 'Get a publication document snapshot.',
    paramsSchema: DocumentIdParamsSchema,
    responseSchema: PublicationDocumentDetailSchema,
    paramsTypeName: 'DocumentIdParams',
    responseTypeName: 'PublicationDocumentDetail',
  },
  {
    tag: 'documents',
    operationId: 'getDocumentCanonical',
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents/{docId}/canonical',
    summary: 'Get the canonical Typst-oriented document AST.',
    paramsSchema: DocumentIdParamsSchema,
    responseSchema: V1CanonicalTypstNodeSchema,
    paramsTypeName: 'DocumentIdParams',
    responseTypeName: 'PublicationDocumentDetail["canonicalDocJson"]',
  },
  {
    tag: 'documents',
    operationId: 'getDocumentEditorProjection',
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents/{docId}/editor-projection',
    summary: 'Get the editor projection for a publication document.',
    paramsSchema: DocumentIdParamsSchema,
    responseSchema: V1EditorProjectionSchema,
    paramsTypeName: 'DocumentIdParams',
    responseTypeName: 'PublicationDocumentDetail["editorProjectionJson"]',
  },
  {
    tag: 'documents',
    operationId: 'getDocumentTypst',
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents/{docId}/typst',
    summary: 'Get the deterministic Typst source snapshot for a document.',
    paramsSchema: DocumentIdParamsSchema,
    responseSchema: PublicationDocumentTypstSchema,
    paramsTypeName: 'DocumentIdParams',
    responseTypeName: 'PublicationDocumentTypst',
  },
  {
    tag: 'documents',
    operationId: 'updateDocument',
    method: 'patch',
    path: '/api/v1/projects/{projectId}/documents/{docId}',
    summary: 'Apply a canonical/editor document patch.',
    paramsSchema: DocumentIdParamsSchema,
    requestBodySchema: V1PublicationDocumentPatchSchema,
    responseSchema: PublicationDocumentDetailSchema,
    paramsTypeName: 'DocumentIdParams',
    requestTypeName: 'PublicationDocumentPatchRequest',
    responseTypeName: 'PublicationDocumentDetail',
  },
  {
    tag: 'documents',
    operationId: 'updateDocumentLayout',
    method: 'patch',
    path: '/api/v1/projects/{projectId}/documents/{docId}/layout',
    summary: 'Update a publication document layout plan.',
    paramsSchema: DocumentIdParamsSchema,
    requestBodySchema: LayoutPlanSchema,
    responseSchema: PublicationDocumentDetailSchema,
    paramsTypeName: 'DocumentIdParams',
    requestTypeName: 'DocumentLayout',
    responseTypeName: 'PublicationDocumentDetail',
  },
  {
    tag: 'graphInterrupts',
    operationId: 'listProjectInterrupts',
    method: 'get',
    path: '/api/v1/projects/{projectId}/interrupts',
    summary: 'List pending graph interrupts for a project.',
    paramsSchema: ProjectIdParamsSchema,
    responseSchema: z.array(GraphInterruptSchema),
    paramsTypeName: 'ProjectIdParams',
    responseTypeName: 'GraphInterrupt[]',
  },
  {
    tag: 'generationRuns',
    operationId: 'createGenerationRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/generation-runs',
    summary: 'Create and enqueue a generation run.',
    paramsSchema: ProjectIdParamsSchema,
    requestBodySchema: GenerationRunCreateSchema,
    responseSchema: GenerationRunSchema,
    paramsTypeName: 'ProjectIdParams',
    requestTypeName: 'GenerationRunCreateRequest',
    responseTypeName: 'GenerationRun',
  },
  {
    tag: 'generationRuns',
    operationId: 'listGenerationRuns',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs',
    summary: 'List generation runs for a project.',
    paramsSchema: ProjectIdParamsSchema,
    responseSchema: z.array(GenerationRunSchema),
    paramsTypeName: 'ProjectIdParams',
    responseTypeName: 'GenerationRun[]',
  },
  {
    tag: 'generationRuns',
    operationId: 'getGenerationRun',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}',
    summary: 'Get generation run details.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: GenerationRunDetailSchema,
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'GenerationRunDetail',
  },
  {
    tag: 'generationRuns',
    operationId: 'pauseGenerationRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/pause',
    summary: 'Pause a generation run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: GenerationRunSchema,
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'GenerationRun',
  },
  {
    tag: 'generationRuns',
    operationId: 'resumeGenerationRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/resume',
    summary: 'Resume a generation run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: GenerationRunSchema,
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'GenerationRun',
  },
  {
    tag: 'generationRuns',
    operationId: 'cancelGenerationRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/cancel',
    summary: 'Cancel a generation run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: GenerationRunSchema,
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'GenerationRun',
  },
  {
    tag: 'generationRuns',
    operationId: 'listGenerationRunInterrupts',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/interrupts',
    summary: 'List graph interrupts for a generation run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: z.array(GraphInterruptSchema),
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'GraphInterrupt[]',
  },
  {
    tag: 'generationRuns',
    operationId: 'resolveGenerationRunInterrupt',
    method: 'post',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/interrupts/{interruptId}/resolve',
    summary: 'Resolve a generation run graph interrupt.',
    paramsSchema: GraphInterruptIdParamsSchema,
    requestBodySchema: GraphInterruptResolutionRequestSchema,
    responseSchema: GraphInterruptSchema,
    paramsTypeName: 'GraphInterruptIdParams',
    requestTypeName: 'GraphInterruptResolutionRequestBody',
    responseTypeName: 'GraphInterrupt',
  },
  {
    tag: 'generationRuns',
    operationId: 'listGenerationTasks',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/tasks',
    summary: 'List generation tasks for a run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: z.array(V1GenerationTaskSchema),
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'V1GenerationTask[]',
  },
  {
    tag: 'generationRuns',
    operationId: 'listGenerationArtifacts',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/artifacts',
    summary: 'List generated artifacts for a run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: z.array(V1GeneratedArtifactSchema),
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'GeneratedArtifact[]',
  },
  {
    tag: 'generationRuns',
    operationId: 'getGenerationArtifact',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/artifacts/{artifactId}',
    summary: 'Get generated artifact detail and evaluations.',
    paramsSchema: GenerationArtifactIdParamsSchema,
    responseSchema: V1GeneratedArtifactDetailSchema,
    paramsTypeName: 'GenerationArtifactIdParams',
    responseTypeName: 'GeneratedArtifact & { evaluations?: ArtifactEvaluation[] }',
  },
  {
    tag: 'generationRuns',
    operationId: 'listGenerationCanonEntities',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/canon',
    summary: 'List canon entities for a run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: z.array(CanonEntitySchema),
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'CanonEntity[]',
  },
  {
    tag: 'generationRuns',
    operationId: 'listGenerationEvaluations',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/evaluations',
    summary: 'List evaluations for a run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: z.array(ArtifactEvaluationSchema),
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'ArtifactEvaluation[]',
  },
  {
    tag: 'generationRuns',
    operationId: 'getGenerationAssemblyManifest',
    method: 'get',
    path: '/api/v1/projects/{projectId}/generation-runs/{runId}/assembly',
    summary: 'Get the latest assembly manifest for a run.',
    paramsSchema: GenerationRunIdParamsSchema,
    responseSchema: AssemblyManifestSchema,
    paramsTypeName: 'GenerationRunIdParams',
    responseTypeName: 'AssemblyManifest',
  },
  {
    tag: 'agentRuns',
    operationId: 'createAgentRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/agent-runs',
    summary: 'Create and enqueue an agent run.',
    paramsSchema: ProjectIdParamsSchema,
    requestBodySchema: AgentRunCreateSchema,
    responseSchema: AgentRunSchema,
    paramsTypeName: 'ProjectIdParams',
    requestTypeName: 'AgentRunCreateRequest',
    responseTypeName: 'AgentRun',
  },
  {
    tag: 'agentRuns',
    operationId: 'listAgentRuns',
    method: 'get',
    path: '/api/v1/projects/{projectId}/agent-runs',
    summary: 'List agent runs for a project.',
    paramsSchema: ProjectIdParamsSchema,
    responseSchema: z.array(AgentRunSummarySchema),
    paramsTypeName: 'ProjectIdParams',
    responseTypeName: 'AgentRunSummary[]',
  },
  {
    tag: 'agentRuns',
    operationId: 'getAgentRun',
    method: 'get',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}',
    summary: 'Get agent run details.',
    paramsSchema: AgentRunIdParamsSchema,
    responseSchema: AgentRunDetailSchema,
    paramsTypeName: 'AgentRunIdParams',
    responseTypeName: 'AgentRunDetail',
  },
  {
    tag: 'agentRuns',
    operationId: 'pauseAgentRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/pause',
    summary: 'Pause an agent run.',
    paramsSchema: AgentRunIdParamsSchema,
    responseSchema: AgentRunSchema,
    paramsTypeName: 'AgentRunIdParams',
    responseTypeName: 'AgentRun',
  },
  {
    tag: 'agentRuns',
    operationId: 'resumeAgentRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/resume',
    summary: 'Resume an agent run.',
    paramsSchema: AgentRunIdParamsSchema,
    responseSchema: AgentRunSchema,
    paramsTypeName: 'AgentRunIdParams',
    responseTypeName: 'AgentRun',
  },
  {
    tag: 'agentRuns',
    operationId: 'cancelAgentRun',
    method: 'post',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/cancel',
    summary: 'Cancel an agent run.',
    paramsSchema: AgentRunIdParamsSchema,
    responseSchema: AgentRunSchema,
    paramsTypeName: 'AgentRunIdParams',
    responseTypeName: 'AgentRun',
  },
  {
    tag: 'agentRuns',
    operationId: 'listAgentRunInterrupts',
    method: 'get',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/interrupts',
    summary: 'List graph interrupts for an agent run.',
    paramsSchema: AgentRunIdParamsSchema,
    responseSchema: z.array(GraphInterruptSchema),
    paramsTypeName: 'AgentRunIdParams',
    responseTypeName: 'GraphInterrupt[]',
  },
  {
    tag: 'agentRuns',
    operationId: 'resolveAgentRunInterrupt',
    method: 'post',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/interrupts/{interruptId}/resolve',
    summary: 'Resolve an agent run graph interrupt.',
    paramsSchema: GraphInterruptIdParamsSchema,
    requestBodySchema: GraphInterruptResolutionRequestSchema,
    responseSchema: GraphInterruptSchema,
    paramsTypeName: 'GraphInterruptIdParams',
    requestTypeName: 'GraphInterruptResolutionRequestBody',
    responseTypeName: 'GraphInterrupt',
  },
  {
    tag: 'agentRuns',
    operationId: 'listAgentCheckpoints',
    method: 'get',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/checkpoints',
    summary: 'List agent checkpoints.',
    paramsSchema: AgentRunIdParamsSchema,
    responseSchema: z.array(AgentCheckpointSchema),
    paramsTypeName: 'AgentRunIdParams',
    responseTypeName: 'AgentCheckpoint[]',
  },
  {
    tag: 'agentRuns',
    operationId: 'restoreAgentCheckpoint',
    method: 'post',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/checkpoints/{checkpointId}/restore',
    summary: 'Restore an agent checkpoint.',
    paramsSchema: AgentCheckpointIdParamsSchema,
    responseSchema: AgentCheckpointSchema,
    paramsTypeName: 'AgentCheckpointIdParams',
    responseTypeName: 'AgentCheckpoint',
  },
  {
    tag: 'agentRuns',
    operationId: 'listAgentActions',
    method: 'get',
    path: '/api/v1/projects/{projectId}/agent-runs/{runId}/actions',
    summary: 'List agent actions.',
    paramsSchema: AgentRunIdParamsSchema,
    responseSchema: z.array(AgentActionSchema),
    paramsTypeName: 'AgentRunIdParams',
    responseTypeName: 'AgentAction[]',
  },
  {
    tag: 'exports',
    operationId: 'createExportJob',
    method: 'post',
    path: '/api/v1/projects/{projectId}/export-jobs',
    summary: 'Create and enqueue an export job.',
    paramsSchema: ProjectIdParamsSchema,
    requestBodySchema: ExportCreateRequestSchema,
    responseSchema: ExportJobResponseSchema,
    paramsTypeName: 'ProjectIdParams',
    requestTypeName: 'ExportRequest',
    responseTypeName: 'ExportJob',
  },
  {
    tag: 'exports',
    operationId: 'listExportJobs',
    method: 'get',
    path: '/api/v1/projects/{projectId}/export-jobs',
    summary: 'List export jobs for a project.',
    paramsSchema: ProjectIdParamsSchema,
    responseSchema: z.array(ExportJobResponseSchema),
    paramsTypeName: 'ProjectIdParams',
    responseTypeName: 'ExportJob[]',
  },
  {
    tag: 'exports',
    operationId: 'getExportJob',
    method: 'get',
    path: '/api/v1/export-jobs/{jobId}',
    summary: 'Get export job status.',
    paramsSchema: ExportJobIdParamsSchema,
    responseSchema: ExportJobResponseSchema,
    paramsTypeName: 'ExportJobIdParams',
    responseTypeName: 'ExportJob',
  },
  {
    tag: 'exports',
    operationId: 'applyExportJobFixes',
    method: 'post',
    path: '/api/v1/export-jobs/{jobId}/fix',
    summary: 'Apply safe fixes from an export review and queue a re-export.',
    paramsSchema: ExportJobIdParamsSchema,
    responseSchema: ExportReviewFixResultSchema,
    paramsTypeName: 'ExportJobIdParams',
    responseTypeName: 'ExportReviewFixResult',
  },
  {
    tag: 'exports',
    operationId: 'downloadExportJob',
    method: 'get',
    path: '/api/v1/export-jobs/{jobId}/download',
    summary: 'Download a completed export artifact.',
    paramsSchema: ExportJobIdParamsSchema,
    axiosResponseType: 'blob',
    paramsTypeName: 'ExportJobIdParams',
    responseTypeName: 'Blob',
  },
];
