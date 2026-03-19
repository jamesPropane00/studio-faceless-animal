export async function onRequestPost(context) {
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
      station,
    } = body || {};

    const cleanUser = String(username || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const cleanPh = String(ph || "");
    const cleanTitle = String(title || "").trim();
    const cleanStation = String(station || "1");

    if (!cleanUser || !cleanPh || !cleanTitle || !file_b64 || !file_type || !file_name) {
      return json({ error: "Missing required fields." }, 400);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server env is not configured." }, 500);
    }

    // verify member identity
    const verifyUrl =
      `${supabaseUrl}/rest/v1/member_accounts` +
      `?username=eq.${encodeURIComponent(cleanUser)}` +
      `&password_hash=eq.${encodeURIComponent(cleanPh)}` +
      `&select=username,plan_type,member_status`;

    const verifyRes = await fetch(verifyUrl, {
      headers: sbHeaders(serviceKey),
    });

    if (!verifyRes.ok) {
      return json({ error: "Could not verify identity." }, 500);
    }

    const verifyRows = await verifyRes.json();
    if (!Array.isArray(verifyRows) || verifyRows.length === 0) {
      return json({ error: "Authentication failed." }, 401);
    }

    const member = verifyRows[0];
    const paidPlans = new Set(["access", "starter", "pro", "premium"]);
    if (!paidPlans.has(String(member.plan_type || "").toLowerCase()) || member.member_status !== "active") {
      return json({ error: "Active paid membership required." }, 403);
    }

    // current month range
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

    // quota check: max 2 per month
    const quotaUrl =
      `${supabaseUrl}/rest/v1/radio_upload_quota` +
      `?username=eq.${encodeURIComponent(cleanUser)}` +
      `&uploaded_at=gte.${encodeURIComponent(monthStart.toISOString())}` +
      `&uploaded_at=lt.${encodeURIComponent(nextMonthStart.toISOString())}` +
      `&select=id`;

    const quotaRes = await fetch(quotaUrl, {
      headers: sbHeaders(serviceKey),
    });

    if (!quotaRes.ok) {
      return json({ error: "Could not check monthly quota." }, 500);
    }

    const quotaRows = await quotaRes.json();
    if (Array.isArray(quotaRows) && quotaRows.length >= 2) {
      return json({ error: "You have already used your 2 uploads for this month." }, 429);
    }

    // upload file to Supabase Storage bucket "radio", always Station 1
    const bytes = decodeBase64(String(file_b64));
    if (bytes.byteLength > 30 * 1024 * 1024) {
      return json({ error: "File exceeds 30MB limit." }, 400);
    }

    const ext = getExt(String(file_name), String(file_type));
    const safeBase = String(file_name)
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 60) || "track";

    const objectName = `${Date.now()}_${cleanUser}_${safeBase}${ext}`;
    const storagePath = `ch1/community/${objectName}`;

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

    // insert into main radio tracks table
    const trackInsertRes = await fetch(`${supabaseUrl}/rest/v1/radio_tracks`, {
      method: "POST",
      headers: {
        ...sbHeaders(serviceKey),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify([{
        channel: "1",
        title: `${cleanTitle} · @${cleanUser}`,
        src: publicSrc,
        storage_path: storagePath,
        uploaded_by: cleanUser,
        is_active: true,
      }]),
    });

    if (!trackInsertRes.ok) {
      const t = await trackInsertRes.text();
      return json({ error: `Track insert failed: ${t}` }, 500);
    }

    const trackRows = await trackInsertRes.json();
    const track = trackRows[0];

    // record quota usage
    const quotaInsertRes = await fetch(`${supabaseUrl}/rest/v1/radio_upload_quota`, {
      method: "POST",
      headers: {
        ...sbHeaders(serviceKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        username: cleanUser,
        station: "1",
        title: cleanTitle,
        storage_path: storagePath,
      }]),
    });

    if (!quotaInsertRes.ok) {
      const t = await quotaInsertRes.text();
      return json({ error: `Quota record failed: ${t}` }, 500);
    }

    return json({
      ok: true,
      track,
      used_this_month: (Array.isArray(quotaRows) ? quotaRows.length : 0) + 1,
      remaining_this_month: Math.max(0, 2 - ((Array.isArray(quotaRows) ? quotaRows.length : 0) + 1)),
    }, 200);

  } catch (err) {
    return json({ error: err.message || "Community upload failed." }, 500);
  }
}

function sbHeaders(key) {
  return {
    "Authorization": `Bearer ${key}`,
    "apikey": key,
  };
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