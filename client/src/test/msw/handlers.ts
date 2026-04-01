import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/projects/:id/export-jobs', () => HttpResponse.json([])),
];
