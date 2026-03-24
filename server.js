const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Load .env ONLY for local dev — never overwrite existing env vars (Vercel sets them)
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  });
} catch {}

const JWT_SECRET = process.env.JWT_SECRET || 'pagya-portfolio-secret-2026';
const PROD_CLIENT_ID = '1064819793143-vnuka7norga50qrta9ln7i8dr9v4v0nf.apps.googleusercontent.com';
const LOCAL_CLIENT_ID = '1064819793143-dfh2uoalko515ofsdcojjvc2o0ro1u2b.apps.googleusercontent.com';
const ALLOWED_EMAIL = 'pagya261998@gmail.com';
const DATA_FILE = path.join(__dirname, 'data.json');
const DRAFT_FILE = process.env.VERCEL ? '/tmp/draft.json' : path.join(__dirname, 'draft.json');

const app = express();
app.use(express.json({ limit: '2mb' }));

// ── Admin static assets — explicit routes BEFORE the HTML catch-all ──
app.get('/admin/admin.css', (_req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(path.join(__dirname, 'admin/admin.css'));
});
app.get('/admin/admin.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'admin/admin.js'));
});

// ── Admin HTML — inject client ID ────────────────────────────────
app.get(['/admin', '/admin/'], (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || (process.env.VERCEL ? PROD_CLIENT_ID : LOCAL_CLIENT_ID);
  let html = fs.readFileSync(path.join(__dirname, 'admin/index.html'), 'utf8');
  html = html.replace('</head>', `<script>window.__GOOGLE_CLIENT_ID__="${clientId}";</script>\n</head>`);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ── Static files ──────────────────────────────────────────────────
app.use(express.static(__dirname, { index: false }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Helpers ───────────────────────────────────────────────────────
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Ensure draft exists
if (!fs.existsSync(DRAFT_FILE)) {
  try { fs.copyFileSync(DATA_FILE, DRAFT_FILE); } catch {}
}

// ── Google token verification via fetch (reliable on Vercel) ──────
async function verifyGoogleToken(idToken) {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url);
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch {
    throw new Error('Invalid response from Google: ' + text.slice(0, 100));
  }
  if (payload.error) throw new Error(payload.error_description || payload.error);
  return payload;
}

// ── Auth middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Google SSO login ──────────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    const payload = await verifyGoogleToken(credential);

    if (payload.email !== ALLOWED_EMAIL) {
      return res.status(403).json({ error: 'Access denied. Restricted to authorised account only.' });
    }

    const token = jwt.sign(
      { email: payload.email, name: payload.name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    return res.json({ token, name: payload.name, email: payload.email });
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ error: 'Authentication failed: ' + err.message });
  }
});

// ── Public data ───────────────────────────────────────────────────
app.get('/api/data', (_req, res) => {
  try { res.json(readJSON(DATA_FILE)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Draft: read ───────────────────────────────────────────────────
app.get('/api/draft', requireAuth, (_req, res) => {
  try { res.json(readJSON(DRAFT_FILE)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Draft: update section ─────────────────────────────────────────
app.put('/api/draft/:section', requireAuth, (req, res) => {
  try {
    const { section } = req.params;
    const draft = readJSON(DRAFT_FILE);
    if (!(section in draft)) return res.status(404).json({ error: `Section "${section}" not found` });
    draft[section] = req.body;
    writeJSON(DRAFT_FILE, draft);
    res.json({ success: true, section, data: draft[section] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Draft: add item ───────────────────────────────────────────────
app.post('/api/draft/:section', requireAuth, (req, res) => {
  try {
    const { section } = req.params;
    const draft = readJSON(DRAFT_FILE);
    if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Not an array section' });
    const newItem = { ...req.body, id: `${section}_${Date.now()}` };
    draft[section].push(newItem);
    writeJSON(DRAFT_FILE, draft);
    res.json({ success: true, item: newItem });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Draft: update item ────────────────────────────────────────────
app.put('/api/draft/:section/:id', requireAuth, (req, res) => {
  try {
    const { section, id } = req.params;
    const draft = readJSON(DRAFT_FILE);
    if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Not an array section' });
    const idx = draft[section].findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });
    draft[section][idx] = { ...req.body, id };
    writeJSON(DRAFT_FILE, draft);
    res.json({ success: true, item: draft[section][idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Draft: delete item ────────────────────────────────────────────
app.delete('/api/draft/:section/:id', requireAuth, (req, res) => {
  try {
    const { section, id } = req.params;
    const draft = readJSON(DRAFT_FILE);
    if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Not an array section' });
    draft[section] = draft[section].filter(i => i.id !== id);
    writeJSON(DRAFT_FILE, draft);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Publish ───────────────────────────────────────────────────────
app.post('/api/publish', requireAuth, (_req, res) => {
  try {
    writeJSON(DATA_FILE, readJSON(DRAFT_FILE));
    res.json({ success: true, message: 'Published to live.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reset draft ───────────────────────────────────────────────────
app.post('/api/draft/reset', requireAuth, (_req, res) => {
  try {
    writeJSON(DRAFT_FILE, readJSON(DATA_FILE));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Local dev ─────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Portfolio: http://localhost:${PORT}`);
    console.log(`🔐 Admin:     http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
