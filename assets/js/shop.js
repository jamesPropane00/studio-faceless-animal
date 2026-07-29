import { supabase, SUPABASE_READY } from "./supabase-client.js";
const $ = (s) => document.querySelector(s);
const money = (c) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
const safe = (v) => String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let products=[], cart=JSON.parse(localStorage.getItem("fas_shop_cart")||"[]");
const productById=(id)=>products.find(p=>p.id===id);
function save(){localStorage.setItem("fas_shop_cart",JSON.stringify(cart.map(({id,quantity})=>({id,quantity}))));renderCart()}
function image(p){return p.product_images?.sort((a,b)=>a.sort_order-b.sort_order)[0]?.public_url||""}
async function load(){
 if(!SUPABASE_READY){$("#shop-status").textContent="The shop is not connected yet.";return}
 await supabase.rpc("release_expired_shop_reservations");
 const {data,error}=await supabase.from("products").select("id,title,description,price_cents,quantity,sku,condition,category,shipping_price_cents,local_pickup,state,product_kind,preview_url,product_images(public_url,alt_text,sort_order)").eq("published",true).order("created_at",{ascending:false});
 if(error){$("#shop-status").textContent="The supply could not be loaded. Try again soon.";return}
 products=data||[];$("#shop-status").hidden=true;
 [...new Set(products.map(p=>p.category))].sort().forEach(c=>$("#category-filter").insertAdjacentHTML("beforeend",`<option>${safe(c)}</option>`));
 cart=cart.filter(i=>productById(i.id));save();renderProducts();
}
function renderProducts(){
 const q=$("#shop-search").value.toLowerCase(),cat=$("#category-filter").value;
 const list=products.filter(p=>(!q||`${p.title} ${p.description} ${p.sku}`.toLowerCase().includes(q))&&(!cat||p.category===cat));
 $("#product-grid").innerHTML=list.map(p=>{const reserved=p.state==="reserved",sold=p.state==="sold"||p.quantity<1,low=!sold&&!reserved&&p.quantity<=3;return `<article class="product-card">
 <div class="product-image" data-detail="${p.id}">${image(p)?`<img src="${safe(image(p))}" alt="${safe(p.title)}" loading="lazy">`:`<div class="no-image">FA</div>`}${reserved?`<span class="badge sold">Temporarily reserved</span>`:sold?`<span class="badge sold">Sold out</span>`:low?`<span class="badge low">Only ${p.quantity} left</span>`:""}</div>
 <div class="product-copy"><span class="product-meta">${safe(p.category)} · ${p.product_kind==="physical"?safe(p.condition):"Instant download"}</span><h3>${safe(p.title)}</h3><span class="price">${money(p.price_cents)}</span>
 <div class="card-actions"><button data-add="${p.id}" ${sold?"disabled":""}>Add to bag</button><button class="primary" data-buy="${p.id}" ${sold?"disabled":""}>Buy now</button></div></div></article>`}).join("")||"<p class='shop-status'>No pieces match that search.</p>";
}
function add(id,buy=false){const p=productById(id);if(!p||p.state==="sold"||p.state==="inactive"||p.quantity<1)return;const line=cart.find(i=>i.id===id);if(line)line.quantity=Math.min(line.quantity+1,p.quantity);else cart.push({id,quantity:1});save();openCart();if(buy)$("#checkout-form input[name=name]").focus()}
function renderCart(){
 cart=cart.filter(i=>productById(i.id));$("#cart-count").textContent=cart.reduce((n,i)=>n+i.quantity,0);
 $("#cart-items").innerHTML=cart.length?cart.map(i=>{const p=productById(i.id);return `<div class="cart-line">${image(p)?`<img src="${safe(image(p))}" alt="">`:"<span></span>"}<div><h3>${safe(p.title)}</h3><span class="price">${money(p.price_cents)}</span><div class="qty"><button data-qty="${p.id}:-1">−</button><span>${i.quantity}</span><button data-qty="${p.id}:1">+</button></div></div><button class="remove" data-remove="${p.id}">×</button></div>`}).join(""):"<p class='shop-status'>Your bag is empty.</p>";
 const hasPhysical=cart.some(i=>productById(i.id)?.product_kind==="physical");
 $("#fulfillment-options").hidden=!hasPhysical;
 const fulfill=hasPhysical?($('input[name="fulfillment"]:checked')?.value||"shipping"):"digital";
 $("#shipping-fields").hidden=fulfill!=="shipping";
 $("#shipping-fields").querySelectorAll("input").forEach(input=>input.required=fulfill==="shipping");
 const total=cart.reduce((n,i)=>{const p=productById(i.id);return n+(p.price_cents+(fulfill==="shipping"&&p.product_kind==="physical"?p.shipping_price_cents:0))*i.quantity},0);
 $("#cart-total").textContent=money(total);$(".checkout-button").disabled=!cart.length;
}
function openCart(){$("#cart-drawer").classList.add("open");$("#cart-drawer").setAttribute("aria-hidden","false");$("#drawer-shade").hidden=false}
function closeCart(){$("#cart-drawer").classList.remove("open");$("#cart-drawer").setAttribute("aria-hidden","true");$("#drawer-shade").hidden=true}
function detail(id){const p=productById(id),digital=p.product_kind!=="physical";$("#product-detail").innerHTML=`<div class="detail-grid"><div class="detail-gallery">${image(p)?`<img src="${safe(image(p))}" alt="${safe(p.title)}">`:""}</div><div class="detail-copy"><p class="eyebrow">${safe(p.category)} · ${digital?"Digital download":safe(p.condition)}</p><h2>${safe(p.title)}</h2><p class="price">${money(p.price_cents)}</p><p class="detail-description">${safe(p.description)}</p>${digital&&p.preview_url?`<p><a class="price" href="${safe(p.preview_url)}" target="_blank" rel="noopener">Preview →</a></p>`:""}<p class="product-meta">${digital?"Download released after verified payment":p.local_pickup?"Shipping or Providence pickup":"Ships to you"} · SKU ${safe(p.sku)}</p><div class="card-actions"><button data-add="${p.id}">Add to bag</button><button class="primary" data-buy="${p.id}">Buy now</button></div></div></div>`;$("#product-modal").hidden=false}
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
