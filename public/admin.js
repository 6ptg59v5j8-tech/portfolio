
const byId = id => document.getElementById(id);

const authView = byId('auth-view');
const dashboard = byId('dashboard');
const loginForm = byId('login-form');

let projects = [];
let socials = [];
let skills = [];
let galleryPhotos = [];
let editingId = null;
let editingSkillId = null;
let siteSettings = {};
let bannerMessages = [];

let toastTimer;

function showSavedToast(message = 'Changes saved') {
  const toast = byId('admin-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function status(id, msg, error = false) {
  const el = byId(id);
  if (el) {
    el.textContent = msg;
    el.classList.toggle('error', error);
  }

  if (!error && /\bsaved\b|\buploaded\b|\bdeleted\b/i.test(msg)) {
    showSavedToast();
  }
}

function setValue(form, name, value) {
  if (form?.elements?.[name]) {
    form.elements[name].value = value ?? '';
  }
}

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

function showAuth() {
  if (authView) authView.hidden = false;
  if (dashboard) dashboard.hidden = true;
}

async function boot() {
  try {
    const result = await api('status');
    if (result.authenticated) await showDashboard();
    else showAuth();
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
if (byId('logout-button')) {
  byId('logout-button').addEventListener('click', async () => {
    try {
      await api('logout', { method: 'POST', body: '{}' });
      showAuth();
      if (loginForm) loginForm.reset();
      status('login-message', '');
    } catch (error) {
      alert('Logout failed: ' + error.message);
    }
  });
}

// DASHBOARD AND TABS
async function showDashboard() {
  if (authView) authView.hidden = true;
  if (dashboard) dashboard.hidden = false;

  await Promise.allSettled([
    loadContent(),
    loadProjects(),
    loadSkills(),
    loadAnnouncements()
  ]);
}

function activateTab(name) {
  document.querySelectorAll('.tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === name);
  });

  ['content', 'projects', 'skills', 'announcements'].forEach(panel => {
    const element = byId('panel-' + panel);
    if (element) element.hidden = panel !== name;
  });
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
});

// IMAGE UPLOAD AND PREVIEWS
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

function showImagePreview(previewId, url) {
  const preview = byId(previewId);
  if (!preview) return;

  preview.replaceChildren();

  if (!url) {
    const text = document.createElement('span');
    text.className = 'sub';
    text.textContent = 'No image uploaded yet.';
    preview.append(text);
    return;
  }

  const image = document.createElement('img');
  image.src = url;
  image.alt = 'Image preview';
  image.style.maxWidth = '220px';
  image.style.maxHeight = '180px';
  image.style.objectFit = 'contain';
  preview.append(image);
}

// CONTENT AND BRANDING
async function loadContent() {
  try {
    const data = await api('content');
    siteSettings = data.settings || {};

    const form = byId('content-form');

    if (form) {
      Object.entries(siteSettings).forEach(([key, value]) => {
        setValue(form, key, value);
      });

      showImagePreview('logo-preview', siteSettings.logo_url || '');
      showImagePreview('favicon-preview', siteSettings.favicon_url || '');
      showImagePreview(
        'about-photo-admin-preview',
        siteSettings.about_photo_url || ''
      );

      setValue(form, 'about_photo_url', siteSettings.about_photo_url || '');

      if (form.elements.availability_status) {
        form.elements.availability_status.value =
          siteSettings.availability_status === 'not_accepting'
            ? 'not_accepting'
            : 'available';
      }
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

// IMAGE FILE PREVIEWS
[
  ['logo_file', 'logo-preview'],
  ['favicon_file', 'favicon-preview'],
  ['about_photo_file', 'about-photo-admin-preview']
].forEach(([fileName, previewId]) => {
  const input = byId('content-form')?.elements?.[fileName];
  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;

    showImagePreview(previewId, URL.createObjectURL(file));
  });
});

// SAVE SITE CONTENT
if (byId('content-form')) {
  byId('content-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const settings = {};

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) continue;
      settings[key] = value;
    }

    try {
      status('content-status', 'Saving site content...');

      const logoFile = form.elements.logo_file?.files?.[0];
      const faviconFile = form.elements.favicon_file?.files?.[0];
      const aboutPhotoFile = form.elements.about_photo_file?.files?.[0];

      if (logoFile?.size) {
        settings.logo_url = await uploadImage(logoFile);
        setValue(form, 'logo_url', settings.logo_url);
      }

      if (faviconFile?.size) {
        settings.favicon_url = await uploadImage(faviconFile);
        setValue(form, 'favicon_url', settings.favicon_url);
      }

      if (aboutPhotoFile?.size) {
        settings.about_photo_url = await uploadImage(aboutPhotoFile);
        setValue(form, 'about_photo_url', settings.about_photo_url);
      }

      settings.about_photo_url =
        settings.about_photo_url ||
        form.elements.about_photo_url?.value ||
        '';

      settings.availability_status =
        form.elements.availability_status?.value || 'available';

      await api('content', {
        method: 'PUT',
        body: JSON.stringify({ settings, socials })
      });

      siteSettings = { ...siteSettings, ...settings };

      showImagePreview('logo-preview', settings.logo_url || '');
      showImagePreview('favicon-preview', settings.favicon_url || '');
      showImagePreview(
        'about-photo-admin-preview',
        settings.about_photo_url || ''
      );

      status('content-status', 'Changes saved.');
    } catch (error) {
      status('content-status', error.message, true);
    }
  });
}

