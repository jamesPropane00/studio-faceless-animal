// faceless_builder_app.js
// Shared builder logic for Faceless Builder App

window.__FAS_BUILDER_SAVE_ENDPOINT = "/api/member/page-builder/save";

const editor = grapesjs.init({
  container: '#gjs',
  height: '100%',
  fromElement: false,
  storageManager: false,
  selectorManager: { componentFirst: true },
  blockManager: { appendTo: '#blocks' },
  styleManager: { appendTo: '.gjs-sm-sectors' },
  layerManager: { appendTo: '.gjs-layers-container' },
  traitManager: { appendTo: '.gjs-traits-container' },
  deviceManager: {
    devices: [
      { id: 'desktop', name: 'Desktop', width: '' },
      { id: 'tablet', name: 'Tablet', width: '768px', widthMedia: '992px' },
      { id: 'mobile', name: 'Mobile', width: '375px', widthMedia: '575px' }
    ]
  }
});

const bm = editor.BlockManager;

bm.add('site-navbar', {
  label: 'Navbar',
  category: 'Layout',
  content: `
    <header style="padding:18px 24px; background:#111; color:#fff; border-bottom:1px solid #222;">
      <div style="max-width:1180px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap;">
        <div style="font-size:20px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;">Brand</div>
        <nav style="display:flex; gap:18px; flex-wrap:wrap;">
          <a href="#" style="color:#d4d4d4; text-decoration:none;">Home</a>
          <a href="#" style="color:#d4d4d4; text-decoration:none;">About</a>
          <a href="#" style="color:#d4d4d4; text-decoration:none;">Work</a>
          <a href="#" style="color:#d4d4d4; text-decoration:none;">Contact</a>
        </nav>
      </div>
    </header>
  `
});
bm.add('hero-banner', {
  label: 'Hero Banner',
  category: 'Layout',
  content: `
    <section style="padding:110px 24px; background:linear-gradient(135deg,#111,#1f1f1f); color:#fff; text-align:center;">
      <div style="max-width:980px; margin:0 auto;">
        <div style="display:inline-block; padding:6px 12px; border:1px solid rgba(255,255,255,.18); border-radius:999px; color:#c9c9c9; font-size:12px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:18px;">Faceless Brand</div>
        <h1 style="margin:0 0 18px; font-size:58px; line-height:1.05;">Build Your Presence</h1>
        <p style="margin:0 auto 28px; max-width:720px; font-size:18px; color:#b7b7b7;">Launch a sharp, modern page with a dark premium look and strong call to action.</p>
        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <a href="#" style="display:inline-block; padding:14px 24px; background:#fff; color:#111; text-decoration:none; border-radius:8px; font-weight:700;">Get Started</a>
          <a href="#" style="display:inline-block; padding:14px 24px; background:transparent; color:#fff; border:1px solid rgba(255,255,255,.2); text-decoration:none; border-radius:8px; font-weight:700;">See More</a>
        </div>
      </div>
    </section>
  `
});
bm.add('section-block', {
  label: 'Section',
  category: 'Layout',
  content: `
    <section style="padding:70px 24px; background:#101010; color:#fff;">
      <div style="max-width:1100px; margin:0 auto;">
        <h2 style="margin:0 0 16px; font-size:38px;">New Section</h2>
        <p style="margin:0; font-size:16px; color:#bcbcbc;">Add your content here and shape the section however you want.</p>
      </div>
    </section>
  `
});
bm.add('two-columns', {
  label: '2 Columns',
  category: 'Layout',
  content: `
    <section style="padding:70px 24px; background:#0f0f0f; color:#fff;">
      <div style="max-width:1100px; margin:0 auto; display:flex; gap:24px; flex-wrap:wrap;">
        <div style="flex:1 1 320px; min-height:200px; padding:26px; background:#181818; border:1px solid #2a2a2a; border-radius:14px;">
          <h3 style="margin-top:0;">Left Column</h3>
          <p style="color:#b9b9b9;">Use this side for text, images, embeds, or buttons.</p>
        </div>
        <div style="flex:1 1 320px; min-height:200px; padding:26px; background:#181818; border:1px solid #2a2a2a; border-radius:14px;">
          <h3 style="margin-top:0;">Right Column</h3>
          <p style="color:#b9b9b9;">Perfect for split layouts and side-by-side content.</p>
        </div>
      </div>
    </section>
  `
});
bm.add('feature-cards', {
  label: 'Feature Cards',
  category: 'Sections',
  content: `
    <section style="padding:80px 24px; background:#0d0d0d; color:#fff;">
      <div style="max-width:1100px; margin:0 auto;">
        <div style="margin-bottom:26px;">
          <h2 style="margin:0 0 12px; font-size:42px;">What You Offer</h2>
          <p style="margin:0; color:#b9b9b9;">Highlight your strongest features in a clean card layout.</p>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:20px;">
          <div style="flex:1 1 260px; padding:24px; background:#171717; border:1px solid #292929; border-radius:16px;">
            <h3 style="margin-top:0;">Fast Setup</h3>
            <p style="color:#bababa;">Get online quickly with a sleek starter layout.</p>
          </div>
          <div style="flex:1 1 260px; padding:24px; background:#171717; border:1px solid #292929; border-radius:16px;">
            <h3 style="margin-top:0;">Strong Branding</h3>
            <p style="color:#bababa;">Shape the page around your tone, image, and offer.</p>
          </div>
          <div style="flex:1 1 260px; padding:24px; background:#171717; border:1px solid #292929; border-radius:16px;">
            <h3 style="margin-top:0;">Flexible Layout</h3>
            <p style="color:#bababa;">Rearrange sections easily without rebuilding the page.</p>
          </div>
        </div>
      </div>
    </section>
  `
});
bm.add('gallery-grid', {
  label: 'Gallery Grid',
  category: 'Media',
  content: `
    <section style="padding:80px 24px; background:#101010; color:#fff;">
      <div style="max-width:1100px; margin:0 auto;">
        <h2 style="margin:0 0 22px; font-size:40px;">Gallery</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px;">
          <img src="https://via.placeholder.com/600x500?text=Image+1" style="width:100%; display:block; border-radius:14px;" />
          <img src="https://via.placeholder.com/600x500?text=Image+2" style="width:100%; display:block; border-radius:14px;" />
          <img src="https://via.placeholder.com/600x500?text=Image+3" style="width:100%; display:block; border-radius:14px;" />
          <img src="https://via.placeholder.com/600x500?text=Image+4" style="width:100%; display:block; border-radius:14px;" />
        </div>
      </div>
    </section>
  `
});
bm.add('social-links', {
  label: 'Social Links',
  category: 'Media',
  content: `
    <section style="padding:40px 24px; background:#111; color:#fff;">
      <div style="max-width:1100px; margin:0 auto; display:flex; gap:14px; flex-wrap:wrap;">
        <a href="#" style="padding:12px 18px; border:1px solid #2d2d2d; border-radius:999px; color:#fff; text-decoration:none;">Instagram</a>
        <a href="#" style="padding:12px 18px; border:1px solid #2d2d2d; border-radius:999px; color:#fff; text-decoration:none;">YouTube</a>
        <a href="#" style="padding:12px 18px; border:1px solid #2d2d2d; border-radius:999px; color:#fff; text-decoration:none;">Spotify</a>
        <a href="#" style="padding:12px 18px; border:1px solid #2d2d2d; border-radius:999px; color:#fff; text-decoration:none;">TikTok</a>
      </div>
    </section>
  `
});
bm.add('contact-block', {
  label: 'Contact Block',
  category: 'Sections',
  content: `
    <section style="padding:80px 24px; background:#0e0e0e; color:#fff;">
      <div style="max-width:900px; margin:0 auto;">
        <h2 style="margin:0 0 14px; font-size:42px;">Contact</h2>
        <p style="margin:0 0 24px; color:#b8b8b8;">Add your call to action and contact info here.</p>
        <div style="display:grid; gap:14px;">
          <div style="padding:18px 20px; background:#181818; border:1px solid #2a2a2a; border-radius:12px;">Email: yourname@example.com</div>
          <div style="padding:18px 20px; background:#181818; border:1px solid #2a2a2a; border-radius:12px;">Phone: (000) 000-0000</div>
          <div style="padding:18px 20px; background:#181818; border:1px solid #2a2a2a; border-radius:12px;">Location: Your City</div>
        </div>
      </div>
    </section>
  `
});
bm.add('site-footer', {
  label: 'Footer',
  category: 'Layout',
  content: `
    <footer style="padding:34px 24px; background:#0a0a0a; color:#8f8f8f; border-top:1px solid #1f1f1f;">
      <div style="max-width:1100px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap;">
        <div style="font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#fff;">Brand</div>
        <div>© 2026 All rights reserved</div>
      </div>
    </footer>
  `
});
bm.add('text-block', {
  label: 'Text',
  category: 'Basic',
  content: `<div style="padding:22px; color:#fff; font-size:16px;">Insert your text here</div>`
});
bm.add('image-block', {
  label: 'Image',
  category: 'Basic',
  content: `<div style="padding:20px; text-align:center;"><img src="https://via.placeholder.com/900x500?text=Your+Image" style="max-width:100%; height:auto; display:inline-block; border-radius:12px;" /></div>`
});
bm.add('button-block', {
  label: 'Button',
  category: 'Basic',
  content: `<div style="padding:20px;"><a href="#" style="display:inline-block; padding:12px 22px; background:#fff; color:#111; text-decoration:none; border-radius:8px; font-weight:700;">Click Here</a></div>`
});

