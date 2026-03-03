import { useState } from 'react';

export interface EvaluationFinding {
  category: 'content' | 'formatting';
  severity: 'issue' | 'suggestion' | 'praise';
  nodeRef: number;
  title: string;
  detail: string;
}

export interface EvaluationBlock {
  _evaluation: true;
  overallScore: number;
  summary: string;
  findings: EvaluationFinding[];
}

/** Extract an _evaluation control block from raw assistant message content. */
export function extractEvaluation(content: string): EvaluationBlock | null {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && parsed._evaluation === true && typeof parsed.overallScore === 'number' && Array.isArray(parsed.findings)) {
        return {
          _evaluation: true,
          overallScore: parsed.overallScore,
          summary: String(parsed.summary || ''),
          findings: parsed.findings
            .filter((f: Record<string, unknown>) => typeof f.title === 'string' && typeof f.detail === 'string')
            .map((f: Record<string, unknown>) => ({
              category: f.category === 'formatting' ? 'formatting' : 'content',
              severity: ['issue', 'suggestion', 'praise'].includes(f.severity as string) ? f.severity as EvaluationFinding['severity'] : 'suggestion',
              nodeRef: typeof f.nodeRef === 'number' ? f.nodeRef : -1,
              title: String(f.title),
              detail: String(f.detail),
            })),
        };
      }
    } catch { /* not valid JSON */ }
  }
  return null;
}

const SEVERITY_CONFIG = {
  issue: {
    label: 'Issues',
    bg: 'bg-red-50',
    border: 'border-red-200',
    titleColor: 'text-red-800',
    detailColor: 'text-red-700',
    badgeColor: 'bg-red-100 text-red-700',
    icon: (
      <svg className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    defaultExpanded: true,
  },
  suggestion: {
    label: 'Suggestions',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    titleColor: 'text-amber-800',
    detailColor: 'text-amber-700',
    badgeColor: 'bg-amber-100 text-amber-700',
    icon: (
      <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
    defaultExpanded: true,
  },
  praise: {
    label: 'Praise',
    bg: 'bg-green-50',
    border: 'border-green-200',
    titleColor: 'text-green-800',
    detailColor: 'text-green-700',
    badgeColor: 'bg-green-100 text-green-700',
    icon: (
      <svg className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    defaultExpanded: false,
  },
} as const;

function scoreColor(score: number): string {
  if (score <= 3) return 'bg-red-500';
  if (score <= 6) return 'bg-amber-500';
  return 'bg-green-500';
}

interface FindingSectionProps {
  severity: 'issue' | 'suggestion' | 'praise';
  findings: EvaluationFinding[];
}

function FindingSection({ severity, findings }: FindingSectionProps) {
  const config = SEVERITY_CONFIG[severity];
  const [expanded, setExpanded] = useState(config.defaultExpanded);

  if (findings.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors py-1"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {config.label}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.badgeColor}`}>
          {findings.length}
        </span>
      </button>
      {expanded && (
        <div className="space-y-1.5 ml-1">
          {findings.map((finding, i) => (
            <div key={i} className={`${config.bg} border ${config.border} rounded px-2.5 py-2`}>
              <div className="flex items-start gap-1.5">
                {config.icon}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold ${config.titleColor}`}>{finding.title}</span>
                    {finding.nodeRef >= 0 && (
                      <span className="text-[10px] text-gray-400 font-mono">[{finding.nodeRef}]</span>
                    )}
                    <span className="text-[10px] text-gray-400 capitalize">{finding.category}</span>
                  </div>
                  <p className={`text-xs ${config.detailColor} mt-0.5 leading-relaxed`}>{finding.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AiEvaluationCardProps {
  evaluation: EvaluationBlock;
}

export function AiEvaluationCard({ evaluation }: AiEvaluationCardProps) {
  const issues = evaluation.findings.filter(f => f.severity === 'issue');
  const suggestions = evaluation.findings.filter(f => f.severity === 'suggestion');
  const praise = evaluation.findings.filter(f => f.severity === 'praise');

  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
      {/* Header with score */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className={`${scoreColor(evaluation.overallScore)} text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center shrink-0`}>
          {evaluation.overallScore}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500">Document Evaluation</div>
          <p className="text-xs text-gray-700 leading-relaxed">{evaluation.summary}</p>
        </div>
      </div>

      {/* Findings */}
      <div className="px-3 py-2 space-y-1.5">
        <FindingSection severity="issue" findings={issues} />
        <FindingSection severity="suggestion" findings={suggestions} />
        <FindingSection severity="praise" findings={praise} />
      </div>
    </div>
  );
}
