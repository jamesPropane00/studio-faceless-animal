import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const shopOrigin = Deno.env.get("SHOP_ORIGIN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": shopOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowedUsers = new Set(["jdot00", "jamespropane00"]);
const allowedKinds = new Set(["physical", "music_download", "file_download"]);
const allowedStates = new Set(["available", "reserved", "sold", "inactive"]);
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
          .select("*,product_images(*)").order("created_at", { ascending: false });
        if (error) throw error;
        return reply({ products: data ?? [] });
      }

      case "list_orders": {
        let query = admin.from("orders").select("*,order_items(*)").order("created_at", { ascending: false });
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

      case "save_product": {
        const input = body.product ?? {};
        const kind = String(input.product_kind ?? "");
        const state = String(input.state ?? "");
        if (!allowedKinds.has(kind) || !allowedStates.has(state)) return reply({ error: "Invalid product type or state" }, 400);
        const id = String(input.id ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ error: "Invalid product ID" }, 400);
        const title = String(input.title ?? "").trim();
        const sku = String(input.sku ?? "").trim();
        const slugBase = cleanSlug(input.slug || title);
        const slug = slugBase.length >= 2 ? slugBase : `product-${id.slice(0, 8)}`;
        const price = Number(input.price_cents);
        const quantity = Number(input.quantity);
        if (!title || !sku || !Number.isInteger(price) || price < 0 || !Number.isInteger(quantity) || quantity < 0) {
          return reply({ error: "Title, SKU, price and quantity are required" }, 400);
        }
        const isDigital = kind !== "physical";
        const seoTitle = String(input.seo_title ?? "").trim().slice(0, 70);
        const metaDescription = String(input.meta_description ?? "").trim().slice(0, 320);
        const searchKeywords = (Array.isArray(input.search_keywords) ? input.search_keywords : [])
          .map((keyword: unknown) => String(keyword).trim().toLowerCase().slice(0, 80))
          .filter(Boolean).slice(0, 30);
        if (isDigital && (!input.download_storage_path || !input.download_filename)) {
          return reply({ error: "Digital products require a protected download file" }, 400);
        }
        const product = {
          id, title, sku, product_kind: kind, state,
          description: String(input.description ?? ""),
          slug,
          seo_title: seoTitle || null,
          meta_description: metaDescription || null,
          search_keywords: searchKeywords,
          brand: String(input.brand ?? "Faceless Animal Studios").trim().slice(0, 120) || "Faceless Animal Studios",
          gtin: cleanOptional(input.gtin, 32),
          mpn: cleanOptional(input.mpn, 80),
          google_product_category: cleanOptional(input.google_product_category, 160),
          ebay_category_id: cleanOptional(input.ebay_category_id, 40),
          facebook_category: cleanOptional(input.facebook_category, 160),
          marketplace_ready: Boolean(input.marketplace_ready),
          price_cents: price, quantity,
          condition: isDigital ? "Digital" : String(input.condition ?? "New"),
          category: String(input.category ?? "Other").trim() || "Other",
          shipping_price_cents: isDigital ? 0 : Math.max(0, Number(input.shipping_price_cents) || 0),
          local_pickup: !isDigital && Boolean(input.local_pickup),
          published: Boolean(input.published),
          preview_url: isDigital ? (String(input.preview_url ?? "") || null) : null,
          download_storage_path: isDigital ? String(input.download_storage_path) : null,
          download_filename: isDigital ? String(input.download_filename) : null,
          download_mime_type: isDigital ? String(input.download_mime_type ?? "application/octet-stream") : null,
        };
        const { data, error } = await admin.from("products").upsert(product).select().single();
        if (error) throw error;
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

      default:
        return reply({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    console.error(error);
    return reply({ error: error instanceof Error ? error.message : "Admin request failed" }, 500);
  }
});
