import { createClient } from '@supabase/supabase-js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 25 * 1024 * 1024;

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

function clean(value, limit = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function optional(value, limit = 255) {
  return clean(value, limit) || null;
}

function cents(value) {
  const normalized = String(value ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}

function safeFilename(value) {
  const name = clean(value || 'photo', 120).replace(/[^a-z0-9._-]/gi, '-');
  return name.replace(/-+/g, '-') || 'photo';
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function submissionCount(admin, fingerprint, since) {
  const [sell, request] = await Promise.all([
    admin.from('market_sell_submissions').select('id', { count: 'exact', head: true })
      .eq('request_fingerprint', fingerprint).gte('created_at', since),
    admin.from('market_buyer_requests').select('id', { count: 'exact', head: true })
      .eq('request_fingerprint', fingerprint).gte('created_at', since),
  ]);
  if (sell.error || request.error) throw sell.error || request.error;
  return Number(sell.count || 0) + Number(request.count || 0);
}

function databaseError(error) {
  if (error?.code === '42P01' || /market_(seller|sell|buyer)/i.test(String(error?.message || ''))) {
    return json({ error: 'The Market database migration has not been installed yet.' }, 503);
  }
  return json({ error: 'The Market could not save this submission right now.' }, 500);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);
  const configuredOrigin = String(env.SHOP_ORIGIN || requestUrl.origin).replace(/\/+$/, '');
  const origin = request.headers.get('origin');
  if (origin && origin !== configuredOrigin && origin !== requestUrl.origin) {
    return json({ error: 'Request origin is not allowed.' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 30 * 1024 * 1024) return json({ error: 'The upload is too large.' }, 413);

  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Market intake is not configured.' }, 503);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Submit the Market form again.' }, 400);
  }
  if (clean(form.get('website'), 200)) return json({ ok: true, reference: 'RECEIVED' });

  const type = clean(form.get('type'), 20);
  if (!['seller_application', 'sell', 'request'].includes(type)) {
    return json({ error: 'Invalid Market submission type.' }, 400);
  }
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const salt = String(env.MARKET_INTAKE_SALT || serviceKey.slice(-32));
  const fingerprint = await sha256(`${salt}|${ip}|${userAgent.slice(0, 160)}`);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const username = clean(form.get('submitted_by_username'), 40).toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const sessionHash = clean(form.get('session_hash'), 255);
  if (!username || !sessionHash) {
    return json({ error: 'Sign in with your Faceless Animal account before using the Market.' }, 401);
  }
  const { data: member, error: memberError } = await admin.from('member_accounts')
    .select('username').eq('username', username).eq('password_hash', sessionHash).maybeSingle();
  if (memberError || !member) {
    return json({ error: 'Your website login could not be verified. Sign in again.' }, 401);
  }

  try {
    const count = await submissionCount(
      admin,
      fingerprint,
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    );
    if (count >= 6) return json({ error: 'Too many submissions. Try again in about an hour.' }, 429);
  } catch (error) {
    return databaseError(error);
  }

  if (type === 'seller_application') {
    const sellerHandle = clean(form.get('seller_handle'), 40).toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    const accountType = clean(form.get('account_type'), 20);
    const legalName = clean(form.get('legal_name'), 160);
    const businessName = optional(form.get('business_name'), 180);
    const birthDate = clean(form.get('date_of_birth'), 10);
    const email = clean(form.get('contact_email'), 254).toLowerCase();
    const phone = clean(form.get('contact_phone'), 40);
    const addressLine1 = clean(form.get('address_line1'), 180);
    const addressLine2 = optional(form.get('address_line2'), 180);
    const city = clean(form.get('city'), 100);
    const region = clean(form.get('region'), 80).toUpperCase();
    const postalCode = clean(form.get('postal_code'), 10);
    const termsAccepted = form.get('terms_accepted') === 'yes';
    const informationCertified = form.get('information_certified') === 'yes';
    const birth = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(`${birthDate}T00:00:00Z`) : null;
    const adultCutoff = new Date();
    adultCutoff.setUTCFullYear(adultCutoff.getUTCFullYear() - 18);
    if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(sellerHandle)) {
      return json({ error: 'Choose a seller handle with 3–40 letters, numbers, underscores, or dashes.' }, 400);
    }
    if (!['individual', 'business'].includes(accountType) || legalName.length < 2 ||
        !birth || Number.isNaN(birth.getTime()) || birth > adultCutoff) {
      return json({ error: 'Enter the legal account details. Sellers must be at least 18.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 7 ||
        addressLine1.length < 3 || city.length < 2 || region.length < 2 ||
        !/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
      return json({ error: 'Enter a valid email, phone number, and complete U.S. address.' }, 400);
    }
    if (!termsAccepted || !informationCertified) {
      return json({ error: 'Accept the seller terms and certify that the information is accurate.' }, 400);
    }
    const { data: existingSeller, error: existingSellerError } = await admin.from('market_seller_accounts')
      .select('id,status,seller_code').eq('username', member.username).maybeSingle();
    if (existingSellerError) return databaseError(existingSellerError);
    if (existingSeller?.status === 'approved') {
      return json({ error: 'Your seller account is already approved. Contact support to change legal information.' }, 409);
    }
    if (existingSeller?.status === 'suspended' || existingSeller?.status === 'closed') {
      return json({ error: 'This seller account cannot be changed through the application form.' }, 403);
    }
    const sellerRecord = {
      username: member.username,
      seller_handle: sellerHandle,
      status: 'pending',
      account_type: accountType,
      legal_name: legalName,
      business_name: businessName,
      date_of_birth: birthDate,
      contact_email: email,
      contact_phone: phone,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      region,
      postal_code: postalCode,
      country_code: 'US',
      terms_version: 'underground-market-seller-v1',
      terms_accepted_at: new Date().toISOString(),
      information_certified_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
    };
    const query = existingSeller
      ? admin.from('market_seller_accounts').update(sellerRecord).eq('id', existingSeller.id)
      : admin.from('market_seller_accounts').insert(sellerRecord);
    const { data: seller, error: sellerError } = await query.select('seller_code,status').single();
    if (sellerError) {
      if (sellerError.code === '23505') return json({ error: 'That seller handle is already taken.' }, 409);
      return databaseError(sellerError);
    }
    return json({
      ok: true,
      reference: seller.seller_code,
      status: seller.status,
      message: 'Your seller application is private and awaiting administrator review.',
    }, existingSeller ? 200 : 201);
  }

  const contactName = clean(form.get('contact_name'), 120);
  const contactEmail = clean(form.get('contact_email'), 254).toLowerCase();
  const contactPhone = optional(form.get('contact_phone'), 40);
  const zipCode = clean(form.get('zip_code'), 10);
  if (contactName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return json({ error: 'Enter your name and a valid email address.' }, 400);
  }
  if (!/^\d{5}(?:-\d{4})?$/.test(zipCode)) return json({ error: 'Enter a valid U.S. ZIP code.' }, 400);

  if (type === 'request') {
    const productName = clean(form.get('product_name'), 180);
    const budget = cents(form.get('maximum_budget'));
    const conditionPreference = clean(form.get('condition_preference'), 20);
    const fulfillmentPreference = clean(form.get('fulfillment_preference'), 20);
    if (productName.length < 2 || budget === null || budget < 1) {
      return json({ error: 'Enter what you need and a maximum budget.' }, 400);
    }
    if (!['new', 'used', 'either'].includes(conditionPreference) ||
        !['local', 'shipping', 'either'].includes(fulfillmentPreference)) {
      return json({ error: 'Choose valid condition and delivery preferences.' }, 400);
    }
    const { data, error } = await admin.from('market_buyer_requests').insert({
      product_name: productName,
      description: optional(form.get('description'), 4000),
      maximum_budget_cents: budget,
      condition_preference: conditionPreference,
      fulfillment_preference: fulfillmentPreference,
      zip_code: zipCode,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      submitted_by_username: member.username,
      request_fingerprint: fingerprint,
    }).select('reference_code').single();
    if (error) return databaseError(error);
    return json({
      ok: true,
      reference: data.reference_code,
      message: 'Your buyer request is in the review queue.',
    }, 201);
  }

  const itemName = clean(form.get('item_name'), 180);
  const category = clean(form.get('category'), 100);
  const itemCondition = clean(form.get('item_condition'), 80);
  const sellingMode = clean(form.get('selling_mode'), 30);
  const desiredPriceText = clean(form.get('desired_price'), 30);
  const desiredPrice = desiredPriceText ? cents(desiredPriceText) : null;
  if (itemName.length < 2 || category.length < 2 || itemCondition.length < 2) {
    return json({ error: 'Enter the item name, category, and condition.' }, 400);
  }
  if (!['list_it', 'listing_help', 'sell_fast'].includes(sellingMode)) {
    return json({ error: 'Choose how you want to sell the item.' }, 400);
  }
  if (desiredPriceText && desiredPrice === null) return json({ error: 'Enter a valid desired price.' }, 400);
  const { data: sellerAccount, error: sellerAccountError } = await admin.from('market_seller_accounts')
    .select('id,status').eq('username', member.username).maybeSingle();
  if (sellerAccountError) return databaseError(sellerAccountError);
  if (!sellerAccount || sellerAccount.status !== 'approved') {
    return json({ error: 'Your seller account must be approved before you can submit an item.' }, 403);
  }

  const photos = form.getAll('photos').filter((entry) => entry instanceof File && entry.size > 0);
  if (!photos.length || photos.length > 5) return json({ error: 'Upload between 1 and 5 item photos.' }, 400);
  const totalBytes = photos.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) return json({ error: 'The combined photos must be 25 MB or less.' }, 413);
  for (const photo of photos) {
    if (!IMAGE_TYPES.has(photo.type) || photo.size > MAX_IMAGE_BYTES) {
      return json({ error: 'Photos must be JPEG, PNG, WebP, or AVIF and no larger than 8 MB each.' }, 400);
    }
  }

  const { data: submission, error: insertError } = await admin.from('market_sell_submissions').insert({
    seller_account_id: sellerAccount.id,
    selling_mode: sellingMode,
    item_name: itemName,
    category,
    item_condition: itemCondition,
    item_size: optional(form.get('item_size'), 80),
    description: optional(form.get('description'), 4000),
    desired_price_cents: desiredPrice,
    zip_code: zipCode,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    submitted_by_username: member.username,
    request_fingerprint: fingerprint,
  }).select('id,reference_code').single();
  if (insertError) return databaseError(insertError);

  const uploadedPaths = [];
  try {
    const imageRows = [];
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const path = `${submission.id}/${String(index + 1).padStart(2, '0')}-${crypto.randomUUID()}-${safeFilename(photo.name)}`;
      const { error: uploadError } = await admin.storage.from('market-intake').upload(path, photo, {
        contentType: photo.type,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      imageRows.push({
        submission_id: submission.id,
        storage_path: path,
        original_filename: safeFilename(photo.name),
        mime_type: photo.type,
        size_bytes: photo.size,
        sort_order: index,
      });
    }
    const { error: imageError } = await admin.from('market_sell_images').insert(imageRows);
    if (imageError) throw imageError;
  } catch (error) {
    if (uploadedPaths.length) await admin.storage.from('market-intake').remove(uploadedPaths);
    await admin.from('market_sell_submissions').delete().eq('id', submission.id);
    console.error('Market image upload failed', error);
    return json({ error: 'The photos could not be saved. Try smaller images or try again.' }, 500);
  }

  return json({
    ok: true,
    reference: submission.reference_code,
    message: 'Your item is in the private review queue. It is not public yet.',
  }, 201);
}

export async function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}
