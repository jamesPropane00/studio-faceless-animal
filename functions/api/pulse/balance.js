// Pulse Balance Endpoint
// GET /api/pulse/balance
// Returns: { ok, pulse_balance_cents, pulse_balance }

import { getSupabaseClient, requireUser, jsonResponse } from '../../_shared/backend-utils';

export default async function handler(context) {
  const { env } = context;
  try {
    const user = await requireUser(context);
    if (!user) {
      return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    }
    const supabase = getSupabaseClient(env, { serviceRole: true });
    const { data, error } = await supabase
      .from('pulse_accounts')
      .select('pulse_balance_cents')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      return jsonResponse({ ok: false, error: error.message || 'Failed to load balance.' }, 500);
    }
    const cents = data && typeof data.pulse_balance_cents === 'number' ? data.pulse_balance_cents : 0;
    return jsonResponse({
      ok: true,
      pulse_balance_cents: cents,
      pulse_balance: (cents / 100).toFixed(2),
    });
  } catch {
    return jsonResponse({ ok: false, error: 'Internal server error.' }, 500);
  }
}
