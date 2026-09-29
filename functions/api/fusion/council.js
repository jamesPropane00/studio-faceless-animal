const EXPECTED_TOKEN_SHA256 = "79105ed8c34ac0344d881a1502e404f737abd02689ed3d942c1493ab425b04da";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const hex = (bytes) => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
async function authorized(request) {
  const token = request.headers.get("x-fusion-worker-token") || "";
  if (token.length < 40 || token.length > 256) return false;
  const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  let diff = 0;
  for (let i = 0; i < EXPECTED_TOKEN_SHA256.length; i++) diff |= digest.charCodeAt(i) ^ EXPECTED_TOKEN_SHA256.charCodeAt(i);
  return diff === 0;
}
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type,x-fusion-worker-token" },
  });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!await authorized(request)) return json({ error: "unauthorized" }, 401);
    const input = await request.json();
    if (String(input?.model || "").startsWith("@cf/") || input?.provider === "cloudflare_workers_ai") {
      const cfToken = env?.CF_AI_TOKEN || "";
      const accountId = env?.CF_ACCOUNT_ID || "";
      if (!cfToken || !accountId) return json({ error: "cloudflare_credentials_unconfigured", provider: "cloudflare_workers_ai" }, 503);
      const system = String(input?.system || "").slice(0, 12000);
      const prompt = String(input?.prompt || "").slice(0, 16000);
      if (!system || !prompt) return json({ error: "invalid_inference_request" }, 400);
      const model = "@cf/meta/llama-3.2-3b-instruct";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/run/" + model, {
          method: "POST", signal: controller.signal,
          headers: { Authorization: "Bearer " + cfToken, "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature: 0.65, max_tokens: 1800, response_format: { type: "json_object" } }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) return json({ error: String(data?.errors?.[0]?.message || "cloudflare_inference_failed").slice(0, 300), provider: "cloudflare_workers_ai", model, http_status: response.status }, 502);
        const output = String(data?.result?.response || "").trim();
        if (!output) return json({ error: "empty_cloudflare_model_output", provider: "cloudflare_workers_ai", model }, 502);
        return json({ provider: "cloudflare_workers_ai", model, response: output });
      } catch (error) {
        return json({ error: error?.name === "AbortError" ? "cloudflare_timeout" : "cloudflare_bridge_runtime_error", provider: "cloudflare_workers_ai", model }, 502);
      } finally { clearTimeout(timer); }
    }
    const token = env?.HF_TOKEN || env?.HUGGINGFACE_TOKEN || "";
    if (!token) return json({ error: "huggingface_token_unconfigured", provider: "huggingface" }, 503);
    const system = String(input?.system || "").slice(0, 12000);
    const prompt = String(input?.prompt || "").slice(0, 16000);
    const model = "Qwen/Qwen2.5-7B-Instruct";
    if (!system || !prompt) return json({ error: "invalid_inference_request" }, 400);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          temperature: 0.65,
          max_tokens: 1800,
          response_format: { type: "json_object" },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json({
        error: String(data?.error?.message || data?.error || data?.message || ("huggingface_http_" + response.status)).slice(0, 400),
        provider: "huggingface",
        model,
        http_status: response.status,
      }, 502);
      const output = String(data?.choices?.[0]?.message?.content || "").trim();
      if (!output) return json({ error: "empty_huggingface_model_output", provider: "huggingface", model }, 502);
      return json({ provider: "huggingface", model, response: output });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return json({
      error: error?.name === "AbortError" ? "huggingface_timeout" : "huggingface_bridge_runtime_error",
      detail: String(error?.message || error || "unknown_error").slice(0, 300),
      provider: "huggingface",
    }, 502);
  }
}
