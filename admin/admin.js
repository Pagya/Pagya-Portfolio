/* ── State ── */
let token = localStorage.getItem('admin_token') || null;
let draft = {};
let currentSection = 'hero';
let pendingSave = null;

/* ── DOM refs ── */
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const editorArea = document.getElementById('editorArea');
const sectionTitle = document.getElementById('sectionTitle');
const toast = document.getElementById('toast');
const modalOverlay = document.getElementById('modalOverlay');

/* ── Init ── */
if (token) showDashboard();

/* ── Login ── */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('loginError');
  err.textContent = '';
  try {
    const res = await api('/api/login', 'POST', {
      username: document.getElementById('loginUser').value,
      password: document.getElementById('loginPass').value
    }, false);
    token = res.token;
    localStorage.setItem('admin_token', token);
    showDashboard();
  } catch (ex) {
    err.textContent = ex.message || 'Invalid credentials';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  token = null; localStorage.removeItem('admin_token');
  dashboard.classList.add('hidden'); loginScreen.classList.remove('hidden');
});

/* ── Nav ── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    currentSection = item.dataset.section;
    sectionTitle.textContent = item.textContent.replace(/^.{2}/, '').trim();
    renderSection(currentSection);
  });
});

/* ── Save ── */
document.getElementById('saveBtn').addEventListener('click', saveCurrentSection);

/* ── Publish ── */
document.getElementById('publishBtn').addEventListener('click', () => {
  confirm('Publish Draft to Live', 'This will replace the live portfolio with your current draft. Are you sure?', async () => {
    await api('/api/publish', 'POST');
    showToast('Published to live site ✅', 'success');
  });
});

/* ── Reset ── */
document.getElementById('resetBtn').addEventListener('click', () => {
  confirm('Reset Draft', 'This will discard all unsaved draft changes and reset to the current live content.', async () => {
    await api('/api/draft/reset', 'POST');
    draft = await api('/api/draft');
    renderSection(currentSection);
    showToast('Draft reset to live content', 'success');
  });
});

/* ── Dashboard init ── */
async function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  try {
    draft = await api('/api/draft');
    renderSection(currentSection);
  } catch {
    showToast('Session expired. Please log in again.', 'error');
    token = null; localStorage.removeItem('admin_token');
    loginScreen.classList.remove('hidden'); dashboard.classList.add('hidden');
  }
}

/* ── Section renderer ── */
function renderSection(section) {
  editorArea.innerHTML = '';
  const d = draft[section];
  if (!d) { editorArea.innerHTML = '<p style="color:#6b7280">Section not found.</p>'; return; }

  switch (section) {
    case 'hero':        renderHero(d); break;
    case 'about':       renderAbout(d); break;
    case 'achievements': renderArraySection(d, 'achievements', renderAchievementItem); break;
    case 'caseStudies': renderArraySection(d, 'caseStudies', renderCaseStudyItem); break;
    case 'skills':      renderSkills(d); break;
    case 'experience':  renderArraySection(d, 'experience', renderExperienceItem); break;
    case 'contact':     renderContact(d); break;
  }
}

/* ── HERO ── */
function renderHero(d) {
  editorArea.innerHTML = `
    <p class="section-intro">Edit the hero section — name, title, value proposition, and availability badge.</p>
    <div class="editor-card">
      <div class="fields-grid">
        <div class="field"><label>Name</label><input id="h_name" value="${esc(d.name)}" /></div>
        <div class="field"><label>Eyebrow Badge</label><input id="h_eyebrow" value="${esc(d.eyebrow)}" /></div>
        <div class="field field--full"><label>Title Line</label><input id="h_title" value="${esc(d.title)}" /></div>
        <div class="field field--full"><label>Value Proposition</label><textarea id="h_value">${esc(d.value)}</textarea></div>
      </div>
    </div>`;
  pendingSave = () => ({
    name: val('h_name'), eyebrow: val('h_eyebrow'),
    title: val('h_title'), value: val('h_value')
  });
}

