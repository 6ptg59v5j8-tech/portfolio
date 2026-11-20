const byId = id => document.getElementById(id);

const authView = byId('auth-view');
const dashboard = byId('dashboard');
const loginForm = byId('login-form');

let projects = [];
let socials = [];
let skills = [];
let editingId = null;
let editingSkillId = null;

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  headers.set('Accept', 'application/json');

  const response = await fetch('/api/' + path, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  const data = await response.json().catch(() => ({
    error: 'Unexpected server response'
  }));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function status(id, msg, error = false) {
  const el = byId(id);
  if (!el) return;

  el.textContent = msg;
  el.classList.toggle('error', error);
}

function showAuth() {
  if (authView) authView.hidden = false;
  if (dashboard) dashboard.hidden = true;
  if (loginForm) loginForm.hidden = false;
}

async function boot() {
  try {
    const result = await api('status');

    if (result.authenticated) {
      await showDashboard();
    } else {
      showAuth();
    }
  } catch (error) {
    showAuth();
    status('login-message', error.message, true);
  }
}

// LOGIN
if (loginForm) {
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    status('login-message', 'Signing in...');

    const form = new FormData(loginForm);

    try {
      await api('login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password')
        })
      });

      await showDashboard();
    } catch (error) {
      status('login-message', error.message, true);
    }
  });
}

// LOGOUT
const logoutButton = byId('logout-button');

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await api('logout', {
        method: 'POST',
        body: '{}'
      });

      showAuth();
      if (loginForm) loginForm.reset();
      status('login-message', '');
    } catch (error) {
      alert('Logout failed: ' + error.message);
    }
  });
}

// DASHBOARD
async function showDashboard() {
  if (authView) authView.hidden = true;
  if (dashboard) dashboard.hidden = false;

  await Promise.allSettled([
    loadContent(),
    loadProjects(),
    loadSkills()
  ]);
}

// TABS
function activateTab(name) {
  document.querySelectorAll('.tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === name);
  });

  ['content', 'projects', 'skills'].forEach(panel => {
    const element = byId('panel-' + panel);
    if (element) element.hidden = panel !== name;
  });
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
});

// SITE CONTENT
async function loadContent() {
  try {
    const data = await api('content');
    const form = byId('content-form');

    if (form) {
      Object.entries(data.settings || {}).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = value ?? '';
      });
    }

    socials = data.socials || [];
    renderSocials();
  } catch (error) {
    status('content-status', error.message, true);
  }
}

function renderSocials() {
  const root = byId('social-editor');
  if (!root) return;

  root.replaceChildren();

  socials.forEach((social, index) => {
    const row = document.createElement('div');
    row.className = 'social-row';

    const label = document.createElement('input');
    label.placeholder = 'Label';
    label.value = social.label || '';
    label.maxLength = 40;
    label.setAttribute('aria-label', 'Social link label');

    const url = document.createElement('input');
    url.placeholder = 'https://...';
    url.value = social.url || '';
    url.maxLength = 500;
    url.type = 'url';
    url.setAttribute('aria-label', 'Social link URL');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';

    remove.addEventListener('click', () => {
      socials.splice(index, 1);
      renderSocials();
    });

    label.addEventListener('input', () => {
      socials[index].label = label.value;
    });

    url.addEventListener('input', () => {
      socials[index].url = url.value;
    });

    row.append(label, url, remove);
    root.append(row);
  });
}

if (byId('add-social')) {
  byId('add-social').addEventListener('click', () => {
    socials.push({ label: '', url: '' });
    renderSocials();
  });
}

if (byId('content-form')) {
  byId('content-form').addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const settings = {};

    for (const [key, value] of formData.entries()) {
      settings[key] = value;
    }

    try {
      await api('content', {
        method: 'PUT',
        body: JSON.stringify({ settings, socials })
      });

      status('content-status', 'Saved - your live website has been updated.');
    } catch (error) {
      status('content-status', error.message, true);
    }
  });
}

// IMAGE UPLOAD
async function uploadImage(file) {
  if (!file || !file.size) return '';

  const upload = new FormData();
  upload.append('image', file);

  const result = await api('upload', {
    method: 'POST',
    body: upload
  });

  return result.url;
}

// PROJECTS
async function loadProjects() {
  try {
    const data = await api('projects');
    projects = data.projects || [];
    renderProjects();
  } catch (error) {
    status('project-status', error.message, true);
  }
}

function renderProjects() {
  const list = byId('project-list');
  if (!list) return;

  list.replaceChildren();

  projects.forEach((project, index) => {
    const row = document.createElement('div');
    row.className = 'project-row';

    const info = document.createElement('div');
    const heading = document.createElement('h3');
    const subtitle = document.createElement('p');

    heading.textContent = project.title || 'Untitled project';
    subtitle.textContent = [
      project.category || 'Uncategorised',
      project.project_date || ''
    ].filter(Boolean).join(' · ');

    info.append(heading, subtitle);

    const actions = document.createElement('div');
    actions.className = 'project-actions';

    [
      ['↑', 'Move up', () => moveProject(index, -1)],
      ['↓', 'Move down', () => moveProject(index, 1)],
      ['Edit', 'Edit project', () => editProject(project)],
      ['Delete', 'Delete project', () => deleteProject(project)]
    ].forEach(([label, title, callback]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.addEventListener('click', callback);
      actions.append(button);
    });

    row.append(info, actions);
    list.append(row);
  });
}

