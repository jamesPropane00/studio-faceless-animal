// /functions/api/member/pages/delete.ts
import { getSupabaseClient, getUserFromRequest } from '../../../_utils';

export async function onRequest(context) {
  const user = await getUserFromRequest(context);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = await context.request.json();
  const { page_slug } = body;
  if (!page_slug) return new Response('Missing slug', { status: 400 });
  const supabase = getSupabaseClient(context.env);
  // Get site_id for this user
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id')
    .eq('account_id', user.account_id)
    .single();
  if (siteError || !site) return new Response('Site not found', { status: 404 });
  // Prevent deleting homepage (must reassign first)
  const { data: page } = await supabase
    .from('site_pages')
    .select('is_homepage')
    .eq('site_id', site.id)
    .eq('page_slug', page_slug)
    .single();
  if (page?.is_homepage) return new Response('Cannot delete homepage. Set another page as homepage first.', { status: 400 });
  // Delete page
  const { error } = await supabase
    .from('site_pages')
    .delete()
    .eq('site_id', site.id)
    .eq('page_slug', page_slug);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ success: true });
}
