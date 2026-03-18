/**
 * Tradovate WebSocket Proxy Server
 *
 * Runs alongside the Next.js app. Manages one Tradovate WebSocket connection
 * per authenticated user. Browser clients connect here with a short-lived
 * JWT ticket issued by the Next.js API route /api/tradovate/ws-ticket.
 *
 * Start: node server/index.js
 * Or:    npm run server
 */

'use strict';

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { ConnectionManager } = require('./ConnectionManager');
const { verifyTicket } = require('./utils/ticket');
const { rateLimiter } = require('./middleware/rateLimit');

const PORT = process.env.WS_SERVER_PORT || 8080;

const app = express();
app.use(express.json());

// Allow CORS preflight from Next.js dev/prod origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check — used by monitoring and Next.js to detect server availability
app.get('/health', (req, res) => {
  const manager = ConnectionManager.getInstance();
  res.json({
    status: 'ok',
    activeUsers: manager.getActiveCount(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const manager = ConnectionManager.getInstance();

wss.on('connection', async (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';

  // IP-based rate limiting — prevents connection storms
  if (!rateLimiter.check(ip)) {
    ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: 'Too many connections' }));
    ws.close(1008, 'Rate limited');
    return;
  }

  // Extract one-time ticket from query string: /ws?ticket=<jwt>
  let url;
  try {
    url = new URL(req.url, `http://localhost`);
  } catch {
    ws.close(1008, 'Malformed URL');
    return;
  }

  const ticket = url.searchParams.get('ticket');
  if (!ticket) {
    ws.send(JSON.stringify({ type: 'error', code: 'NO_TICKET', message: 'Auth ticket required' }));
    ws.close(1008, 'Missing ticket');
    return;
  }

  // Verify & decode the ticket
  let payload;
  try {
    payload = verifyTicket(ticket);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', code: 'INVALID_TICKET', message: 'Invalid or expired ticket' }));
    ws.close(1008, 'Invalid ticket');
    return;
  }

  // Hand off to connection manager
  await manager.handleClient(ws, payload);
});

server.listen(PORT, () => {
  console.log(`[WS Proxy] Listening on port ${PORT}`);
  console.log(`[WS Proxy] Mode: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown — close all Tradovate connections cleanly
process.on('SIGTERM', () => {
  console.log('[WS Proxy] SIGTERM received, shutting down...');
  manager.shutdown();
  server.close(() => {
    console.log('[WS Proxy] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  manager.shutdown();
  server.close(() => process.exit(0));
});
