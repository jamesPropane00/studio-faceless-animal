export async function onRequestGet(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");

  if (!username) {
    return json({ error: "Missing username." }, 400);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

  const quotaUrl =
    `${supabaseUrl}/rest/v1/radio_upload_quota` +
    `?username=eq.${encodeURIComponent(username)}` +
    `&uploaded_at=gte.${encodeURIComponent(monthStart.toISOString())}` +
    `&uploaded_at=lt.${encodeURIComponent(nextMonthStart.toISOString())}` +
    `&select=id`;

  const res = await fetch(quotaUrl, {
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
    },
  });

  if (!res.ok) {
    return json({ error: "Could not load quota." }, 500);
  }

  const rows = await res.json();
  const used = Array.isArray(rows) ? rows.length : 0;
  const remaining = Math.max(0, 2 - used);

  return json({ used, remaining, limit: 2 }, 200);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}