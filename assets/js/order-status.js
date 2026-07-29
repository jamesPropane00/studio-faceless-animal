import { supabase } from "./supabase-client.js";
const params = new URLSearchParams(location.search);
const order = params.get("order");
const token = params.get("token");
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
let tries = 0;

async function loadDownloads() {
  const { data, error } = await supabase.functions.invoke("hyper-handler", {
    body: { order_id: order, token },
  });
  if (error || !data?.downloads?.length) return "";
  return `<section class="download-panel"><p class="eyebrow">Your downloads</p>${data.downloads.map((item) =>
    `<a class="checkout-button download-link" href="${safe(item.url)}">${safe(item.title)} — download ${safe(item.filename)} →</a>`
  ).join("")}<p class="secure-note">Links expire after one hour. Reload this verified order page to create fresh links.</p></section>`;
}

async function check() {
  if (!order || !token) {
    document.querySelector("#result-title").textContent = "We couldn’t verify this order";
    document.querySelector("#order-result").textContent = "Use the exact link returned after checkout.";
    return;
  }
  const { data, error } = await supabase.rpc("get_order_status", { p_order: order, p_token: token });
  const result = data?.[0];
  if (error || !result) {
    document.querySelector("#result-title").textContent = "We couldn’t verify this order";
    document.querySelector("#order-result").textContent = "Use the exact link from checkout or contact the studio.";
    return;
  }
  const paid = ["paid", "shipped", "completed", "refunded"].includes(result.status);
  const fulfillment = result.fulfillment_method === "pickup" ? "Local pickup"
    : result.fulfillment_method === "digital" ? "Digital delivery" : "Shipping";
  document.querySelector("#result-title").textContent = paid
    ? `Payment verified · ${result.order_number}` : `Payment status: ${result.status}`;
  document.querySelector("#order-result").innerHTML = `
    <p>${result.items.map((item) => `${item.quantity}× ${safe(item.title)} — ${money(item.unit_price_cents * item.quantity)}`).join("<br>")}</p>
    <p><strong>${money(result.total_cents)}</strong> · ${fulfillment}</p>
    <p>Status: <strong>${result.status}</strong></p>
    ${paid && result.status !== "refunded" ? await loadDownloads() : ""}`;
  if (!paid && tries++ < 8) setTimeout(check, 2500);
  if (paid) localStorage.removeItem("fas_shop_cart");
}
check();
