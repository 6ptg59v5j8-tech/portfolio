(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);

  function safeUrl(value) {
    if (!value || typeof value !== "string") return "";
    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function text(value, fallback = "") {
    return typeof value === "string" ? value : (value == null ? fallback : String(value));
  }

  function formatProjectDate(value) {
    if (!value) return "";
    const raw = String(value).trim();
    const date = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getSettings(data) {
    const source = data?.settings || data?.content || data || {};
    if (Array.isArray(source)) {
      return Object.fromEntries(source.map(item => [item.key, item.value]));
    }
    return source;
  }

  function applyBranding(settings) {
    const logoUrl = safeUrl(settings.logo_url);
    const faviconUrl = safeUrl(settings.favicon_url);
    const wordmark = $(".wordmark");
    const footerBrand = $(".footer-brand");

    [wordmark, footerBrand].forEach((element, index) => {
      if (!element) return;

      if (logoUrl) {
        const image = document.createElement("img");
        image.src = logoUrl;
        image.alt = "Daniel Burden";
        image.className = index === 0 ? "header-logo-image" : "footer-logo-image";
        element.replaceChildren(image);
        element.classList.add("has-custom-logo");
      } else {
        element.classList.remove("has-custom-logo");
        if (index === 0) {
          element.innerHTML = '<span class="wordmark-text">DB<span class="wordmark-dot">.</span></span>';
        } else {
          element.innerHTML = '<span class="footer-brand-text">DB<span>.</span></span>';
        }
      }
    });

    const favicon = $("#site-favicon");
    if (favicon && faviconUrl) favicon.href = faviconUrl;
  }

  function renderProjects(projects) {
    const grid = $("#project-grid");
    if (!grid) return;

    grid.replaceChildren();

    if (!Array.isArray(projects) || projects.length === 0) {
      const empty = document.createElement("p");
      empty.className = "skills-empty";
      empty.textContent = "Projects will appear here soon.";
      grid.append(empty);
      return;
    }

    projects.forEach((project, index) => {
      const slug = text(project.slug).trim();
      const projectUrl = slug
        ? `/projects/${encodeURIComponent(slug)}`
        : safeUrl(project.project_url);

      const card = document.createElement("article");
      card.className = "project-card";

      const art = document.createElement("div");
      art.className = `project-art ${["art-one", "art-two", "art-three"][index % 3]}`;

      const imageUrl = safeUrl(project.image_url);
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = text(project.title, "Project image");
        image.loading = "lazy";
        art.append(image);
      } else {
        const number = document.createElement("span");
        number.textContent = String(index + 1).padStart(2, "0");
        const artworkText = document.createElement("i");
        artworkText.textContent = text(project.title, "Selected work");
        art.append(number, artworkText);
      }

      if (projectUrl) {
        const link = document.createElement("a");
        link.className = "project-card-link";
        link.href = projectUrl;
        link.setAttribute("aria-label", `Find out more about ${text(project.title, "this project")}`);

        const prompt = document.createElement("span");
        prompt.className = "project-card-prompt";
        prompt.textContent = "Find out more";
        link.append(prompt);
        art.append(link);
      }

      const meta = document.createElement("div");
      meta.className = "project-meta";

      const details = document.createElement("div");
      const heading = document.createElement("h3");
      heading.textContent = text(project.title, "Untitled project");

      const description = document.createElement("p");
      const category = text(project.category);
      const date = formatProjectDate(project.project_date);
      description.textContent = [category, date].filter(Boolean).join(" / ");

      details.append(heading, description);

      const arrow = document.createElement("span");
      arrow.textContent = projectUrl ? "↗" : "—";
      meta.append(details, arrow);

      if (projectUrl) {
        const cardLink = document.createElement("a");
        cardLink.className = "project-meta-link";
        cardLink.href = projectUrl;
        cardLink.setAttribute("aria-label", `View ${text(project.title, "project")}`);
        cardLink.append(meta);
        card.append(art, cardLink);
      } else {
        card.append(art, meta);
      }

      grid.append(card);
    });
  }

  function renderSkills(skills) {
    const container = $("#skills-groups");
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(skills) || skills.length === 0) {
      const empty = document.createElement("p");
      empty.className = "skills-empty";
      empty.textContent = "Skills will appear here soon.";
      container.append(empty);
      return;
    }

    const categories = ["Lighting", "Sound", "Technical", "Production"];
    const grouped = new Map(categories.map(category => [category, []]));

    skills.forEach(skill => {
      const category = categories.find(item =>
        item.toLowerCase() === text(skill.category).toLowerCase()
      ) || "Technical";

      grouped.get(category).push(skill);
    });

    categories.forEach(category => {
      const items = grouped.get(category);
      if (!items.length) return;

      const section = document.createElement("section");
      section.className = "skill-category";

      const heading = document.createElement("h3");
      heading.className = "skill-category-title";
      heading.textContent = category;

      const cards = document.createElement("div");
      cards.className = "skill-card-grid";

      items.forEach(skill => {
        const card = document.createElement("article");
        card.className = "skill-card";

        const imageWrap = document.createElement("div");
        imageWrap.className = "skill-card-image";

        const imageUrl = safeUrl(skill.image_url);
        if (imageUrl) {
          const image = document.createElement("img");
          image.src = imageUrl;
          image.alt = text(skill.name, "Skill");
          image.loading = "lazy";
          imageWrap.append(image);
        }

        const content = document.createElement("div");
        content.className = "skill-card-content";

        const title = document.createElement("h4");
        title.textContent = text(skill.name, "Skill");

        const description = document.createElement("p");
        description.textContent = text(skill.description);

        content.append(title);
        if (skill.description) content.append(description);

        if (skill.level) {
          const level = document.createElement("span");
          level.className = "skill-level";
          level.textContent = text(skill.level);
          content.append(level);
        }

        card.append(imageWrap, content);
        cards.append(card);
      });

      section.append(heading, cards);
      container.append(section);
    });
  }

  function applyContent(data) {
    const settings = getSettings(data);
    applyBranding(settings);

    const fields = [
      ["eyebrow", "eyebrow"],
      ["hero-title", "hero_title"],
      ["hero-intro", "hero_intro"],
      ["about-title", "about_title"],
      ["about-text", "about_text"],
      ["location", "location"],
      ["contact-title", "contact_title"],
      ["contact-text", "contact_text"]
    ];

    fields.forEach(([elementId, key]) => {
      const element = document.getElementById(elementId);
      if (element && settings[key]) element.textContent = settings[key];
    });

    const email = text(settings.email || settings.contact_email);
    const emailLink = $("#email-link");
    if (emailLink && email) {
      emailLink.href = `mailto:${email}`;
      emailLink.textContent = `${email} `;
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      emailLink.append(arrow);
    }

    const socials = settings.socials || data?.socials || [];
    const socialContainer = $("#social-links");
    if (socialContainer) {
      socialContainer.replaceChildren();

      if (Array.isArray(socials)) {
        socials.forEach(item => {
          const url = safeUrl(item.url);
          if (!url) return;

          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = text(item.label || item.name, "Social");
          socialContainer.append(link);
        });
      }
    }

    if (Array.isArray(data?.projects)) renderProjects(data.projects);
  }

  async function loadSite() {
    try {
      const response = await fetch("/api/content", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load site content.");
      const data = await response.json();
      applyContent(data);
    } catch (error) {
      console.error("Site content:", error);
    }

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (response.ok) {
        const projects = await response.json();
        if (Array.isArray(projects)) renderProjects(projects);
        else if (Array.isArray(projects.projects)) renderProjects(projects.projects);
      }
    } catch (error) {
      console.error("Projects:", error);
    }
  }

  async function loadPublicSkills() {
    try {
      const response = await fetch("/api/skills", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load skills.");
      const data = await response.json();
      renderSkills(Array.isArray(data) ? data : data.skills || []);
    } catch (error) {
      console.error("Skills:", error);
    }
  }

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  loadSite();
  loadPublicSkills();
})();
