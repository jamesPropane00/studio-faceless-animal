import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const origin = Deno.env.get("SHOP_ORIGIN") ?? "";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const { order_id, token } = await req.json();
    if (!order_id || !token) return reply({ error: "Order credentials are required." }, 400);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: items, error } = await admin.rpc("get_paid_download_items", {
      p_order: order_id, p_token: token,
    });
    if (error) throw error;
    if (!items?.length) return reply({ downloads: [] });
    const downloads = [];
    for (const item of items) {
      const { data, error: signError } = await admin.storage
        .from("product-downloads")
        .createSignedUrl(item.storage_path, 3600, { download: item.filename });
      if (signError) throw signError;
      downloads.push({ title: item.title, filename: item.filename, url: data.signedUrl });
    }
    return reply({ downloads });
  } catch (error) {
    console.error(error);
    return reply({ error: "Downloads could not be prepared." }, 500);
  }
});
