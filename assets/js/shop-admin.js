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
const sourceFor = (product) => Array.isArray(product?.product_sources)
  ? product.product_sources[0] : product?.product_sources || null;
const deliveryPresets = {
  standard: { min: 15, max: 30, from: "China", service: "AliExpress Standard Shipping" },
  choice: { min: 7, max: 15, from: "China", service: "AliExpress Choice" },
  us_warehouse: { min: 5, max: 10, from: "United States", service: "US warehouse shipping" },
};
let session = null;
let products = [];
let orders = [];
let importedSpringImage = null;

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
  const selectedKind = $("#product-kind").value;
  const spring = selectedKind === "spring";
  const fanvue = selectedKind === "fanvue";
  const dropship = selectedKind === "dropship";
  const external = spring || fanvue;
  const digital = selectedKind === "music_download" || selectedKind === "file_download";
  $("#physical-fields").classList.toggle("hidden", digital || external);
  $("#digital-fields").classList.toggle("hidden", !digital);
  $("#spring-fields").classList.toggle("hidden", !spring);
  $("#fanvue-fields").classList.toggle("hidden", !fanvue);
  $("#dropship-fields").classList.toggle("hidden", !dropship);
  $("#local-pickup-control").classList.toggle("hidden", dropship);
  if (dropship) $("#product-form").elements.local_pickup.checked = false;
  $("#photo-help").textContent = fanvue
    ? "Upload only non-explicit promotional images that are safe for a general audience."
    : spring
      ? "The main Spring product image imports automatically. You may upload extra promotional images."
      : dropship
        ? "Upload your own licensed product images. The first image is the main storefront image."
        : "Select several photos at once from your phone. The first image is the main image.";
  if (external && !$("#product-form").elements.quantity.value) {
    $("#product-form").elements.quantity.value = "1";
  }
  const current = products.find((product) => product.id === $("#product-form").elements.id.value);
  $("#product-form").elements.download_file.required = digital && !current?.download_storage_path;
}
$("#product-kind").onchange = showKindFields;

$("#delivery-preset").onchange = (event) => {
  const preset = deliveryPresets[event.target.value];
  if (!preset) return;
  const form = $("#product-form");
  form.elements.delivery_min_business_days.value = String(preset.min);
  form.elements.delivery_max_business_days.value = String(preset.max);
  form.elements.ships_from.value = preset.from;
  form.elements.shipping_service.value = preset.service;
};
$("#product-form").elements.supplier_product_url.addEventListener("input", (event) => {
  const value = String(event.target.value || "");
  $("#open-supplier-source").href = value.startsWith("https://") ? value : "https://www.aliexpress.com/";
  const match = String(event.target.value).match(/\/item\/(\d+)\.html/i);
  if (match && !$("#product-form").elements.supplier_product_id.value) {
    $("#product-form").elements.supplier_product_id.value = match[1];
  }
});
$("#copy-supplier-source").onclick = async () => {
  const value = $("#product-form").elements.supplier_product_url.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    $("#copy-supplier-source").textContent = "Copied";
    setTimeout(() => { $("#copy-supplier-source").textContent = "Copy source URL"; }, 1200);
  } catch {
    alert("Could not copy the supplier URL.");
  }
};

