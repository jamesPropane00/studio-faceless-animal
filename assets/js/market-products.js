import { supabase, SUPABASE_READY } from './supabase-client.js';

const grid = document.getElementById('market-listings');
const search = document.getElementById('market-search');
const category = document.getElementById('market-category');
const count = document.getElementById('market-listing-count');
let products = [];

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);

function productImage(product) {
  const images = Array.isArray(product.product_images) ? [...product.product_images] : [];
  images.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return images[0]?.public_url || '';
}

function productUrl(product) {
  return product.slug ? `/product/${encodeURIComponent(product.slug)}` : `/store?productId=${encodeURIComponent(product.id)}`;
}

function statusBadge(product) {
  if (product.fulfillment_provider === 'spring') return '<span class="listing-badge">Made to order</span>';
  if (product.fulfillment_provider === 'fanvue') return '<span class="listing-badge">Exclusive</span>';
  if (product.state === 'reserved') return '<span class="listing-badge is-low">Reserved</span>';
  return '';
}

function render() {
  const term = search.value.trim().toLowerCase();
  const selectedCategory = category.value;
  const filtered = products.filter((product) => {
    const haystack = `${product.title || ''} ${product.description || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase();
    return (!term || haystack.includes(term)) && (!selectedCategory || product.category === selectedCategory);
  });

  count.textContent = `${filtered.length} ${filtered.length === 1 ? 'listing' : 'listings'}`;
  if (!filtered.length) {
    grid.innerHTML = '<p class="listing-status">No listings match that search. <a href="/store">Browse the full Underground Vault →</a></p>';
    return;
  }

  grid.innerHTML = filtered.map((product) => {
    const image = productImage(product);
    const condition = product.product_kind === 'physical' ? (product.condition || 'Available') : 'Digital';
    const price = product.fulfillment_provider === 'fanvue' && Number(product.price_cents) < 1 ? 'Exclusive access' : money(product.price_cents);
    return `<a class="listing-card" href="${productUrl(product)}">
      <div class="listing-image">${image ? `<img src="${safe(image)}" alt="${safe(product.title)}" loading="lazy" />` : '<div class="no-image">FA</div>'}${statusBadge(product)}</div>
      <div class="listing-copy">
        <span class="listing-meta">${safe(product.category || 'Marketplace')} · ${safe(condition)}</span>
        <h3>${safe(product.title)}</h3>
        <div class="listing-bottom"><span class="listing-price">${safe(price)}</span><span class="listing-view">View listing →</span></div>
      </div>
    </a>`;
  }).join('');
}

async function loadProducts() {
  if (!SUPABASE_READY) {
    grid.innerHTML = '<p class="listing-status">The live catalog is reconnecting. <a href="/store">Open the Underground Vault →</a></p>';
    count.textContent = 'Vault inventory';
    return;
  }

  const { data, error } = await supabase
    .from('products')
    .select('id,slug,title,description,brand,price_cents,quantity,condition,category,state,product_kind,fulfillment_provider,product_images(public_url,alt_text,sort_order)')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = '<p class="listing-status">The live listings could not be loaded right now. <a href="/store">Continue to the Underground Vault →</a></p>';
    count.textContent = 'Vault inventory';
    return;
  }

  products = data || [];
  [...new Set(products.map((product) => product.category).filter(Boolean))].sort().forEach((name) => category.insertAdjacentHTML('beforeend', `<option value="${safe(name)}">${safe(name)}</option>`));
  render();
}

search.addEventListener('input', render);
category.addEventListener('change', render);
loadProducts();
