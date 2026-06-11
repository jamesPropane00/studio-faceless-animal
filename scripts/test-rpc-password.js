#!/usr/bin/env node
/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — Password RPC Live Test
 *  scripts/test-rpc-password.js
 *
 *  Runs a 4-step live integration test against the Supabase
 *  password auth RPCs introduced in migration 012.
 *
 *  Usage:
 *    SUPABASE_URL=https://xxx.supabase.co \
 *    SUPABASE_SERVICE_ROLE_KEY=eyJh... \
 *    node scripts/test-rpc-password.js
 *
 *  What it tests:
 *    1. Insert a temporary test user into member_accounts
 *    2. set_member_password(username, hash, salt)  → expect true
 *    3. verify_member_password(username, correct hash) → expect true
 *    4. verify_member_password(username, wrong hash)   → expect false
 *    Cleanup: delete the test user
 *
 *  PBKDF2 parameters match assets/js/auth.js exactly:
 *    iterations: 100,000  |  digest: sha256  |  keylen: 32 bytes
 *    salt: 16 random bytes, base64-encoded
 *    hash: base64-encoded derived key
 * ============================================================
 */

'use strict'
const https  = require('https')
const crypto = require('crypto')

const SUPA_URL = process.env.SUPABASE_URL
const SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPA_URL || !SVC_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const HOST      = new URL(SUPA_URL).hostname
const TEST_USER = 'fas_rpc_test_' + Date.now()
const TEST_PW   = 'TestPassword123!'

// Derive PBKDF2 hash — identical algorithm to assets/js/auth.js
const saltBuf  = crypto.randomBytes(16)
const saltB64  = saltBuf.toString('base64')
const hashBuf  = crypto.pbkdf2Sync(Buffer.from(TEST_PW, 'utf8'), saltBuf, 100_000, 32, 'sha256')
const hashB64  = hashBuf.toString('base64')
const wrongB64 = 'd3JvbmdicGFzc3dvcmRoYXNoYWJjZGVmZ2g='  // intentionally wrong

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const buf = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const req = https.request({
      hostname: HOST, port: 443, path, method,
      headers: {
        'apikey':          SVC_KEY,
        'Authorization':   `Bearer ${SVC_KEY}`,
        'Content-Type':    'application/json',
        'Prefer':          'return=representation',
        ...(buf ? { 'Content-Length': buf.length } : {}),
      }
    }, res => {
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => {
        let json; try { json = JSON.parse(Buffer.concat(chunks)) } catch { json = null }
        resolve({ status: res.statusCode, json, text: Buffer.concat(chunks).toString() })
      })
    })
    req.on('error', reject)
    if (buf) req.write(buf)
    req.end()
  })
}

async function run() {
  let passed = 0, failed = 0
  const pass = (l, d) => { console.log(`  ✓ PASS  ${l}${d ? '  →  ' + d : ''}`); passed++ }
  const fail = (l, d) => { console.error(`  ✗ FAIL  ${l}${d ? '  →  ' + d : ''}`); failed++ }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  verify_member_password RPC — Live Test')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  host: ${HOST}`)
  console.log(`  user: ${TEST_USER}`)
  console.log('')

  // STEP 1: Insert test user
  console.log('STEP 1  Create test user in member_accounts')
  const ins = await request('POST', '/rest/v1/member_accounts', {
    username: TEST_USER, display_name: 'RPC Test', plan_type: 'starter', member_status: 'active'
  })
  ins.status === 201
    ? pass('Row inserted', `HTTP ${ins.status}`)
    : fail('Insert failed', `HTTP ${ins.status}  ${ins.text.slice(0, 200)}`)

  // STEP 2: set_member_password → true
  console.log('\nSTEP 2  set_member_password(username, hash, salt) → expect true')
  const setR = await request('POST', '/rest/v1/rpc/set_member_password',
    { p_username: TEST_USER, p_hash: hashB64, p_salt: saltB64 })
  setR.status === 200 && setR.json === true
    ? pass('Password set', `returned ${setR.json}`)
    : fail('set_member_password failed', `HTTP ${setR.status}  ${setR.text.slice(0, 300)}`)

  // STEP 3: verify correct hash → true
  console.log('\nSTEP 3  verify_member_password (CORRECT hash) → expect true')
  const goodR = await request('POST', '/rest/v1/rpc/verify_member_password',
    { p_username: TEST_USER, p_hash: hashB64 })
  goodR.status === 200 && goodR.json === true
    ? pass('Correct hash accepted', `returned ${goodR.json}`)
    : fail('Correct hash rejected', `HTTP ${goodR.status}  ${goodR.text.slice(0, 300)}`)

  // STEP 4: verify wrong hash → false
  console.log('\nSTEP 4  verify_member_password (WRONG hash) → expect false')
  const badR = await request('POST', '/rest/v1/rpc/verify_member_password',
    { p_username: TEST_USER, p_hash: wrongB64 })
  badR.status === 200 && badR.json === false
    ? pass('Wrong hash rejected', `returned ${badR.json}`)
    : fail('Wrong hash NOT rejected', `HTTP ${badR.status}  ${badR.text.slice(0, 300)}`)

  // Cleanup
  console.log('\nCLEANUP  Deleting test user')
  const del = await request('DELETE',
    `/rest/v1/member_accounts?username=eq.${encodeURIComponent(TEST_USER)}`, null)
  console.log(del.status === 204 || del.status === 200 ? '  ✓  Cleaned up' : `  ⚠  HTTP ${del.status}`)

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  failed === 0
    ? console.log(`  ALL ${passed} TESTS PASSED ✓`)
    : console.log(`  ${passed} passed  /  ${failed} FAILED`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  return failed
}

run()
  .then(f => process.exit(f > 0 ? 1 : 0))
  .catch(e => { console.error('Fatal:', e.message); process.exit(1) })
