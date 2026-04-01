// /functions/api/member/sites/current.ts
import { getSupabaseClient, getUserFromRequest } from '../../../_utils';

export async function onRequest(context) {
  const user = await getUserFromRequest(context);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const supabase = getSupabaseClient(context.env);
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('account_id', user.account_id)
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}
