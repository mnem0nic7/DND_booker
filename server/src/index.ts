import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import { projectDocumentRoutes, documentRoutes } from './routes/documents.js';
import { projectAssetRoutes, assetRoutes } from './routes/assets.js';
import exportRoutes from './routes/exports.js';
import templateRoutes from './routes/templates.js';
import { aiSettingsRoutes, aiGenerateRoutes, aiChatRoutes, aiWizardRoutes } from './routes/ai.js';
import { publicRateLimit } from './middleware/ai-rate-limit.js';
import { requireAuth, type AuthRequest } from './middleware/auth.js';

// Validate required env vars in production
if (process.env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL', 'REDIS_HOST', 'AI_KEY_ENCRYPTION_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required env vars in production: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

// Trust the nginx reverse proxy so rate-limiters see the real client IP
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// CORS — validate origin in production
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  console.error('FATAL: CLIENT_URL must be set in production for CORS security.');
  process.exit(1);
}
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, same-origin)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/api/health', publicRateLimit, (_req, res) => {
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
app.use('/api/ai', aiSettingsRoutes);
app.use('/api/ai', aiGenerateRoutes);
app.use('/api/projects/:projectId', aiChatRoutes);
app.use('/api/projects/:projectId', aiWizardRoutes);

// Serve uploaded files with auth — verify the requesting user owns the project
app.use('/uploads/:projectId/:filename', requireAuth, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authReq = req as AuthRequest;
  const projectId = String(req.params.projectId);
  const filename = String(req.params.filename);

  // Verify the user owns this project
  const { prisma: db } = await import('./config/database.js');
  const project = await db.project.findFirst({
    where: { id: projectId, userId: authReq.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Serve the file with security headers
  const filePath = path.resolve(process.cwd(), 'uploads', projectId, filename);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'");
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

// Global error handler — catches unhandled errors from async route handlers
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Handle multer-specific errors with proper status codes
  if (err.name === 'MulterError') {
    const status = (err as Error & { code?: string }).code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    if (!res.headersSent) {
      res.status(status).json({ error: err.message });
    }
    return;
  }
  // Handle fileFilter rejections (plain Error from multer's callback)
  if (err.message === 'Only image files are allowed') {
    if (!res.headersSent) {
      res.status(400).json({ error: err.message });
    }
    return;
  }
  console.error('[Error]', err.stack ?? err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Only start listening if this file is run directly (not imported in tests)
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  async function gracefulShutdown(signal: string) {
    console.log(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      Promise.all([
        import('./config/database.js').then(({ prisma }) => prisma.$disconnect()),
        import('./config/redis.js').then(({ redis }) => redis.quit()),
      ]).then(() => {
        console.log('All connections closed.');
        process.exit(0);
      }).catch((err) => {
        console.error('Error during shutdown:', err);
        process.exit(1);
      });
    });
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