/* ── ABOUT ── */
function renderAbout(d) {
  editorArea.innerHTML = `
    <p class="section-intro">Edit the about section heading, paragraphs, and stat cards.</p>
    <div class="editor-card">
      <div class="editor-card__header"><span class="editor-card__title">Heading & Paragraphs</span></div>
      <div class="field"><label>Section Heading</label><textarea id="ab_heading">${esc(d.heading)}</textarea></div>
      ${d.paragraphs.map((p, i) => `<div class="field"><label>Paragraph ${i+1}</label><textarea id="ab_p${i}" rows="4">${esc(p)}</textarea></div>`).join('')}
    </div>
    <div class="editor-card">
      <div class="editor-card__header"><span class="editor-card__title">Stat Cards</span></div>
      <div class="fields-grid">
        ${d.stats.map((s, i) => `
          <div class="field"><label>Stat ${i+1} Number</label><input id="ab_sn${i}" value="${esc(s.number)}" /></div>
          <div class="field"><label>Stat ${i+1} Label</label><input id="ab_sl${i}" value="${esc(s.label)}" /></div>
        `).join('')}
      </div>
    </div>`;
  pendingSave = () => ({
    heading: val('ab_heading'),
    paragraphs: d.paragraphs.map((_, i) => val(`ab_p${i}`)),
    stats: d.stats.map((_, i) => ({ number: val(`ab_sn${i}`), label: val(`ab_sl${i}`) }))
  });
}

/* ── GENERIC ARRAY SECTION ── */
function renderArraySection(items, section, itemRenderer) {
  editorArea.innerHTML = '';
  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'editor-card';
    card.id = `card_${item.id}`;
    card.innerHTML = itemRenderer(item, i);
    editorArea.appendChild(card);
    attachArrayItemEvents(card, item, section);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--add';
  addBtn.textContent = `+ Add New ${section === 'caseStudies' ? 'Case Study' : section === 'achievements' ? 'Achievement' : 'Experience'}`;
  addBtn.addEventListener('click', () => addArrayItem(section));
  editorArea.appendChild(addBtn);
  pendingSave = null; // array items save individually
}

function attachArrayItemEvents(card, item, section) {
  card.querySelector('.save-item-btn')?.addEventListener('click', () => saveArrayItem(card, item, section));
  card.querySelector('.del-item-btn')?.addEventListener('click', () => {
    confirm('Delete Item', `Delete "${item.title || item.role || 'this item'}"? This cannot be undone.`, async () => {
      await api(`/api/draft/${section}/${item.id}`, 'DELETE');
      draft[section] = draft[section].filter(i => i.id !== item.id);
      renderSection(currentSection);
      showToast('Item deleted', 'success');
    });
  });
}

/* ── ACHIEVEMENT ITEM ── */
function renderAchievementItem(item) {
  return `
    <div class="editor-card__header">
      <span class="editor-card__title">${esc(item.title || 'New Achievement')}</span>
      <div class="editor-card__actions">
        <button class="btn btn--icon btn--edit save-item-btn">Save</button>
        <button class="btn btn--icon btn--del del-item-btn">Delete</button>
      </div>
    </div>
    <div class="fields-grid">
      <div class="field"><label>Icon (emoji)</label><input class="f_icon" value="${esc(item.icon)}" /></div>
      <div class="field"><label>Metric</label><input class="f_metric" value="${esc(item.metric)}" /></div>
      <div class="field field--full"><label>Title</label><input class="f_title" value="${esc(item.title)}" /></div>
      <div class="field field--full"><label>Description</label><textarea class="f_desc">${esc(item.desc)}</textarea></div>
      <div class="field field--full"><label>Tag</label><input class="f_tag" value="${esc(item.tag)}" /></div>
    </div>`;
}

