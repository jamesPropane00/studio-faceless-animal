import { supabase, SUPABASE_READY } from "./supabase-client.js";
const $ = (s) => document.querySelector(s);
const money = (c) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
const safe = (v) => String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let products=[], cart=JSON.parse(localStorage.getItem("fas_shop_cart")||"[]");
const productById=(id)=>products.find(p=>p.id===id);
const productUrl=(product)=>product.slug
 ? `/product/${encodeURIComponent(product.slug)}`
 : `/store?productId=${encodeURIComponent(product.id)}`;
const springUrl=(product)=>{
 try{const url=new URL(product.external_purchase_url||"");return url.protocol==="https:"&&/^[a-z0-9-]+\.creator-spring\.com$/i.test(url.hostname)&&/^\/listing\/[a-z0-9-]+\/?$/i.test(url.pathname)?url.toString():""}catch{return""}
};
const fanvueUrl=(product)=>{
 try{const url=new URL(product.external_purchase_url||"");return url.protocol==="https:"&&/^(www\.)?fanvue\.com$/i.test(url.hostname)&&url.pathname!=="/"?url.toString():""}catch{return""}
};
const externalUrl=(product)=>product.fulfillment_provider==="spring"
 ? springUrl(product)
 : product.fulfillment_provider==="fanvue" ? fanvueUrl(product) : "";
