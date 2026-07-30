import { supabase, SUPABASE_READY } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const allowedAdmins = new Set(["jdot00", "jamespropane00"]);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const slugify = (value) => String(value || "").trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
const excerpt = (value, limit = 155) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
};
let session = null;
let products = [];

function getWebsiteSession() {
  try { return JSON.parse(localStorage.getItem("fas_user") || "null"); } catch { return null; }
}
async function api(action, payload = {}) {
  if (!session?.username || !session?.shop_token) throw new Error("Sign in with your website account again.");
  const { data, error } = await supabase.functions.invoke("dynamic-function", {
    body: { action, username: session.username, token: session.shop_token, ...payload },
  });
  if (error || data?.error) throw new Error(data?.error || error.message);
  return data;
}
async function guard() {
  if (!SUPABASE_READY) return deny("Supabase is not configured.");
  session = getWebsiteSession();
  const username = String(session?.username || "").toLowerCase();
  if (!session?.shop_token) return deny("Sign in with your Faceless Animal website account again to activate secure shop access.");
  if (!allowedAdmins.has(username)) return deny("Access denied. Only jdot00 and jamespropane00 may use this admin.");
  try {
    const verified = await api("verify");
    showAdmin(verified.username);
  } catch (error) {
    deny(error.message);
  }
}
function deny(message) {
  $("#login-error").textContent = message;
  $("#login-view").classList.remove("hidden");
  $("#admin-view").classList.add("hidden");
}
function showAdmin(username) {
  $("#login-view").classList.add("hidden");
  $("#admin-view").classList.remove("hidden");
  document.querySelector(".shop-brand small").textContent = `SUPPLY ADMIN · ${username}`;
  loadProducts();
  loadOrders();
}
$("#signout").onclick = () => {
  localStorage.removeItem("fas_user");
  localStorage.removeItem("fas_member");
  location.href = "login.html?next=shop-admin.html";
};

function showKindFields() {
  const digital = $("#product-kind").value !== "physical";
  $("#physical-fields").classList.toggle("hidden", digital);
  $("#digital-fields").classList.toggle("hidden", !digital);
  const current = products.find((product) => product.id === $("#product-form").elements.id.value);
  $("#product-form").elements.download_file.required = digital && !current?.download_storage_path;
}
$("#product-kind").onchange = showKindFields;

function updateSearchPreview() {
  const form = $("#product-form");
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "").trim();
  $("#seo-preview-title").textContent = title ? `${title} | Faceless Supply` : "Your product title | Faceless Supply";
  $("#seo-preview-url").textContent = `facelessanimalstudios.com/product/${slugify(title) || "your-product"}`;
  $("#seo-preview-description").textContent = excerpt(description) || "Your product description will become the search description automatically.";
}
$("#product-form").elements.title.addEventListener("input", updateSearchPreview);
$("#product-form").elements.description.addEventListener("input", updateSearchPreview);

