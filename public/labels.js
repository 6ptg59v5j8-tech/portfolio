/* Applies the text, section visibility and SEO settings edited in the dashboard.
   Anything left blank in the dashboard keeps the default written in the page. */
(() => {
  "use strict";

  const ready = fetch("/api/content", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : {}))
    .then(d => d.settings || {})
    .catch(() => ({}));
  window.siteSettingsReady = ready;

  const clean = v => (typeof v === "string" ? v.replace(/\s*\u2014\s*/g, ", ").trim() : "");

  // "|" in a value becomes a line break, e.g. "Selected|productions".
  function fill(el, value, upper) {
    const v = upper ? value.toUpperCase() : value;
    el.replaceChildren();
    v.split("|").forEach((part, i) => {
      if (i) el.append(document.createElement("br"));
      el.append(document.createTextNode(part.trim()));
    });
  }

  ready.then(s => {
    document.querySelectorAll("[data-setting]").forEach(el => {
      const v = clean(s[el.dataset.setting]);
      if (v) fill(el, v, el.hasAttribute("data-upper"));
    });

    // Hide whole sections (and their navigation links).
    ["work", "about", "skills", "contact"].forEach(name => {
      if (s["show_" + name] !== "false") return;
      document.querySelectorAll(`[data-section="${name}"],[data-nav="${name}"]`).forEach(el => {
        el.style.display = "none";
      });
    });
    if (s.show_education === "false") {
      document.querySelectorAll(".skills-education-switch").forEach(el => { el.style.display = "none"; });
    }

    // Text wordmark (only matters when no logo image is set).
    const mark = clean(s.wordmark_text);
    if (mark) {
      document.querySelectorAll(".wordmark-text,.footer-brand-text").forEach(el => {
        const dotClass = el.querySelector("span")?.className || "";
        el.replaceChildren(document.createTextNode(mark));
        const dot = document.createElement("span");
        dot.className = dotClass;
        dot.textContent = ".";
        el.append(dot);
      });
    }

    // Browser tab title and search description.
    const onHome = !document.body.classList.contains("production-page");
    if (onHome && clean(s.site_title)) document.title = clean(s.site_title);
    const desc = clean(s.meta_description);
    const meta = document.querySelector('meta[name="description"]');
    if (desc && meta) meta.setAttribute("content", desc);
  });
})();