/* ── CASE STUDY ITEM ── */
function renderCaseStudyItem(item) {
  const stepsHtml = (item.steps || []).map((s, i) => `
    <div class="step-item" data-step="${i}">
      <input class="step-title" value="${esc(s.title)}" placeholder="Step title" />
      <input class="step-desc" value="${esc(s.desc)}" placeholder="Step description" />
      <button class="btn btn--icon btn--del remove-step" data-i="${i}" style="flex-shrink:0">✕</button>
    </div>`).join('');
  const impactHtml = (item.impact || []).map((m, i) => `
    <div class="step-item" data-imp="${i}">
      <input class="imp-value" value="${esc(m.value)}" placeholder="Value" style="max-width:120px" />
      <input class="imp-label" value="${esc(m.label)}" placeholder="Label" />
      <button class="btn btn--icon btn--del remove-impact" data-i="${i}" style="flex-shrink:0">✕</button>
    </div>`).join('');
  return `
    <div class="editor-card__header">
      <span class="editor-card__title">${esc(item.title || 'New Case Study')}</span>
      <div class="editor-card__actions">
        <button class="btn btn--icon btn--edit save-item-btn">Save</button>
        <button class="btn btn--icon btn--del del-item-btn">Delete</button>
      </div>
    </div>
    <div class="fields-grid">
      <div class="field"><label>Number (e.g. 01)</label><input class="f_number" value="${esc(item.number)}" /></div>
      <div class="field"><label>Tag</label><input class="f_tag" value="${esc(item.tag)}" /></div>
      <div class="field field--full"><label>Title</label><input class="f_title" value="${esc(item.title)}" /></div>
      <div class="field field--full"><label>Summary</label><textarea class="f_summary">${esc(item.summary)}</textarea></div>
      <div class="field field--full"><label>Problem Statement</label><textarea class="f_problem">${esc(item.problem)}</textarea></div>
      <div class="field field--full"><label>Context</label><textarea class="f_context">${esc(item.context)}</textarea></div>
      <div class="field field--full"><label>My Role</label><textarea class="f_role">${esc(item.role)}</textarea></div>
      <div class="field field--full"><label>Solution</label><textarea class="f_solution">${esc(item.solution)}</textarea></div>
      <div class="field field--full"><label>Learnings</label><textarea class="f_learnings">${esc(item.learnings)}</textarea></div>
    </div>
    <div class="field field--full" style="margin-top:0.75rem">
      <label>Approach Steps</label>
      <div class="steps-list cs-steps-list">${stepsHtml}</div>
      <button class="btn btn--add add-step-btn" style="margin-top:0.4rem">+ Add Step</button>
    </div>
    <div class="field field--full" style="margin-top:0.75rem">
      <label>Impact Metrics</label>
      <div class="steps-list cs-impact-list">${impactHtml}</div>
      <button class="btn btn--add add-impact-btn" style="margin-top:0.4rem">+ Add Metric</button>
    </div>`;
}

/* ── EXPERIENCE ITEM ── */
function renderExperienceItem(item) {
  const outcomesHtml = (item.outcomes || []).map((o, i) => `
    <div class="step-item" data-out="${i}">
      <input class="outcome-text" value="${esc(o)}" placeholder="Outcome" />
      <button class="btn btn--icon btn--del remove-outcome" data-i="${i}" style="flex-shrink:0">✕</button>
    </div>`).join('');
  return `
    <div class="editor-card__header">
      <span class="editor-card__title">${esc(item.role || 'New Role')}</span>
      <div class="editor-card__actions">
        <button class="btn btn--icon btn--edit save-item-btn">Save</button>
        <button class="btn btn--icon btn--del del-item-btn">Delete</button>
      </div>
    </div>
    <div class="fields-grid">
      <div class="field"><label>Role</label><input class="f_role" value="${esc(item.role)}" /></div>
      <div class="field"><label>Company</label><input class="f_company" value="${esc(item.company)}" /></div>
      <div class="field"><label>Location</label><input class="f_location" value="${esc(item.location)}" /></div>
      <div class="field"><label>Industry</label><input class="f_industry" value="${esc(item.industry)}" /></div>
      <div class="field"><label>Period</label><input class="f_period" value="${esc(item.period)}" /></div>
      <div class="field field--full"><label>Summary</label><textarea class="f_summary">${esc(item.summary)}</textarea></div>
    </div>
    <div class="field" style="margin-top:0.75rem">
      <label>Key Outcomes</label>
      <div class="steps-list exp-outcomes-list">${outcomesHtml}</div>
      <button class="btn btn--add add-outcome-btn" style="margin-top:0.4rem">+ Add Outcome</button>
    </div>`;
}

