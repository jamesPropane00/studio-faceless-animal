// Deployed function name: clever-function (kept to match the live storefront).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SHOP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items.map((item: Record<string, unknown>) => ({
      product_id: String(item.product_id ?? ""),
      quantity: Number(item.quantity ?? 0),
    })) : [];
    if (!items.length || items.length > 20) return reply({ error: "Your cart is empty or too large." }, 400);
    if (!["shipping", "pickup", "digital"].includes(body.fulfillment)) {
      return reply({ error: "Choose shipping, pickup, or digital delivery." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { error: releaseError } = await admin.rpc("release_expired_shop_reservations");
    if (releaseError) throw releaseError;
    const { data: requestedProducts, error: productError } = await admin.from("products")
      .select("id,title,fulfillment_provider,fulfillment_mode,product_sources(supplier_name,supplier_variant_id,supplier_sku)")
      .in("id", items.map((item: { product_id: string; quantity: number }) => item.product_id));
    if (productError) throw productError;
    if ((requestedProducts ?? []).some((product) => product.fulfillment_provider !== "internal")) {
      return reply({ error: "External products must be purchased through their official product page." }, 400);
    }
    const unmappedCJProduct = (requestedProducts ?? []).find((product) => {
      const source = Array.isArray(product.product_sources) ? product.product_sources[0] : product.product_sources;
      const variantId = String(source?.supplier_variant_id ?? "").trim();
      const supplierSku = String(source?.supplier_sku ?? "").trim();
      return product.fulfillment_mode === "dropship" && source?.supplier_name === "CJdropshipping" &&
        (!variantId || !supplierSku || /^PENDING(?:-|$)/i.test(variantId) || /^PENDING(?:-|$)/i.test(supplierSku));
    });
    if (unmappedCJProduct) {
      return reply({ error: `${unmappedCJProduct.title} is temporarily unavailable while its exact supplier variant is verified.` }, 409);
    }
    const { data: created, error: createError } = await admin.rpc("create_shop_order", {
      p_items: items, p_fulfillment: body.fulfillment, p_customer: body.customer ?? {},
    });
    if (createError) return reply({ error: createError.message }, 409);

    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,order_number,total_cents,currency,customer_email,reservation_token").eq("id", created.order_id).single();
    if (orderError) throw orderError;
    const origin = Deno.env.get("SHOP_ORIGIN");
    if (!origin) throw new Error("SHOP_ORIGIN is not configured.");
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${origin}/checkout-success.html?order=${order.id}&token=${order.reservation_token}`);
    params.set("cancel_url", `${origin}/checkout-canceled.html?order=${order.id}&token=${order.reservation_token}`);
    params.set("customer_email", order.customer_email);
    params.set("expires_at", String(Math.floor(Date.now() / 1000) + 1800)); // Stripe minimum; DB hold remains 10 minutes.
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", order.currency);
    params.set("line_items[0][price_data][unit_amount]", String(order.total_cents));
    params.set("line_items[0][price_data][product_data][name]", `Faceless Animal order ${order.order_number}`);
    params.set("metadata[order_id]", order.id);
    params.set("payment_intent_data[metadata][order_id]", order.id);

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) throw new Error(session?.error?.message ?? "Stripe could not start checkout.");
    await admin.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return reply({ url: session.url });
  } catch (error) {
    console.error(error);
    return reply({ error: error instanceof Error ? error.message : "Checkout failed." }, 500);
  }
});
