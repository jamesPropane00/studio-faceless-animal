function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function makeSlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "faceless-page";
}
function getFormData() {
  return {
    type: document.getElementById("qs-type").value.trim(),
    title: document.getElementById("qs-title").value.trim() || "Faceless Page",
    profileImg: document.getElementById("qs-profile-img").value.trim(),
    headerImg: document.getElementById("qs-header-img").value.trim(),
    bio: document.getElementById("qs-bio").value.trim(),
    links: document.getElementById("qs-links").value.trim(),
    contact: document.getElementById("qs-contact").value.trim(),
    featured: document.getElementById("qs-featured").value.trim()
  };
}
function buildLinksHtml(linkText) {
  return (linkText || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => `<a href="${escapeHtml(v)}" target="_blank" style="color:#a78bfa;text-decoration:none;margin-right:10px;">${escapeHtml(v)}</a>`)
    .join(" ");
}
function buildPageHtml(data) {
  const safeTitle = escapeHtml(data.title);
  const safeType = escapeHtml(data.type);
  const safeBio = escapeHtml(data.bio);
  const safeContact = escapeHtml(data.contact);
  const safeFeatured = escapeHtml(data.featured);
  const profileImg = data.profileImg ? escapeHtml(data.profileImg) : "";
  const headerImg = data.headerImg ? escapeHtml(data.headerImg) : "";
  const linksHtml = buildLinksHtml(data.links);
  return `
<section style="padding:48px 18px;max-width:720px;margin:0 auto;color:#eef2ff;font-family:Inter,system-ui,sans-serif;">
  <div style="border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,#171c31,#0d1120);border-radius:24px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.35);">
    ${headerImg ? `<img src="${headerImg}" alt="Header" style="width:100%;height:220px;object-fit:cover;display:block;">` : `<div style="height:160px;background:linear-gradient(135deg,#7c3aed,#2563eb);"></div>`}
    <div style="padding:22px;">
      <div style="display:flex;gap:16px;align-items:center;margin-top:-58px;flex-wrap:wrap;">
        ${profileImg ? `<img src="${profileImg}" alt="Profile" style="width:92px;height:92px;border-radius:50%;object-fit:cover;border:4px solid #111629;background:#111629;">` : `<div style="width:92px;height:92px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#2563eb);border:4px solid #111629;"></div>`}
        <div>
          <h1 style="margin:0;font-size:1.7rem;">${safeTitle}</h1>
          <div style="margin-top:6px;color:#a78bfa;font-weight:700;">${safeType || "Creator Page"}</div>
        </div>
      </div>
      ${safeBio ? `<p style="margin:20px 0 0;color:#cdd5ea;line-height:1.7;">${safeBio}</p>` : ``}
      ${linksHtml ? `<div style="margin-top:18px;"><strong style="display:block;margin-bottom:8px;">Links</strong>${linksHtml}</div>` : ``}
      ${safeContact ? `<div style="margin-top:18px;"><strong>Contact:</strong> ${safeContact}</div>` : ``}
      ${safeFeatured ? `<div style="margin-top:12px;"><strong>Featured:</strong> ${safeFeatured}</div>` : ``}
    </div>
  </div>
</section>`.trim();
}
function renderPreview() {
  const data = getFormData();
  const preview = document.getElementById("qs-preview");
  preview.innerHTML = `
    <h3>${escapeHtml(data.title || "Faceless Page")}</h3>
    <p><strong>Type:</strong> ${escapeHtml(data.type || "Not selected")}</p>
    <p><strong>Bio:</strong> ${escapeHtml(data.bio || "No bio yet.")}</p>
    <p><strong>Contact:</strong> ${escapeHtml(data.contact || "No contact set.")}</p>
    <p><strong>Featured:</strong> ${escapeHtml(data.featured || "No featured content yet.")}</p>
  `;
}
async function saveDraft(e) {
  if (e) e.preventDefault();
  const user = JSON.parse(localStorage.getItem("fas_user") || "null");
  if (!user || !user.username) {
    alert("You need to be signed in.");
    return;
  }
  const data = getFormData();
  const title = data.title;
  const slug = makeSlug(title);
  const html = buildPageHtml(data);
  const css = "";
  const full_document = `<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"><title>${escapeHtml(title)}</title></head><body style=\"margin:0;background:#080b14;\">${html}</body></html>`;
  const payload = {
    page_title: title,
    page_slug: slug,
    html,
    css,
    full_document,
    is_published: false
  };
  try {
    const res = await fetch("/api/member/pages/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fas-user": JSON.stringify(user)
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Save failed");
    alert("Draft saved!");
    renderPreview();
    const recent = document.getElementById("my-page-recent");
    recent.innerHTML = `<div class="list-item">Draft saved for <strong>${escapeHtml(title)}</strong>.</div>`;
    updateStatusUi({ published: false, slug });
  } catch (err) {
    alert("Save failed.");
  }
}
async function publishPage() {
  const user = JSON.parse(localStorage.getItem("fas_user") || "null");
  if (!user || !user.username) {
    alert("You need to be signed in.");
    return;
  }
  const data = getFormData();
  const title = data.title;
  const slug = makeSlug(title);
  const html = buildPageHtml(data);
  const css = "";
  const full_document = `<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"><title>${escapeHtml(title)}</title></head><body style=\"margin:0;background:#080b14;\">${html}</body></html>`;
  const payload = {
    page_title: title,
    page_slug: slug,
    html,
    css,
    full_document,
    is_published: true
  };
  try {
    const res = await fetch("/api/member/pages/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fas-user": JSON.stringify(user)
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Publish failed");
    alert("Page published!");
    renderPreview();
    const recent = document.getElementById("my-page-recent");
    recent.innerHTML = `<div class=\"list-item\">Page published for <strong>${escapeHtml(title)}</strong>.</div>`;
    updateStatusUi({ published: true, slug });
  } catch (err) {
    alert("Publish failed.");
  }
}
function updateStatusUi(opts) {
  const user = JSON.parse(localStorage.getItem("fas_user") || "null");
  const statusEl = document.getElementById("my-page-status");
  const dot = document.getElementById("status-dot");
  const liveBtn = document.getElementById("my-page-view-live");
  const routeHint = document.getElementById("route-hint");
  if (user && user.username) {
    routeHint.textContent = "/" + user.username;
  }
  const published = opts && opts.published;
  const slug = (opts && opts.slug) || (user && user.username);
  if (published) {
    statusEl.textContent = "Live now";
    dot.classList.add("live");
    liveBtn.style.display = "inline-flex";
    liveBtn.href = "/" + encodeURIComponent(slug);
    liveBtn.textContent = "View Live";
  } else {
    statusEl.textContent = "Not published yet";
    dot.classList.remove("live");
    liveBtn.style.display = "none";
  }
}
document.getElementById("qs-form").addEventListener("submit", saveDraft);
updateStatusUi();
