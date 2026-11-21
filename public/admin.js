
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

    const available = settings.availability_status !== 'not_accepting';

    const label = document.getElementById('availability-text');
    const dot = document.getElementById('availability-dot');

    if (label) {
      label.textContent = available
        ? 'Available for opportunities'
        : 'Not accepting new clients';
    }

    if (dot) {
      dot.classList.toggle('status-dot-unavailable', !available);
    }
  } catch (error) {
    console.error('Could not load About settings:', error);
  }
})();
