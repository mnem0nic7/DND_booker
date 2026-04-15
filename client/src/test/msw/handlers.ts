import { http, HttpResponse } from 'msw';

export const handlers = [
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
