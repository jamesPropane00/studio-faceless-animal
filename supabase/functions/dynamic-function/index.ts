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
          .select("*,product_images(*),product_sources(*)").order("created_at", { ascending: false });
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
        const supplierUrl = isDropship ? aliexpressUrl(sourceInput.supplier_product_url) : null;
        if (isDropship && !supplierUrl) {
          return reply({ error: "Paste a valid AliExpress product URL." }, 400);
        }
        const sourceCost = isDropship && sourceInput.supplier_cost_cents !== null &&
          sourceInput.supplier_cost_cents !== undefined
          ? Number(sourceInput.supplier_cost_cents) : null;
        if (sourceCost !== null && (!Number.isInteger(sourceCost) || sourceCost < 0)) {
          return reply({ error: "Supplier cost must be a valid amount." }, 400);
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
            supplierUrl!.match(/\/item\/(\d+)\.html/i)?.[1] ?? null;
          const { error: sourceError } = await admin.from("product_sources").upsert({
            product_id: id,
            supplier_name: "AliExpress",
            supplier_product_url: supplierUrl,
            supplier_product_id: sourceProductId,
            supplier_variant: cleanOptional(sourceInput.supplier_variant, 240),
            supplier_cost_cents: sourceCost,
            supplier_notes: cleanOptional(sourceInput.supplier_notes, 2000),
          });
          if (sourceError) throw sourceError;
        } else {
          const { error: sourceDeleteError } = await admin.from("product_sources").delete().eq("product_id", id);
          if (sourceDeleteError) throw sourceDeleteError;
        }
        const images = Array.isArray(body.images) ? body.images.slice(0, 12) : [];
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
          .select("published").eq("id", String(body.product_id)).single();
        if (readError) throw readError;
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
