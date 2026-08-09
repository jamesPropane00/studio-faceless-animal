import { createClient } from '@supabase/supabase-js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function username(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Market accounts are not configured.' }, 503);
  const requestedUsername = username(request.headers.get('x-fas-username'));
  const sessionHash = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!requestedUsername || !sessionHash) return json({ signed_in: false, seller: null }, 401);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: member, error: memberError } = await admin.from('member_accounts')
    .select('username').eq('username', requestedUsername).eq('password_hash', sessionHash).maybeSingle();
  if (memberError || !member) return json({ signed_in: false, seller: null }, 401);
  const { data: seller, error: sellerError } = await admin.from('market_seller_accounts')
    .select('seller_code,seller_handle,status,account_type,identity_status,payout_status,review_notes,created_at,reviewed_at')
    .eq('username', member.username).maybeSingle();
  if (sellerError) {
    if (sellerError.code === '42P01') return json({ error: 'The Market database migration has not been installed yet.' }, 503);
    return json({ error: 'Seller status could not be loaded.' }, 500);
  }
  return json({ signed_in: true, username: member.username, seller: seller || null });
}

export async function onRequestPost() {
  return json({ error: 'Method not allowed.' }, 405);
}
