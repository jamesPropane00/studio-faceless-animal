// /functions/api/member/pages/create.ts
import { getSupabaseClient, getUserFromRequest } from '../../../_utils';

export async function onRequest(context) {
  const user = await getUserFromRequest(context);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = await context.request.json();
  const { page_slug, page_title, template_name, theme_name, is_homepage } = body;
  if (!page_slug || !page_title) return new Response('Missing fields', { status: 400 });
  const supabase = getSupabaseClient(context.env);
  // Get site_id for this user
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id')
    .eq('account_id', user.account_id)
    .single();
  if (siteError || !site) return new Response('Site not found', { status: 404 });
  // If is_homepage, unset others
  if (is_homepage) {
    await supabase.from('site_pages').update({ is_homepage: false }).eq('site_id', site.id);
  }
  // Insert new page
  const { data, error } = await supabase
    .from('site_pages')
    .insert([{
      site_id: site.id,
      account_id: user.account_id,
      signal_id: user.signal_id,
      username: user.username,
      page_slug,
      page_title,
      template_name,
      theme_name,
      is_homepage: !!is_homepage,
      is_published: false
    }])
    .select()
    .single();
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}
