(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  function normaliseImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";

    try {
      const url = new URL(value.trim(), window.location.origin);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function showPlaceholder(frame, placeholder) {
    if (!frame || !placeholder) return;
    if (!placeholder.isConnected) frame.replaceChildren(placeholder);
    placeholder.hidden = false;
  }

  async function loadAboutPhotoAndAvailability() {
    const frame = $("about-photo-frame");
    const placeholder = $("about-photo-placeholder");

    try {
      const response = await fetch("/api/content", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error(`Content request failed (${response.status}).`);
      }

      const data = await response.json();
      const settings = data && data.settings && typeof data.settings === "object"
        ? data.settings
        : {};

      if (frame) {
        const imageUrl = normaliseImageUrl(settings.about_photo_url);

        if (imageUrl) {
          const image = document.createElement("img");
          image.className = "about-photo";
          image.alt = "Portrait of Daniel";
          image.loading = "eager";
          image.decoding = "async";

          image.addEventListener("load", () => {
            frame.replaceChildren(image);
          }, { once: true });

          image.addEventListener("error", () => {
            console.error("The About portrait could not be loaded:", imageUrl);
            showPlaceholder(frame, placeholder);
          }, { once: true });

          // Set src after registering both listeners so cached and fresh
          // images follow the same success/error path.
          image.src = imageUrl;
        } else {
          showPlaceholder(frame, placeholder);
        }
      }

      const isAvailable = settings.availability_status !== "not_accepting";
      const availabilityText = $("availability-text");
      const availabilityDot = $("availability-dot");

      if (availabilityText) {
        availabilityText.textContent = isAvailable
          ? "Available for opportunities"
          : "Not accepting new clients";
      }

      if (availabilityDot) {
        availabilityDot.classList.toggle(
          "status-dot-unavailable",
          !isAvailable
        );
      }
    } catch (error) {
      console.error("Could not load About settings:", error);
      showPlaceholder(frame, placeholder);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAboutPhotoAndAvailability, { once: true });
  } else {
    loadAboutPhotoAndAvailability();
  }
})();
