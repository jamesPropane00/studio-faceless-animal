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

      try {
        const createRes = await supabaseFetch(
          SUPA_URL,
          SERVICE_KEY,
          'POST',
          '/rest/v1/member_accounts',
          {
            username,
            display_name: username,
            credits_balance: 0,
            veil_level: 1,
            flow_rate_per_min: 0.2
          }
        );
        if (!createRes.ok) {
          let errText = '';
          try { errText = await createRes.text(); } catch {}
          console.error('[vault-flow-tick] Failed to auto-create member row for:', username, errText);
        }
      } catch (insertError) {
        console.error("member insert failed:", insertError);
      }
          SUPA_URL,
          SERVICE_KEY,
          'POST',
          '/rest/v1/member_accounts',
          {
            username,
            display_name: username,
            credits_balance: 0,
            veil_level: 1,
            veil_state: 'active',
            flow_last_tick_at: new Date().toISOString(),
            flow_last_day: new Date().toISOString().slice(0, 10),
            flow_earned_today: 0,
            flow_rate_per_min: 0.2
          }
        );
        if (!createRes.ok) {
          console.error('[vault-flow-tick] Failed to auto-create member row for:', username);
        }
      } catch (insertError) {
        console.error("member insert failed:", insertError);
      }
      // Try to fetch again
      row = await getMemberVaultRow(SUPA_URL, SERVICE_KEY, username);
      if (!row) {
        console.error('[vault-flow-tick] Member row still not found after auto-create:', username);
        return jsonResponse({ ok: false, error: 'Member row not found after auto-create.' }, 500);
      }
    }

    const tickResult = await tickMemberVaultFlow(SUPA_URL, SERVICE_KEY, row);
    if (!tickResult.ok) {
      console.error('[vault-flow-tick] Tick failed:', tickResult.error);
      return jsonResponse({ ok: false, error: tickResult.error || 'Could not persist vault flow tick.' }, 500);
    }

    return jsonResponse({ ok: true, ...tickResult.snapshot }, 200);
      try {
        const createRes = await fetch(
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
        const bodyText = await createRes.text();
        if (!createRes.ok) {
          return jsonResponse({
            ok: false,
            error: "AUTO_CREATE_FAILED",
            status: createRes.status,
            statusText: createRes.statusText,
            body: bodyText
          }, 500);
        }
      } catch (insertError) {
        return jsonResponse({
          ok: false,
          error: "AUTO_CREATE_EXCEPTION",
          detail: String(insertError)
        }, 500);
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
  }
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
