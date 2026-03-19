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
    const {
      username,
      ph,
      title,
      file_b64,
      file_type,
      file_name,
      channel,
    } = body || {};

    const cleanUser = String(username || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const cleanPh = String(ph || "");
    const cleanTitle = String(title || "").trim();
    const cleanChannel = ["1", "4", "5"].includes(String(channel)) ? String(channel) : "1";

    if (!cleanUser || !cleanPh || !cleanTitle || !file_b64 || !file_type || !file_name) {
      return json({ error: "Missing required fields." }, 400);
    }

    if (cleanTitle.length > 100) {
      return json({ error: "Title too long." }, 400);
    }

    const allowed = new Set([
      "audio/mpeg",
      "audio/mp3",
      "audio/ogg",
      "audio/wav",
      "audio/x-wav",
      "audio/flac",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/aiff",
    ]);

    if (!allowed.has(String(file_type))) {
      return json({ error: "Unsupported audio type." }, 400);
    }

    const admins = new Set(["jamespropane00", "arianamnm"]);
    if (!admins.has(cleanUser)) {
      return json({ error: "Admin access only." }, 403);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server env is not configured." }, 500);
    }

    const verifyUrl =
      `${supabaseUrl}/rest/v1/member_accounts` +
      `?username=eq.${encodeURIComponent(cleanUser)}` +
      `&password_hash=eq.${encodeURIComponent(cleanPh)}` +
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

    const bytes = decodeBase64(String(file_b64));
    if (bytes.byteLength > 50 * 1024 * 1024) {
      return json({ error: "File exceeds 50MB limit." }, 400);
    }

    const ext = getExt(String(file_name), String(file_type));
    const safeBase = String(file_name)
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 60) || "track";

    const objectName = `${Date.now()}_${safeBase}${ext}`;
    const storagePath = `ch${cleanChannel}/${objectName}`;

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/radio/${storagePath}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
          "Content-Type": String(file_type),
          "x-upsert": "false",
        },
        body: bytes,
      }
    );

    if (!uploadRes.ok) {
      const t = await uploadRes.text();
      return json({ error: `Storage upload failed: ${t}` }, 500);
    }

    const publicSrc = `${supabaseUrl}/storage/v1/object/public/radio/${storagePath}`;

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/radio_tracks`, {
      method: "POST",
      headers: {
        ...sbHeaders(serviceKey),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify([
        {
          channel: cleanChannel,
          title: cleanTitle,
          src: publicSrc,
          storage_path: storagePath,
          uploaded_by: cleanUser,
          is_active: true,
        },
      ]),
    });

    if (!insertRes.ok) {
      const t = await insertRes.text();

      await fetch(`${supabaseUrl}/storage/v1/object/radio`, {
        method: "DELETE",
        headers: {
          ...sbHeaders(serviceKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: [storagePath] }),
      }).catch(() => {});

      return json({ error: `DB insert failed: ${t}` }, 500);
    }

    const rows = await insertRes.json();
    return json({ ok: true, track: rows[0] }, 200);
  } catch (err) {
    return json({ error: err.message || "Upload failed." }, 500);
  }
}

function sbHeaders(key) {
  return {
    "Authorization": `Bearer ${key}`,
    "apikey": key,
  };
}

function decodeBase64(base64) {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function getExt(fileName, mime) {
  const m = String(fileName).match(/\.[^.]+$/);
  if (m) return m[0].toLowerCase();

  const map = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/aiff": ".aiff",
  };
  return map[mime] || ".mp3";
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