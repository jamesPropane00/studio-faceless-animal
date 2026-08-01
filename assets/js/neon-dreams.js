const galleryRoot = document.querySelector('#ndc-character-collections');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function mediaCard(item) {
  const title = escapeHtml(item.title || 'Untitled signal');
  const caption = escapeHtml(item.caption || '');
  const visual = item.media_type === 'video'
    ? `<button class="ndc-media-play" type="button" data-video="${escapeHtml(item.public_url)}" aria-label="Play ${title}">
         <video preload="metadata" playsinline poster="${escapeHtml(item.poster_url || '')}"><source src="${escapeHtml(item.public_url)}"></video>
         <span class="ndc-play-orb" aria-hidden="true"><span></span></span>
       </button>`
    : `<img src="${escapeHtml(item.public_url)}" alt="${title}" loading="lazy">`;
  return `<article class="ndc-media-card">${visual}<div class="ndc-media-copy"><strong>${title}</strong>${caption ? `<p>${caption}</p>` : ''}</div></article>`;
}

function characterSection(character) {
  const items = Array.isArray(character.media) ? character.media : [];
  if (!items.length) return '';
  const accent = /^#[0-9a-f]{6}$/i.test(character.accent_color) ? character.accent_color : '#ec4899';
  return `<section class="ndc-character" style="--character-accent:${accent}" aria-labelledby="character-${escapeHtml(character.slug)}">
    <div class="ndc-character-head">
      <div><p class="ndc-character-label">Character file</p><h3 id="character-${escapeHtml(character.slug)}">${escapeHtml(character.name)}</h3>
      ${character.subtitle ? `<strong>${escapeHtml(character.subtitle)}</strong>` : ''}</div>
      <div class="ndc-rail-controls"><button type="button" data-rail-prev aria-label="Previous items">←</button><button type="button" data-rail-next aria-label="Next items">→</button></div>
    </div>
    ${character.description ? `<p class="ndc-character-description">${escapeHtml(character.description)}</p>` : ''}
    <div class="ndc-media-rail" tabindex="0">${items.map(mediaCard).join('')}</div>
  </section>`;
}

async function loadCharacters() {
  if (!galleryRoot) return;
  try {
    const response = await fetch('/api/neon-dreams/characters');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not load character files.');
    const html = (payload.characters || []).map(characterSection).join('');
    galleryRoot.innerHTML = html || '<p class="ndc-empty-signal">New character files are being prepared.</p>';
  } catch {
    galleryRoot.innerHTML = '<p class="ndc-empty-signal">Character files are temporarily off signal.</p>';
  }
}

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-rail-prev],[data-rail-next]');
  if (control) {
    const rail = control.closest('.ndc-character').querySelector('.ndc-media-rail');
    rail.scrollBy({ left: rail.clientWidth * (control.hasAttribute('data-rail-next') ? .82 : -.82), behavior: 'smooth' });
    return;
  }
  const play = event.target.closest('[data-video]');
  if (!play) return;
  const video = play.querySelector('video');
  if (!video.controls) {
    video.controls = true;
    play.classList.add('is-playing');
    video.play().catch(() => {});
  }
});

loadCharacters();

