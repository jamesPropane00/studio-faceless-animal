import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const origin = Deno.env.get("SHOP_ORIGIN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowed = new Set(["jdot00", "jamespropane00"]);
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const username = String(body.username ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const passwordHash = String(body.ph ?? "");
    if (!allowed.has(username) || !passwordHash) return reply({ error: "Access denied" }, 403);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: member } = await admin.from("member_accounts")
      .select("username").eq("username", username).eq("password_hash", passwordHash).maybeSingle();
    if (!member) return reply({ error: "Website login could not be verified" }, 401);

    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const token = btoa(String.fromCharCode(...random))
      .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("shop_platform_sessions").delete().eq("username", username).lt("expires_at", new Date().toISOString());
    const { error } = await admin.from("shop_platform_sessions").insert({
      username, token_hash: tokenHash, expires_at: expiresAt,
    });
    if (error) throw error;
    return reply({ token, expires_at: expiresAt });
  } catch (error) {
    console.error(error);
    return reply({ error: "Admin session could not be created" }, 500);
  }
});
