import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const shopOrigin = Deno.env.get("SHOP_ORIGIN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": shopOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowedUsers = new Set(["jdot00", "jamespropane00"]);
const allowedKinds = new Set(["physical", "music_download", "file_download"]);
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const cleanUsername = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
const cleanFilename = (value: unknown) =>
  String(value ?? "file").replace(/[^a-z0-9._-]/gi, "-").slice(0, 160);
const cleanSlug = (value: unknown) =>
  String(value ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
const cleanOptional = (value: unknown, limit = 255) => {
  const text = String(value ?? "").trim().slice(0, limit);
  return text || null;
};
const exactCJMapping = (variantId: unknown, sku: unknown) => {
  const cleanVariantId = String(variantId ?? "").trim();
  const cleanSku = String(sku ?? "").trim();
  return Boolean(
    cleanVariantId && cleanSku &&
    !/^PENDING(?:-|$)/i.test(cleanVariantId) &&
    !/^PENDING(?:-|$)/i.test(cleanSku)
  );
};
const excerpt = (value: unknown, limit = 155) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
};
const automaticKeywords = (...values: unknown[]) => {
  const stopWords = new Set(["about", "after", "also", "and", "are", "been", "for", "from", "have", "into", "that", "the", "their", "this", "with", "your"]);
  const words = values.join(" ").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [...new Set(words.filter((word) => word.length > 2 && !stopWords.has(word)))].slice(0, 24);
};
const springUrl = (value: unknown) => {
  try {
    const url = new URL(String(value ?? "").trim());
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.creator-spring\.com$/i.test(url.hostname) ||
      !/^\/listing\/[a-z0-9-]+\/?$/i.test(url.pathname)
    ) return null;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};
const fanvueUrl = (value: unknown) => {
  try {
    const url = new URL(String(value ?? "").trim());
    if (
      url.protocol !== "https:" ||
      !/^(www\.)?fanvue\.com$/i.test(url.hostname) ||
      url.pathname === "/"
    ) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};
const aliexpressUrl = (value: unknown) => {
  try {
    const url = new URL(String(value ?? "").trim());
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !(host === "aliexpress.com" || host.endsWith(".aliexpress.com") ||
        host === "aliexpress.us" || host.endsWith(".aliexpress.us"))
    ) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};
const cjUrl = (value: unknown) => {
  try {
    const url = new URL(String(value ?? "").trim());
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !(host === "cjdropshipping.com" || host.endsWith(".cjdropshipping.com"))
    ) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};
const stripHtml = (value: unknown) => String(value ?? "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
const cjProductId = (url: string | null, explicit: unknown) => {
  const direct = String(explicit ?? "").trim();
  if (/^[a-z0-9-]{8,80}$/i.test(direct)) return direct;
  if (!url) return null;
  const queryId = new URL(url).searchParams.get("pid") ?? new URL(url).searchParams.get("productId");
  if (queryId && /^[a-z0-9-]{8,80}$/i.test(queryId)) return queryId;
  const matches = url.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|\d{12,}/gi);
  return matches?.at(-1) ?? null;
};
const getCJAccessToken = async () => {
  const stored = Deno.env.get("CJ_ACCESS_TOKEN")?.trim();
  if (stored) return stored;
  const apiKey = Deno.env.get("CJ_API_KEY")?.trim();
  if (!apiKey) throw new Error("CJ is not connected yet. Add CJ_API_KEY in Supabase Edge Function secrets.");
  const response = await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result?.result || !result?.data?.accessToken) {
    throw new Error(result?.message || "CJ rejected the API key.");
  }
  return String(result.data.accessToken);
};
const decodeEscaped = (value: string) => {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
};
const decodeHtml = (value: string) => value
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const metaContent = (html: string, name: string) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(html.match(new RegExp(`<meta[^>]+(?:property|name)="${escapedName}"[^>]+content="([^"]*)"`, "i"))?.[1] ?? "");
};
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const username = cleanUsername(body.username);
    const token = String(body.token ?? "");
    if (!allowedUsers.has(username) || !token) return reply({ error: "Access denied" }, 403);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const { data: platformSession, error: sessionError } = await admin.from("shop_platform_sessions")
      .select("id").eq("username", username).eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (sessionError || !platformSession) return reply({ error: "Your admin session expired. Sign in again." }, 401);
    await admin.from("shop_platform_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", platformSession.id);

    switch (String(body.action ?? "")) {
      case "verify":
        return reply({ ok: true, username });

      case "list_products": {
        const { data, error } = await admin.from("products")
          .select("*,product_images(*),product_sources(*),marketplace_listings(*)").order("created_at", { ascending: false });
        if (error) throw error;
        return reply({ products: data ?? [] });
      }

      case "list_orders": {
        let query = admin.from("orders").select(`
          id,order_number,status,fulfillment_method,
          customer_email,customer_name,customer_phone,shipping_address,
          subtotal_cents,shipping_cents,total_cents,currency,
          created_at,updated_at,paid_at,
          order_items(
            id,title,sku,unit_price_cents,quantity,shipping_price_cents,image_url,product_kind,
            fulfillment_mode,ships_from,delivery_min_business_days,delivery_max_business_days,shipping_service,
            supplier_name,supplier_product_url,supplier_product_id,supplier_variant,supplier_cost_cents,supplier_notes,
            supplier_order_id,supplier_tracking_number,supplier_status
          )
        `).order("created_at", { ascending: false });
        if (body.status) query = query.eq("status", String(body.status));
        const { data, error } = await query;
        if (error) throw error;
        return reply({ orders: data ?? [] });
      }

      case "create_upload_url": {
        const bucket = String(body.bucket);
        if (!["product-images", "product-downloads"].includes(bucket)) return reply({ error: "Invalid upload bucket" }, 400);
        const productId = String(body.product_id ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(productId)) return reply({ error: "Invalid product ID" }, 400);
        const size = Number(body.size ?? 0);
        const max = bucket === "product-images" ? 10 * 1024 * 1024 : 512 * 1024 * 1024;
        if (!Number.isFinite(size) || size < 1 || size > max) return reply({ error: "File exceeds the upload limit" }, 400);
        const path = `${productId}/${crypto.randomUUID()}-${cleanFilename(body.filename)}`;
        const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
        if (error) throw error;
        return reply({ path, token: data.token });
      }

      case "import_cj_product": {
        const sourceUrl = cjUrl(body.url);
        const productId = cjProductId(sourceUrl, body.product_id);
        if (!sourceUrl && !productId) {
          return reply({ error: "Paste a valid cjdropshipping.com product URL or CJ product ID." }, 400);
        }
        if (!productId) {
          return reply({ error: "CJ's URL did not contain a product ID. Copy the PID from CJ into Supplier product ID." }, 400);
        }
        const accessToken = await getCJAccessToken();
        const endpoint = new URL("https://developers.cjdropshipping.com/api2.0/v1/product/query");
        endpoint.searchParams.set("pid", productId);
        const response = await fetch(endpoint, {
          headers: { "CJ-Access-Token": accessToken },
          signal: AbortSignal.timeout(20000),
        });
        const result = await response.json();
        if (!response.ok || !result?.result || !result?.data) {
          return reply({ error: result?.message || "CJ could not find that product." }, 422);
        }
        const item = result.data;
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const firstVariant = variants[0] ?? {};
        const importedVariants = variants.map((variant: Record<string, unknown>) => {
          const locations = Array.isArray(variant.inventories) ? variant.inventories : [];
          const variantInventory = locations.reduce((sum: number, location: Record<string, unknown>) =>
            sum + Math.max(0, Number(location.totalInventory) || 0), 0);
          const variantCost = Number(variant.variantSellPrice ?? item.sellPrice);
          const variantSuggestedText = String(variant.variantSugSellPrice ?? item.suggestSellPrice ?? "");
          const variantSuggestedValues = variantSuggestedText.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
          return {
            id: cleanOptional(variant.vid, 160),
            name: cleanOptional(variant.variantNameEn ?? variant.variantKey, 240),
            sku: cleanOptional(variant.variantSku ?? variant.variantKey, 160),
            cost_cents: Number.isFinite(variantCost) && variantCost >= 0 ? Math.round(variantCost * 100) : null,
            suggested_price_cents: variantSuggestedValues.length ? Math.round(Math.max(...variantSuggestedValues) * 100) : null,
            quantity: Math.max(0, Math.min(999999, Math.floor(variantInventory))),
            weight_grams: Math.round(Number(variant.variantWeight ?? item.packingWeight ?? item.productWeight) || 0) || null,
          };
        }).filter((variant: Record<string, unknown>) => variant.id && variant.sku);
        const inventory = variants.reduce((total: number, variant: Record<string, unknown>) => {
          const locations = Array.isArray(variant.inventories) ? variant.inventories : [];
          return total + locations.reduce((sum: number, location: Record<string, unknown>) =>
            sum + Math.max(0, Number(location.totalInventory) || 0), 0);
        }, 0);
        const suggestedText = String(firstVariant.variantSugSellPrice ?? item.suggestSellPrice ?? "");
        const suggestedValues = suggestedText.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
        const suggestedPrice = suggestedValues.length ? Math.max(...suggestedValues) : null;
        const cost = Number(firstVariant.variantSellPrice ?? item.sellPrice);
        const images = [...new Set([item.bigImage, ...(Array.isArray(item.productImageSet) ? item.productImageSet : [])])]
          .filter((url): url is string => typeof url === "string" && /^https:\/\//i.test(url)).slice(0, 12);
        return reply({
          product: {
            title: cleanOptional(item.productNameEn, 200) ?? "CJ product",
            description: stripHtml(item.description).slice(0, 8000),
            category: cleanOptional(item.categoryName, 160) ?? "CJ merchandise",
            product_id: String(item.pid ?? productId),
            sku: cleanOptional(firstVariant.variantSku ?? item.productSku, 160),
            variant_id: cleanOptional(firstVariant.vid, 160),
            variant_name: cleanOptional(firstVariant.variantNameEn ?? firstVariant.variantKey, 240),
            cost_cents: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 100) : null,
            suggested_price_cents: suggestedPrice !== null ? Math.round(suggestedPrice * 100) : null,
            quantity: Math.max(0, Math.min(999999, Math.floor(inventory))),
            weight_grams: Math.round(Number(firstVariant.variantWeight ?? item.packingWeight ?? item.productWeight) || 0) || null,
            images,
            variants_count: variants.length,
            variants: importedVariants,
          },
        });
      }

      case "import_spring_product": {
        const url = springUrl(body.url);
        if (!url) return reply({ error: "Paste a valid creator-spring.com product listing URL." }, 400);
        const response = await fetch(url, {
          headers: { "User-Agent": "FacelessAnimalStoreImporter/1.0" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) return reply({ error: "Spring could not load that listing." }, 422);
        const html = (await response.text()).slice(0, 2_000_000);
        const start = html.indexOf('\\"storeListing\\":');
        const listing = start >= 0 ? html.slice(start, start + 300_000) : "";
        const field = (name: string, useLast = false) => {
          const prefix = `\\"${name}\\":\\"`;
          const valueStart = useLast ? listing.lastIndexOf(prefix) : listing.indexOf(prefix);
          if (valueStart < 0) return "";
          const contentStart = valueStart + prefix.length;
          const valueEnd = listing.indexOf('\\"', contentStart);
          return valueEnd < 0 ? "" : decodeEscaped(listing.slice(contentStart, valueEnd));
        };
        const metaTitle = metaContent(html, "og:title").replace(/^.*?\s+-\s+/, "");
        const title = field("title") || metaTitle;
        const description = field("description", true) || field("description") || metaContent(html, "og:description");
        const imageUrl = field("full") || metaContent(html, "og:image");
        const priceText = field("price");
        const productType = field("productType");
        const listingId = listing.match(/\\"listingId\\":(\d+)/)?.[1] ?? "";
        const priceCents = Math.round(Number(priceText) * 100);
        if (!title || !imageUrl || !Number.isInteger(priceCents)) {
          return reply({ error: "That Spring listing did not expose enough product information to import." }, 422);
        }
        return reply({
          product: {
            title, description, image_url: imageUrl, price_cents: priceCents,
            category: productType || "Spring merchandise",
            external_purchase_url: url,
            external_listing_id: listingId,
          },
        });
      }

      case "save_product": {
        const input = body.product ?? {};
        const kind = String(input.product_kind ?? "");
        if (!allowedKinds.has(kind)) return reply({ error: "Invalid product type" }, 400);
        const provider = String(input.fulfillment_provider ?? "internal");
        if (!["internal", "spring", "fanvue"].includes(provider)) return reply({ error: "Invalid fulfillment provider" }, 400);
        const isSpring = provider === "spring";
        const isFanvue = provider === "fanvue";
        const isExternal = isSpring || isFanvue;
        const fulfillmentMode = String(input.fulfillment_mode ?? "stocked");
        if (!["stocked", "dropship"].includes(fulfillmentMode)) {
          return reply({ error: "Invalid fulfillment mode" }, 400);
        }
        const isDropship = fulfillmentMode === "dropship";
        if (isDropship && (provider !== "internal" || kind !== "physical")) {
          return reply({ error: "Dropship listings must be physical products sold through this store." }, 400);
        }
        const purchaseUrl = isSpring
          ? springUrl(input.external_purchase_url)
          : isFanvue ? fanvueUrl(input.external_purchase_url) : null;
        if (isSpring && !purchaseUrl) return reply({ error: "A valid Spring listing URL is required." }, 400);
        if (isFanvue && !purchaseUrl) return reply({ error: "A valid fanvue.com profile or post URL is required." }, 400);
        if (isFanvue && !Boolean(input.preview_is_safe)) {
          return reply({ error: "Confirm that the promotional image and description are safe for a general audience." }, 400);
        }
        const id = String(input.id ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ error: "Invalid product ID" }, 400);
        const title = String(input.title ?? "").trim();
        const description = String(input.description ?? "").trim();
        const price = Number(input.price_cents);
        const quantity = Number(input.quantity);
        if (!title || !description || !Number.isInteger(price) || price < 0 || !Number.isInteger(quantity) || quantity < 0) {
          return reply({ error: "Title, description, price and quantity are required" }, 400);
        }
        const isDigital = kind !== "physical";
        const category = String(input.category ?? "Other").trim() || "Other";
        const condition = isDigital ? "Digital" : (String(input.condition ?? "New").trim() || "New");
        const { data: existing, error: existingError } = await admin.from("products")
          .select("slug,sku,gtin,mpn,google_product_category,ebay_category_id,facebook_category,marketplace_ready,fulfillment_provider,external_purchase_url,external_listing_id")
          .eq("id", id).maybeSingle();
        if (existingError) throw existingError;
        const sku = String(input.sku ?? "").trim() || existing?.sku || `FA-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
        let slug = existing?.slug || cleanSlug(title) || `product-${id.slice(0, 8)}`;
        if (!existing) {
          const { data: slugOwner, error: slugError } = await admin.from("products")
            .select("id").eq("slug", slug).maybeSingle();
          if (slugError) throw slugError;
          if (slugOwner) slug = `${slug}-${id.slice(0, 8)}`;
        }
        const { data: activeReservations, error: reservationError } = await admin.from("inventory_reservations")
          .select("quantity")
          .eq("product_id", id).eq("status", "active").gt("expires_at", new Date().toISOString());
        if (reservationError) throw reservationError;
        const reservedQuantity = (activeReservations ?? [])
          .reduce((total: number, reservation: { quantity: number }) => total + reservation.quantity, 0);
        const state = isExternal ? "available" : (quantity <= 0 ? "sold" : (quantity - reservedQuantity <= 0 ? "reserved" : "available"));
        const rawSeoTitle = `${title} | Faceless Supply`;
        const seoTitle = rawSeoTitle.length <= 70 ? rawSeoTitle : excerpt(title, 51) + " | Faceless Supply";
        const metaDescription = excerpt(description, 155);
        const searchKeywords = automaticKeywords(title, category, condition, kind.replaceAll("_", " "), description);
        if (isDigital && (!input.download_storage_path || !input.download_filename)) {
          return reply({ error: "Digital products require a protected download file" }, 400);
        }
        const deliveryMinValue = Number(input.delivery_min_business_days);
        const deliveryMaxValue = Number(input.delivery_max_business_days);
        const deliveryMin = isDropship ? deliveryMinValue : null;
        const deliveryMax = isDropship ? deliveryMaxValue : null;
        const shipsFrom = isDropship ? String(input.ships_from ?? "").trim().slice(0, 80) : null;
        if (
          isDropship &&
          (!Number.isInteger(deliveryMinValue) || !Number.isInteger(deliveryMaxValue) ||
            deliveryMinValue < 1 || deliveryMinValue > 90 ||
            deliveryMaxValue < deliveryMinValue || deliveryMaxValue > 120 ||
            !shipsFrom || shipsFrom.length < 2)
        ) {
          return reply({ error: "Enter a valid ships-from location and delivery window." }, 400);
        }
        const sourceInput = body.source ?? {};
        const supplierName = String(sourceInput.supplier_name ?? "AliExpress") === "CJdropshipping"
          ? "CJdropshipping" : "AliExpress";
        const supplierUrl = isDropship
          ? (supplierName === "CJdropshipping" ? cjUrl(sourceInput.supplier_product_url) : aliexpressUrl(sourceInput.supplier_product_url))
          : null;
        if (isDropship && !supplierUrl) {
          return reply({ error: `Paste a valid ${supplierName} product URL.` }, 400);
        }
        const sourceCost = isDropship && sourceInput.supplier_cost_cents !== null &&
          sourceInput.supplier_cost_cents !== undefined
          ? Number(sourceInput.supplier_cost_cents) : null;
        if (sourceCost !== null && (!Number.isInteger(sourceCost) || sourceCost < 0)) {
          return reply({ error: "Supplier cost must be a valid amount." }, 400);
        }
        const requestedVariantId = supplierName === "CJdropshipping"
          ? cleanOptional(sourceInput.supplier_variant_id, 160) : null;
        const requestedSupplierSku = supplierName === "CJdropshipping"
          ? cleanOptional(sourceInput.supplier_sku, 160) : null;
        const marketplace = body.marketplace ?? {};
        const marketplaceEnabled = Boolean(marketplace.enabled);
        if (
          isDropship && supplierName === "CJdropshipping" &&
          (Boolean(input.published) || marketplaceEnabled) &&
          !exactCJMapping(requestedVariantId, requestedSupplierSku)
        ) {
          return reply({ error: "Choose one exact CJ variant with a real VID and variant SKU before publishing or preparing this product for TikTok Shop." }, 400);
        }
        const product = {
          id, title, sku, product_kind: kind, state,
          description,
          slug,
          seo_title: seoTitle,
          meta_description: metaDescription,
          search_keywords: searchKeywords,
          brand: "Faceless Animal Studios",
          gtin: existing?.gtin ?? null,
          mpn: existing?.mpn ?? null,
          google_product_category: existing?.google_product_category ?? null,
          ebay_category_id: existing?.ebay_category_id ?? null,
          facebook_category: existing?.facebook_category ?? null,
          marketplace_ready: existing?.marketplace_ready ?? false,
          price_cents: price, quantity,
          condition,
          category,
          fulfillment_provider: provider,
          external_purchase_url: purchaseUrl,
          external_listing_id: isSpring ? cleanOptional(input.external_listing_id, 80) : null,
          content_rating: isFanvue ? "mature_external" : "general",
          fulfillment_mode: fulfillmentMode,
          ships_from: shipsFrom,
          delivery_min_business_days: deliveryMin,
          delivery_max_business_days: deliveryMax,
          shipping_service: isDropship ? cleanOptional(input.shipping_service, 100) : null,
          shipping_price_cents: (isDigital || isExternal) ? 0 : Math.max(0, Number(input.shipping_price_cents) || 0),
          local_pickup: !isDigital && !isExternal && !isDropship && Boolean(input.local_pickup),
          published: Boolean(input.published),
          preview_url: isDigital ? (String(input.preview_url ?? "") || null) : null,
          download_storage_path: isDigital ? String(input.download_storage_path) : null,
          download_filename: isDigital ? String(input.download_filename) : null,
          download_mime_type: isDigital ? String(input.download_mime_type ?? "application/octet-stream") : null,
        };
        const { data, error } = await admin.from("products").upsert(product).select().single();
        if (error) throw error;
        if (isDropship) {
          const sourceProductId = cleanOptional(sourceInput.supplier_product_id, 100) ??
            (supplierName === "CJdropshipping"
              ? cjProductId(supplierUrl, null)
              : supplierUrl!.match(/\/item\/(\d+)\.html/i)?.[1] ?? null);
          const sourceVariantId = requestedVariantId;
          const sourceSku = requestedSupplierSku;
          const baseVariant = cleanOptional(sourceInput.supplier_variant, 240);
          const variantText = [
            baseVariant,
            sourceVariantId && !baseVariant?.includes(`VID ${sourceVariantId}`) ? `VID ${sourceVariantId}` : null,
            sourceSku && !baseVariant?.includes(`SKU ${sourceSku}`) ? `SKU ${sourceSku}` : null,
          ].filter(Boolean).join(" | ").slice(0, 600) || null;
          const { error: sourceError } = await admin.from("product_sources").upsert({
            product_id: id,
            supplier_name: supplierName,
            supplier_product_url: supplierUrl,
            supplier_product_id: sourceProductId,
            supplier_variant: variantText,
            supplier_variant_id: sourceVariantId,
            supplier_sku: sourceSku,
            supplier_cost_cents: sourceCost,
            supplier_notes: cleanOptional(sourceInput.supplier_notes, 2000),
          });
          if (sourceError) throw sourceError;
        } else {
          const { error: sourceDeleteError } = await admin.from("product_sources").delete().eq("product_id", id);
          if (sourceDeleteError) throw sourceDeleteError;
        }
        if (marketplaceEnabled && (kind !== "physical" || isExternal || isFanvue)) {
          return reply({ error: "Only physical products may be prepared for TikTok Shop." }, 400);
        }
        const categoryId = cleanOptional(marketplace.category_id, 160);
        const warehouseId = cleanOptional(marketplace.warehouse_id, 160);
        const countryOfOrigin = cleanOptional(marketplace.country_of_origin, 100);
        const weight = marketplace.package_weight_grams ? Number(marketplace.package_weight_grams) : null;
        const length = marketplace.package_length_cm ? Number(marketplace.package_length_cm) : null;
        const width = marketplace.package_width_cm ? Number(marketplace.package_width_cm) : null;
        const height = marketplace.package_height_cm ? Number(marketplace.package_height_cm) : null;
        const complianceConfirmed = Boolean(marketplace.compliance_confirmed);
        const images = Array.isArray(body.images) ? body.images.slice(0, 12) : [];
        const { count: existingImageCount, error: imageCountError } = await admin.from("product_images")
          .select("id", { count: "exact", head: true }).eq("product_id", id);
        if (imageCountError) throw imageCountError;
        const listingReady = marketplaceEnabled && Boolean(
          categoryId && warehouseId && countryOfOrigin && complianceConfirmed &&
          weight && weight > 0 && length && length > 0 && width && width > 0 && height && height > 0 &&
          price > 0 && quantity > 0 && (images.length > 0 || (existingImageCount ?? 0) > 0) &&
          (!isDropship || supplierName !== "CJdropshipping" || exactCJMapping(requestedVariantId, requestedSupplierSku))
        );
        const { error: marketplaceError } = await admin.from("marketplace_listings").upsert({
          product_id: id,
          marketplace: "tiktok_shop",
          status: marketplaceEnabled ? (listingReady ? "ready" : "draft") : "disabled",
          category_id: categoryId,
          warehouse_id: warehouseId,
          brand_name: cleanOptional(marketplace.brand_name, 160) ?? "No brand",
          country_of_origin: countryOfOrigin,
          package_weight_grams: weight,
          package_length_cm: length,
          package_width_cm: width,
          package_height_cm: height,
          compliance_confirmed_at: complianceConfirmed ? new Date().toISOString() : null,
        }, { onConflict: "product_id,marketplace" });
        if (marketplaceError) throw marketplaceError;
        if (images.length) {
          const rows = images.map((image: Record<string, unknown>, index: number) => ({
            product_id: id,
            storage_path: String(image.storage_path),
            public_url: String(image.public_url),
            alt_text: title,
            sort_order: Number(image.sort_order ?? index),
          }));
          const { error: imageError } = await admin.from("product_images").insert(rows);
          if (imageError) throw imageError;
        }
        return reply({ product: data });
      }

      case "toggle_publish": {
        const { data: current, error: readError } = await admin.from("products")
          .select("published,fulfillment_mode,product_sources(supplier_name,supplier_variant_id,supplier_sku)")
          .eq("id", String(body.product_id)).single();
        if (readError) throw readError;
        const source = Array.isArray(current.product_sources)
          ? current.product_sources[0]
          : current.product_sources;
        if (
          !current.published && current.fulfillment_mode === "dropship" &&
          source?.supplier_name === "CJdropshipping" &&
          !exactCJMapping(source.supplier_variant_id, source.supplier_sku)
        ) {
          return reply({ error: "This CJ draft cannot publish until you import and select one exact supplier variant with a real VID and SKU." }, 400);
        }
        const { error } = await admin.from("products")
          .update({ published: !current.published }).eq("id", String(body.product_id));
        if (error) throw error;
        return reply({ ok: true });
      }

      case "delete_product": {
        const productId = String(body.product_id);
        const { data: product, error: readError } = await admin.from("products")
          .select("download_storage_path,product_images(storage_path)").eq("id", productId).single();
        if (readError) throw readError;
        const imagePaths = (product.product_images ?? []).map((image: { storage_path: string }) => image.storage_path);
        if (imagePaths.length) await admin.storage.from("product-images").remove(imagePaths);
        if (product.download_storage_path) {
          await admin.storage.from("product-downloads").remove([product.download_storage_path]);
        }
        const { error } = await admin.from("products").delete().eq("id", productId);
        if (error) throw error;
        return reply({ ok: true });
      }

      case "update_order_status": {
        const status = String(body.status);
        const { data: current, error: readError } = await admin.from("orders")
          .select("status").eq("id", String(body.order_id)).single();
        if (readError) throw readError;
        const allowedTransitions: Record<string, string[]> = {
          pending: ["canceled"],
          paid: ["shipped"],
          shipped: ["completed"],
        };
        if (!(allowedTransitions[current.status] ?? []).includes(status)) {
          return reply({ error: "That order transition is not allowed" }, 400);
        }
        const { error } = await admin.from("orders").update({ status }).eq("id", String(body.order_id));
        if (error) throw error;
        return reply({ ok: true });
      }

      case "update_dropship_fulfillment": {
        const itemId = String(body.order_item_id ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(itemId)) return reply({ error: "Invalid order item" }, 400);
        const supplierStatus = String(body.supplier_status ?? "");
        if (!["awaiting_purchase", "ordered", "shipped", "delivered", "canceled"].includes(supplierStatus)) {
          return reply({ error: "Invalid supplier status" }, 400);
        }
        const { data: item, error: itemError } = await admin.from("order_items")
          .select("id,fulfillment_mode").eq("id", itemId).single();
        if (itemError) throw itemError;
        if (item.fulfillment_mode !== "dropship") return reply({ error: "That item is not dropshipped." }, 400);
        const { error } = await admin.from("order_items").update({
          supplier_status: supplierStatus,
          supplier_order_id: cleanOptional(body.supplier_order_id, 160),
          supplier_tracking_number: cleanOptional(body.supplier_tracking_number, 240),
        }).eq("id", itemId);
        if (error) throw error;
        return reply({ ok: true });
      }

      default:
        return reply({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    console.error(error);
    return reply({ error: error instanceof Error ? error.message : "Admin request failed" }, 500);
  }
});
