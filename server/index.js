// Local server: `npm run dev` (API only, Vite serves the pages) or `npm start` (API + built site).
// On Vercel this file isn't used — api/index.js exposes the same Express app as a function.
import express from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import app from './app.js';
import { DATABASE_URL } from './db.js';

const PORT = Number(process.env.PORT || 3001);
const DIST = resolve('dist');

if (process.env.NODE_ENV === 'production' && existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')));
}

if (!DATABASE_URL) console.warn('⚠️  DATABASE_URL is not set — add your Neon connection string to .env');
app.listen(PORT, () => console.log(`🍪 Listening on http://localhost:${PORT}`));
