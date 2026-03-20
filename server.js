const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const https = require('https');

// Load .env manually when running locally
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const JWT_SECRET = process.env.JWT_SECRET || 'pagya-portfolio-secret-2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_EMAIL = 'pagya261998@gmail.com';
const DATA_FILE = path.join(__dirname, 'data.json');
const DRAFT_FILE = path.join(__dirname, 'draft.json');

const app = express();
app.use(express.json());

// ── Admin page — inject Google Client ID (must be BEFORE static) ─
app.get(['/admin', '/admin/'], (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'admin/index.html'), 'utf8');
  html = html.replace(
    '</head>',
    `<script>window.__GOOGLE_CLIENT_ID__ = "${GOOGLE_CLIENT_ID}";</script>\n</head>`
  );
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Serve all other static files (admin/admin.css, admin/admin.js, etc.)
app.use(express.static(__dirname, { index: false }));
// Serve index.html at root explicitly
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Helpers ──────────────────────────────────────────────────────
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Ensure draft.json exists
if (!fs.existsSync(DRAFT_FILE)) {
  fs.copyFileSync(DATA_FILE, DRAFT_FILE);
}

// ── Google token verification ────────────────────────────────────
function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return reject(new Error(p.error));
          resolve(p);
        } catch { reject(new Error('Failed to parse Google response')); }
      });
    }).on('error', reject);
  });
}

// ── Auth middleware ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Google SSO ───────────────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  try {
    const payload = await verifyGoogleToken(credential);
    if (payload.email !== ALLOWED_EMAIL) {
      return res.status(403).json({ error: 'Access denied. This admin is restricted to a specific account.' });
    }
    const token = jwt.sign({ email: payload.email, name: payload.name }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, name: payload.name, email: payload.email });
  } catch (err) {
    res.status(401).json({ error: 'Google authentication failed: ' + err.message });
  }
});

// ── Admin page — inject Google Client ID ─────────────────────────
app.get('/admin/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'admin/index.html'), 'utf8');
  html = html.replace(
    '</head>',
    `<script>window.__GOOGLE_CLIENT_ID__ = "${GOOGLE_CLIENT_ID}";</script>\n</head>`
  );
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ── Public data ──────────────────────────────────────────────────
app.get('/api/data', (req, res) => res.json(readJSON(DATA_FILE)));

// ── Draft: read ──────────────────────────────────────────────────
app.get('/api/draft', requireAuth, (req, res) => res.json(readJSON(DRAFT_FILE)));

// ── Draft: update section ────────────────────────────────────────
app.put('/api/draft/:section', requireAuth, (req, res) => {
  const { section } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!(section in draft)) return res.status(404).json({ error: `Section "${section}" not found` });
  draft[section] = req.body;
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true, section, data: draft[section] });
});

// ── Draft: add item to array section ────────────────────────────
app.post('/api/draft/:section', requireAuth, (req, res) => {
  const { section } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Not an array section' });
  const newItem = { ...req.body, id: `${section}_${Date.now()}` };
  draft[section].push(newItem);
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true, item: newItem });
});

// ── Draft: update single array item ─────────────────────────────
app.put('/api/draft/:section/:id', requireAuth, (req, res) => {
  const { section, id } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Not an array section' });
  const idx = draft[section].findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  draft[section][idx] = { ...req.body, id };
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true, item: draft[section][idx] });
});

// ── Draft: delete array item ─────────────────────────────────────
app.delete('/api/draft/:section/:id', requireAuth, (req, res) => {
  const { section, id } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Not an array section' });
  draft[section] = draft[section].filter(i => i.id !== id);
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true });
});

// ── Publish draft → live ─────────────────────────────────────────
app.post('/api/publish', requireAuth, (req, res) => {
  writeJSON(DATA_FILE, readJSON(DRAFT_FILE));
  res.json({ success: true, message: 'Published to live.' });
});

// ── Reset draft to live ──────────────────────────────────────────
app.post('/api/draft/reset', requireAuth, (req, res) => {
  writeJSON(DRAFT_FILE, readJSON(DATA_FILE));
  res.json({ success: true });
});

// ── Local dev server ─────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Portfolio: http://localhost:${PORT}`);
    console.log(`🔐 Admin:     http://localhost:${PORT}/admin/`);
    if (!GOOGLE_CLIENT_ID) console.warn('⚠️  Set GOOGLE_CLIENT_ID in .env\n');
  });
}

module.exports = app;
