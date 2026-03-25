/**
 * FACELESS ANIMAL STUDIOS — Member Vault Flow Tick
 * Cloudflare Pages Function
 * POST /api/member/vault-flow-tick
 */

import { getVeilTier } from './veil-tiers.js';

const FLOW_MAX_ELAPSED_MIN = 10;
const FLOW_TICK_INTERVAL_MS = 15000;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPA_URL = env.SUPABASE_URL;

    if (!SERVICE_KEY || !SUPA_URL) {
      return jsonResponse(
        { ok: false, step: 'env', error: 'Server credentials not configured.' },
        503
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, step: 'body', error: 'Invalid request body.' },
        400
      );
    }

    const username = normalizeUsername(body && body.username);
    const ph = String((body && body.ph) || '').trim();

    if (!username || !ph) {
      return jsonResponse(
        { ok: false, step: 'input', error: 'Missing username/ph.' },
        400
      );
    }

    // Step 1: lookup existing member row
    let row = null;
    const select1 = await getMemberVaultRowMaybeSingle(SUPA_URL, SERVICE_KEY, username);
    if (!select1.ok) {
      return jsonResponse(
        {
          ok: false,
          step: 'select1',
          error: select1.error,
          detail: select1.detail || null
        },
        select1.status || 500
      );
    }
    row = select1.row;

    // Step 2: auto-create if missing
    if (!row) {
      let createRes = null;
      let bodyText = '';
      let insertedRows = null;

      try {
        createRes = await fetch(`${SUPA_URL}/rest/v1/member_accounts`, {
          method: 'POST',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            username,
            display_name: username,
            plan_type: 'free',
            member_status: 'free',
            password_hash: ph,
            credits_balance: 0,
            veil_level: 1,
            veil_state: 'active',
            flow_earned_today: 0,
            flow_rate_per_min: 0.2,
            flow_last_tick_at: new Date().toISOString(),
            flow_last_day: utcDayKey(new Date())
          })
        });

        bodyText = await createRes.text();

        if (bodyText) {
          try {
            insertedRows = JSON.parse(bodyText);
          } catch {
            insertedRows = null;
          }
        }

        if (!createRes.ok && createRes.status !== 409) {
          return jsonResponse(
            {
              ok: false,
              step: 'insert',
              error: 'AUTO_CREATE_FAILED',
              status: createRes.status,
              statusText: createRes.statusText,
              body: bodyText
            },
            500
          );
        }

        if (createRes.ok && Array.isArray(insertedRows) && insertedRows.length > 0) {
          row = insertedRows[0];
        }
      } catch (insertError) {
        return jsonResponse(
          {
            ok: false,
            step: 'insert',
            error: 'AUTO_CREATE_EXCEPTION',
            detail: String(insertError)
          },
          500
        );
      }

      // Step 3: fallback readback if insert did not return a row or conflict happened
      if (!row) {
        const select2 = await getMemberVaultRowMaybeSingle(SUPA_URL, SERVICE_KEY, username);
        if (!select2.ok) {
          return jsonResponse(
            {
              ok: false,
              step: 'readback',
              error: select2.error,
              detail: select2.detail || null
            },
            select2.status || 500
          );
        }

        row = select2.row;

        if (!row) {
          return jsonResponse(
            {
              ok: false,
              step: 'insert_debug',
              status: createRes ? createRes.status : 500,
              statusText: createRes ? createRes.statusText : 'NO_RESPONSE',
              body: bodyText,
              note: 'Insert did not produce a usable row'
            },
            500
          );
        }
      }
    }

    // Step 4: verify identity after bootstrap
    const identityOk = await verifyIdentity(SUPA_URL, SERVICE_KEY, username, ph);
    if (!identityOk) {
      return jsonResponse(
        { ok: false, step: 'auth', error: 'Authentication failed.' },
        401
      );
    }

    // Step 5: tick logic
    const tickResult = await tickMemberVaultFlow(SUPA_URL, SERVICE_KEY, row);
    if (!tickResult.ok) {
      return jsonResponse(
        { ok: false, step: 'tick', error: tickResult.error || 'Could not persist vault flow tick.' },
        500
      );
    }

    return jsonResponse({ ok: true, ...tickResult.snapshot }, 200);
  } catch (err) {
    return jsonResponse(
      { ok: false, step: 'catch', error: String(err) },
      500
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function normalizeUsername(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '');
}

async function verifyIdentity(supabaseUrl, serviceKey, username, ph) {
  if (!username || !ph) return false;

  const u = normalizeUsername(username);
  if (!u) return false;

  const filter =
    `username=eq.${encodeURIComponent(u)}` +
    `&password_hash=eq.${encodeURIComponent(ph)}` +
    `&select=username`;

  const res = await supabaseFetch(
    supabaseUrl,
    serviceKey,
    'GET',
    `/rest/v1/member_accounts?${filter}`,
    null
  );

  if (!res.ok) return false;

  try {
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function getMemberVaultRowMaybeSingle(supabaseUrl, serviceKey, username) {
  const u = normalizeUsername(username);

  if (!u) {
    return {
      ok: false,
      status: 400,
      error: 'Missing username'
    };
  }

  const path =
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(u)}` +
    `&select=id,username,display_name,platform_id,veil_level,veil_state,credits_balance,flow_last_tick_at,flow_last_day,flow_earned_today,flow_rate_per_min` +
    `&limit=1`;

  let res;
  try {
    res = await supabaseFetch(supabaseUrl, serviceKey, 'GET', path, null);
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: 'Fetch failed',
      detail: String(err)
    };
  }

  if (!res.ok) {
    let errText = '';
    try {
      errText = await res.text();
    } catch {
      errText = '';
    }

    return {
      ok: false,
      status: res.status,
      error: 'Supabase lookup failed',
      detail: errText
    };
  }

  try {
    const rows = await res.json();
    return {
      ok: true,
      row: Array.isArray(rows) && rows.length > 0 ? rows[0] : null
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: 'JSON parse error',
      detail: String(err)
    };
  }
}

async function tickMemberVaultFlow(supabaseUrl, serviceKey, row) {
  if (!row || !row.username) {
    return { ok: false, error: 'Member row not found.' };
  }

  const veilLevel = Number(row.veil_level || 1);
  const veilTier = getVeilTier(veilLevel);

  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = utcDayKey(now);

  const balance = Math.max(0, Number(row.credits_balance || 0));
  let earnedToday = Math.max(0, Number(row.flow_earned_today || 0));

  const storedDay = String(row.flow_last_day || '').slice(0, 10);
  if (!storedDay || storedDay !== todayKey) {
    earnedToday = 0;
  }

  const lastTickRaw = String(row.flow_last_tick_at || '');
  const lastTickMs = lastTickRaw ? Date.parse(lastTickRaw) : Date.now();
  const nowMs = Date.now();

  const elapsedMs = nowMs - (Number.isFinite(lastTickMs) ? lastTickMs : nowMs);
  if (elapsedMs < FLOW_TICK_INTERVAL_MS) {
    return { ok: false, error: 'Tick too soon. Wait at least 15 seconds between ticks.' };
  }

  let elapsedMin = Math.max(0, elapsedMs / 60000);
  elapsedMin = Math.min(elapsedMin, FLOW_MAX_ELAPSED_MIN);

  const flowRate = toFixedNumber(Number(row.flow_rate_per_min || 0), 4);
  const tickSeconds = elapsedMs / 1000;
  const generated = toFixedNumber((flowRate / 60) * tickSeconds * veilTier.multiplier, 4);

  let cappedGenerated = generated;
  if (veilTier.cap != null) {
    const remaining = Math.max(0, Number(veilTier.cap) - earnedToday);
    cappedGenerated = Math.min(generated, remaining);
  }

  const nextEarned = toFixedNumber(earnedToday + cappedGenerated, 4);
  const nextBalance = toFixedNumber(balance + cappedGenerated, 4);

  const patchBody = {
    credits_balance: nextBalance,
    flow_last_tick_at: nowIso,
    flow_last_day: todayKey,
    flow_earned_today: nextEarned,
    flow_rate_per_min: flowRate
  };

  const writePath =
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(normalizeUsername(row.username))}`;

  const writeRes = await supabaseFetch(
    supabaseUrl,
    serviceKey,
    'PATCH',
    writePath,
    patchBody
  );

  if (!writeRes.ok) {
    let errText = '';
    try {
      errText = await writeRes.text();
    } catch {
      errText = '';
    }

    return {
      ok: false,
      error: `Could not persist vault flow tick.${errText ? ` ${errText}` : ''}`
    };
  }

  const mergedRow = {
    ...row,
    ...patchBody
  };

  return {
    ok: true,
    row: mergedRow,
    snapshot: vaultSnapshotFromRow(
      mergedRow,
      veilTier,
      cappedGenerated,
      elapsedMin,
      nowIso
    )
  };
}

function vaultSnapshotFromRow(row, veilTier, generated, elapsedMinutes, tickedAt) {
  return {
    credits_balance: toFixedNumber(Math.max(0, Number(row && row.credits_balance || 0)), 4),
    flow_rate_per_min: toFixedNumber(Math.max(0, Number(row && row.flow_rate_per_min || 0)), 4),
    flow_earned_today: toFixedNumber(Math.max(0, Number(row && row.flow_earned_today || 0)), 4),
    daily_cap: veilTier.cap,
    veil_level: row && row.veil_level,
    veil_label: veilTier.label,
    veil_multiplier: veilTier.multiplier,
    vault_tier_label: veilTier.label,
    generated: toFixedNumber(generated || 0, 4),
    elapsed_minutes: toFixedNumber(elapsedMinutes || 0, 4),
    ticked_at: tickedAt || new Date().toISOString()
  };
}

function toFixedNumber(value, digits) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function utcDayKey(date) {
  const d = date instanceof Date ? date : new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function supabaseFetch(supabaseUrl, serviceKey, method, urlPath, jsonBody) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  return fetch(`${supabaseUrl}${urlPath}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
      body = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, step: 'body', error: 'Invalid request body.' },
        400
      );
    }

    const username = normalizeUsername(body && body.username);
    const ph = String((body && body.ph) || '').trim();

    if (!username || !ph) {
      return jsonResponse(
        { ok: false, step: 'input', error: 'Missing username/ph.' },
        400
      );
    }

    // Step 1: lookup existing member row
    let row = null;
    const select1 = await getMemberVaultRowMaybeSingle(SUPA_URL, SERVICE_KEY, username);
    if (!select1.ok) {
      return jsonResponse(
        {
          ok: false,
          step: 'select1',
          error: select1.error,
          detail: select1.detail || null
        },
        select1.status || 500
      );
    }
    row = select1.row;

    // Step 2: auto-create if missing
    if (!row) {
      let createRes = null;
      let bodyText = '';
      let insertedRows = null;

      try {
        createRes = await fetch(`${SUPA_URL}/rest/v1/member_accounts`, {
          method: 'POST',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            username,
            display_name: username,
            plan_type: 'free',
            member_status: 'free',
            password_hash: ph,
            credits_balance: 0,
            veil_level: 1,
            veil_state: 'active',
            flow_earned_today: 0,
            flow_rate_per_min: 0.2,
            flow_last_tick_at: new Date().toISOString(),
            flow_last_day: utcDayKey(new Date())
          })
        });

        bodyText = await createRes.text();

        if (bodyText) {
          try {
            insertedRows = JSON.parse(bodyText);
          } catch {
            insertedRows = null;
          }
        }

        if (!createRes.ok && createRes.status !== 409) {
          return jsonResponse(
            {
              ok: false,
              step: 'insert',
              error: 'AUTO_CREATE_FAILED',
              status: createRes.status,
              statusText: createRes.statusText,
              body: bodyText
            },
            500
          );
        }

        if (createRes.ok && Array.isArray(insertedRows) && insertedRows.length > 0) {
          row = insertedRows[0];
        }
      } catch (insertError) {
        return jsonResponse(
          {
            ok: false,
            step: 'insert',
            error: 'AUTO_CREATE_EXCEPTION',
            detail: String(insertError)
          },
          500
        );
      }

      // Step 3: fallback readback if insert did not return a row or conflict happened
      if (!row) {
        const select2 = await getMemberVaultRowMaybeSingle(SUPA_URL, SERVICE_KEY, username);
        if (!select2.ok) {
          return jsonResponse(
            {
              ok: false,
              step: 'readback',
              error: select2.error,
              detail: select2.detail || null
            },
            select2.status || 500
          );
        }

        row = select2.row;

        if (!row) {
          return jsonResponse(
            {
              ok: false,
              step: 'insert_debug',
              status: createRes ? createRes.status : 500,
              statusText: createRes ? createRes.statusText : 'NO_RESPONSE',
              body: bodyText,
              note: 'Insert did not produce a usable row'
            },
            500
          );
        }
      }
    }

    // Step 4: verify identity after bootstrap
    const identityOk = await verifyIdentity(SUPA_URL, SERVICE_KEY, username, ph);
    if (!identityOk) {
      return jsonResponse(
        { ok: false, step: 'auth', error: 'Authentication failed.' },
        401
      );
    }

    // Step 5: tick logic
    const tickResult = await tickMemberVaultFlow(SUPA_URL, SERVICE_KEY, row);
    if (!tickResult.ok) {
      return jsonResponse(
        { ok: false, step: 'tick', error: tickResult.error || 'Could not persist vault flow tick.' },
        500
      );
    }

    return jsonResponse({ ok: true, ...tickResult.snapshot }, 200);
  } catch (err) {
    return jsonResponse(
      { ok: false, step: 'catch', error: String(err) },
      500
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function normalizeUsername(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '');
}

async function verifyIdentity(supabaseUrl, serviceKey, username, ph) {
  if (!username || !ph) return false;

  const u = normalizeUsername(username);
  if (!u) return false;

  const filter =
    `username=eq.${encodeURIComponent(u)}` +
    `&password_hash=eq.${encodeURIComponent(ph)}` +
    `&select=username`;

  const res = await supabaseFetch(
    supabaseUrl,
    serviceKey,
    'GET',
    `/rest/v1/member_accounts?${filter}`,
    null
  );

  if (!res.ok) return false;

  try {
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function getMemberVaultRowMaybeSingle(supabaseUrl, serviceKey, username) {
  const u = normalizeUsername(username);

  if (!u) {
    return {
      ok: false,
      status: 400,
      error: 'Missing username'
    };
  }

  const path =
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(u)}` +
    `&select=id,username,display_name,platform_id,veil_level,veil_state,credits_balance,flow_last_tick_at,flow_last_day,flow_earned_today,flow_rate_per_min` +
    `&limit=1`;

  let res;
  try {
    res = await supabaseFetch(supabaseUrl, serviceKey, 'GET', path, null);
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: 'Fetch failed',
      detail: String(err)
    };
  }

  if (!res.ok) {
    let errText = '';
    try {
      errText = await res.text();
    } catch {
      errText = '';
    }

    return {
      ok: false,
      status: res.status,
      error: 'Supabase lookup failed',
      detail: errText
    };
  }

  try {
    const rows = await res.json();
    return {
      ok: true,
      row: Array.isArray(rows) && rows.length > 0 ? rows[0] : null
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: 'JSON parse error',
      detail: String(err)
    };
  }
}

async function tickMemberVaultFlow(supabaseUrl, serviceKey, row) {
  if (!row || !row.username) {
    return { ok: false, error: 'Member row not found.' };
  }

  const veilLevel = Number(row.veil_level || 1);
  const veilTier = getVeilTier(veilLevel);

  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = utcDayKey(now);

  const balance = Math.max(0, Number(row.credits_balance || 0));
  let earnedToday = Math.max(0, Number(row.flow_earned_today || 0));

  const storedDay = String(row.flow_last_day || '').slice(0, 10);
  if (!storedDay || storedDay !== todayKey) {
    earnedToday = 0;
  }

  const lastTickRaw = String(row.flow_last_tick_at || '');
  const lastTickMs = lastTickRaw ? Date.parse(lastTickRaw) : Date.now();
  const nowMs = Date.now();

  const elapsedMs = nowMs - (Number.isFinite(lastTickMs) ? lastTickMs : nowMs);
  if (elapsedMs < FLOW_TICK_INTERVAL_MS) {
    return { ok: false, error: 'Tick too soon. Wait at least 15 seconds between ticks.' };
  }

  let elapsedMin = Math.max(0, elapsedMs / 60000);
  elapsedMin = Math.min(elapsedMin, FLOW_MAX_ELAPSED_MIN);

  const flowRate = toFixedNumber(Number(row.flow_rate_per_min || 0), 4);
  const tickSeconds = elapsedMs / 1000;
  const generated = toFixedNumber((flowRate / 60) * tickSeconds * veilTier.multiplier, 4);

  let cappedGenerated = generated;
  if (veilTier.cap != null) {
    const remaining = Math.max(0, Number(veilTier.cap) - earnedToday);
    cappedGenerated = Math.min(generated, remaining);
  }

  const nextEarned = toFixedNumber(earnedToday + cappedGenerated, 4);
  const nextBalance = toFixedNumber(balance + cappedGenerated, 4);

  const patchBody = {
    credits_balance: nextBalance,
    flow_last_tick_at: nowIso,
    flow_last_day: todayKey,
    flow_earned_today: nextEarned,
    flow_rate_per_min: flowRate
  };

  const writePath =
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(normalizeUsername(row.username))}`;

  const writeRes = await supabaseFetch(
    supabaseUrl,
    serviceKey,
    'PATCH',
    writePath,
    patchBody
  );

  if (!writeRes.ok) {
    let errText = '';
    try {
      errText = await writeRes.text();
    } catch {
      errText = '';
    }

    return {
      ok: false,
      error: `Could not persist vault flow tick.${errText ? ` ${errText}` : ''}`
    };
  }

  const mergedRow = {
    ...row,
    ...patchBody
  };

  return {
    ok: true,
    row: mergedRow,
    snapshot: vaultSnapshotFromRow(
      mergedRow,
      veilTier,
      cappedGenerated,
      elapsedMin,
      nowIso
    )
  };
}

function vaultSnapshotFromRow(row, veilTier, generated, elapsedMinutes, tickedAt) {
  return {
    credits_balance: toFixedNumber(Math.max(0, Number(row && row.credits_balance || 0)), 4),
    flow_rate_per_min: toFixedNumber(Math.max(0, Number(row && row.flow_rate_per_min || 0)), 4),
    flow_earned_today: toFixedNumber(Math.max(0, Number(row && row.flow_earned_today || 0)), 4),
    daily_cap: veilTier.cap,
    veil_level: row && row.veil_level,
    veil_label: veilTier.label,
    veil_multiplier: veilTier.multiplier,
    vault_tier_label: veilTier.label,
    generated: toFixedNumber(generated || 0, 4),
    elapsed_minutes: toFixedNumber(elapsedMinutes || 0, 4),
    ticked_at: tickedAt || new Date().toISOString()
  };
}

function toFixedNumber(value, digits) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function utcDayKey(date) {
  const d = date instanceof Date ? date : new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function supabaseFetch(supabaseUrl, serviceKey, method, urlPath, jsonBody) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  return fetch(`${supabaseUrl}${urlPath}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
// Ensure all blocks are properly closed
/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — Member Vault Flow Tick
 *  functions/api/member/vault-flow-tick.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/member/vault-flow-tick
 *  Body: { username, ph }
 *
 *  Economy model:
 *    - credits_balance is the real Signal Coin (SC) balance
 *    - veil is a progression/tier/rate, not a spendable balance
 *    - pulse is staged/not implemented
 * ============================================================
 */


const FLOW_BASE_SC_PER_MIN = 0.2;
const FLOW_MAX_ELAPSED_MIN = 10;
const FLOW_TICK_INTERVAL_MS = 15000;

// Import centralized Veil config
import { getVeilTier } from './veil-tiers.js';

export async function onRequestPost(context) {
  console.log("vault-flow-tick hit");
  const { request, env } = context;
  try {
    const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPA_URL = env.SUPABASE_URL;
    if (!SERVICE_KEY || !SUPA_URL) {
      console.error('[vault-flow-tick] Missing server credentials:', { SERVICE_KEY, SUPA_URL });
      return jsonResponse({ ok: false, error: 'Server credentials not configured.' }, 503);
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return jsonResponse({ ok: false, step: 'body', error: 'Invalid request body.' }, 400);
    }

    const usernameRaw = body && body.username;
    const ph = String((body && body.ph) || '').trim();
    const username = String(usernameRaw || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
    if (!username || !ph) {
      return jsonResponse({ ok: false, step: 'input', error: 'Missing username/ph.' }, 400);
    }

    // Step 1: Try to fetch member row
    let row = null;
    try {
      row = await getMemberVaultRow(SUPA_URL, SERVICE_KEY, username);
    } catch (err) {
      return jsonResponse({ ok: false, step: 'select1', error: 'Initial select failed', detail: String(err) }, 500);
    }
    if (!row) {
      // Step 2: Insert minimal valid row
      let createRes, bodyText, insertRow;
      try {
        createRes = await fetch(
          `${SUPA_URL}/rest/v1/member_accounts`,
          {
            method: 'POST',
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation'
            },
            body: JSON.stringify({
              username,
              display_name: username,
              credits_balance: 0,
              veil_level: 1,
              flow_rate_per_min: 0.2,
              password_hash: ph,
              plan_type: 'free',
              member_status: 'free'
            })
          }
        );
        bodyText = await createRes.text();
        if (createRes.ok) {
          // Try to parse the returned row
          try {
            const parsed = JSON.parse(bodyText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              insertRow = parsed[0];
              row = insertRow;
            }
          } catch (parseErr) {
            // Parsing failed, surface error for debug
            return jsonResponse({
              ok: false,
              step: 'insert_return_parse',
              error: 'Could not parse insert return row',
              detail: String(parseErr),
              body: bodyText
            }, 500);
          }
        } else if (createRes.status === 409) {
          // Duplicate conflict: row likely exists, continue to readback
          // (do not return error, proceed to next step)
        } else {
          return jsonResponse({
            ok: false,
            step: 'insert',
            error: "AUTO_CREATE_FAILED",
            status: createRes.status,
            statusText: createRes.statusText,
            body: bodyText
          }, 500);
        }
      } catch (insertError) {
        return jsonResponse({
          ok: false,
          step: 'insert',
          error: "AUTO_CREATE_EXCEPTION",
          detail: String(insertError)
        }, 500);
      }
      // Step 3: Use returned row if available, else fallback to SELECT
      if (!row) {
        // Expose full insert debug info if row is still missing after insert
        return jsonResponse({
          ok: false,
          step: 'insert_debug',
          status: createRes.status,
          statusText: createRes.statusText,
          body: bodyText,
          note: 'Insert did not produce a usable row'
        }, 500);
      }
    }

    // Step 4: Tick business logic
    const tickResult = await tickMemberVaultFlow(SUPA_URL, SERVICE_KEY, row);
    if (!tickResult.ok) {
      console.error('[vault-flow-tick] Tick failed:', tickResult.error);
      return jsonResponse({ ok: false, error: tickResult.error || 'Could not persist vault flow tick.' }, 500);
    }

    return jsonResponse({ ok: true, ...tickResult.snapshot }, 200);
  } catch (err) {
    return jsonResponse({ ok: false, step: 'catch', error: String(err) }, 500);
  }
  const path = `/rest/v1/member_accounts?username=eq.${encodeURIComponent(u)}&select=id,username,display_name,platform_id,veil_level,veil_state,credits_balance,flow_last_tick_at,flow_last_day,flow_earned_today,flow_rate_per_min&limit=1`
  const res = await supabaseFetch(supabaseUrl, serviceKey, 'GET', path, null)
  if (!res.ok) return null
  try {
    const rows = await res.json()
    return Array.isArray(rows) && rows.length ? rows[0] : null
  } catch {
    return null
  }
}

async function tickMemberVaultFlow(supabaseUrl, serviceKey, row) {
  if (!row || !row.username) return { ok: false, error: 'Member row not found.' }

  // Centralized veil tier
  const veilLevel = Number(row && row.veil_level);
  const veilTier = getVeilTier(veilLevel);
  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = utcDayKey(now);

  const balance = Math.max(0, Number(row.credits_balance || 0) || 0);
  let earnedToday = Math.max(0, Number(row.flow_earned_today || 0) || 0);
  const storedDay = String(row.flow_last_day || '').slice(0, 10);
  if (!storedDay || storedDay !== todayKey) earnedToday = 0;

  const lastTickRaw = String(row.flow_last_tick_at || '');
  const lastTickMs = lastTickRaw ? Date.parse(lastTickRaw) : Date.now();
  const nowMs = Date.now();
  const elapsedMs = nowMs - (Number.isFinite(lastTickMs) ? lastTickMs : nowMs);
  // Enforce tick interval: must be >= 15s
  if (elapsedMs < FLOW_TICK_INTERVAL_MS) {
    return { ok: false, error: 'Tick too soon. Wait at least 15 seconds between ticks.' };
          const lookup = await getMemberVaultRowMaybeSingle(SUPA_URL, SERVICE_KEY, username);
          if (!lookup.ok) {
            return jsonResponse({ ok: false, step: 'select1', error: lookup.error, detail: lookup, status: lookup.status || 500 }, lookup.status || 500);
          }
          row = lookup.row;
  let elapsedMin = Math.max(0, elapsedMs / 60000);
  elapsedMin = Math.min(elapsedMin, FLOW_MAX_ELAPSED_MIN);

  // Earning formula: (flow_rate_per_min / 60) * tick_seconds * veil_multiplier
  const flowRate = toFixedNumber(Number(row.flow_rate_per_min || 0), 4);
  const tickSeconds = elapsedMs / 1000;
  const generated = toFixedNumber((flowRate / 60) * tickSeconds * veilTier.multiplier, 4);

  // Daily cap enforcement
  let cappedGenerated = generated;
  if (veilTier.cap != null) {
    const remaining = Math.max(0, Number(veilTier.cap) - earnedToday);
    cappedGenerated = Math.min(generated, remaining);
  }

  const nextEarned = toFixedNumber(earnedToday + cappedGenerated, 4);
  const nextBalance = toFixedNumber(balance + cappedGenerated, 4);
  const mergedRow = {
    ...row,
    credits_balance: nextBalance,
    flow_last_tick_at: nowIso,
    flow_last_day: todayKey,
    flow_earned_today: nextEarned,
    flow_rate_per_min: flowRate,
  };

  const patchBody = {
    credits_balance: nextBalance,
    flow_last_tick_at: nowIso,
    flow_last_day: todayKey,
    flow_earned_today: nextEarned,
    flow_rate_per_min: flowRate,
  };

  const writePath = `/rest/v1/member_accounts?username=eq.${encodeURIComponent(String(row.username || '').toLowerCase())}`;
  const writeRes = await supabaseFetch(supabaseUrl, serviceKey, 'PATCH', writePath, patchBody);
  if (!writeRes.ok) {
    return { ok: false, error: 'Could not persist vault flow tick.' };
  }

  return {
    ok: true,
    row: mergedRow,
    snapshot: vaultSnapshotFromRow(mergedRow, veilTier, cappedGenerated, elapsedMin, nowIso),
  };
}


// No longer needed: veil logic is now in veil-tiers.js


function vaultSnapshotFromRow(row, veilTier, generated, elapsedMinutes, tickedAt) {
  return {
    credits_balance: toFixedNumber(Math.max(0, Number(row && row.credits_balance || 0) || 0), 4),
    flow_rate_per_min: toFixedNumber(Math.max(0, Number(row && row.flow_rate_per_min || 0)), 4),
    flow_earned_today: toFixedNumber(Math.max(0, Number(row && row.flow_earned_today || 0) || 0), 4),
    daily_cap: veilTier.cap,
    veil_level: row && row.veil_level,
    veil_label: veilTier.label,
    veil_multiplier: veilTier.multiplier,
    vault_tier_label: veilTier.label,
    generated: toFixedNumber(generated || 0, 4),
    elapsed_minutes: toFixedNumber(elapsedMinutes || 0, 4),
    ticked_at: tickedAt || new Date().toISOString(),
  };
}

function toFixedNumber(value, digits) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  const p = Math.pow(10, digits)
  return Math.round(n * p) / p
}

function utcDayKey(date) {
  const d = date instanceof Date ? date : new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function supabaseFetch(supabaseUrl, serviceKey, method, urlPath, jsonBody) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  return fetch(`${supabaseUrl}${urlPath}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  })
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
