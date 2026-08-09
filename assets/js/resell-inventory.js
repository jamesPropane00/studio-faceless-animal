const $ = (selector) => document.querySelector(selector);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(cents || 0) / 100);
let lots = [];

function image(lot) {
  return lot.images?.[0]?.public_url || '';
}

function budgetMatch(lot, value) {
  if (!value) return true;
  const total = lot.delivered_total_cents;
  if (value === '15000') return total < 15000;
  if (value === '50000') return total >= 15000 && total <= 50000;
  if (value === '100000') return total > 50000 && total <= 100000;
  return total > 100000;
}

function render() {
  const budget = $('#ri-budget').value;
  const tier = $('#ri-size').value;
  const sort = $('#ri-sort').value;
  const visible = lots.filter((lot) => budgetMatch(lot, budget) && (!tier || lot.lot_tier === tier));
  visible.sort((a, b) => sort === 'price-low' ? a.delivered_total_cents - b.delivered_total_cents
    : sort === 'unit-low' ? a.buyer_cost_per_unit_cents - b.buyer_cost_per_unit_cents
      : sort === 'largest' ? b.unit_count - a.unit_count : 0);
  $('#ri-status').hidden = visible.length > 0;
  $('#ri-status').textContent = lots.length ? 'No reseller lots match those filters.' : 'No reseller lots are published yet.';
  $('#ri-grid').innerHTML = visible.map((lot) => {
    const shipping = lot.shipping_price_cents ? money(lot.shipping_price_cents) : 'Included';
    const resources = (lot.included_resources || []).map((item) => `<span>${safe(item)}</span>`).join('');
    return `<article class="lot-card"><div class="lot-image">${image(lot) ? `<img src="${safe(image(lot))}" alt="${safe(lot.lot_name)}" loading="lazy">` : ''}<span class="lot-tier">${safe(lot.lot_tier)} · ${lot.unit_count.toLocaleString()} units</span></div><div class="lot-copy"><p class="ri-kicker">${safe(lot.supplier_label)}</p><h2>${safe(lot.lot_name)}</h2><p class="lot-summary">${safe(lot.opportunity_summary || lot.description)}</p><div class="lot-numbers"><div class="lot-number is-accent"><small>Your delivered cost / unit</small><strong>${money(lot.buyer_cost_per_unit_cents)}</strong></div><div class="lot-number"><small>Suggested individual retail</small><strong>${money(lot.suggested_retail_min_cents)}–${money(lot.suggested_retail_max_cents)}</strong></div><div class="lot-number"><small>Potential gross retail</small><strong>${money(lot.potential_gross_retail_min_cents)}–${money(lot.potential_gross_retail_max_cents)}</strong></div><div class="lot-number"><small>Break-even at low estimate</small><strong>${lot.break_even_units_at_min_price} units</strong></div></div><div class="lot-facts"><span>Warehouse: ${safe(lot.warehouse_country)}</span><span>Shipping: ${shipping} · ${safe(lot.delivery_min_business_days)}–${safe(lot.delivery_max_business_days)} business days estimated</span>${lot.resale_channels?.length ? `<span>Suggested channels: ${safe(lot.resale_channels.join(', '))}</span>` : ''}</div>${resources ? `<div class="lot-resources">${resources}</div>` : ''}<div class="lot-buy"><div><small>Wholesale lot</small><strong>${money(lot.lot_price_cents)}</strong></div><a href="/market?buy=${encodeURIComponent(lot.slug)}">Buy lot →</a></div></div></article>`;
  }).join('');
}

async function load() {
  try {
    const response = await fetch('/api/market/resell-inventory', { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Reseller inventory could not be loaded.');
    lots = data.lots || [];
    render();
  } catch (error) {
    $('#ri-status').hidden = false;
    $('#ri-status').textContent = error.message;
  }
}

['#ri-budget', '#ri-size', '#ri-sort'].forEach((selector) => $(selector).addEventListener('change', render));
load();