async function moveProject(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= projects.length) return;

  const copy = [...projects];
  [copy[index], copy[next]] = [copy[next], copy[index]];

  try {
    await api('projects/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids: copy.map(project => project.id) })
    });

    await loadProjects();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteProject(project) {
  if (!confirm(`Delete "${project.title}"?`)) return;

  try {
    await api('projects/' + encodeURIComponent(project.id), {
      method: 'DELETE'
    });

    await loadProjects();
  } catch (error) {
    alert(error.message);
  }
}

function editProject(project) {
  editingId = project.id;

  const form = byId('project-form');
  if (!form) return;

  form.reset();

  Object.entries(project).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? '';
  });

  if (byId('project-editor-title')) {
    byId('project-editor-title').textContent = 'Edit project';
  }

  if (byId('project-editor')) {
    byId('project-editor').hidden = false;
    byId('project-editor').scrollIntoView({ behavior: 'smooth' });
  }
}

if (byId('new-project')) {
  byId('new-project').addEventListener('click', () => {
    editingId = null;
    if (byId('project-form')) byId('project-form').reset();

    if (byId('project-editor-title')) {
      byId('project-editor-title').textContent = 'New project';
    }

    if (byId('project-editor')) byId('project-editor').hidden = false;
  });
}

if (byId('cancel-project')) {
  byId('cancel-project').addEventListener('click', () => {
    if (byId('project-editor')) byId('project-editor').hidden = true;
  });
}

if (byId('project-form')) {
  byId('project-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    let imageUrl = formData.get('image_url') || '';

    try {
      const file = formData.get('image_file');
      if (file && file.size) imageUrl = await uploadImage(file);

      const payload = {
        title: formData.get('title'),
        category: formData.get('category'),
        project_date: formData.get('project_date') || '',
        description: formData.get('description'),
        image_url: imageUrl,
        project_url: formData.get('project_url')
      };

      if (editingId) {
        await api('projects/' + encodeURIComponent(editingId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await api('projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      byId('project-editor').hidden = true;
      status('project-status', 'Saved.');
      await loadProjects();
    } catch (error) {
      status('project-status', error.message, true);
    }
  });
}

// SKILLS
async function loadSkills() {
  try {
    const data = await api('admin/skills');
    skills = data.skills || [];
    renderSkills();
  } catch (error) {
    status('skill-status', error.message, true);
  }
}

function renderSkills() {
  const list = byId('skills-list');
  if (!list) return;

  list.replaceChildren();

  if (!skills.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No skills added yet. Select "Add skill" to get started.';
    list.append(empty);
    return;
  }

  skills.forEach(skill => {
    const card = document.createElement('div');
    card.className = 'skill-row';

    const info = document.createElement('div');
    const heading = document.createElement('h3');
    const details = document.createElement('p');
    const visibility = document.createElement('p');

    heading.textContent = skill.name || 'Untitled skill';

    details.textContent = [
      skill.category || 'Uncategorised',
      skill.experience_level || '',
      skill.description || ''
    ].filter(Boolean).join(' · ');

    visibility.textContent =
      Number(skill.is_visible) === 0 || skill.is_visible === false
        ? 'Hidden from website'
        : 'Visible on website';

    info.append(heading, details, visibility);

    const actions = document.createElement('div');
    actions.className = 'project-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => editSkill(skill));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteSkill(skill));

    actions.append(editButton, deleteButton);
    card.append(info, actions);
    list.append(card);
  });
}

function editSkill(skill) {
  editingSkillId = skill.id;

  const form = byId('skill-form');
  if (!form) return;

  form.reset();

  form.elements.name.value = skill.name || '';
  form.elements.category.value = skill.category || 'Lighting';
  form.elements.description.value = skill.description || '';
  form.elements.experience_level.value = skill.experience_level || '';
  form.elements.image_url.value = skill.image_url || '';
  form.elements.is_visible.checked =
    !(Number(skill.is_visible) === 0 || skill.is_visible === false);

  byId('skill-editor-title').textContent = 'Edit skill';
  byId('skill-editor').hidden = false;
  byId('skill-editor').scrollIntoView({ behavior: 'smooth' });
}

if (byId('new-skill')) {
  byId('new-skill').addEventListener('click', () => {
    editingSkillId = null;

    const form = byId('skill-form');
    if (form) {
      form.reset();
      form.elements.is_visible.checked = true;
    }

    byId('skill-editor-title').textContent = 'New skill';
    byId('skill-editor').hidden = false;
  });
}

if (byId('cancel-skill')) {
  byId('cancel-skill').addEventListener('click', () => {
    byId('skill-editor').hidden = true;
  });
}

if (byId('skill-form')) {
  byId('skill-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    let imageUrl = formData.get('image_url') || '';

    const payload = {
      name: formData.get('name'),
      category: formData.get('category'),
      description: formData.get('description') || '',
      experience_level: formData.get('experience_level') || null,
      image_url: imageUrl,
      is_visible: form.elements.is_visible.checked
    };

    try {
      const file = formData.get('image_file');
      if (file && file.size) {
        payload.image_url = await uploadImage(file);
      }

      if (editingSkillId) {
        await api('skills/' + encodeURIComponent(editingSkillId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await api('skills', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      byId('skill-editor').hidden = true;
      status('skill-status', 'Skill saved.');
      await loadSkills();
    } catch (error) {
      status('skill-status', error.message, true);
    }
  });
}

async function deleteSkill(skill) {
  if (!confirm(`Delete "${skill.name}"?`)) return;

  try {
    await api('skills/' + encodeURIComponent(skill.id), {
      method: 'DELETE'
    });

    status('skill-status', 'Skill deleted.');
    await loadSkills();
  } catch (error) {
    status('skill-status', error.message, true);
  }
}

// START
boot();
