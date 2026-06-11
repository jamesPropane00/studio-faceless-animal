/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — STORAGE SERVICE
 *  assets/js/services/storage.js
 *
 *  Central upload service for all creator media on the platform.
 *  Wraps Supabase Storage with consistent path conventions,
 *  file validation, and a uniform { url, path, error } return shape.
 *
 *  BUCKET: creator-media   (public read, authenticated write)
 *  PATH STRUCTURE:
 *    creator-media/{username}/avatar/{timestamp}_{filename}   → profile picture
 *    creator-media/{username}/cover/{timestamp}_{filename}    → page cover image
 *    creator-media/{username}/board/{timestamp}_{filename}    → board post image
 *
 *  CONSUMERS (current):
 *    admin.js — admin-triggered avatar/cover updates on profiles
 *
 *  CONSUMERS (planned):
 *    creator dashboard — self-service uploads
 *    board-post form   — attach image to a board post
 *    page-renderer.js  — reads cover_image_url from profile/metadata_json
 *
 *  SCHEMA COLUMNS WRITTEN:
 *    profiles.avatar_url       — set via updateProfileAvatar()
 *    profiles.cover_image_url  — set via updateProfileCover()
 *    board_posts.image_url     — caller sets after uploadBoardImage() succeeds
 *    pages.metadata_json.cover_image_url — caller sets via updatePageMeta()
 *
 *  STORAGE BUCKET SETUP:
 *    Run supabase/migrations/010_creator_media_storage.sql in Supabase SQL Editor.
 *    Then create the `creator-media` bucket in Supabase Storage UI:
 *      Storage → New bucket → name: creator-media → Public: ON
 *
 *  INTAKE FORM UPLOADS:
 *    The existing `profile-images` bucket (migration 005) and
 *    uploadProfileImage() in submissions.js are NOT replaced here.
 *    Intake form uploads go to profile-images/{username}/{filename}.
 *    This service is for post-approval creator media only.
 * ============================================================
 */

import { supabase, SUPABASE_READY } from '../supabase-client.js'


// ── CONSTANTS ──────────────────────────────────────────────────
export const BUCKET = 'creator-media'

/** Media type keys — used as path segments and as identifiers */
export const MEDIA_TYPE = {
  AVATAR: 'avatar',
  COVER:  'cover',
  BOARD:  'board',
}

/** Accepted image MIME types */
const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])

/** Max file size per media type (in bytes) */
const MAX_SIZE = {
  [MEDIA_TYPE.AVATAR]: 5 * 1024 * 1024,   // 5 MB — profile picture
  [MEDIA_TYPE.COVER]:  10 * 1024 * 1024,  // 10 MB — cover image (wider crop)
  [MEDIA_TYPE.BOARD]:  8 * 1024 * 1024,   // 8 MB  — board post image
}


// ── INTERNAL HELPERS ───────────────────────────────────────────

function notReady(fn) {
  return { url: null, path: null, error: new Error(`[FAS] storage.${fn}(): Supabase not configured.`) }
}

/**
 * Sanitize a filename to be URL-safe.
 * Replaces spaces and special chars, lowercases the result.
 */
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.\-_]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/**
 * Build the storage path for a given username and media type.
 * Prefixes the filename with a timestamp to bust cache on re-upload.
 *
 * @param {string} username  - profile username (URL slug)
 * @param {string} mediaType - one of MEDIA_TYPE values
 * @param {string} filename  - original File.name
 * @returns {string} e.g. "djfaceless/avatar/1741234567890_profile.jpg"
 */
function buildPath(username, mediaType, filename) {
  const ts = Date.now()
  const safe = sanitizeFilename(filename)
  return `${username}/${mediaType}/${ts}_${safe}`
}

/**
 * Validate a File object before uploading.
 *
 * @param {File}   file       - browser File object
 * @param {string} mediaType  - one of MEDIA_TYPE values
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateFile(file, mediaType) {
  if (!file) return { valid: false, error: 'No file provided.' }

  if (!ACCEPTED_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" not accepted. Use JPEG, PNG, WebP, or GIF.`,
    }
  }

  const maxBytes = MAX_SIZE[mediaType] || 5 * 1024 * 1024
  if (file.size > maxBytes) {
    const maxMB = maxBytes / (1024 * 1024)
    const fileMB = (file.size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `File is ${fileMB} MB — max allowed for ${mediaType} is ${maxMB} MB.`,
    }
  }

  return { valid: true, error: null }
}

/**
 * Core upload function.
 * Validates → uploads to Supabase Storage → returns public URL.
 *
 * @param {string} username  - profile username
 * @param {string} mediaType - one of MEDIA_TYPE values
 * @param {File}   file      - browser File object
 * @returns {Promise<{ url: string|null, path: string|null, error: Error|null }>}
 */
async function uploadMedia(username, mediaType, file) {
  if (!SUPABASE_READY) return notReady('uploadMedia')
  if (!username) return { url: null, path: null, error: new Error('[FAS] storage: username is required') }

  const { valid, error: validErr } = validateFile(file, mediaType)
  if (!valid) return { url: null, path: null, error: new Error(`[FAS] storage: ${validErr}`) }

  const storagePath = buildPath(username, mediaType, file.name)

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: true, cacheControl: '3600' })

  if (uploadError) {
    console.error(`[FAS] storage.upload(${mediaType}) error:`, uploadError.message)
    return { url: null, path: storagePath, error: uploadError }
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  return { url: publicUrl, path: storagePath, error: null }
}


