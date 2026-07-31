-- Permit AVIF uploads in addition to the storefront's existing image formats.
-- The admin browser normally converts AVIF to JPEG for maximum compatibility,
-- while this keeps direct and interrupted upload flows from being rejected.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
]
where id = 'product-images';
