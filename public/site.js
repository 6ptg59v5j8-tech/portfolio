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
    return cleanCopy(typeof value === "string"
      ? value
      : (value == null ? fallback : String(value)));
  }

  // Tidy text that comes from the database: no em dashes, no leading "01"-style list numbers.
  function cleanCopy(value) {
    return typeof value === "string" ? value.replace(/\s*\u2014\s*/g, ", ") : value;
  }

  function stripListNumber(value) {
    return typeof value === "string" ? value.replace(/^\s*0\d\s*[.)\/:-]?\s+/, "") : value;
  }


  function projectPath(project) {
    // Only link to an internal production page when the API supplies a real
    // database slug. Do not invent a route from the title: that can create
    // links to pages which do not exist yet.
    const slug = text(project.slug).trim();
    return slug ? `/projects/${encodeURIComponent(slug)}` : "";
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
      return Object.fromEntries(
        source.map(item => [item.key, item.value])
      );
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
        image.className = index === 0
          ? "header-logo-image"
          : "footer-logo-image";

        element.replaceChildren(image);
        element.classList.add("has-custom-logo");
      } else {
        element.classList.remove("has-custom-logo");

        if (index === 0) {
          element.innerHTML =
            '<span class="wordmark-text">DB<span class="wordmark-dot">.</span></span>';
        } else {
          element.innerHTML =
            '<span class="footer-brand-text">DB<span>.</span></span>';
        }
      }
    });

    const favicon = $("#site-favicon");
    if (favicon && faviconUrl) favicon.href = faviconUrl;
  }

  let siteSettings = {};
  const label = (key, fallback) => cleanCopy((siteSettings[key] || "").trim()) || fallback;

  function renderProjects(projects) {
    const grid = $("#project-grid");
    if (!grid) return;

    grid.replaceChildren();

    if (!Array.isArray(projects) || projects.length === 0) {
      const empty = document.createElement("p");
      empty.className = "skills-empty";
      empty.textContent = label("work_empty", "Projects will appear here soon.");
      grid.append(empty);
      return;
    }

    // The server already returns projects in the order chosen in the dashboard.
    const orderedProjects = projects;

    orderedProjects.forEach((project, index) => {
      const internalUrl = projectPath(project);
      const projectUrl = internalUrl || safeUrl(project.project_url);

      const card = document.createElement("article");
      card.className = "project-card";

      const art = document.createElement("div");
      art.className =
        `project-art ${["art-one", "art-two", "art-three"][index % 3]}`;

      const imageUrl = safeUrl(project.image_url);

      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = text(project.title, "Project image");
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => {
          image.remove();
          const fallback = document.createElement("i");
          fallback.textContent = text(project.title, "Selected work");
          art.insertBefore(fallback, art.querySelector(".project-card-link"));
        }, { once: true });
        art.append(image);
      } else {
        const artworkText = document.createElement("i");
        artworkText.textContent = text(project.title, "Selected work");

        art.append(artworkText);
      }

      if (projectUrl) {
        const link = document.createElement("a");
        link.className = "project-card-link";
        link.href = projectUrl;
        link.setAttribute(
          "aria-label",
          `Find out more about ${text(project.title, "this project")}`
        );
        link.setAttribute("data-project-link", "true");

        const prompt = document.createElement("span");
        prompt.className = "project-card-prompt";
        prompt.textContent = label("card_button", "Find out more");

        link.append(prompt);
        art.append(link);
      }

      const meta = document.createElement("div");
      meta.className = "project-meta";

      const details = document.createElement("div");

      const heading = document.createElement("h3");
      heading.textContent = stripListNumber(text(project.title, "Untitled project"));

      const description = document.createElement("p");
      const category = stripListNumber(text(project.category));
      const date = formatProjectDate(project.project_date);

      description.textContent = [category, date]
        .filter(Boolean)
        .join(" / ");

      details.append(heading, description);

      const arrow = document.createElement("span");
      arrow.textContent = projectUrl ? "↗" : "→";

      meta.append(details, arrow);

      if (projectUrl) {
        const cardLink = document.createElement("a");
        cardLink.className = "project-meta-link";
        cardLink.href = projectUrl;
        cardLink.setAttribute(
          "aria-label",
          `View ${text(project.title, "project")}`
        );
        cardLink.setAttribute("data-project-link", "true");

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

    const preferredOrder = [
      "Lighting",
      "Sound",
      "Technical",
      "Production"
    ];

    const grouped = new Map();

    skills.forEach(skill => {
      const category = text(skill.category, "Other").trim() || "Other";
      const existingKey = [...grouped.keys()].find(
        key => key.toLowerCase() === category.toLowerCase()
      );

      const key = existingKey || category;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(skill);
    });

    const categories = [
      ...preferredOrder.filter(category =>
        [...grouped.keys()].some(
          key => key.toLowerCase() === category.toLowerCase()
        )
      ),
      ...[...grouped.keys()]
        .filter(category =>
          !preferredOrder.some(
            preferred => preferred.toLowerCase() === category.toLowerCase()
          )
        )
        .sort((a, b) => a.localeCompare(b))
    ];

    categories.forEach(category => {
      const items = grouped.get(category);
      if (!items || !items.length) return;

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

        const content = document.createElement("div");
        content.className = "skill-card-content";

        const title = document.createElement("h4");
        title.textContent = stripListNumber(text(skill.name, "Skill"));
        content.append(title);

        const descriptionText = text(skill.description).trim();

        if (descriptionText) {
          const description = document.createElement("p");
          description.textContent = descriptionText;
          content.append(description);
        }

        const levelText = text(skill.experience_level || skill.level).trim();

        if (levelText) {
          const level = document.createElement("span");
          level.className = "skill-level";
          level.textContent = levelText;
          content.append(level);
        }

        card.append(content);
        cards.append(card);
      });

      section.append(heading, cards);
      container.append(section);
    });
  }


  function renderEducation(entries) {
    const container = $("#education-list");
    if (!container) return;
    container.replaceChildren();

    if (!Array.isArray(entries) || entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "skills-empty";
      empty.textContent = "Education details will appear here soon.";
      container.append(empty);
      return;
    }

    entries.forEach(entry => {
      const card = document.createElement("article");
      card.className = "skill-card education-card";

      const content = document.createElement("div");
      content.className = "skill-card-content";

      const heading = document.createElement("h4");
      heading.textContent = text(entry.qualification, "Qualification");

      const institution = document.createElement("p");
      institution.textContent = text(entry.institution);

      content.append(heading, institution);

      const dates = [text(entry.start_date), text(entry.end_date)].filter(Boolean).join(" to ");
      if (dates) {
        const date = document.createElement("span");
        date.className = "skill-level";
        date.textContent = dates;
        content.append(date);
      }

      const descriptionText = text(entry.description).trim();
      if (descriptionText) {
        const description = document.createElement("p");
        description.textContent = descriptionText;
        content.append(description);
      }

      card.append(content);
      container.append(card);
    });
  }

  function setupSkillsEducationSwitch() {
    const switcher = $(".skills-education-switch");
    if (!switcher) return;
    const buttons = [...switcher.querySelectorAll("[data-view]")];
    const panels = { skills: $("#skills-view"), education: $("#education-view") };
    const thumb = $(".skills-education-thumb", switcher);
    const title = $("#skills-section-title");
    const note = $("#skills-section-note");

    function activate(view, focusButton = false) {
      const selected = buttons.find(button => button.dataset.view === view) || buttons[0];
      buttons.forEach(button => {
        const active = button === selected;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
        button.tabIndex = active ? 0 : -1;
      });
      switcher.dataset.active = selected.dataset.view;
      if (thumb) thumb.style.transform = selected.dataset.view === "education" ? "translateX(100%)" : "translateX(0)";
      const isEdu = selected.dataset.view === "education";
      const setHeading = (el, key, fallbackHtml, accent) => {
        if (!el) return;
        const custom = label(key, "");
        if (!custom) { el.innerHTML = fallbackHtml; return; }
        el.replaceChildren();
        custom.split("|").forEach((part, i) => {
          if (i) el.append(document.createElement("br"));
          el.append(document.createTextNode(part.trim()));
        });
        if (accent) { const dot = document.createElement("span"); dot.className = "accent"; dot.textContent = "."; el.append(dot); }
      };
      setHeading(title, isEdu ? "education_title" : "skills_title",
        isEdu ? 'Education<span class="accent">.</span>' : 'Skills &amp;<br>technical experience<span class="accent">.</span>', true);
      setHeading(note, isEdu ? "education_note" : "skills_note",
        isEdu ? 'My academic background<br>and formal training.' : 'The skills and knowledge I bring<br>to productions and live events.', false);
      Object.entries(panels).forEach(([key, panel]) => {
        if (!panel) return;
        const active = key === selected.dataset.view;
        if (active) {
          panel.hidden = false;
          panel.classList.remove("panel-enter");
          requestAnimationFrame(() => panel.classList.add("panel-enter"));
          panel.setAttribute("aria-hidden", "false");
        } else {
          panel.hidden = true;
          panel.classList.remove("panel-enter");
          panel.setAttribute("aria-hidden", "true");
        }
      });
      if (focusButton) selected.focus();
    }

    buttons.forEach((button, index) => {
      button.addEventListener("click", () => activate(button.dataset.view));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length;
        activate(buttons[next].dataset.view, true);
      });
    });
    window.__refreshSkillsHeading = () => activate(switcher.dataset.active || "skills");
    activate("skills");
  }

  async function loadPublicEducation() {
    try {
      const response = await fetch("/api/education", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load education.");
      const data = await response.json();
      renderEducation(Array.isArray(data) ? data : data.education || []);
    } catch (error) {
      console.error("Education:", error);
    }
  }

  function applyContent(data) {
    const settings = getSettings(data);
    siteSettings = settings;
    applyBranding(settings);

    const statusButton = $("#about-status-button");
    if (statusButton) {
      const enabled = settings.status_button_enabled === "true";
      const label = text(settings.status_button_label || "Now").trim();
      const message = text(settings.status_button_text).trim();
      const url = safeUrl(text(settings.status_button_url).trim());
      statusButton.hidden = !(enabled && message);

      if (enabled && message) {
        statusButton.querySelector(".about-status-label").textContent = label || "Now";
        statusButton.querySelector(".about-status-message").textContent = message;

        if (url) {
          statusButton.href = url;
          statusButton.removeAttribute("aria-disabled");
          statusButton.removeAttribute("tabindex");
          statusButton.style.pointerEvents = "";
        } else {
          statusButton.removeAttribute("href");
          statusButton.setAttribute("aria-disabled", "true");
          statusButton.setAttribute("tabindex", "-1");
          statusButton.style.pointerEvents = "none";
        }
      }
    }

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
      if (element && settings[key]) {
        const value = cleanCopy(settings[key]);
        if (elementId === "hero-title") {
          let heroLines = value.includes("|")
            ? value.split("|").map(line => line.trim()).filter(Boolean)
            : value.split(/(?<=[.!?])\s+/).map(line => line.trim()).filter(Boolean);

          // The three-part headline may also be entered without separators.
          if (heroLines.length === 1 && /creative vision.*technical thinking.*planned execution/i.test(value)) {
            heroLines = value.split(/\s+(?=Technical thinking\b|Planned execution\b)/i).map(line => line.trim()).filter(Boolean);
          }

          if (heroLines.length > 1) {
            const nodes = heroLines.map((line, index) => {
              const lineElement = document.createElement("span");
              lineElement.className = index === 0
                ? "hero-title-line"
                : "hero-title-line muted-title";
              lineElement.textContent = line;
              return lineElement;
            });
            element.replaceChildren(...nodes);
          } else {
            element.textContent = value;
          }
        } else {
          element.textContent = value;
        }
      }
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

    if (typeof window.__refreshSkillsHeading === "function") window.__refreshSkillsHeading();

    if (Array.isArray(data?.projects)) {
      renderProjects(data.projects);
    }
  }

  async function loadSite() {
    try {
      const response = await fetch("/api/content", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load site content.");
      }

      const data = await response.json();
      applyContent(data);
    } catch (error) {
      console.error("Site content:", error);
    }

    try {
      const response = await fetch("/api/projects", {
        cache: "no-store"
      });

      if (response.ok) {
        const projects = await response.json();

        if (Array.isArray(projects)) {
          renderProjects(projects);
        } else if (Array.isArray(projects.projects)) {
          renderProjects(projects.projects);
        }
      }
    } catch (error) {
      console.error("Projects:", error);
      const grid = $("#project-grid");
      if (grid) {
        grid.replaceChildren();
        const message = document.createElement("p");
        message.className = "skills-empty";
        message.setAttribute("role", "status");
        message.textContent = "Selected work could not load right now. Please refresh to try again.";
        grid.append(message);
      }
    }
  }

  async function loadPublicSkills() {
    try {
      const response = await fetch("/api/skills", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load skills.");
      }

      const data = await response.json();

      renderSkills(
        Array.isArray(data) ? data : data.skills || []
      );
    } catch (error) {
      console.error("Skills:", error);
      const container = $("#skills-groups");
      if (container) {
        container.replaceChildren();
        const message = document.createElement("p");
        message.className = "skills-empty";
        message.setAttribute("role", "status");
        message.textContent = "Skills could not load right now. Please refresh to try again.";
        container.append(message);
      }
    }
  }

  const year = $("#year");
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  setupSkillsEducationSwitch();
  loadSite();
  loadPublicSkills();
  loadPublicEducation();
})();
