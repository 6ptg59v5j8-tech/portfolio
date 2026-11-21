
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

  function addText(parent, tag, className, value) {
    if (!value) return null;
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    parent.append(element);
    return element;
  }

  function formatDate(value) {
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

  function dateRange(project) {
    const start = formatDate(project.project_date || project.start_date);
    const end = formatDate(project.end_date);

    if (start && end && start !== end) return `${start} — ${end}`;
    return start || end || "";
  }

  function applyBranding(settings = {}) {
    const logoUrl = safeUrl(settings.logo_url);
    const faviconUrl = safeUrl(settings.favicon_url);

    [$(".wordmark"), $(".footer-brand")].forEach((element, index) => {
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
      } else if (index === 0) {
        element.innerHTML =
          '<span class="wordmark-text">DB<span class="wordmark-dot">.</span></span>';
        element.classList.remove("has-custom-logo");
      } else {
        element.innerHTML =
          '<span class="footer-brand-text">DB<span>.</span></span>';
        element.classList.remove("has-custom-logo");
      }
    });

    const favicon = $("#site-favicon");
    if (favicon && faviconUrl) favicon.href = faviconUrl;
  }

  function renderGallery(photos, coverUrl) {
    const gallery = document.createElement("section");
    gallery.className = "production-gallery section-wrap";

    addText(gallery, "span", "section-kicker", "GALLERY");

    const grid = document.createElement("div");
    grid.className = "production-gallery-grid";

    const allPhotos = Array.isArray(photos) ? [...photos] : [];

    if (
      coverUrl &&
      !allPhotos.some(photo => photo.image_url === coverUrl)
    ) {
      allPhotos.unshift({
        image_url: coverUrl,
        alt_text: "Production cover image"
      });
    }

    allPhotos.forEach((photo, index) => {
      const url = safeUrl(photo.image_url);
      if (!url) return;

      const figure = document.createElement("figure");
      figure.className = "production-gallery-item";

      const image = document.createElement("img");
      image.src = url;
      image.alt = photo.alt_text || `Production photograph ${index + 1}`;
      image.loading = "lazy";
      image.decoding = "async";

      figure.append(image);
      grid.append(figure);
    });

    if (grid.children.length) {
      gallery.append(grid);
      return gallery;
    }

    return null;
  }

  function renderProject(data) {
    const project = data.project || data;
    const photos = data.photos || project.photos || [];
    const main = $("#production-content");

    if (!main) {
      throw new Error("The production content container is missing.");
    }

    if (!project || !project.title) {
      throw new Error("This production could not be found.");
    }

    document.title = `${project.title} — Daniel Burden`;

    main.replaceChildren();

    const intro = document.createElement("section");
    intro.className = "production-intro section-wrap";

    const back = document.createElement("a");
    back.className = "production-back-link";
    back.href = "/#work";
    back.textContent = "← Back to selected work";
    intro.append(back);

    addText(
      intro,
      "span",
      "section-kicker production-kicker",
      project.category || "SELECTED WORK"
    );

    addText(intro, "h1", "production-title", project.title);

    const dates = dateRange(project);
    if (dates) {
      addText(intro, "p", "production-date", dates);
    }

    if (project.description) {
      addText(
        intro,
        "p",
        "production-description",
        project.description
      );
    }

    const details = document.createElement("div");
    details.className = "production-details";

    [
      ["Venue", project.venue],
      ["Role", project.role],
      ["Credits", project.credits]
    ].forEach(([label, value]) => {
      if (!value) return;

      const item = document.createElement("div");
      item.className = "production-detail";

      addText(item, "span", "production-detail-label", label);
      addText(item, "p", "production-detail-value", value);

      details.append(item);
    });

    if (details.children.length) {
      intro.append(details);
    }

    main.append(intro);

    const coverUrl = safeUrl(project.image_url);

    if (coverUrl) {
      const cover = document.createElement("section");
      cover.className = "production-cover section-wrap";

      const image = document.createElement("img");
      image.src = coverUrl;
      image.alt = `${project.title} production`;
      image.fetchPriority = "high";

      cover.append(image);
      main.append(cover);
    }

    if (project.project_url) {
      const externalUrl = safeUrl(project.project_url);

      if (externalUrl) {
        const external = document.createElement("div");
        external.className = "production-external section-wrap";

        const link = document.createElement("a");
        link.href = externalUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Visit project website ↗";

        external.append(link);
        main.append(external);
      }
    }

    const gallery = renderGallery(photos, coverUrl);
    if (gallery) main.append(gallery);

    const navigation = document.createElement("nav");
    navigation.className = "production-navigation section-wrap";
    navigation.setAttribute("aria-label", "Project navigation");

    const previous = data.previous;
    const next = data.next;

    if (previous && previous.slug) {
      const link = document.createElement("a");
      link.className =
        "production-nav-link production-nav-previous";
      link.href = `/projects/${encodeURIComponent(previous.slug)}`;

      addText(link, "span", "production-nav-label", "← PREVIOUS PROJECT");
      addText(
        link,
        "strong",
        "",
        previous.title || "Previous project"
      );

      navigation.append(link);
    } else {
      navigation.append(document.createElement("span"));
    }

    if (next && next.slug) {
      const link = document.createElement("a");
      link.className = "production-nav-link production-nav-next";
      link.href = `/projects/${encodeURIComponent(next.slug)}`;

      addText(link, "span", "production-nav-label", "NEXT PROJECT →");
      addText(
        link,
        "strong",
        "",
        next.title || "Next project"
      );

      navigation.append(link);
    }

    if (previous || next) {
      main.append(navigation);
    }
  }

  function showError(message) {
    const main = $("#production-content");
    if (!main) return;

    main.replaceChildren();

    const section = document.createElement("section");
    section.className = "production-error section-wrap";

    addText(section, "span", "section-kicker", "SELECTED WORK");
    addText(section, "h1", "", "Production not found");
    addText(
      section,
      "p",
      "",
      message || "This production may have been moved or is not available yet."
    );

    const link = document.createElement("a");
    link.href = "/#work";
    link.textContent = "← Back to all projects";

    section.append(link);
    main.append(section);
  }

  async function loadProject() {
    const path = window.location.pathname;
    const slug = decodeURIComponent(
      path.replace(/^\/projects\/?/, "").replace(/\/$/, "")
    );

    if (!slug) {
      showError("No production was specified.");
      return;
    }

    try {
      // Load the production independently.
      const projectResponse = await fetch(
        `/api/projects/slug/${encodeURIComponent(slug)}`,
        { cache: "no-store" }
      );

      if (!projectResponse.ok) {
        throw new Error(
          `The production API returned status ${projectResponse.status}.`
        );
      }

      const data = await projectResponse.json();

      if (!data.project && !data.title) {
        throw new Error("The production data was empty.");
      }

      // Render the production before requesting optional site settings.
      renderProject(data);

      // Branding is optional. Its failure must not hide the production.
      try {
        const contentResponse = await fetch(
          "/api/content",
          { cache: "no-store" }
        );

        if (contentResponse.ok) {
          const content = await contentResponse.json();
          const settings = content.settings || content.content || content;

          const normalizedSettings = Array.isArray(settings)
            ? Object.fromEntries(
                settings.map(item => [item.key, item.value])
              )
            : settings;

          applyBranding(normalizedSettings || {});
        }
      } catch (brandingError) {
        console.warn("Optional site branding could not be loaded:", brandingError);
      }

    } catch (error) {
      console.error("Production page:", error);
      showError(
        "We couldn't load this production. Please try refreshing the page."
      );
    }
  }

  loadProject();
})();
