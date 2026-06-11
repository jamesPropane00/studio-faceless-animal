import https from 'https'
import fs from 'fs'

const HOST = 'ghufaozjwondqcrcucjs.supabase.co'
const ANON_KEY = 'sb_publishable_kixI74nB7Drt6mQKooaXHg_nPoE0h_-'
const VALID_RE = /^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const req = https.request({
      hostname: HOST,
      port: 443,
      path,
      method,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': payload.length } : {}),
      },
    }, (res) => {
      const chunks = []
      res.on('data', (d) => chunks.push(d))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch {}
        resolve({ status: res.statusCode || 0, text, json })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function summarize(rows) {
  const total = rows.length
  const missingRows = rows.filter((r) => !r.platform_id || String(r.platform_id).trim() === '')
  const invalidRows = rows.filter((r) => {
    if (!r.platform_id || String(r.platform_id).trim() === '') return false
    return !VALID_RE.test(String(r.platform_id))
  })

  const groups = new Map()
  for (const r of rows) {
    const code = String(r.platform_id || '').trim().toUpperCase()
    if (!code) continue
    groups.set(code, (groups.get(code) || 0) + 1)
  }
  const duplicateGroups = [...groups.entries()].filter(([, count]) => count > 1)

  return {
    total,
    missing: missingRows.length,
    invalid: invalidRows.length,
    duplicateCodeGroups: duplicateGroups.length,
    missingUsers: missingRows.map((r) => r.username),
    invalidUsers: invalidRows.map((r) => ({ username: r.username, platform_id: r.platform_id })),
    duplicateSamples: duplicateGroups.slice(0, 20).map(([code, count]) => ({ code, count })),
  }
}

async function fetchUsers() {
  const res = await request('GET', '/rest/v1/member_accounts?select=username,platform_id&limit=10000')
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.json)) {
    return { ok: false, status: res.status, body: res.text.slice(0, 1000), rows: [] }
  }
  return { ok: true, status: res.status, rows: res.json }
}

async function run() {
  const out = {
    timestamp: new Date().toISOString(),
    host: HOST,
    before: null,
    activation: null,
    after: null,
    errors: [],
  }

  const beforeRes = await fetchUsers()
  if (beforeRes.ok) out.before = summarize(beforeRes.rows)
  else out.errors.push({ stage: 'before-fetch', ...beforeRes })

  // Try direct public backfill rpc first.
  const backfillRes = await request('POST', '/rest/v1/rpc/fas_backfill_missing_signal_codes', {})
  out.activation = {
    endpoint: 'fas_backfill_missing_signal_codes',
    status: backfillRes.status,
    body: backfillRes.json ?? backfillRes.text.slice(0, 500),
  }

  const afterRes = await fetchUsers()
  if (afterRes.ok) out.after = summarize(afterRes.rows)
  else out.errors.push({ stage: 'after-fetch', ...afterRes })

  fs.mkdirSync('artifacts', { recursive: true })
  fs.writeFileSync('artifacts/signal-code-activation-report.json', JSON.stringify(out, null, 2))

  const summary = {
    before: out.before,
    activation: out.activation,
    after: out.after,
    errors: out.errors,
  }
  fs.writeFileSync('artifacts/signal-code-activation-summary.json', JSON.stringify(summary, null, 2))
}

run().catch((err) => {
  fs.mkdirSync('artifacts', { recursive: true })
  fs.writeFileSync('artifacts/signal-code-activation-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    fatal: String(err && err.message ? err.message : err),
  }, null, 2))
  process.exitCode = 1
})