// ...existing blockManager.add code for all blocks...

editor.setComponents(`
  <section style="padding:110px 24px; background:linear-gradient(135deg,#111,#202020); color:#fff; text-align:center;">
    <div style="max-width:960px; margin:0 auto;">
      <div style="display:inline-block; padding:6px 12px; border:1px solid rgba(255,255,255,.18); border-radius:999px; color:#cfcfcf; font-size:12px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:18px;">Faceless Visual Builder</div>
      <h1 style="margin:0 0 18px; font-size:62px; line-height:1.05;">Build Your Page</h1>
      <p style="margin:0 auto; max-width:720px; font-size:18px; color:#b8b8b8;">Drag layout blocks, drop in content, and shape the site visually.</p>
    </div>
  </section>
`);

document.querySelectorAll('.panel-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('active-panel'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.panel).classList.add('active-panel');
  });
});

const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const exportModal = document.getElementById('exportModal');
const closeExport = document.getElementById('closeExport');
const codeOutput = document.getElementById('codeOutput');

exportBtn.addEventListener('click', () => {
  const html = editor.getHtml();
  const css = editor.getCss();
  codeOutput.value = `<style>\n${css}\n</style>\n\n${html}`;
  exportModal.classList.add('active');
});

closeExport.addEventListener('click', () => exportModal.classList.remove('active'));
exportModal.addEventListener('click', e => {
  if (e.target === exportModal) exportModal.classList.remove('active');
});

clearBtn.addEventListener('click', () => {
  if (!confirm('Clear the current page?')) return;
  editor.setComponents('');
  editor.setStyle('');
});
