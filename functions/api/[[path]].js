
const ITERATIONS = 100000;
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const MAX_BODY = 1_000_000;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });

const fail = (message, status = 400) => json({ error: message }, status);

/* Every piece of public text that can be edited from the dashboard.
   An empty value means "use the built-in default written in the page". */
const LABEL_KEYS = [
  'wordmark_text', 'nav_work', 'nav_about', 'nav_skills', 'nav_contact',
  'work_kicker', 'work_title', 'work_note', 'work_empty', 'card_button',
  'about_kicker', 'skills_kicker', 'skills_title', 'skills_note',
  'tab_skills', 'tab_education', 'education_title', 'education_note', 'contact_kicker',
  'footer_tagline', 'back_to_top', 'project_footer_text', 'project_footer_link',
  'label_back_to_work', 'label_gallery', 'label_venue', 'label_role', 'label_credits',
  'label_visit_project', 'label_previous_project', 'label_next_project'
];
const SECTION_KEYS = ['show_work', 'show_about', 'show_skills', 'show_education', 'show_contact'];

let schemaChecked = false;
async function ensureSchema(env) {
  if (schemaChecked) return;
  const cols = await env.DB.prepare('PRAGMA table_info(projects)').all();
  if (!cols.results.some(c => c.name === 'is_visible')) {
    await env.DB.prepare('ALTER TABLE projects ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1').run();
  }
  schemaChecked = true;
}

/* 'newest' = newest dated project first (undated last); 'manual' = the order set in the dashboard. */
function sortProjects(rows, mode) {
  const list = [...rows];
  if (mode === 'manual') {
    return list.sort((a, b) => (a.sort_order - b.sort_order) || (a.id < b.id ? -1 : 1));
  }
  const time = p => { const v = Date.parse(p.project_date || ''); return Number.isFinite(v) ? v : null; };
  return list.sort((a, b) => {
    const x = time(a), y = time(b);
    if (x !== null && y !== null && x !== y) return y - x;
    if (x !== null && y === null) return -1;
    if (y !== null && x === null) return 1;
    return (b.sort_order - a.sort_order) || (a.id < b.id ? 1 : -1);
  });
}

const PROJECT_COLS = `id,title,category,description,image_url,project_url,
  project_date,sort_order,slug,venue,role,credits,is_visible`;

async function listProjects(env, includeHidden, mode) {
  const rows = await env.DB.prepare(
    `SELECT ${PROJECT_COLS} FROM projects ${includeHidden ? '' : 'WHERE is_visible=1'} ORDER BY sort_order,id`
  ).all();
  return sortProjects(rows.results, mode);
}

async function reorderTable(env, table, ids) {
  if (!['skills', 'education'].includes(table)) throw new Error('Invalid table.');
  if (!Array.isArray(ids) || ids.length > 500) throw new Error('Invalid order.');
  const existing = await env.DB.prepare(`SELECT id FROM ${table}`).all();
  const have = existing.results.map(x => x.id);
  if (ids.length !== have.length || !ids.every(id => have.includes(id)) || new Set(ids).size !== have.length) {
    throw new Error('The order does not match the saved items. Refresh and try again.');
  }
  await env.DB.batch(ids.map((id, i) => env.DB.prepare(`UPDATE ${table} SET sort_order=? WHERE id=?`).bind(i + 1, id)));
}

async function checkPassword(env, adminId, password) {
  if (typeof password !== 'string' || !password || password.length > 200) return null;
  const row = await env.DB.prepare('SELECT * FROM admins WHERE id=?').bind(adminId).first();
  if (!row) return null;
  const salt = Uint8Array.from(
    atob(row.password_salt.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const computed = await passwordHash(password, salt, row.password_iterations);
  return computed === row.password_hash ? row : null;
}
const bytes = n => crypto.getRandomValues(new Uint8Array(n));
const hex = a => [...new Uint8Array(a)].map(x => x.toString(16).padStart(2, '0')).join('');
const b64url = a =>
  btoa(String.fromCharCode(...new Uint8Array(a)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

async function sha(value) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function passwordHash(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  return b64url(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  ));
}

const cookieName = 'db_session';

function getCookie(req) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + cookieName + '=([^;]+)'));
  return m ? m[1] : '';
}

