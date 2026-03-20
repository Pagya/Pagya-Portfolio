const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pagya-portfolio-secret-2026';
const DATA_FILE = path.join(__dirname, 'data.json');
const DRAFT_FILE = path.join(__dirname, 'draft.json');

// Admin credentials (hashed password for "admin123" — change this)
const ADMIN = {
  username: 'admin',
  // To change password: node -e "const b=require('bcryptjs');console.log(b.hashSync('yourpassword',10))"
  passwordHash: bcrypt.hashSync('admin123', 10)
};

app.use(express.json());
app.use(express.static(__dirname)); // serve portfolio files

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

// ── Auth routes ──────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN.username || !bcrypt.compareSync(password, ADMIN.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
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
  console.log(`   Username: admin  |  Password: admin123\n`);
});
