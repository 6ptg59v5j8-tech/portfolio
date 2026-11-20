const $ = (id) => document.getElementById(id);

const safeUrl = (value) => {
  try {
    const u = new URL(value, location.origin);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
};

function text(node, value) {
  if (node) node.textContent = value ?? '';
}

function formatProjectDate(value) {
  if (!value) return '';
  const date = new Date(value + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function renderProjects(projects) {
  const grid = $('project-grid');
  if (!grid) return;

  grid.replaceChildren();

  if (!projects.length) {
    const empty = document.createElement('p');
    empty.className = 'skills-empty';
    empty.textContent = 'Projects will appear here soon.';
    grid.append(empty);
    return;
  }

  projects.forEach((p, i) => {
    const card = document.createElement('article');
    card.className = 'project-card';

    const art = document.createElement('div');
    art.className = 'project-art';

    const imageUrl = safeUrl(p.image_url);
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = p.title || 'Project image';
      img.loading = 'lazy';
      art.append(img);
    } else {
      art.classList.add(['art-one', 'art-two', 'art-three'][i % 3]);
      const number = document.createElement('span');
      number.textContent = String(i + 1).padStart(2, '0');
      const motif = document.createElement('i');
      motif.textContent = p.title || 'Selected work';
      art.append(number, motif);
    }

    const meta = document.createElement('div');
    meta.className = 'project-meta';

    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = p.title || 'Untitled project';

    const category = document.createElement('p');
    const date = formatProjectDate(p.project_date);
    category.textContent = [p.category || 'Selected work', date]
      .filter(Boolean).join(' · ');

    info.append(title, category);

    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    meta.append(info, arrow);
    card.append(art, meta);

    const url = safeUrl(p.project_url);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'project-link';
      a.setAttribute('aria-label', `View ${p.title || 'project'}`);
      a.append(card);
      grid.append(a);
    } else {
      grid.append(card);
    }
  });
}

function renderSkills(skills) {
  const root = $('skills-groups');
  if (!root) return;

  root.replaceChildren();

  const categories = ['Lighting', 'Sound', 'Technical', 'Production'];
  const grouped = Object.fromEntries(
    categories.map(category => [
      category,
      skills.filter(skill =>
        String(skill.category || '').toLowerCase() === category.toLowerCase()
      )
    ])
  );

  const hasSkills = categories.some(category => grouped[category].length);

  if (!hasSkills) {
    const empty = document.createElement('p');
    empty.className = 'skills-empty';
    empty.textContent = 'Skills will appear here soon.';
    root.append(empty);
    return;
  }

  categories.forEach(category => {
    const items = grouped[category];
    if (!items.length) return;

    const group = document.createElement('section');
    group.className = 'skill-category';

    const heading = document.createElement('h3');
    heading.className = 'skill-category-title';
    heading.textContent = category;

    const grid = document.createElement('div');
    grid.className = 'skill-card-grid';

    items.forEach(skill => {
      const card = document.createElement('article');
      card.className = 'skill-card';

      if (skill.image_url) {
        const imageUrl = safeUrl(skill.image_url);
        if (imageUrl) {
          const imageWrap = document.createElement('div');
          imageWrap.className = 'skill-card-image';

          const image = document.createElement('img');
          image.src = imageUrl;
          image.alt = skill.name ? `${skill.name} image` : 'Skill image';
          image.loading = 'lazy';

          imageWrap.append(image);
          card.append(imageWrap);
        }
      }

      const content = document.createElement('div');
      content.className = 'skill-card-content';

      const name = document.createElement('h4');
      name.textContent = skill.name || 'Skill';

      content.append(name);

      if (skill.description) {
        const description = document.createElement('p');
        description.textContent = skill.description;
        content.append(description);
      }

      if (skill.experience_level) {
        const level = document.createElement('span');
        level.className = 'skill-level';
        level.textContent = skill.experience_level;
        content.append(level);
      }

      card.append(content);
      grid.append(card);
    });

    group.append(heading, grid);
    root.append(group);
  });
}

async function loadSite() {
  try {
    const res = await fetch('/api/content', {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) return;

    const data = await res.json();
    const s = data.settings || {};

    text($('eyebrow'), s.eyebrow);
    text($('hero-title'), s.hero_title);
    text($('hero-intro'), s.hero_intro);
    text($('about-title'), s.about_title);
    text($('about-text'), s.about_text);
    text($('location'), s.location);
    text($('contact-title'), s.contact_title);
    text($('contact-text'), s.contact_text);

    const email = $('email-link');
    if (email && s.email) {
      email.href = 'mailto:' + s.email;
      email.textContent = s.email + ' ↗';
    }

    const socials = $('social-links');
    if (socials) {
      socials.replaceChildren();

      (data.socials || []).forEach(item => {
        const url = safeUrl(item.url);
        if (!url) return;

        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = item.label;
        socials.append(a);
      });
    }

    renderProjects(data.projects || []);
  } catch (e) {
    console.warn('Portfolio content could not be loaded.', e);
  }
}

async function loadPublicSkills() {
  try {
    const res = await fetch('/api/skills', {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error('Could not load skills.');

    const data = await res.json();
    renderSkills(data.skills || []);
  } catch (error) {
    console.warn('Portfolio skills could not be loaded.', error);
  }
}

text($('year'), new Date().getFullYear());
loadSite();
loadPublicSkills();