// ANNOUNCEMENT BANNER
function getBannerForm() {
  return byId('announcement-form');
}

function renderBannerMessages() {
  const root = byId('banner-message-list');
  if (!root) return;

  root.replaceChildren();

  if (!bannerMessages.length) {
    const empty = document.createElement('p');
    empty.className = 'sub';
    empty.textContent = 'No messages yet. Add a message to get started.';
    root.append(empty);
  }

  bannerMessages.forEach((message, index) => {
    const row = document.createElement('div');
    row.className = 'banner-message-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 180;
    input.value = message;
    input.placeholder = 'Type your announcement...';
    input.setAttribute('aria-label', `Announcement message ${index + 1}`);

    input.addEventListener('input', () => {
      bannerMessages[index] = input.value;
      updateBannerPreview();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'quiet';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      bannerMessages.splice(index, 1);
      renderBannerMessages();
      updateBannerPreview();
    });

    row.append(input, remove);
    root.append(row);
  });
}

function updateBannerPreview() {
  const form = getBannerForm();
  const preview = byId('banner-preview');
  if (!form || !preview) return;

  preview.style.background = form.elements.banner_background.value;
  preview.style.color = form.elements.banner_text_colour.value;

  const message = bannerMessages.find(item => item.trim()) ||
    'Your announcement will appear here';

  preview.textContent = message;
}

async function loadAnnouncements() {
  try {
    const data = await api('content');
    siteSettings = { ...siteSettings, ...(data.settings || {}) };

    const form = getBannerForm();
    if (!form) return;

    form.elements.banner_enabled.checked =
      siteSettings.banner_enabled === 'true';

    form.elements.banner_background.value =
      siteSettings.banner_background || '#20211e';

    form.elements.banner_text_colour.value =
      siteSettings.banner_text_colour || '#ffffff';

    form.elements.banner_speed.value =
      siteSettings.banner_speed || '7';

    try {
      const parsed = JSON.parse(siteSettings.banner_messages || '[]');
      bannerMessages = Array.isArray(parsed)
        ? parsed.filter(item => typeof item === 'string')
        : [];
    } catch {
      bannerMessages = [];
    }

    renderBannerMessages();
    updateBannerPreview();
  } catch (error) {
    status('announcement-status', error.message, true);
  }
}

if (byId('add-banner-message')) {
  byId('add-banner-message').addEventListener('click', () => {
    bannerMessages.push('');
    renderBannerMessages();
    updateBannerPreview();
  });
}

[
  'banner_background',
  'banner_text_colour'
].forEach(name => {
  const input = getBannerForm()?.elements?.[name];
  if (input) input.addEventListener('input', updateBannerPreview);
});

if (getBannerForm()) {
  getBannerForm().addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.currentTarget;

    const settings = {
      ...siteSettings,
      banner_enabled: form.elements.banner_enabled.checked ? 'true' : 'false',
      banner_messages: JSON.stringify(
        bannerMessages.map(item => item.trim()).filter(Boolean)
      ),
      banner_background: form.elements.banner_background.value,
      banner_text_colour: form.elements.banner_text_colour.value,
      banner_speed: form.elements.banner_speed.value
    };

    try {
      status('announcement-status', 'Saving announcement banner...');

      await api('content', {
        method: 'PUT',
        body: JSON.stringify({ settings, socials })
      });

      siteSettings = settings;
      status('announcement-status', 'Announcement banner saved.');
    } catch (error) {
      status('announcement-status', error.message, true);
    }
  });
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
      project.project_date || '',
      project.venue || ''
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
    showSavedToast('Project order saved');
  } catch (error) {
    alert(error.message);
  }
}

