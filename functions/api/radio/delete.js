export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  return onRequestPost(context);
}

async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    const username = String(body?.username || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const ph = String(body?.ph || "");
    const id = String(body?.id || "");

    if (!username || !ph || !id) {
      return json({ error: "Missing fields." }, 400);
    }

    const admins = new Set(["jamespropane00", "arianamnm"]);
    if (!admins.has(username)) {
      return json({ error: "Admin access only." }, 403);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server env is not configured." }, 500);
    }

    const verifyUrl =
      `${supabaseUrl}/rest/v1/member_accounts` +
      `?username=eq.${encodeURIComponent(username)}` +
      `&password_hash=eq.${encodeURIComponent(ph)}` +
      `&select=username`;

    const verifyRes = await fetch(verifyUrl, {
      headers: sbHeaders(serviceKey),
    });

    if (!verifyRes.ok) {
      const t = await verifyRes.text();
      return json({ error: `Could not verify identity: ${t}` }, 500);
    }

    const verifyRows = await verifyRes.json();
    if (!Array.isArray(verifyRows) || verifyRows.length === 0) {
      return json({ error: "Authentication failed." }, 401);
    }

    const rowRes = await fetch(
      `${supabaseUrl}/rest/v1/radio_tracks?id=eq.${encodeURIComponent(id)}&select=id,storage_path`,
      { headers: sbHeaders(serviceKey) }
    );

    if (!rowRes.ok) {
      const t = await rowRes.text();
      return json({ error: `Track lookup failed: ${t}` }, 500);
    }

    const rows = await rowRes.json();
    if (!rows.length) {
      return json({ error: "Track not found." }, 404);
    }

    const track = rows[0];

    const storageDeleteRes = await fetch(`${supabaseUrl}/storage/v1/object/radio`, {
      method: "DELETE",
      headers: {
        ...sbHeaders(serviceKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [track.storage_path] }),
    });

    if (!storageDeleteRes.ok) {
      const t = await storageDeleteRes.text();
      return json({ error: `Storage delete failed: ${t}` }, 500);
    }

    const dbDeleteRes = await fetch(
      `${supabaseUrl}/rest/v1/radio_tracks?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: {
          ...sbHeaders(serviceKey),
          "Prefer": "return=representation",
        },
      }
    );

    if (!dbDeleteRes.ok) {
      const t = await dbDeleteRes.text();
      return json({ error: `DB delete failed: ${t}` }, 500);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: err.message || "Delete failed." }, 500);
  }
}

function sbHeaders(key) {
  return {
    "Authorization": `Bearer ${key}`,
    "apikey": key,
  };
}

function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(data, status = 200) {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}