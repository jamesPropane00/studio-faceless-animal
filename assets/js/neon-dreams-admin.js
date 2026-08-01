const ndc = {
  characters: [],
  session: null,
  $: (selector) => document.querySelector(selector),
  safe: (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])),
};

function userHeader() { return { 'x-fas-user': JSON.stringify(ndc.session || {}) }; }

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...userHeader(), ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function render() {
  const list = ndc.$('#ndc-character-list');
  list.innerHTML = ndc.characters.map((character) => `<article class="admin-row">
    <div><strong>${ndc.safe(character.name)}</strong><p>${ndc.safe(character.subtitle || 'No subtitle')} · ${character.media?.length || 0} media files · ${character.published ? 'Live' : 'Draft'}</p>
    <div class="ndc-admin-media">${(character.media || []).map((item) => `<span>${item.media_type === 'video' ? '▶' : '▧'} ${ndc.safe(item.title || item.media_type)} <button type="button" data-delete-media="${item.id}">×</button></span>`).join('')}</div></div>
    <div class="admin-actions"><button type="button" data-upload-to="${character.id}">Add media</button><button type="button" data-edit-character="${character.id}">Edit</button><button type="button" data-sell-character="${character.id}">Sell a file</button><button type="button" data-delete-character="${character.id}">Delete</button></div>
  </article>`).join('') || '<p class="field-help">Create your first character section above.</p>';
}

async function load() {
  try {
    ndc.session = JSON.parse(localStorage.getItem('fas_user') || 'null');
    const payload = await request('/api/neon-dreams/characters?admin=1');
    ndc.characters = payload.characters || [];
    render();
  } catch (error) {
    ndc.$('#ndc-character-error').textContent = error.message;
  }
}

ndc.$('#ndc-character-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  values.action = 'save'; values.published = form.elements.published.checked;
  try {
    await request('/api/neon-dreams/characters', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(values) });
    form.reset(); form.elements.id.value = ''; form.elements.accent_color.value = '#ec4899'; form.elements.published.checked = true;
    await load();
  } catch (error) { ndc.$('#ndc-character-error').textContent = error.message; }
});

ndc.$('#ndc-media-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Uploading…';
  try {
    await request('/api/neon-dreams/media', { method: 'POST', body: new FormData(form) });
    form.reset(); form.classList.add('hidden'); await load();
  } catch (error) { ndc.$('#ndc-media-error').textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Upload media'; }
});

document.addEventListener('click', async (event) => {
  const tab = event.target.closest('[data-tab="characters"]');
  if (tab) load();
  const upload = event.target.closest('[data-upload-to]');
  if (upload) {
    ndc.$('#ndc-media-form').classList.remove('hidden');
    ndc.$('#ndc-media-form').elements.character_id.value = upload.dataset.uploadTo;
    ndc.$('#ndc-media-form').scrollIntoView({ behavior:'smooth', block:'center' });
  }
  const edit = event.target.closest('[data-edit-character]');
  if (edit) {
    const character = ndc.characters.find((item) => item.id === edit.dataset.editCharacter);
    const form = ndc.$('#ndc-character-form');
    ['id','name','slug','subtitle','description','accent_color','cover_url','sort_order'].forEach((key) => { form.elements[key].value = character[key] ?? ''; });
    form.elements.published.checked = character.published;
    form.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  const sell = event.target.closest('[data-sell-character]');
  if (sell) {
    const character = ndc.characters.find((item) => item.id === sell.dataset.sellCharacter);
    const query = new URLSearchParams({ tab:'products', kind:'file_download', title:`${character.name} Digital File`, category:'Neon Dreams Club', description:character.description || `A digital release from ${character.name}'s Neon Dreams Club collection.` });
    location.href = `shop-admin.html?${query}`;
  }
  const deleteMedia = event.target.closest('[data-delete-media]');
  if (deleteMedia && confirm('Delete this media file?')) {
    await request('/api/neon-dreams/media', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'delete', id:deleteMedia.dataset.deleteMedia }) }); await load();
  }
  const deleteCharacter = event.target.closest('[data-delete-character]');
  if (deleteCharacter && confirm('Delete this character and every media file in the section?')) {
    await request('/api/neon-dreams/characters', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'delete', id:deleteCharacter.dataset.deleteCharacter }) }); await load();
  }
});