async function deleteProject(project) {
  if (!confirm(`Delete "${project.title}" and its production photos?`)) return;

  try {
    await api('projects/' + encodeURIComponent(project.id), {
      method: 'DELETE'
    });

    if (editingId === project.id) {
      editingId = null;
      if (byId('project-editor')) byId('project-editor').hidden = true;
    }

    status('project-status', 'Project deleted.');
    await loadProjects();
  } catch (error) {
    alert(error.message);
  }
}

function resetGallery() {
  galleryPhotos = [];
  const root = byId('gallery-list');
  if (root) root.replaceChildren();

  const fileInput = byId('gallery_files');
  if (fileInput) fileInput.value = '';
}

function editProject(project) {
  editingId = project.id;
  resetGallery();

  const form = byId('project-form');
  if (!form) return;

  form.reset();

  Object.entries(project).forEach(([key, value]) => {
    setValue(form, key, value);
  });

  if (byId('project-editor-title')) {
    byId('project-editor-title').textContent = 'Edit production';
  }

  if (byId('project-editor')) {
    byId('project-editor').hidden = false;
    byId('project-editor').scrollIntoView({ behavior: 'smooth' });
  }

  loadProjectGallery(project);
}

if (byId('new-project')) {
  byId('new-project').addEventListener('click', () => {
    editingId = null;
    resetGallery();

    if (byId('project-form')) byId('project-form').reset();

    if (byId('project-editor-title')) {
      byId('project-editor-title').textContent = 'New production';
    }

    if (byId('project-editor')) {
      byId('project-editor').hidden = false;
      byId('project-editor').scrollIntoView({ behavior: 'smooth' });
    }
  });
}

if (byId('cancel-project')) {
  byId('cancel-project').addEventListener('click', () => {
    if (byId('project-editor')) byId('project-editor').hidden = true;
    editingId = null;
  });
}

// PRODUCTION GALLERY
function galleryRoot() {
  const editor = byId('gallery-editor');
  if (!editor) return null;

  let root = byId('gallery-list');

  if (!root) {
    root = document.createElement('div');
    root.id = 'gallery-list';
    root.className = 'gallery-list';
    editor.append(root);
  }

  return root;
}

function renderGallery() {
  const root = galleryRoot();
  if (!root) return;

  root.replaceChildren();

  if (!galleryPhotos.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No production photos have been added yet.';
    root.append(empty);
    return;
  }

  galleryPhotos.forEach((photo, index) => {
    const row = document.createElement('div');
    row.className = 'project-row';

    const image = document.createElement('img');
    image.src = photo.image_url;
    image.alt = photo.alt_text || 'Production photo';
    image.loading = 'lazy';
    image.style.width = '110px';
    image.style.height = '75px';
    image.style.objectFit = 'cover';

    const details = document.createElement('div');
    const label = document.createElement('p');
    label.textContent = photo.alt_text || `Photo ${index + 1}`;
    details.append(label);

    const actions = document.createElement('div');
    actions.className = 'project-actions';

    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.title = 'Move photo up';
    up.disabled = index === 0;
    up.addEventListener('click', () => moveGalleryPhoto(index, -1));

    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.title = 'Move photo down';
    down.disabled = index === galleryPhotos.length - 1;
    down.addEventListener('click', () => moveGalleryPhoto(index, 1));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => deleteGalleryPhoto(photo));

    actions.append(up, down, remove);
    row.append(image, details, actions);
    root.append(row);
  });
}

async function loadProjectGallery(project) {
  if (!project?.slug) {
    renderGallery();
    return;
  }

  try {
    const data = await api(
      'projects/slug/' + encodeURIComponent(project.slug)
    );

    galleryPhotos = data.photos || [];
    renderGallery();
  } catch (error) {
    status('project-status', 'Could not load production photos: ' + error.message, true);
  }
}