/* ── SKILLS ── */
function renderSkills(d) {
  editorArea.innerHTML = `<p class="section-intro">Manage skill tags for each category. Click × to remove, type and press Enter or click Add to add new ones.</p>`;
  ['business', 'product', 'tools'].forEach(cat => {
    const labels = { business: '🔍 Business Analysis', product: '💡 Product Thinking', tools: '🛠️ Tools & Platforms' };
    const card = document.createElement('div');
    card.className = 'editor-card';
    card.innerHTML = `
      <div class="editor-card__header"><span class="editor-card__title">${labels[cat]}</span></div>
      <div class="tags-editor" id="tags_${cat}">
        ${d[cat].map(t => tagChip(t, cat)).join('')}
      </div>
      <div class="tag-add-row">
        <input id="tagInput_${cat}" placeholder="Add skill..." />
        <button onclick="addTag('${cat}')">Add</button>
      </div>`;
    editorArea.appendChild(card);
    card.querySelectorAll('.tag-chip__remove').forEach(btn => {
      btn.addEventListener('click', () => removeTag(cat, btn.dataset.tag));
    });
    card.querySelector(`#tagInput_${cat}`).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addTag(cat); }
    });
  });
  pendingSave = () => ({
    business: getTags('business'),
    product: getTags('product'),
    tools: getTags('tools')
  });
}

function tagChip(t, cat) {
  return `<span class="tag-chip">${esc(t)}<span class="tag-chip__remove" data-tag="${esc(t)}" data-cat="${cat}">×</span></span>`;
}
window.addTag = function(cat) {
  const input = document.getElementById(`tagInput_${cat}`);
  const val = input.value.trim();
  if (!val) return;
  const container = document.getElementById(`tags_${cat}`);
  const chip = document.createElement('span');
  chip.className = 'tag-chip';
  chip.innerHTML = `${esc(val)}<span class="tag-chip__remove" data-tag="${esc(val)}" data-cat="${cat}">×</span>`;
  chip.querySelector('.tag-chip__remove').addEventListener('click', () => removeTag(cat, val));
  container.appendChild(chip);
  input.value = '';
};
function removeTag(cat, tag) {
  const container = document.getElementById(`tags_${cat}`);
  container.querySelectorAll('.tag-chip').forEach(chip => {
    if (chip.querySelector('.tag-chip__remove')?.dataset.tag === tag) chip.remove();
  });
}
function getTags(cat) {
  return [...document.querySelectorAll(`#tags_${cat} .tag-chip`)].map(c => c.childNodes[0].textContent.trim());
}

/* ── CONTACT ── */
function renderContact(d) {
  editorArea.innerHTML = `
    <p class="section-intro">Edit contact section intro text and links.</p>
    <div class="editor-card">
      <div class="fields-grid">
        <div class="field field--full"><label>Intro Text</label><textarea id="c_intro" rows="4">${esc(d.intro)}</textarea></div>
        <div class="field"><label>Phone</label><input id="c_phone" value="${esc(d.phone)}" /></div>
        <div class="field"><label>Email</label><input id="c_email" value="${esc(d.email)}" /></div>
        <div class="field field--full"><label>LinkedIn URL</label><input id="c_linkedin" value="${esc(d.linkedin)}" /></div>
      </div>
    </div>`;
  pendingSave = () => ({
    intro: val('c_intro'), phone: val('c_phone'),
    email: val('c_email'), linkedin: val('c_linkedin')
  });
}

