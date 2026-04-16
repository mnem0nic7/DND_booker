import { http, HttpResponse } from 'msw';

export const handlers = [
  // Projects
  http.get('/api/v1/projects', () => HttpResponse.json([])),
  http.post('/api/v1/projects', () =>
    HttpResponse.json({
      id: 'proj-default',
      userId: 'user-1',
      title: 'New Project',
      description: '',
      type: 'campaign',
      status: 'draft',
      coverImageUrl: null,
      settings: {
        pageSize: 'letter',
        margins: { top: 1, right: 1, bottom: 1, left: 1 },
        columns: 1,
        theme: 'classic-parchment',
        fonts: { heading: 'serif', body: 'serif' },
        textLayoutFallbacks: {},
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  ),

  http.get('/api/v1/projects/:projectId/export-jobs', () => HttpResponse.json([])),

  // Console
  http.get('/api/v1/projects/:projectId/console/agents', () => HttpResponse.json([])),
  http.post('/api/v1/projects/:projectId/console/chat', () =>
    HttpResponse.json({ replies: [] }),
  ),

  // Interviews
  http.get('/api/v1/projects/:projectId/interview/sessions/latest', () =>
    HttpResponse.json(null),
  ),
  http.post('/api/v1/projects/:projectId/interview/sessions', () =>
    HttpResponse.json({
      id: 'sess-default',
      projectId: 'proj-1',
      userId: 'user-1',
      status: 'collecting',
      turns: [],
      briefDraft: null,
      lockedBrief: null,
      missingFields: [],
      maxUserTurns: 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lockedAt: null,
    }),
  ),
  http.post('/api/v1/projects/:projectId/interview/sessions/:sessionId/messages', () =>
    HttpResponse.json({
      id: 'sess-default',
      projectId: 'proj-1',
      userId: 'user-1',
      status: 'collecting',
      turns: [],
      briefDraft: null,
      lockedBrief: null,
      missingFields: [],
      maxUserTurns: 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lockedAt: null,
    }),
  ),
  http.post('/api/v1/projects/:projectId/interview/sessions/:sessionId/lock', () =>
    HttpResponse.json({
      id: 'sess-default',
      projectId: 'proj-1',
      userId: 'user-1',
      status: 'locked',
      turns: [],
      briefDraft: null,
      lockedBrief: null,
      missingFields: [],
      maxUserTurns: 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lockedAt: new Date().toISOString(),
    }),
  ),

  // Generation runs
  http.get('/api/v1/projects/:projectId/generation-runs', () => HttpResponse.json([])),
];
