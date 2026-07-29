import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function verify(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)));
  return safeEqual(signature, parts.v1 ?? "");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  if (!await verify(payload, signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!)) {
    return new Response("Invalid signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    if (!orderId) return new Response("Missing order metadata", { status: 400 });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.rpc("complete_shop_payment", {
      p_event_id: event.id, p_event_type: event.type, p_payload: event,
      p_order_id: orderId, p_session_id: session.id, p_payment_intent_id: session.payment_intent,
    });
    if (error) { console.error(error); return new Response("Processing failed", { status: 500 }); }
  }
  return new Response("ok");
});