function save(){localStorage.setItem("fas_shop_cart",JSON.stringify(cart.map(({id,quantity})=>({id,quantity}))));renderCart()}
function image(p){return p.product_images?.sort((a,b)=>a.sort_order-b.sort_order)[0]?.public_url||""}
async function load(){
 if(!SUPABASE_READY){$("#shop-status").textContent="The shop is not connected yet.";return}
 await supabase.rpc("release_expired_shop_reservations");
 let result=await supabase.from("products").select("id,slug,title,description,seo_title,meta_description,search_keywords,brand,gtin,mpn,price_cents,quantity,sku,condition,category,shipping_price_cents,local_pickup,state,product_kind,preview_url,fulfillment_provider,external_purchase_url,fulfillment_mode,ships_from,delivery_min_business_days,delivery_max_business_days,shipping_service,product_images(public_url,alt_text,sort_order)").eq("published",true).order("created_at",{ascending:false});
 if(result.error)result=await supabase.from("products").select("id,slug,title,description,seo_title,meta_description,search_keywords,brand,gtin,mpn,price_cents,quantity,sku,condition,category,shipping_price_cents,local_pickup,state,product_kind,preview_url,fulfillment_provider,external_purchase_url,product_images(public_url,alt_text,sort_order)").eq("published",true).order("created_at",{ascending:false});
 if(result.error)result=await supabase.from("products").select("id,title,description,price_cents,quantity,sku,condition,category,shipping_price_cents,local_pickup,state,product_kind,preview_url,product_images(public_url,alt_text,sort_order)").eq("published",true).order("created_at",{ascending:false});
 const {data,error}=result;
 if(error){$("#shop-status").textContent="The supply could not be loaded. Try again soon.";return}
 products=data||[];$("#shop-status").hidden=true;
 [...new Set(products.map(p=>p.category))].sort().forEach(c=>$("#category-filter").insertAdjacentHTML("beforeend",`<option>${safe(c)}</option>`));
 cart=cart.filter(i=>(productById(i.id)?.fulfillment_provider||"internal")==="internal");save();renderProducts();
 const requestedSlug=new URLSearchParams(location.search).get("product");
 const requestedId=new URLSearchParams(location.search).get("productId");
 const requestedProduct=products.find(product=>product.slug===requestedSlug||product.id===requestedId);
 if(requestedProduct)detail(requestedProduct.id);
}
function renderProducts(){
 const q=$("#shop-search").value.toLowerCase(),cat=$("#category-filter").value;
 const list=products.filter(p=>(!q||`${p.title} ${p.description} ${p.sku} ${p.brand||""} ${p.category} ${(p.search_keywords||[]).join(" ")}`.toLowerCase().includes(q))&&(!cat||p.category===cat));
 $("#product-grid").innerHTML=list.map(p=>{const external=externalUrl(p),spring=p.fulfillment_provider==="spring"&&external,fanvue=p.fulfillment_provider==="fanvue"&&external,reserved=!external&&p.state==="reserved",sold=!external&&(p.state==="sold"||p.quantity<1),low=!external&&!sold&&!reserved&&p.quantity<=3;return `<article class="product-card">
 <a class="product-image" href="${productUrl(p)}">${image(p)?`<img src="${safe(image(p))}" alt="${safe(p.title)}" loading="lazy">`:`<div class="no-image">FA</div>`}${fanvue?`<span class="badge">18+ · View on Fanvue</span>`:spring?`<span class="badge">Made to order by Spring</span>`:reserved?`<span class="badge sold">Temporarily reserved</span>`:sold?`<span class="badge sold">Sold out</span>`:low?`<span class="badge low">Only ${p.quantity} left</span>`:""}</a>
 <div class="product-copy"><span class="product-meta">${safe(p.category)} · ${fanvue?"Fanvue exclusive":spring?"Spring fulfillment":p.fulfillment_mode==="dropship"?`Ships from ${safe(p.ships_from)}`:p.product_kind==="physical"?safe(p.condition):"Instant download"}</span><h3><a href="${productUrl(p)}">${safe(p.title)}</a></h3><span class="price">${spring?"From ":""}${fanvue&&p.price_cents<1?"Exclusive access":money(p.price_cents)}</span>${p.fulfillment_mode==="dropship"?`<small class="delivery-estimate">Estimated delivery: ${safe(p.delivery_min_business_days)}–${safe(p.delivery_max_business_days)} business days</small>`:""}
 ${external?`<div class="card-actions spring-action"><a class="primary" href="${safe(external)}" target="_blank" rel="noopener">${fanvue?"View on Fanvue (18+) →":"Choose options on Spring →"}</a></div>`:`<div class="card-actions"><button data-add="${p.id}" ${sold?"disabled":""}>Add to bag</button><button class="primary" data-buy="${p.id}" ${sold?"disabled":""}>Buy now</button></div>`}</div></article>`}).join("")||"<p class='shop-status'>No pieces match that search.</p>";
}
function add(id,buy=false){const p=productById(id);if(!p||(p.fulfillment_provider||"internal")!=="internal"||p.state==="sold"||p.state==="inactive"||p.quantity<1)return;const line=cart.find(i=>i.id===id);if(line)line.quantity=Math.min(line.quantity+1,p.quantity);else cart.push({id,quantity:1});save();openCart();if(buy)$("#checkout-form input[name=name]").focus()}
function renderCart(){
 cart=cart.filter(i=>productById(i.id));$("#cart-count").textContent=cart.reduce((n,i)=>n+i.quantity,0);
 $("#cart-items").innerHTML=cart.length?cart.map(i=>{const p=productById(i.id);return `<div class="cart-line">${image(p)?`<img src="${safe(image(p))}" alt="">`:"<span></span>"}<div><h3>${safe(p.title)}</h3><span class="price">${money(p.price_cents)}</span>${p.fulfillment_mode==="dropship"?`<small class="delivery-estimate">Ships from ${safe(p.ships_from)} · ${safe(p.delivery_min_business_days)}–${safe(p.delivery_max_business_days)} business days. Timing can vary by destination and customs.</small>`:""}<div class="qty"><button data-qty="${p.id}:-1">−</button><span>${i.quantity}</span><button data-qty="${p.id}:1">+</button></div></div><button class="remove" data-remove="${p.id}">×</button></div>`}).join(""):"<p class='shop-status'>Your bag is empty.</p>";
 const hasPhysical=cart.some(i=>productById(i.id)?.product_kind==="physical");
 const hasDropship=cart.some(i=>productById(i.id)?.fulfillment_mode==="dropship");
 const pickupRadio=$('input[name="fulfillment"][value="pickup"]');
 pickupRadio.disabled=hasDropship;
 pickupRadio.closest("label").title=hasDropship?"Supplier-shipped products are not available for local pickup.":"";
 if(hasDropship&&pickupRadio.checked)$('input[name="fulfillment"][value="shipping"]').checked=true;
 $("#fulfillment-options").hidden=!hasPhysical;
 const fulfill=hasPhysical?($('input[name="fulfillment"]:checked')?.value||"shipping"):"digital";
 $("#shipping-fields").hidden=fulfill!=="shipping";
 $("#shipping-fields").querySelectorAll("input").forEach(input=>input.required=fulfill==="shipping");
 const total=cart.reduce((n,i)=>{const p=productById(i.id);return n+(p.price_cents+(fulfill==="shipping"&&p.product_kind==="physical"?p.shipping_price_cents:0))*i.quantity},0);
 $("#cart-total").textContent=money(total);$(".checkout-button").disabled=!cart.length;
}
function openCart(){$("#cart-drawer").classList.add("open");$("#cart-drawer").setAttribute("aria-hidden","false");$("#drawer-shade").hidden=false}
function closeCart(){$("#cart-drawer").classList.remove("open");$("#cart-drawer").setAttribute("aria-hidden","true");$("#drawer-shade").hidden=true}
function detail(id){const p=productById(id),external=externalUrl(p),spring=p.fulfillment_provider==="spring"&&external,fanvue=p.fulfillment_provider==="fanvue"&&external,digital=!external&&p.product_kind!=="physical",dropship=p.fulfillment_mode==="dropship";$("#product-detail").innerHTML=`<div class="detail-grid"><div class="detail-gallery">${image(p)?`<img src="${safe(image(p))}" alt="${safe(p.title)}">`:""}</div><div class="detail-copy"><p class="eyebrow">${safe(p.category)} · ${fanvue?"18+ on Fanvue":spring?"Made to order by Spring":dropship?`Ships from ${safe(p.ships_from)}`:digital?"Digital download":safe(p.condition)}</p><h2>${safe(p.title)}</h2><p class="price">${spring?"From ":""}${fanvue&&p.price_cents<1?"Exclusive access":money(p.price_cents)}</p><p class="detail-description">${safe(p.description)}</p>${dropship?`<div class="shipping-disclosure"><strong>Estimated delivery: ${safe(p.delivery_min_business_days)}–${safe(p.delivery_max_business_days)} business days</strong><span>${safe(p.shipping_service||"Supplier shipping")} from ${safe(p.ships_from)}. Delivery may vary by destination, carrier processing and customs.</span></div>`:""}${digital&&p.preview_url?`<p><a class="price" href="${safe(p.preview_url)}" target="_blank" rel="noopener">Preview →</a></p>`:""}<p class="product-meta">${fanvue?"Fanvue handles sign-in, age controls, payment, and access":spring?"Spring handles payment, production, shipping, and support":dropship?"Ships directly from a third-party fulfillment supplier":digital?"Download released after verified payment":p.local_pickup?"Shipping or Providence pickup":"Ships to you"} · SKU ${safe(p.sku)}</p><p><a class="product-page-link" href="${productUrl(p)}">Open permanent product page →</a></p>${external?`<div class="card-actions spring-action"><a class="primary" href="${safe(external)}" target="_blank" rel="noopener">${fanvue?"View and unlock on Fanvue (18+) →":"Choose options on Spring →"}</a></div>`:`<div class="card-actions"><button data-add="${p.id}">Add to bag</button><button class="primary" data-buy="${p.id}">Buy now</button></div>`}</div></div>`;$("#product-modal").hidden=false}
document.addEventListener("click",e=>{const t=e.target.closest("[data-add],[data-buy],[data-detail],[data-close-modal],[data-remove],[data-qty]");if(!t)return;if(t.dataset.add)add(t.dataset.add);if(t.dataset.buy)add(t.dataset.buy,true);if(t.dataset.detail)detail(t.dataset.detail);if("closeModal"in t.dataset)$("#product-modal").hidden=true;if(t.dataset.remove){cart=cart.filter(i=>i.id!==t.dataset.remove);save()}if(t.dataset.qty){const[id,d]=t.dataset.qty.split(":");const i=cart.find(x=>x.id===id),p=productById(id);i.quantity=Math.max(0,Math.min(p.quantity,i.quantity+Number(d)));if(!i.quantity)cart=cart.filter(x=>x!==i);save()}});
$("#cart-open").onclick=openCart;$("#cart-close").onclick=closeCart;$("#drawer-shade").onclick=closeCart;$("#shop-search").oninput=renderProducts;$("#category-filter").onchange=renderProducts;
document.querySelectorAll('input[name="fulfillment"]').forEach(r=>r.onchange=()=>{const ship=r.value==="shipping"&&r.checked;$("#shipping-fields").hidden=!ship;$("#shipping-fields").querySelectorAll("input").forEach(i=>i.required=ship);renderCart()});
$("#checkout-form").onsubmit=async(e)=>{e.preventDefault();const btn=$(".checkout-button"),err=$("#checkout-error"),fd=new FormData(e.currentTarget),hasPhysical=cart.some(i=>productById(i.id)?.product_kind==="physical"),fulfillment=hasPhysical?$('input[name="fulfillment"]:checked').value:"digital";err.textContent="";btn.disabled=true;btn.textContent="Reserving your order…";
 try{if(fulfillment==="pickup"&&cart.some(i=>productById(i.id).product_kind==="physical"&&!productById(i.id).local_pickup))throw new Error("One or more physical items are not available for pickup.");
 const {data,error}=await supabase.functions.invoke("clever-function",{
   body:{
     items:cart.map(i=>({product_id:i.id,quantity:i.quantity})),
     fulfillment,
     customer:{
       name:fd.get("name"),email:fd.get("email"),phone:fd.get("phone"),
       shipping_address:{line1:fd.get("line1"),line2:fd.get("line2"),city:fd.get("city"),state:fd.get("state"),postal_code:fd.get("postal_code"),country:"US"}
     }
   }
 });
 if(error)throw new Error(data?.error||error.message);if(!data?.url)throw new Error(data?.error||"Checkout could not start.");location.assign(data.url)}
 catch(ex){err.textContent=ex.message;btn.disabled=false;btn.textContent="Secure checkout →"}};
load();renderCart();
