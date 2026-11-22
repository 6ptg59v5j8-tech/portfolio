
(async function loadAnnouncementBanner() {
  const banner = document.getElementById('announcement-banner');
  const track = document.getElementById('announcement-track');

  if (!banner || !track) return;

  try {
    const response = await fetch('/api/content', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) return;

    const data = await response.json();
    const settings = data.settings || {};

    if (settings.banner_enabled !== 'true') return;

    let messages = [];

    try {
      const parsed = JSON.parse(settings.banner_messages || '[]');
      if (Array.isArray(parsed)) {
        messages = parsed.filter(
          item => typeof item === 'string' && item.trim()
        );
      }
    } catch {
      messages = [];
    }

    if (!messages.length) return;

    const background = settings.banner_background || '#20211e';
    const textColour = settings.banner_text_colour || '#ffffff';
    const speed = Math.min(
      30,
      Math.max(4, Number(settings.banner_speed) || 7)
    );

    banner.style.backgroundColor = background;
    banner.style.color = textColour;

    track.replaceChildren();

    const repeatedMessages = [...messages, ...messages];

    repeatedMessages.forEach(message => {
      const item = document.createElement('span');
      item.className = 'announcement-item';
      item.textContent = message;
      track.append(item);
    });

    track.style.animationDuration = `${speed * messages.length}s`;
    banner.hidden = false;
  } catch (error) {
    console.error('Could not load announcement banner:', error);
  }
})();