async function loadProducts() {
  try {
    products = (await api("list_products")).products || [];
    $("#product-list").innerHTML = products.map((product) => `
      <article class="admin-row"><div><strong>${safe(product.title)}</strong>
        <p>${safe(product.sku)} · ${safe(product.product_kind?.replaceAll("_", " ") || "physical")} · ${money(product.price_cents)} · ${product.quantity} available · ${product.state} · ${product.published ? "published" : "hidden"}</p>
        <p>${product.slug ? `<a href="/product/${encodeURIComponent(product.slug)}" target="_blank" rel="noopener">View product page ↗</a>` : "Product URL is created when saved"} · ${product.published ? "Live in store" : "Private draft"}</p>
      </div><div class="admin-actions"><button data-edit="${product.id}">Edit</button><button data-publish="${product.id}">${product.published ? "Unpublish" : "Publish"}</button><button data-delete="${product.id}">Delete</button></div></article>`
    ).join("") || "<p>No products yet.</p>";
  } catch (error) {
    $("#product-list").innerHTML = `<p class="form-error">${safe(error.message)}</p>`;
  }
}
function cleanFilename(name) {
  return String(name).replace(/[^a-z0-9._-]/gi, "-");
}
async function uploadFile(bucket, productId, file) {
  const signed = await api("create_upload_url", {
    bucket, product_id: productId, filename: cleanFilename(file.name), size: file.size,
  });
  const { error } = await supabase.storage.from(bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return signed.path;
}

$("#product-form").onsubmit = async (event) => {
  event.preventDefault();
  const element = event.currentTarget;
  const form = new FormData(element);
  const existingId = String(form.get("id") || "");
  const productId = existingId || crypto.randomUUID();
  const existing = products.find((product) => product.id === existingId);
  const kind = String(form.get("product_kind"));
  const isDigital = kind !== "physical";
  const downloadFile = form.get("download_file");
  let download = {
    path: existing?.download_storage_path || null,
    filename: existing?.download_filename || null,
    mime: existing?.download_mime_type || null,
  };
  $("#product-error").textContent = "";
  try {
    if (isDigital && downloadFile?.size) {
      download = {
        path: await uploadFile("product-downloads", productId, downloadFile),
        filename: downloadFile.name,
        mime: downloadFile.type || "application/octet-stream",
      };
    }
    if (isDigital && !download.path) throw new Error("Choose the protected file customers will download.");
    const imageRecords = [];
    const images = form.getAll("images").filter((file) => file.size);
    for (const [index, file] of images.entries()) {
      const path = await uploadFile("product-images", productId, file);
      const { data: publicData } = supabase.storage.from("product-images").getPublicUrl(path);
      imageRecords.push({
        storage_path: path, public_url: publicData.publicUrl,
        sort_order: (existing?.product_images?.length || 0) + index,
      });
    }
    await api("save_product", {
      product: {
        id: productId, title: form.get("title"), sku: form.get("sku"),
        description: form.get("description"),
        price_cents: Math.round(Number(form.get("price")) * 100),
        quantity: Number(form.get("quantity")),
        condition: form.get("condition"), category: form.get("category"),
        shipping_price_cents: Math.round(Number(form.get("shipping_price") || 0) * 100),
        local_pickup: form.get("local_pickup") === "on",
        published: form.get("published") === "on", product_kind: kind,
        preview_url: form.get("preview_url") || null,
        download_storage_path: download.path, download_filename: download.filename,
        download_mime_type: download.mime,
      },
      images: imageRecords,
    });
    resetProductForm();
    await loadProducts();
  } catch (error) {
    $("#product-error").textContent = error.message;
  }
};

function editProduct(product) {
  const form = $("#product-form");
  for (const key of ["id","title","sku","description","quantity","condition","category","product_kind","preview_url"]) {
    form.elements[key].value = product[key] || "";
  }
  form.elements.price.value = (product.price_cents / 100).toFixed(2);
  form.elements.shipping_price.value = (product.shipping_price_cents / 100).toFixed(2);
  form.elements.local_pickup.checked = product.local_pickup;
  form.elements.published.checked = product.published;
  showKindFields();
  updateSearchPreview();
  scrollTo({ top: 0, behavior: "smooth" });
}
document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-edit],[data-publish],[data-delete],[data-tab]");
  if (!target) return;
  if (target.dataset.tab) {
    document.querySelectorAll(".tabs button").forEach((button) => button.classList.toggle("active", button === target));
    $("#products-tab").classList.toggle("hidden", target.dataset.tab !== "products");
    $("#orders-tab").classList.toggle("hidden", target.dataset.tab !== "orders");
  }
  const product = products.find((item) => item.id === (target.dataset.edit || target.dataset.publish || target.dataset.delete));
  try {
    if (target.dataset.edit && product) editProduct(product);
    if (target.dataset.publish && product) { await api("toggle_publish", { product_id: product.id }); loadProducts(); }
    if (target.dataset.delete && product && confirm(`Delete “${product.title}” and its files?`)) {
      await api("delete_product", { product_id: product.id }); loadProducts();
    }
  } catch (error) {
    alert(error.message);
  }
});
function resetProductForm() {
  $("#product-form").reset();
  $("#product-form").elements.id.value = "";
  $("#product-kind").value = "physical";
  showKindFields();
  updateSearchPreview();
}
$("#reset-product").onclick = resetProductForm;

async function loadOrders() {
  try {
    const data = await api("list_orders", { status: $("#order-filter").value });
    const transitions = { pending: ["canceled"], paid: ["shipped"], shipped: ["completed"] };
    $("#order-list").innerHTML = (data.orders || []).map((order) => `
      <article class="admin-row"><div><strong>${safe(order.order_number)}</strong>
        <p>${safe(order.customer_name)} · ${safe(order.customer_email)} · ${money(order.total_cents)} · ${order.fulfillment_method}</p>
        <p>${order.order_items.map((item) => `${item.quantity}× ${safe(item.title)} (${safe(item.product_kind?.replaceAll("_", " ") || "physical")})`).join(" · ")}</p>
      </div><div class="admin-actions"><select data-status="${order.id}">
        ${[order.status, ...(transitions[order.status] || [])].map((status) => `<option>${status}</option>`).join("")}
      </select></div></article>`).join("") || "<p>No orders found.</p>";
  } catch (error) {
    $("#order-list").innerHTML = `<p class="form-error">${safe(error.message)}</p>`;
  }
}
$("#order-filter").onchange = loadOrders;
document.addEventListener("change", async (event) => {
  if (!event.target.dataset.status) return;
  try {
    await api("update_order_status", { order_id: event.target.dataset.status, status: event.target.value });
    loadOrders();
  } catch (error) {
    alert(error.message);
  }
});

showKindFields();
updateSearchPreview();
guard();
