// /functions/api/member/pages/list.ts
import { getSupabaseClient, getUserFromRequest } from '../../../_utils';

export async function onRequest(context) {
  const user = await getUserFromRequest(context);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const supabase = getSupabaseClient(context.env);
  // Get site_id for this user
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id')
    .eq('account_id', user.account_id)
    .single();
  if (siteError || !site) return new Response('Site not found', { status: 404 });
  // List all pages for this site
  const { data, error } = await supabase
    .from('site_pages')
    .select('*')
    .eq('site_id', site.id)
    .order('sort_order', { ascending: true });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}
