const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const https = require('https');

// Load .env manually ONLY for local dev — never overwrite existing env vars
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    // Only set if not already defined (Vercel env vars take priority)
    if (k && !process.env[k]) process.env[k] = v;
  });
} catch {}

const JWT_SECRET = process.env.JWT_SECRET || 'pagya-portfolio-secret-2026';
// Prod client ID hardcoded as fallback — works even if Vercel env var not set
const PROD_CLIENT_ID = '1064819793143-vnuka7norga50qrta9ln7i8dr9v4v0nf.apps.googleusercontent.com';
const LOCAL_CLIENT_ID = '1064819793143-dfh2uoalko515ofsdcojjvc2o0ro1u2b.apps.googleusercontent.com';
const ALLOWED_EMAIL = 'pagya261998@gmail.com';
const DATA_FILE = path.join(__dirname, 'data.json');
// On Vercel, /tmp is the only writable directory
const DRAFT_FILE = process.env.VERCEL
  ? '/tmp/draft.json'
  : path.join(__dirname, 'draft.json');

const app = express();
app.use(express.json());

// ── Serve admin static assets FIRST (before the HTML route) ─────
app.get('/admin/admin.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(path.join(__dirname, 'admin/admin.css'));
});
app.get('/admin/admin.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'admin/admin.js'));
});

// ── Admin page — inject Google Client ID ─────────────────────────
app.get(['/admin', '/admin/'], (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || (process.env.VERCEL ? PROD_CLIENT_ID : LOCAL_CLIENT_ID);
  let html = fs.readFileSync(path.join(__dirname, 'admin/index.html'), 'utf8');
  html = html.replace(
    '</head>',
    `<script>window.__GOOGLE_CLIENT_ID__ = "${clientId}";</script>\n</head>`
  );
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Serve all other static files
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
