/**
 * Cloudflare Pages middleware to protect static assets from function interception.
 * Routes requests for /assets/*, /templates/*, etc. to static files instead of functions.
 */

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const pathname = url.pathname

  // Explicitly skip functions for static assets and static files
  const staticPrefixes = [
    '/assets/',
    '/templates/',
    '/admin/',
    '/artists/',
    '/business/',
    '/artifacts/',
    '/supabase/',
    '/sql/',
    '/scripts/',
  ]

  const isStatic = staticPrefixes.some(prefix => pathname.startsWith(prefix))
    || pathname.match(/\.(html|js|css|json|ico|txt|md|woff|woff2|ttf|png|jpg|jpeg|gif|svg|webp|mp4|mp3)$/i)

  if (isStatic) {
    // Pass through to static file handler (don't intercept)
    return context.next()
  }

  // For everything else (API routes, dynamic pages), continue to functions
  return context.next()
}
