import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { query } from './db.js';
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import notesRoutes from './routes/notes.js';
import messagesRoutes from './routes/messages.js';
import migrateRoutes from './routes/migrate.js';
import usersRoutes from './routes/users.js';
import algoRoutes from './routes/algo.js';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

// Basic security and parsing
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// Health Check Endpoint (safe, no secrets leaked)
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const dbTest = await query('SELECT 1 AS alive');
    if (dbTest.rows[0]?.alive === 1) {
      dbStatus = 'connected';
    }
  } catch (err) {
    dbStatus = 'disconnected';
  }

  res.json({
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api', notesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/migrate', migrateRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/algo', algoRoutes);

// 404 Route
app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

// Central safe error handler (never leaks stack traces or credentials)
app.use((err, req, res, next) => {
  console.error('API Error:', err.name || 'Error');
  res.status(err.status || 500).json({
    error: 'An internal server error occurred.',
  });
});

const server = app.listen(port, () => {
  console.log(`[ninai-api] Server running on port ${port}`);
});

export default app;