// ── PUBLIC API ─────────────────────────────────────────────────

/**
 * Upload a profile avatar.
 * After success, call updateProfileAvatar(profileId, url) to persist the URL.
 *
 * @param {string} username - profile username (used as folder path)
 * @param {File}   file     - image file from a file input
 * @returns {Promise<{ url: string|null, path: string|null, error: Error|null }>}
 *
 * Storage path: creator-media/{username}/avatar/{timestamp}_{filename}
 */
export async function uploadAvatar(username, file) {
  return uploadMedia(username, MEDIA_TYPE.AVATAR, file)
}


/**
 * Upload a page cover image.
 * After success, call updateProfileCover(profileId, url) or set
 * pages.metadata_json.cover_image_url via admin.
 *
 * @param {string} username - profile username (used as folder path)
 * @param {File}   file     - image file from a file input
 * @returns {Promise<{ url: string|null, path: string|null, error: Error|null }>}
 *
 * Storage path: creator-media/{username}/cover/{timestamp}_{filename}
 */
export async function uploadCover(username, file) {
  return uploadMedia(username, MEDIA_TYPE.COVER, file)
}


/**
 * Upload a board post image.
 * After success, set board_posts.image_url = url when saving the post.
 *
 * @param {string} username - profile username (used as folder path)
 * @param {File}   file     - image file from a file input
 * @returns {Promise<{ url: string|null, path: string|null, error: Error|null }>}
 *
 * Storage path: creator-media/{username}/board/{timestamp}_{filename}
 */
export async function uploadBoardImage(username, file) {
  return uploadMedia(username, MEDIA_TYPE.BOARD, file)
}


/**
 * Get the public URL for any file already stored in the creator-media bucket.
 * Use this when you have the stored path and just need the display URL.
 *
 * @param {string} storagePath - path within creator-media bucket
 * @returns {string} Full public HTTPS URL
 */
export function getPublicUrl(storagePath) {
  if (!SUPABASE_READY) return ''
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)
  return publicUrl
}


/**
 * Delete a file from the creator-media bucket.
 * Admin-only — requires authenticated Supabase session.
 *
 * @param {string} storagePath - path within creator-media bucket
 * @returns {Promise<{ error: Error|null }>}
 */
export async function deleteMedia(storagePath) {
  if (!SUPABASE_READY) return { error: new Error('[FAS] storage.deleteMedia(): Supabase not configured.') }
  if (!storagePath) return { error: new Error('[FAS] storage.deleteMedia(): storagePath is required') }

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath])

  if (error) console.error('[FAS] storage.deleteMedia error:', error.message)
  return { error }
}


// ── DB WRITE HELPERS ───────────────────────────────────────────
// Convenience functions to persist the URL to the database after upload.
// These write to the profiles table via the authenticated admin session.

/**
 * Save an uploaded avatar URL to profiles.avatar_url.
 *
 * @param {string} profileId - profiles.id UUID
 * @param {string} url       - public URL returned by uploadAvatar()
 * @returns {Promise<{ error: Error|null }>}
 */
export async function updateProfileAvatar(profileId, url) {
  if (!SUPABASE_READY) return { error: new Error('[FAS] storage: Supabase not configured.') }
  if (!profileId || !url) return { error: new Error('[FAS] storage: profileId and url are required') }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', profileId)

  if (error) console.error('[FAS] updateProfileAvatar error:', error.message)
  return { error }
}


/**
 * Save an uploaded cover URL to profiles.cover_image_url.
 *
 * @param {string} profileId - profiles.id UUID
 * @param {string} url       - public URL returned by uploadCover()
 * @returns {Promise<{ error: Error|null }>}
 */
export async function updateProfileCover(profileId, url) {
  if (!SUPABASE_READY) return { error: new Error('[FAS] storage: Supabase not configured.') }
  if (!profileId || !url) return { error: new Error('[FAS] storage: profileId and url are required') }

  const { error } = await supabase
    .from('profiles')
    .update({ cover_image_url: url })
    .eq('id', profileId)

  if (error) console.error('[FAS] updateProfileCover error:', error.message)
  return { error }
}


/**
 * Save a board image URL to board_posts.image_url.
 *
 * @param {string} postId - board_posts.id UUID
 * @param {string} url    - public URL returned by uploadBoardImage()
 * @returns {Promise<{ error: Error|null }>}
 */
export async function updateBoardPostImage(postId, url) {
  if (!SUPABASE_READY) return { error: new Error('[FAS] storage: Supabase not configured.') }
  if (!postId || !url) return { error: new Error('[FAS] storage: postId and url are required') }

  const { error } = await supabase
    .from('board_posts')
    .update({ image_url: url })
    .eq('id', postId)

  if (error) console.error('[FAS] updateBoardPostImage error:', error.message)
  return { error }
}
