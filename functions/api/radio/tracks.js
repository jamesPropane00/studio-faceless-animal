export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  return onRequestGet(context);
}

async function onRequestGet(context) {
  const { request, env } = context;

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return json({ tracks: [], error: "Server env is not configured." }, 500);
  }

  const url = new URL(request.url);
  const channel = ["1", "4", "5"].includes(url.searchParams.get("channel"))
    ? url.searchParams.get("channel")
    : "1";

  const res = await fetch(
    `${supabaseUrl}/rest/v1/radio_tracks?select=id,title,src,uploaded_at,channel,play_count,upvotes&is_active=eq.true&channel=eq.${channel}&order=uploaded_at.desc`,
    { headers: sbHeaders(serviceKey) }
  );

  if (!res.ok) {
    const t = await res.text();
    return json({ tracks: [], error: `Could not load tracks: ${t}` }, 500);
  }

  const rows = await res.json();
  const tracks = rows.map((r) => ({
    id: r.id,
    title: r.title,
    src: r.src,
    uploadedAt: r.uploaded_at,
    channel: r.channel,
    play_count: r.play_count || 0,
    upvotes: r.upvotes || 0,
  }));

  return json({ tracks, channel }, 200);
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