function cookie(value, maxAge) {
  return `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

async function body(req) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw new Error('Request is too large.');
  return req.json();
}

function validEmail(s) {
  return typeof s === 'string' &&
    s.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function cleanText(v, max = 3000) {
  if (typeof v !== 'string') throw new Error('Invalid text value.');
  const s = v.trim();
  if (s.length > max) throw new Error('One of the fields is too long.');
  return s;
}

function safeHttpUrl(v) {
  if (!v) return '';
  if (typeof v !== 'string' || v.length > 1000) throw new Error('Invalid URL.');
  const u = new URL(v);
  if (!['https:', 'http:'].includes(u.protocol)) {
    throw new Error('Only HTTP and HTTPS links are allowed.');
  }
  return u.href;
}

function safeImageUrl(v) {
  if (!v) return '';
  if (typeof v === 'string' &&
      /^\/api\/media\/uploads\/[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(v)) {
    return v;
  }
  return safeHttpUrl(v);
}

function cleanProjectDate(value) {
  if (!value) return '';
  const date = cleanText(value, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Enter a valid project date.');
  }

  const parsed = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Enter a valid project date.');
  }

  return date;
}

function makeSlug(value) {
  return cleanText(value || '', 160)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function uniqueProjectSlug(env, value, excludeId = '') {
  const base = makeSlug(value);

  if (!base) throw new Error('A project URL slug is required.');

  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await env.DB.prepare(
      'SELECT id FROM projects WHERE slug=? LIMIT 1'
    ).bind(slug).first();

    if (!existing || existing.id === excludeId) return slug;

    slug = `${base}-${suffix++}`;

    if (suffix > 1000) {
      throw new Error('Could not create a unique project URL.');
    }
  }
}

/*
 * Give older projects their missing slugs.
 * Existing slugs are preserved.
 */
async function ensureProjectSlugs(env) {
  const rows = await env.DB.prepare(
    `SELECT id,title FROM projects
     WHERE slug IS NULL OR slug=''
     ORDER BY sort_order,id`
  ).all();

  for (const row of rows.results) {
    const slug = await uniqueProjectSlug(env, row.title, row.id);

    await env.DB.prepare(
      `UPDATE projects
       SET slug=?,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND (slug IS NULL OR slug='')`
    ).bind(slug, row.id).run();
  }
}

async function admin(req, env) {
  const token = getCookie(req);
  if (!token) return null;

  const hash = await sha(token);

  const row = await env.DB.prepare(
    'SELECT admins.id, admins.email FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE sessions.token_hash=? AND sessions.expires_at>?'
  ).bind(hash, Math.floor(Date.now() / 1000)).first();

  return row || null;
}

function originOk(req, env) {
  const origin = req.headers.get('Origin');
  if (!origin) return false;

  let expected = env.SITE_ORIGIN;

  try {
    if (expected) return new URL(origin).origin === new URL(expected).origin;
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

async function settings(env) {
  const rows = await env.DB.prepare('SELECT key,value FROM site_settings').all();
  return Object.fromEntries(rows.results.map(r => [r.key, r.value]));
}

async function content(env) {
  const s = await settings(env);
  let socials = [];

  try {
    socials = JSON.parse(s.socials || '[]');
  } catch {}

  await ensureProjectSlugs(env);

  const projects = await listProjects(env, false, s.project_order);

  return { settings: s, socials, projects };
}

async function getProjectBySlug(env, slug, isAdmin = false) {
  await ensureProjectSlugs(env);

  const project = await env.DB.prepare(
    `SELECT ${PROJECT_COLS} FROM projects WHERE slug=? LIMIT 1`
  ).bind(slug).first();

  // Hidden (draft) projects are only visible to a signed-in admin, so you can preview them.
  if (!project || (!project.is_visible && !isAdmin)) return null;

  const photos = await env.DB.prepare(
    `SELECT id,image_url,alt_text,sort_order
     FROM project_photos
     WHERE project_id=?
     ORDER BY sort_order,id`
  ).bind(project.id).all();

  const mode = (await settings(env)).project_order;
  const ordered = await listProjects(env, false, mode);
  const i = ordered.findIndex(p => p.id === project.id);
  const pick = p => (p ? { id: p.id, title: p.title, slug: p.slug } : null);

  return {
    project,
    photos: photos.results,
    previous: i > 0 ? pick(ordered[i - 1]) : null,
    next: i >= 0 && i < ordered.length - 1 ? pick(ordered[i + 1]) : null
  };
}

async function ensureConfiguredAdmin(env) {
  const email = typeof env.ADMIN_EMAIL === 'string'
    ? env.ADMIN_EMAIL.trim().toLowerCase()
    : '';

  const password = typeof env.ADMIN_PASSWORD === 'string'
    ? env.ADMIN_PASSWORD
    : '';

  if (!validEmail(email) || password.length < 12 || password.length > 200) {
    throw new Error(
      'Admin configuration is incomplete. Set ADMIN_EMAIL and an ADMIN_PASSWORD secret (12–200 characters).'
    );
  }

  const existing = await env.DB.prepare('SELECT id FROM admins LIMIT 1').first();
  if (existing) return;

  const salt = bytes(16);
  const hash = await passwordHash(password, salt, ITERATIONS);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO admins(id,email,password_hash,password_salt,password_iterations) VALUES(?,?,?,?,?)'
  ).bind(id, email, hash, b64url(salt), ITERATIONS).run();
}

async function handle(req, env, ctx) {
  if (!env.DB) {
    return fail('The D1 database binding (DB) is not configured.', 503);
  }

  await ensureSchema(env);

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
  const route = parts.join('/');
  const method = req.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Allow': 'GET,POST,PUT,DELETE,OPTIONS' }
    });
  }

  if (['POST', 'PUT', 'DELETE'].includes(method) && !originOk(req, env)) {
    return fail('Request origin could not be verified.', 403);
  }

  // PUBLIC IMAGE DELIVERY
  if (method === 'GET' && parts[0] === 'media' && parts[1] === 'uploads' && env.MEDIA) {
    const key = parts.slice(1).join('/');
    const object = await env.MEDIA.get(key);

    if (!object) return fail('Image not found.', 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(object.body, { headers });
  }

  // STATUS
  if (method === 'GET' && route === 'status') {
    await ensureConfiguredAdmin(env);

    const a = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
    const user = await admin(req, env);

    return json({ admin_exists: a.n > 0, authenticated: !!user });
  }

  // PUBLIC SITE CONTENT
  if (method === 'GET' && route === 'content') {
    return json(await content(env));
  }

  // LOGIN
  if (method === 'POST' && route === 'login') {
    await ensureConfiguredAdmin(env);

    const data = await body(req);

    if (!validEmail(data.email) ||
        typeof data.password !== 'string' ||
        data.password.length > 200) {
      return fail('Email or password is incorrect.', 401);
    }

    const ip = await sha(req.headers.get('CF-Connecting-IP') || 'unknown');
    const now = Math.floor(Date.now() / 1000);

    const attempt = await env.DB.prepare(
      'SELECT attempts,window_started,blocked_until FROM login_attempts WHERE ip_hash=?'
    ).bind(ip).first();

    if (attempt && attempt.blocked_until > now) {
      return fail('Too many attempts. Please wait 15 minutes before trying again.', 429);
    }

    const user = await env.DB.prepare(
      'SELECT * FROM admins WHERE email=?'
    ).bind(data.email.trim().toLowerCase()).first();

    const salt = user
      ? Uint8Array.from(
          atob(user.password_salt.replace(/-/g, '+').replace(/_/g, '/')),
          c => c.charCodeAt(0)
        )
      : bytes(16);

    const computed = await passwordHash(
      data.password,
      salt,
      user?.password_iterations || ITERATIONS
    );

    const valid = !!user && computed === user.password_hash;

    if (!valid) {
      const within = attempt && now - attempt.window_started < 900;
      const n = within ? attempt.attempts + 1 : 1;
      const blocked = n >= 8 ? now + 900 : 0;

      await env.DB.prepare(
        'INSERT INTO login_attempts(ip_hash,attempts,window_started,blocked_until) VALUES(?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts,window_started=excluded.window_started,blocked_until=excluded.blocked_until'
      ).bind(ip, n, within ? attempt.window_started : now, blocked).run();

      return fail('Email or password is incorrect.', 401);
    }

    await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(ip).run();

    const token = b64url(bytes(32));
    const tokenHash = await sha(token);
    const expires = now + SESSION_SECONDS;

    await env.DB.prepare(
      'INSERT INTO sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)'
    ).bind(tokenHash, user.id, expires, now).run();

    return json({ ok: true }, 200, {
      'Set-Cookie': cookie(token, SESSION_SECONDS)
    });
  }

  // LOGOUT
  if (method === 'POST' && route === 'logout') {
    const token = getCookie(req);

    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
        .bind(await sha(token)).run();
    }

    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  }

  const user = await admin(req, env);

  if (['PUT', 'POST', 'DELETE'].includes(method)) {
    if (!user && !['setup', 'login', 'logout'].includes(route)) {
      return fail('Please sign in again.', 401);
    }
  }

  // REORDER SKILLS / EDUCATION
  if (method === 'PUT' && (route === 'skills/reorder' || route === 'education/reorder')) {
    const d = await body(req);
    try {
      await reorderTable(env, parts[0], d.ids);
    } catch (e) {
      return fail(e.message);
    }
    return json({ ok: true });
  }

  // ACCOUNT: CHANGE PASSWORD
  if (method === 'POST' && route === 'account/password') {
    const d = await body(req);
    const row = await checkPassword(env, user.id, d.current_password);
    if (!row) return fail('Your current password is incorrect.', 403);
    if (typeof d.new_password !== 'string' || d.new_password.length < 12 || d.new_password.length > 200) {
      return fail('Use a new password between 12 and 200 characters.');
    }
    const salt = bytes(16);
    const hash = await passwordHash(d.new_password, salt, ITERATIONS);
    await env.DB.prepare(
      'UPDATE admins SET password_hash=?,password_salt=?,password_iterations=? WHERE id=?'
    ).bind(hash, b64url(salt), ITERATIONS, user.id).run();
    // Sign out every other device.
    await env.DB.prepare('DELETE FROM sessions WHERE admin_id=? AND token_hash<>?')
      .bind(user.id, await sha(getCookie(req))).run();
    return json({ ok: true });
  }

  // ACCOUNT: CHANGE LOGIN EMAIL
  if (method === 'POST' && route === 'account/email') {
    const d = await body(req);
    const row = await checkPassword(env, user.id, d.current_password);
    if (!row) return fail('Your current password is incorrect.', 403);
    const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
    if (!validEmail(email)) return fail('Enter a valid email address.');
    await env.DB.prepare('UPDATE admins SET email=? WHERE id=?').bind(email, user.id).run();
    return json({ ok: true, email });
  }

  // PUBLIC EDUCATION
  if (method === 'GET' && route === 'education') {
    const rows = await env.DB.prepare(
      'SELECT id,qualification,institution,start_date,end_date,description,sort_order,is_visible FROM education WHERE is_visible=1 ORDER BY sort_order,id'
    ).all();
    return json({ education: rows.results });
  }

  // ADMIN EDUCATION
  if (method === 'GET' && route === 'admin/education') {
    if (!user) return fail('Please sign in again.', 401);
    const rows = await env.DB.prepare(
      'SELECT id,qualification,institution,start_date,end_date,description,sort_order,is_visible FROM education ORDER BY sort_order,id'
    ).all();
    return json({ education: rows.results });
  }

  // ADD EDUCATION
  if (method === 'POST' && route === 'education') {
    const d = await body(req);
    const qualification = cleanText(d.qualification || '', 160);
    const institution = cleanText(d.institution || '', 160);
    const startDate = cleanText(d.start_date || '', 80);
    const endDate = cleanText(d.end_date || '', 80);
    const description = cleanText(d.description || '', 1200);
    if (!qualification || !institution) return fail('Qualification and institution are required.');
    const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0) AS n FROM education').first();
    await env.DB.prepare(
      'INSERT INTO education(id,qualification,institution,start_date,end_date,description,sort_order,is_visible) VALUES(?,?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(), qualification, institution, startDate, endDate, description, (max?.n || 0) + 1, d.is_visible === false ? 0 : 1).run();
    return json({ ok: true });
  }

  // EDIT EDUCATION
  if (parts[0] === 'education' && parts.length === 2 && method === 'PUT') {
    const d = await body(req);
    const qualification = cleanText(d.qualification || '', 160);
    const institution = cleanText(d.institution || '', 160);
    const startDate = cleanText(d.start_date || '', 80);
    const endDate = cleanText(d.end_date || '', 80);
    const description = cleanText(d.description || '', 1200);
    if (!qualification || !institution) return fail('Qualification and institution are required.');
    await env.DB.prepare(
      'UPDATE education SET qualification=?,institution=?,start_date=?,end_date=?,description=?,is_visible=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(qualification, institution, startDate, endDate, description, d.is_visible === false ? 0 : 1, parts[1]).run();
    return json({ ok: true });
  }

  // DELETE EDUCATION
  if (parts[0] === 'education' && parts.length === 2 && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM education WHERE id=?').bind(parts[1]).run();
    return json({ ok: true });
  }

  // PUBLIC SKILLS
  if (method === 'GET' && route === 'skills') {
    const rows = await env.DB.prepare(
      'SELECT id,name,category,description,experience_level,image_url,sort_order,is_visible FROM skills WHERE is_visible=1 ORDER BY sort_order,id'
    ).all();

    return json({ skills: rows.results });
  }

  // ADMIN SKILLS
  if (method === 'GET' && route === 'admin/skills') {
    if (!user) return fail('Please sign in again.', 401);

    const rows = await env.DB.prepare(
      'SELECT id,name,category,description,experience_level,image_url,sort_order,is_visible FROM skills ORDER BY sort_order,id'
    ).all();

    return json({ skills: rows.results });
  }

  // ADD SKILL
  if (method === 'POST' && route === 'skills') {
    const d = await body(req);
    const name = cleanText(d.name || '', 100);
    const category = cleanText(d.category || '', 50);
    const description = cleanText(d.description || '', 500);
    const experience = d.experience_level
      ? cleanText(d.experience_level, 50)
      : null;
    const imageUrl = safeImageUrl(d.image_url || '');

    if (!name || !category) {
      return fail('Skill name and category are required.');
    }

    const max = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order),0) AS n FROM skills'
    ).first();

    await env.DB.prepare(
      'INSERT INTO skills(id,name,category,description,experience_level,image_url,sort_order,is_visible) VALUES(?,?,?,?,?,?,?,?)'
    ).bind(
      crypto.randomUUID(),
      name,
      category,
      description,
      experience,
      imageUrl,
      max.n + 1,
      d.is_visible === false ? 0 : 1
    ).run();

    return json({ ok: true });
  }

  // EDIT SKILL
  if (parts[0] === 'skills' && parts.length === 2 && method === 'PUT') {
    const d = await body(req);
    const name = cleanText(d.name || '', 100);
    const category = cleanText(d.category || '', 50);
    const description = cleanText(d.description || '', 500);
    const experience = d.experience_level
      ? cleanText(d.experience_level, 50)
      : null;
    const imageUrl = safeImageUrl(d.image_url || '');

    if (!name || !category) {
      return fail('Skill name and category are required.');
    }

    await env.DB.prepare(
      'UPDATE skills SET name=?,category=?,description=?,experience_level=?,image_url=?,is_visible=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(
      name,
      category,
      description,
      experience,
      imageUrl,
      d.is_visible === false ? 0 : 1,
      parts[1]
    ).run();

    return json({ ok: true });
  }

  // DELETE SKILL
  if (parts[0] === 'skills' && parts.length === 2 && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM skills WHERE id=?')
      .bind(parts[1]).run();

    return json({ ok: true });
  }

  // PUBLIC PRODUCTION DETAILS, GALLERY AND NAVIGATION
  if (method === 'GET' &&
      parts[0] === 'projects' &&
      parts[1] === 'slug' &&
      parts.length === 3) {
    const result = await getProjectBySlug(env, parts[2], !!user);

    if (!result) return fail('Production not found.', 404);

    return json(result);
  }

  // PROJECT LIST (public: visible projects in the chosen order)
  if (method === 'GET' && route === 'projects') {
    await ensureProjectSlugs(env);
    const mode = (await settings(env)).project_order;
    return json({ projects: await listProjects(env, false, mode) });
  }

  // PROJECT LIST (dashboard: everything, including hidden drafts, in manual order)
  if (method === 'GET' && route === 'admin/projects') {
    if (!user) return fail('Please sign in again.', 401);
    await ensureProjectSlugs(env);
    return json({ projects: await listProjects(env, true, 'manual') });
  }

  // SAVE SITE CONTENT AND BRANDING
  if (method === 'PUT' && route === 'content') {
    const d = await body(req);
    const s = d.settings || {};

    const allowed = {
      eyebrow: 100,
      hero_title: 180,
      hero_intro: 500,
      about_title: 120,
      about_text: 3000,
      contact_title: 150,
      contact_text: 500,
      location: 100,
      email: 254,
      logo_url: 1000,
      favicon_url: 1000,
      about_photo_url: 1000,
      availability_status: 30,
      status_button_enabled: 5,
      status_button_label: 30,
      status_button_text: 120,
      status_button_url: 1000,
      banner_enabled: 5,
      banner_messages: 5000,
      banner_background: 7,
      banner_text_colour: 7,
      banner_speed: 3,
      name: 120,
      site_title: 120,
      meta_description: 300,
      project_order: 10,
      ...Object.fromEntries(SECTION_KEYS.map(k => [k, 5])),
      ...Object.fromEntries(LABEL_KEYS.map(k => [k, 160]))
    };

    if (!validEmail(s.email)) return fail('Enter a valid contact email.');

    const statements = Object.entries(allowed).map(([k, max]) => {
      let value;
      if (['logo_url', 'favicon_url', 'about_photo_url'].includes(k)) {
        value = safeImageUrl(s[k] ?? '');
      } else if (k === 'status_button_url') {
        const rawUrl = cleanText(s[k] ?? '', 1000);
        if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
          value = rawUrl;
        } else {
          value = safeHttpUrl(rawUrl);
        }
      } else if (k.startsWith('show_')) {
        value = s[k] === 'false' ? 'false' : 'true';
      } else if (k === 'project_order') {
        value = s[k] === 'manual' ? 'manual' : 'newest';
      } else if (k === 'availability_status') {
        value = ['available', 'not_accepting'].includes(s[k]) ? s[k] : 'available';
      } else if (k === 'status_button_enabled') {
        value = s[k] === 'true' ? 'true' : 'false';
      } else if (k === 'banner_enabled') {
        value = s[k] === 'true' ? 'true' : 'false';
      } else if (k === 'banner_messages') {
        let messages = [];
        try {
          const parsed = JSON.parse(s[k] || '[]');
          if (Array.isArray(parsed)) messages = parsed.slice(0, 20).map(item => cleanText(item, 180)).filter(Boolean);
        } catch {
          return env.DB.prepare(
            'INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
          ).bind(k, '[]');
        }
        value = JSON.stringify(messages);
      } else if (['banner_background', 'banner_text_colour'].includes(k)) {
        value = /^#[0-9a-fA-F]{6}$/.test(s[k] || '') ? s[k] : (k === 'banner_background' ? '#20211e' : '#ffffff');
      } else if (k === 'banner_speed') {
        const speed = Number(s[k]);
        value = String(Number.isFinite(speed) ? Math.min(30, Math.max(4, Math.round(speed))) : 7);
      } else {
        value = cleanText(s[k] ?? '', max);
      }

      return env.DB.prepare(
        'INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      ).bind(k, value);
    });

    const socials = Array.isArray(d.socials)
      ? d.socials.slice(0, 12).map(x => ({
          label: cleanText(x.label || '', 40),
          url: safeHttpUrl(x.url || '')
        }))
      : [];

    statements.push(
      env.DB.prepare(
        'INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      ).bind('socials', JSON.stringify(socials))
    );

    await env.DB.batch(statements);
    return json({ ok: true });
  }

  // ADD PROJECT / PRODUCTION
  if (method === 'POST' && route === 'projects') {
    const d = await body(req);
    const title = cleanText(d.title || '', 120);

    if (!title) return fail('Project title is required.');

    const slug = await uniqueProjectSlug(env, d.slug || title);

    const max = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order),0) AS n FROM projects'
    ).first();

    const id = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO projects
       (id,title,category,description,image_url,project_url,project_date,
        sort_order,slug,venue,role,credits,is_visible)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      title,
      cleanText(d.category || '', 100),
      cleanText(d.description || '', 3000),
      safeImageUrl(d.image_url || ''),
      safeHttpUrl(d.project_url || ''),
      cleanProjectDate(d.project_date || ''),
      max.n + 1,
      slug,
      cleanText(d.venue || '', 200),
      cleanText(d.role || '', 200),
      cleanText(d.credits || '', 3000),
      d.is_visible === false ? 0 : 1
    ).run();

    return json({ ok: true, id, slug });
  }

  // REORDER PROJECTS
  if (method === 'PUT' && route === 'projects/reorder') {
    const d = await body(req);

    if (!Array.isArray(d.ids) || d.ids.length > 100) {
      return fail('Invalid project order.');
    }

    const existing = await env.DB.prepare('SELECT id FROM projects').all();
    const ids = existing.results.map(x => x.id);

    if (
      d.ids.length !== ids.length ||
      !d.ids.every(id => ids.includes(id)) ||
      new Set(d.ids).size !== ids.length
    ) {
      return fail('Project order does not match saved projects.');
    }

    await env.DB.batch(
      d.ids.map((id, i) =>
        env.DB.prepare('UPDATE projects SET sort_order=? WHERE id=?').bind(i + 1, id)
      )
    );

    return json({ ok: true });
  }

  // EDIT PROJECT / PRODUCTION
  if (parts[0] === 'projects' && parts.length === 2 && method === 'PUT') {
    const d = await body(req);
    const title = cleanText(d.title || '', 120);

    if (!title) return fail('Project title is required.');

    const current = await env.DB.prepare(
      'SELECT id,slug FROM projects WHERE id=?'
    ).bind(parts[1]).first();

    if (!current) return fail('Project not found.', 404);

    const slug = await uniqueProjectSlug(
      env,
      d.slug || current.slug || title,
      parts[1]
    );

    await env.DB.prepare(
      `UPDATE projects
       SET title=?,category=?,description=?,image_url=?,project_url=?,
           project_date=?,slug=?,venue=?,role=?,credits=?,is_visible=?,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).bind(
      title,
      cleanText(d.category || '', 100),
      cleanText(d.description || '', 3000),
      safeImageUrl(d.image_url || ''),
      safeHttpUrl(d.project_url || ''),
      cleanProjectDate(d.project_date || ''),
      slug,
      cleanText(d.venue || '', 200),
      cleanText(d.role || '', 200),
      cleanText(d.credits || '', 3000),
      d.is_visible === false ? 0 : 1,
      parts[1]
    ).run();

    return json({ ok: true, slug });
  }

  // ADD A PHOTO TO A PRODUCTION GALLERY
  if (parts[0] === 'projects' &&
      parts.length === 3 &&
      parts[2] === 'photos' &&
      method === 'POST') {
    const projectId = parts[1];
    const d = await body(req);
    const imageUrl = safeImageUrl(d.image_url || '');

    if (!imageUrl) return fail('Choose an image first.');

    const project = await env.DB.prepare(
      'SELECT id FROM projects WHERE id=?'
    ).bind(projectId).first();

    if (!project) return fail('Project not found.', 404);

    const max = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order),0) AS n FROM project_photos WHERE project_id=?'
    ).bind(projectId).first();

    const id = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO project_photos
       (id,project_id,image_url,alt_text,sort_order)
       VALUES(?,?,?,?,?)`
    ).bind(
      id,
      projectId,
      imageUrl,
      cleanText(d.alt_text || '', 200),
      max.n + 1
    ).run();

    return json({ ok: true, id });
  }

  // REORDER GALLERY PHOTOS
  if (parts[0] === 'projects' &&
      parts.length === 4 &&
      parts[2] === 'photos' &&
      parts[3] === 'reorder' &&
      method === 'PUT') {
    const projectId = parts[1];
    const d = await body(req);

    if (!Array.isArray(d.ids) || d.ids.length > 100) {
      return fail('Invalid photo order.');
    }

    const existing = await env.DB.prepare(
      'SELECT id FROM project_photos WHERE project_id=?'
    ).bind(projectId).all();

    const ids = existing.results.map(photo => photo.id);

    if (
      d.ids.length !== ids.length ||
      !d.ids.every(id => ids.includes(id)) ||
      new Set(d.ids).size !== ids.length
    ) {
      return fail('Photo order does not match saved photos.');
    }

    await env.DB.batch(
      d.ids.map((id, i) =>
        env.DB.prepare(
          'UPDATE project_photos SET sort_order=? WHERE id=? AND project_id=?'
        ).bind(i + 1, id, projectId)
      )
    );

    return json({ ok: true });
  }

  // EDIT A GALLERY PHOTO (alt text)
  if (parts[0] === 'projects' && parts.length === 4 && parts[2] === 'photos' &&
      parts[3] !== 'reorder' && method === 'PUT') {
    const d = await body(req);
    await env.DB.prepare('UPDATE project_photos SET alt_text=? WHERE id=? AND project_id=?')
      .bind(cleanText(d.alt_text || '', 200), parts[3], parts[1]).run();
    return json({ ok: true });
  }

  // DELETE A GALLERY PHOTO
  if (parts[0] === 'projects' &&
      parts.length === 4 &&
      parts[2] === 'photos' &&
      method === 'DELETE') {
    await env.DB.prepare(
      'DELETE FROM project_photos WHERE id=? AND project_id=?'
    ).bind(parts[3], parts[1]).run();

    return json({ ok: true });
  }

  // DELETE PROJECT / PRODUCTION
  if (parts[0] === 'projects' && parts.length === 2 && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM project_photos WHERE project_id=?')
      .bind(parts[1]).run();

    await env.DB.prepare('DELETE FROM projects WHERE id=?')
      .bind(parts[1]).run();

    return json({ ok: true });
  }

  // IMAGE UPLOAD
  if (method === 'POST' && route === 'upload') {
    if (!env.MEDIA) {
      return fail(
        'Image uploads are not enabled yet. Add the optional R2 bucket binding named MEDIA.',
        503
      );
    }

    const form = await req.formData();
    const file = form.get('image');

    if (!file || typeof file === 'string') {
      return fail('Choose an image to upload.');
    }

    if (file.size > 5 * 1024 * 1024) {
      return fail('Images must be 5 MB or smaller.');
    }

    const types = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };

    if (!types[file.type]) {
      return fail('Use a JPEG, PNG, WebP or GIF image.');
    }

    const key = `uploads/${crypto.randomUUID()}.${types[file.type]}`;

    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });

    return json({ ok: true, url: `${url.origin}/api/media/${key}` });
  }

  return fail('Not found.', 404);
}

export async function onRequest(context) {
  try {
    return await handle(
      context.request,
      context.env,
      context
    );
  } catch (e) {
    console.error('API ERROR:', e?.stack || e?.message || e);

    return json({
      error: e?.message || 'Unknown server error',
      database_configured: !!context.env.DB,
      admin_email_configured: !!context.env.ADMIN_EMAIL,
      admin_password_configured: !!context.env.ADMIN_PASSWORD
    }, 500);
  }
}