$("#import-spring").onclick = async () => {
  const form = $("#product-form");
  const status = $("#spring-import-status");
  status.textContent = "Importing from Spring…";
  try {
    const data = await api("import_spring_product", { url: form.elements.external_purchase_url.value });
    const imported = data.product;
    form.elements.title.value = imported.title || "";
    form.elements.description.value = imported.description || "";
    form.elements.price.value = (imported.price_cents / 100).toFixed(2);
    form.elements.quantity.value = "1";
    form.elements.condition.value = "New";
    form.elements.category.value = imported.category || "Spring merchandise";
    form.elements.external_purchase_url.value = imported.external_purchase_url;
    form.elements.external_listing_id.value = imported.external_listing_id || "";
    importedSpringImage = imported.image_url || null;
    status.textContent = "Imported. Review the wording, then save or publish.";
    updateSearchPreview();
  } catch (error) {
    status.textContent = error.message;
  }
};

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
    $("#product-list").innerHTML = products.map((product) => {
      const provider = product.fulfillment_provider || "internal";
      const typeLabel = provider === "spring"
        ? "Spring fulfillment"
        : provider === "fanvue" ? "Fanvue link · 18+"
          : product.fulfillment_mode === "dropship" ? "AliExpress dropship" : safe(product.product_kind?.replaceAll("_", " ") || "physical");
      const inventoryLabel = provider === "spring"
        ? "inventory on Spring"
        : provider === "fanvue" ? "access on Fanvue"
          : product.fulfillment_mode === "dropship"
            ? `${product.delivery_min_business_days}–${product.delivery_max_business_days} business days`
            : `${product.quantity} available · ${product.state}`;
      return `
      <article class="admin-row"><div><strong>${safe(product.title)}</strong>
        <p>${safe(product.sku)} · ${typeLabel} · ${money(product.price_cents)} · ${inventoryLabel} · ${product.published ? "published" : "hidden"}</p>
        <p>${product.slug ? `<a href="/product/${encodeURIComponent(product.slug)}" target="_blank" rel="noopener">View product page ↗</a>` : "Product URL is created when saved"} · ${product.published ? "Live in store" : "Private draft"}</p>
      </div><div class="admin-actions"><button data-edit="${product.id}">Edit</button><button data-publish="${product.id}">${product.published ? "Unpublish" : "Publish"}</button><button data-delete="${product.id}">Delete</button></div></article>`;
    }
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
  const isSpring = kind === "spring";
  const isFanvue = kind === "fanvue";
  const isDropship = kind === "dropship";
  const isExternal = isSpring || isFanvue;
  const isDigital = kind === "music_download" || kind === "file_download";
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
    if (isFanvue && form.get("fanvue_preview_safe") !== "on") {
      throw new Error("Confirm that the Fanvue promotional preview is safe for a general audience.");
    }
    if (isFanvue && !images.length && !existing?.product_images?.length) {
      throw new Error("Upload a non-explicit promotional image for this Fanvue listing.");
    }
    for (const [index, file] of images.entries()) {
      const path = await uploadFile("product-images", productId, file);
      const { data: publicData } = supabase.storage.from("product-images").getPublicUrl(path);
      imageRecords.push({
        storage_path: path, public_url: publicData.publicUrl,
        sort_order: (existing?.product_images?.length || 0) + index,
      });
    }
    if (isSpring && importedSpringImage && !existing?.product_images?.some((image) => image.public_url === importedSpringImage)) {
      imageRecords.push({
        storage_path: `spring/${form.get("external_listing_id") || productId}/front`,
        public_url: importedSpringImage,
        sort_order: 0,
      });
    }
    await api("save_product", {
      product: {
        id: productId, title: form.get("title"), sku: form.get("sku"),
        description: form.get("description"),
        price_cents: Math.round(Number(form.get("price")) * 100),
        quantity: isExternal ? 1 : Number(form.get("quantity")),
        condition: form.get("condition"), category: form.get("category"),
        shipping_price_cents: Math.round(Number(form.get("shipping_price") || 0) * 100),
        local_pickup: !isDropship && form.get("local_pickup") === "on",
        published: form.get("published") === "on",
        product_kind: isExternal || isDropship ? "physical" : kind,
        fulfillment_provider: isSpring ? "spring" : isFanvue ? "fanvue" : "internal",
        fulfillment_mode: isDropship ? "dropship" : "stocked",
        ships_from: isDropship ? form.get("ships_from") : null,
        delivery_min_business_days: isDropship ? Number(form.get("delivery_min_business_days")) : null,
        delivery_max_business_days: isDropship ? Number(form.get("delivery_max_business_days")) : null,
        shipping_service: isDropship ? form.get("shipping_service") : null,
        external_purchase_url: isSpring ? form.get("external_purchase_url") : isFanvue ? form.get("fanvue_url") : null,
        external_listing_id: isSpring ? form.get("external_listing_id") : null,
        preview_is_safe: isFanvue && form.get("fanvue_preview_safe") === "on",
        preview_url: form.get("preview_url") || null,
        download_storage_path: download.path, download_filename: download.filename,
        download_mime_type: download.mime,
      },
      source: isDropship ? {
        supplier_product_url: form.get("supplier_product_url"),
        supplier_product_id: form.get("supplier_product_id") || null,
        supplier_variant: form.get("supplier_variant") || null,
        supplier_cost_cents: form.get("supplier_cost") === "" ? null : Math.round(Number(form.get("supplier_cost")) * 100),
        supplier_notes: form.get("supplier_notes") || null,
      } : null,
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
  for (const key of ["id","title","sku","description","quantity","condition","category","preview_url","external_listing_id"]) {
    form.elements[key].value = product[key] || "";
  }
  const provider = product.fulfillment_provider || "internal";
  form.elements.product_kind.value = provider === "spring"
    ? "spring"
    : provider === "fanvue" ? "fanvue"
      : product.fulfillment_mode === "dropship" ? "dropship" : (product.product_kind || "physical");
  form.elements.external_purchase_url.value = provider === "spring" ? (product.external_purchase_url || "") : "";
  form.elements.fanvue_url.value = provider === "fanvue" ? (product.external_purchase_url || "") : "";
  form.elements.fanvue_preview_safe.checked = provider === "fanvue";
  const source = sourceFor(product);
  form.elements.supplier_product_url.value = source?.supplier_product_url || "";
  $("#open-supplier-source").href = source?.supplier_product_url || "https://www.aliexpress.com/";
  form.elements.supplier_product_id.value = source?.supplier_product_id || "";
  form.elements.supplier_variant.value = source?.supplier_variant || "";
  form.elements.supplier_cost.value = source?.supplier_cost_cents == null ? "" : (source.supplier_cost_cents / 100).toFixed(2);
  form.elements.supplier_notes.value = source?.supplier_notes || "";
  form.elements.ships_from.value = product.ships_from || "China";
  form.elements.delivery_min_business_days.value = product.delivery_min_business_days || 15;
  form.elements.delivery_max_business_days.value = product.delivery_max_business_days || 30;
  form.elements.shipping_service.value = product.shipping_service || "AliExpress Standard Shipping";
  form.elements.delivery_preset.value = "custom";
  importedSpringImage = null;
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
  importedSpringImage = null;
  $("#product-form").elements.fanvue_preview_safe.checked = false;
  $("#product-form").elements.delivery_preset.value = "standard";
  $("#product-form").elements.ships_from.value = "China";
  $("#product-form").elements.delivery_min_business_days.value = "15";
  $("#product-form").elements.delivery_max_business_days.value = "30";
  $("#product-form").elements.shipping_service.value = "AliExpress Standard Shipping";
  $("#open-supplier-source").href = "https://www.aliexpress.com/";
  $("#spring-import-status").textContent = "Paste a public Spring listing and import its title, price, description, and main image.";
  showKindFields();
  updateSearchPreview();
}
$("#reset-product").onclick = resetProductForm;

const confirmedStatuses = new Set(["paid", "shipped", "completed"]);
const formatDate = (value) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
function formatAddress(address) {
  if (!address) return "";
  return [
    address.line1, address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country,
  ].filter(Boolean).join(" · ");
}
function formatAddressForSupplier(address, customerName, phone) {
  if (!address) return "";
  return [
    customerName,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country,
    phone,
  ].filter(Boolean).join("\n");
}
function updateSalesSummary() {
  const sales = orders.filter((order) => confirmedStatuses.has(order.status));
  $("#sales-count").textContent = String(sales.length);
  $("#sales-revenue").textContent = money(sales.reduce((total, order) => total + order.total_cents, 0));
  $("#sales-to-ship").textContent = String(orders.filter((order) => order.status === "paid" && order.fulfillment_method === "shipping").length);
  $("#sales-customers").textContent = String(new Set(sales.map((order) => order.customer_email.toLowerCase())).size);
}
function renderOrders() {
  const status = $("#order-filter").value;
  const search = $("#order-search").value.trim().toLowerCase();
  const transitions = { pending: ["canceled"], paid: ["shipped"], shipped: ["completed"] };
  const visible = orders.filter((order) => {
    if (status && order.status !== status) return false;
    if (!search) return true;
    const haystack = [
      order.order_number, order.customer_name, order.customer_email, order.customer_phone,
      ...order.order_items.flatMap((item) => [
        item.title, item.sku, item.supplier_order_id, item.supplier_tracking_number,
        item.supplier_product_id, item.supplier_variant,
      ]),
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });
  $("#order-list").innerHTML = visible.map((order) => {
    const address = formatAddress(order.shipping_address);
    const supplierAddress = formatAddressForSupplier(
      order.shipping_address, order.customer_name, order.customer_phone,
    );
    const paidDate = order.paid_at ? `Paid ${formatDate(order.paid_at)}` : "Payment not confirmed";
    return `
      <article class="order-card">
        <div class="order-head">
          <div><span class="status-badge status-${safe(order.status)}">${safe(order.status)}</span><h3>${safe(order.order_number)}</h3><div class="order-date">Ordered ${safe(formatDate(order.created_at))} · ${safe(paidDate)}</div></div>
          <strong class="order-total">${money(order.total_cents)}</strong>
        </div>
        <div class="order-sections">
          <section class="order-box">
            <h4>Customer</h4>
            <p><strong>${safe(order.customer_name)}</strong></p>
            <p><a href="mailto:${encodeURIComponent(order.customer_email)}">${safe(order.customer_email)}</a> <button class="copy-button" type="button" data-copy="${safe(order.customer_email)}">Copy</button></p>
            <p>${order.customer_phone ? `<a href="tel:${encodeURIComponent(order.customer_phone)}">${safe(order.customer_phone)}</a>` : "No phone number supplied"}</p>
          </section>
          <section class="order-box">
            <h4>${order.fulfillment_method === "shipping" ? "Shipping" : order.fulfillment_method === "pickup" ? "Local pickup" : "Digital delivery"}</h4>
            <p>${address ? `${safe(address)} <button class="copy-button" type="button" data-copy="${safe(supplierAddress)}">Copy supplier address</button>` : order.fulfillment_method === "digital" ? "Download delivered after verified payment." : "No shipping address required."}</p>
            <p>Subtotal ${money(order.subtotal_cents)} · Shipping ${money(order.shipping_cents)}</p>
          </section>
          <section class="order-box order-items">
            <h4>Purchased items</h4>
            ${order.order_items.map((item) => `
              <div class="order-item">
                ${item.image_url ? `<img src="${safe(item.image_url)}" alt="">` : "<span></span>"}
                <div><strong>${item.quantity}× ${safe(item.title)}</strong><small>SKU ${safe(item.sku)} · ${money(item.unit_price_cents)} each${item.fulfillment_mode === "dropship" ? ` · ${safe(item.delivery_min_business_days)}–${safe(item.delivery_max_business_days)} business days` : ""}</small></div>
                <strong>${money(item.unit_price_cents * item.quantity)}</strong>
                ${item.fulfillment_mode === "dropship" ? `
                  <div class="dropship-source">
                    <h5>AliExpress fulfillment · ${safe(item.supplier_status?.replaceAll("_", " ") || "awaiting purchase")}</h5>
                    <p><a href="${safe(item.supplier_product_url)}" target="_blank" rel="noopener">Open supplier listing ↗</a>
                      <button class="copy-button" type="button" data-copy="${safe(item.supplier_product_url)}">Copy URL</button>
                      ${item.supplier_product_id ? `<button class="copy-button" type="button" data-copy="${safe(item.supplier_product_id)}">Copy product ID</button>` : ""}
                      ${supplierAddress ? `<button class="copy-button" type="button" data-copy="${safe(supplierAddress)}">Copy customer address</button>` : ""}
                    </p>
                    <p>${item.supplier_variant ? `<strong>Variant:</strong> ${safe(item.supplier_variant)} · ` : ""}<strong>Ships from:</strong> ${safe(item.ships_from || "Supplier")} · <strong>Service:</strong> ${safe(item.shipping_service || "Supplier shipping")}${item.supplier_cost_cents == null ? "" : ` · <strong>Source cost:</strong> ${money(item.supplier_cost_cents)}`}</p>
                    ${item.supplier_notes ? `<p><strong>Private notes:</strong> ${safe(item.supplier_notes)}</p>` : ""}
                    <div class="dropship-source-grid">
                      <label class="field-label"><span>Supplier status</span><select data-supplier-status="${item.id}">
                        ${["awaiting_purchase","ordered","shipped","delivered","canceled"].map((value) => `<option value="${value}" ${item.supplier_status === value ? "selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("")}
                      </select></label>
                      <label class="field-label"><span>AliExpress order ID</span><input data-supplier-order="${item.id}" value="${safe(item.supplier_order_id || "")}" placeholder="Order ID"></label>
                      <label class="field-label"><span>Tracking number</span><input data-supplier-tracking="${item.id}" value="${safe(item.supplier_tracking_number || "")}" placeholder="Tracking number"></label>
                    </div>
                    <div class="admin-actions"><button type="button" data-save-dropship="${item.id}">Save supplier fulfillment</button></div>
                  </div>` : ""}
              </div>`).join("")}
          </section>
        </div>
        <div class="order-footer">
          <span class="field-help">${confirmedStatuses.has(order.status) ? "Verified sale" : order.status === "pending" ? "Checkout started; payment has not been verified." : `Order ${safe(order.status)}`}</span>
          <label class="field-label"><span>Update status</span><select data-status="${order.id}">
            ${[order.status, ...(transitions[order.status] || [])].map((nextStatus) => `<option>${nextStatus}</option>`).join("")}
          </select></label>
        </div>
      </article>`;
  }).join("") || "<p>No orders match this search.</p>";
}
async function loadOrders() {
  try {
    const data = await api("list_orders");
    orders = data.orders || [];
    updateSalesSummary();
    renderOrders();
  } catch (error) {
    $("#order-list").innerHTML = `<p class="form-error">${safe(error.message)}</p>`;
  }
}
$("#order-filter").onchange = renderOrders;
$("#order-search").oninput = renderOrders;
document.addEventListener("change", async (event) => {
  if (!event.target.dataset.status) return;
  try {
    await api("update_order_status", { order_id: event.target.dataset.status, status: event.target.value });
    loadOrders();
  } catch (error) {
    alert(error.message);
  }
});
document.addEventListener("click", async (event) => {
  const saveDropship = event.target.closest("[data-save-dropship]");
  if (saveDropship) {
    const itemId = saveDropship.dataset.saveDropship;
    saveDropship.disabled = true;
    try {
      await api("update_dropship_fulfillment", {
        order_item_id: itemId,
        supplier_status: document.querySelector(`[data-supplier-status="${itemId}"]`).value,
        supplier_order_id: document.querySelector(`[data-supplier-order="${itemId}"]`).value,
        supplier_tracking_number: document.querySelector(`[data-supplier-tracking="${itemId}"]`).value,
      });
      saveDropship.textContent = "Saved";
      setTimeout(loadOrders, 700);
    } catch (error) {
      alert(error.message);
      saveDropship.disabled = false;
    }
    return;
  }
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    const label = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = label; }, 1200);
  } catch {
    alert("Could not copy that information.");
  }
});

showKindFields();
updateSearchPreview();
guard();
