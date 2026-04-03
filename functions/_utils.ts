// /functions/_utils.ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

// Extract user from session (assumes JWT or session cookie, or pass from client)
export async function getUserFromRequest(context) {
  // For demo: use localStorage.fas_user passed as a header (X-FAS-User)
  const userHeader = context.request.headers.get('x-fas-user');
  if (!userHeader) return null;
  try {
    return JSON.parse(userHeader);
  } catch {
    return null;
  }
}
