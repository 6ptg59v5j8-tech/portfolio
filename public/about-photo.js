
(async function loadAboutPhotoAndAvailability() {
  try {
    const response = await fetch('/api/content', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) return;

    const data = await response.json();
    const settings = data.settings || {};

    const frame = document.getElementById('about-photo-frame');
    const placeholder = document.getElementById('about-photo-placeholder');

    if (frame && settings.about_photo_url) {
      const image = document.createElement('img');
      image.className = 'about-photo';
      image.alt = 'Portrait of Daniel';
      image.loading = 'lazy';

      image.addEventListener('load', () => {
        frame.replaceChildren(image);
      }, { once: true });

      image.addEventListener('error', () => {
        image.remove();
        if (placeholder) placeholder.hidden = false;
      }, { once: true });

      image.src = settings.about_photo_url;
      if (placeholder) placeholder.hidden = true;
    }

    const isAvailable = settings.availability_status !== 'not_accepting';

    const availabilityText = document.getElementById('availability-text');
    const availabilityDot = document.getElementById('availability-dot');

    if (availabilityText) {
      availabilityText.textContent = isAvailable
        ? 'Available for opportunities'
        : 'Not accepting new clients';
    }

    if (availabilityDot) {
      availabilityDot.classList.toggle(
        'status-dot-unavailable',
        !isAvailable
      );
    }
  } catch (error) {
    console.error('Could not load About settings:', error);
  }
})();