/* ── SAVE HANDLERS ── */
async function saveCurrentSection() {
  if (!pendingSave) { showToast('Use the Save button on each item', 'error'); return; }
  try {
    const data = pendingSave();
    await api(`/api/draft/${currentSection}`, 'PUT', data);
    draft[currentSection] = data;
    showToast('Section saved to draft ✅', 'success');
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}

async function saveArrayItem(card, item, section) {
  try {
    let data;
    if (section === 'achievements') {
      data = {
        icon: card.querySelector('.f_icon').value,
        metric: card.querySelector('.f_metric').value,
        title: card.querySelector('.f_title').value,
        desc: card.querySelector('.f_desc').value,
        tag: card.querySelector('.f_tag').value
      };
    } else if (section === 'caseStudies') {
      data = {
        number: card.querySelector('.f_number').value,
        tag: card.querySelector('.f_tag').value,
        title: card.querySelector('.f_title').value,
        summary: card.querySelector('.f_summary').value,
        problem: card.querySelector('.f_problem').value,
        context: card.querySelector('.f_context').value,
        role: card.querySelector('.f_role').value,
        solution: card.querySelector('.f_solution').value,
        learnings: card.querySelector('.f_learnings').value,
        steps: [...card.querySelectorAll('.step-item[data-step]')].map(s => ({
          title: s.querySelector('.step-title').value,
          desc: s.querySelector('.step-desc').value
        })),
        impact: [...card.querySelectorAll('.step-item[data-imp]')].map(m => ({
          value: m.querySelector('.imp-value').value,
          label: m.querySelector('.imp-label').value
        }))
      };
    } else if (section === 'experience') {
      data = {
        role: card.querySelector('.f_role').value,
        company: card.querySelector('.f_company').value,
        location: card.querySelector('.f_location').value,
        industry: card.querySelector('.f_industry').value,
        period: card.querySelector('.f_period').value,
        summary: card.querySelector('.f_summary').value,
        outcomes: [...card.querySelectorAll('.outcome-text')].map(i => i.value)
      };
    }
    const updated = await api(`/api/draft/${section}/${item.id}`, 'PUT', data);
    const idx = draft[section].findIndex(i => i.id === item.id);
    if (idx !== -1) draft[section][idx] = updated.item;
    showToast('Saved to draft ✅', 'success');
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}

async function addArrayItem(section) {
  const defaults = {
    achievements: { icon: '⭐', metric: 'X%', title: 'New Achievement', desc: 'Description here', tag: 'Tag' },
    caseStudies: { number: '04', tag: 'New', title: 'New Case Study', summary: '', problem: '', context: '', role: '', solution: '', learnings: '', steps: [], impact: [] },
    experience: { role: 'New Role', company: 'Company', location: 'Location', industry: 'Industry', period: '20XX – Present', summary: '', outcomes: [] }
  };
  try {
    const res = await api(`/api/draft/${section}`, 'POST', defaults[section]);
    draft[section].push(res.item);
    renderSection(currentSection);
    showToast('New item added — fill in the details and save', 'success');
  } catch (e) {
    showToast('Failed to add item: ' + e.message, 'error');
  }
}

/* ── Dynamic step/impact/outcome add ── */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('add-step-btn')) {
    const list = e.target.previousElementSibling;
    const i = list.children.length;
    const div = document.createElement('div');
    div.className = 'step-item'; div.dataset.step = i;
    div.innerHTML = `<input class="step-title" placeholder="Step title" /><input class="step-desc" placeholder="Step description" /><button class="btn btn--icon btn--del remove-step" data-i="${i}" style="flex-shrink:0">✕</button>`;
    list.appendChild(div);
  }
  if (e.target.classList.contains('add-impact-btn')) {
    const list = e.target.previousElementSibling;
    const i = list.children.length;
    const div = document.createElement('div');
    div.className = 'step-item'; div.dataset.imp = i;
    div.innerHTML = `<input class="imp-value" placeholder="Value" style="max-width:120px" /><input class="imp-label" placeholder="Label" /><button class="btn btn--icon btn--del remove-impact" data-i="${i}" style="flex-shrink:0">✕</button>`;
    list.appendChild(div);
  }
  if (e.target.classList.contains('add-outcome-btn')) {
    const list = e.target.previousElementSibling;
    const i = list.children.length;
    const div = document.createElement('div');
    div.className = 'step-item'; div.dataset.out = i;
    div.innerHTML = `<input class="outcome-text" placeholder="Outcome" /><button class="btn btn--icon btn--del remove-outcome" data-i="${i}" style="flex-shrink:0">✕</button>`;
    list.appendChild(div);
  }
  if (e.target.classList.contains('remove-step') || e.target.classList.contains('remove-impact') || e.target.classList.contains('remove-outcome')) {
    e.target.closest('.step-item').remove();
  }
});

/* ── API helper ── */
async function api(url, method = 'GET', body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ── Confirm modal ── */
function confirm(title, body, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent = body;
  modalOverlay.classList.remove('hidden');
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');
  const close = () => modalOverlay.classList.add('hidden');
  confirmBtn.onclick = () => { close(); onConfirm(); };
  cancelBtn.onclick = close;
}

/* ── Toast ── */
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast toast--${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

/* ── Utils ── */
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function val(id) { return document.getElementById(id)?.value || ''; }
