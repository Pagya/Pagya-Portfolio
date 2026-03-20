const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const https = require('https');

// Load .env manually (no extra dependency)
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pagya-portfolio-secret-2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const ALLOWED_EMAIL = 'pagya261998@gmail.com';
const DATA_FILE = path.join(__dirname, 'data.json');
const DRAFT_FILE = path.join(__dirname, 'draft.json');

app.use(express.json());
app.use(express.static(__dirname));

// ── Verify Google ID token by calling Google's tokeninfo endpoint ─
function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const payload = JSON.parse(data);
          if (payload.error) return reject(new Error(payload.error));
          resolve(payload);
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

// ── Helpers ──────────────────────────────────────────────────────
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ── Google SSO login ─────────────────────────────────────────────
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

// ── Serve admin page with Google Client ID injected ─────────────
app.get('/admin/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'admin/index.html'), 'utf8');
  html = html.replace(
    '</head>',
    `<script>window.__GOOGLE_CLIENT_ID__ = "${GOOGLE_CLIENT_ID}";</script>\n</head>`
  );
  res.send(html);
});

// ── Public: read published data ──────────────────────────────────
app.get('/api/data', (req, res) => {
  res.json(readJSON(DATA_FILE));
});

// ── Admin: read draft ────────────────────────────────────────────
app.get('/api/draft', requireAuth, (req, res) => {
  res.json(readJSON(DRAFT_FILE));
});

// ── Admin: update a section in draft ────────────────────────────
app.put('/api/draft/:section', requireAuth, (req, res) => {
  const { section } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!(section in draft)) return res.status(404).json({ error: `Section "${section}" not found` });
  draft[section] = req.body;
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true, section, data: draft[section] });
});

// ── Admin: add item to an array section ─────────────────────────
app.post('/api/draft/:section', requireAuth, (req, res) => {
  const { section } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Section is not an array' });
  const newItem = { ...req.body, id: `${section}_${Date.now()}` };
  draft[section].push(newItem);
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true, item: newItem });
});

// ── Admin: update single item in array section ───────────────────
app.put('/api/draft/:section/:id', requireAuth, (req, res) => {
  const { section, id } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Section is not an array' });
  const idx = draft[section].findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  draft[section][idx] = { ...req.body, id };
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true, item: draft[section][idx] });
});

// ── Admin: delete item from array section ───────────────────────
app.delete('/api/draft/:section/:id', requireAuth, (req, res) => {
  const { section, id } = req.params;
  const draft = readJSON(DRAFT_FILE);
  if (!Array.isArray(draft[section])) return res.status(400).json({ error: 'Section is not an array' });
  const before = draft[section].length;
  draft[section] = draft[section].filter(i => i.id !== id);
  if (draft[section].length === before) return res.status(404).json({ error: 'Item not found' });
  writeJSON(DRAFT_FILE, draft);
  res.json({ success: true });
});

// ── Admin: publish draft → live ──────────────────────────────────
app.post('/api/publish', requireAuth, (req, res) => {
  const draft = readJSON(DRAFT_FILE);
  writeJSON(DATA_FILE, draft);
  res.json({ success: true, message: 'Draft published to live portfolio.' });
});

// ── Admin: reset draft to current live ──────────────────────────
app.post('/api/draft/reset', requireAuth, (req, res) => {
  const live = readJSON(DATA_FILE);
  writeJSON(DRAFT_FILE, live);
  res.json({ success: true, message: 'Draft reset to current live content.' });
});

app.listen(PORT, () => {
  console.log(`\n✅ Portfolio running at: http://localhost:${PORT}`);
  console.log(`🔐 Admin panel at:       http://localhost:${PORT}/admin/`);
  console.log(`   Google SSO — only ${ALLOWED_EMAIL} can access\n`);
  if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    console.warn('⚠️  Set GOOGLE_CLIENT_ID in .env or as environment variable!\n');
  }
});
