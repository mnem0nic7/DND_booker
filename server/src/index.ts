import express from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import { projectDocumentRoutes, documentRoutes } from './routes/documents.js';
import { projectAssetRoutes, assetRoutes } from './routes/assets.js';
import exportRoutes from './routes/exports.js';
import templateRoutes from './routes/templates.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:projectId/documents', projectDocumentRoutes);
app.use('/api/projects/:projectId/assets', projectAssetRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api', exportRoutes);
app.use('/api/templates', templateRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Only start listening if this file is run directly (not imported in tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
