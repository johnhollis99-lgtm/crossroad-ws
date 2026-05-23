require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');

const contributionsRouter = require('./routes/contributions');
const narrationRouter     = require('./routes/narration');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? '*' },
});

app.use(express.json({ limit: '64kb' }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.use('/api/contributions', contributionsRouter);
app.use('/api/narration',     narrationRouter);

// ── Socket.io (placeholder for future real-time narration events) ─────────────
io.on('connection', (socket) => {
  console.log(`[ws] connected  ${socket.id}`);
  socket.on('disconnect', () => console.log(`[ws] disconnected ${socket.id}`));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => console.log(`RoadStory server → http://localhost:${PORT}`));