async function uploadGalleryPhotos() {
  if (!editingId) {
    status('project-status', 'Save the production first, then add its photos.', true);
    return;
  }

  const input = byId('gallery_files');
  const files = Array.from(input?.files || []).filter(file => file.size);

  if (!files.length) {
    status('project-status', 'Choose one or more photos first.', true);
    return;
  }

  const button = byId('upload-gallery-photos');
  if (button) button.disabled = true;

  try {
    for (let i = 0; i < files.length; i++) {
      status('project-status', `Uploading photo ${i + 1} of ${files.length}...`);

      const imageUrl = await uploadImage(files[i]);

      await api(`projects/${encodeURIComponent(editingId)}/photos`, {
        method: 'POST',
        body: JSON.stringify({
          image_url: imageUrl,
          alt_text: files[i].name.replace(/\.[^.]+$/, ''),
          sort_order: galleryPhotos.length + i
        })
      });
    }

    if (input) input.value = '';

    const project = projects.find(item => item.id === editingId);
    if (project) await loadProjectGallery(project);

    status('project-status', 'Production photos uploaded.');
  } catch (error) {
    status('project-status', error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteGalleryPhoto(photo) {
  if (!editingId || !confirm('Remove this production photo?')) return;

  try {
    await api(
      `projects/${encodeURIComponent(editingId)}/photos/${encodeURIComponent(photo.id)}`,
      { method: 'DELETE' }
    );

    galleryPhotos = galleryPhotos.filter(item => item.id !== photo.id);
    renderGallery();
    status('project-status', 'Photo removed.');
  } catch (error) {
    status('project-status', error.message, true);
  }
}

async function moveGalleryPhoto(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= galleryPhotos.length) return;

  const copy = [...galleryPhotos];
  [copy[index], copy[next]] = [copy[next], copy[index]];

  try {
    await api(`projects/${encodeURIComponent(editingId)}/photos/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ ids: copy.map(photo => photo.id) })
    });

    galleryPhotos = copy;
    renderGallery();
    showSavedToast('Photo order saved');
  } catch (error) {
    status('project-status', error.message, true);
  }
}

if (byId('upload-gallery-photos')) {
  byId('upload-gallery-photos').addEventListener('click', uploadGalleryPhotos);
}

// PROJECT FORM
if (byId('project-form')) {
  byId('project-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    let imageUrl = formData.get('image_url') || '';

    try {
      status('project-status', 'Saving production...');

      const coverFile = formData.get('image_file');
      if (coverFile && coverFile.size) {
        imageUrl = await uploadImage(coverFile);
      }

      const payload = {
        title: formData.get('title'),
        slug: formData.get('slug') || '',
        category: formData.get('category') || '',
        project_date: formData.get('project_date') || '',
        description: formData.get('description') || '',
        image_url: imageUrl,
        project_url: formData.get('project_url') || '',
        venue: formData.get('venue') || '',
        role: formData.get('role') || '',
        credits: formData.get('credits') || ''
      };

      if (editingId) {
        await api('projects/' + encodeURIComponent(editingId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        const result = await api('projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const savedProject = result.project || result;
        editingId = savedProject.id;
      }

      if (byId('project-editor')) byId('project-editor').hidden = true;

      status('project-status', 'Project saved.');
      await loadProjects();

      const matchingProject = projects.find(project => project.id === editingId);
      if (matchingProject) editProject(matchingProject);
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

  setValue(form, 'name', skill.name);
  setValue(form, 'category', skill.category || 'Lighting');
  setValue(form, 'description', skill.description);
  setValue(form, 'experience_level', skill.experience_level);
  setValue(form, 'image_url', skill.image_url);

  if (form.elements.is_visible) {
    form.elements.is_visible.checked =
      !(Number(skill.is_visible) === 0 || skill.is_visible === false);
  }

  if (byId('skill-editor-title')) {
    byId('skill-editor-title').textContent = 'Edit skill';
  }

  if (byId('skill-editor')) {
    byId('skill-editor').hidden = false;
    byId('skill-editor').scrollIntoView({ behavior: 'smooth' });
  }
}

if (byId('new-skill')) {
  byId('new-skill').addEventListener('click', () => {
    editingSkillId = null;

    const form = byId('skill-form');
    if (form) {
      form.reset();
      if (form.elements.is_visible) form.elements.is_visible.checked = true;
    }

    if (byId('skill-editor-title')) {
      byId('skill-editor-title').textContent = 'New skill';
    }

    if (byId('skill-editor')) byId('skill-editor').hidden = false;
  });
}

if (byId('cancel-skill')) {
  byId('cancel-skill').addEventListener('click', () => {
    if (byId('skill-editor')) byId('skill-editor').hidden = true;
  });
}

if (byId('skill-form')) {
  byId('skill-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: formData.get('name'),
      category: formData.get('category'),
      description: formData.get('description') || '',
      experience_level: formData.get('experience_level') || null,
      image_url: formData.get('image_url') || '',
      is_visible: form.elements.is_visible.checked
    };

    try {
      const file = formData.get('image_file');
      if (file && file.size) payload.image_url = await uploadImage(file);

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
