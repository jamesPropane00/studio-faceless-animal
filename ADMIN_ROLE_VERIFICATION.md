# FAS Admin Role Verification Checklist

## System Overview

There are **three separate verification layers** for admin access:

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Layer 1: Global Admin Link** | Hardcoded username list in `assets/script.js` line 31 | Shows "🛠 Admin Dashboard" link on all pages |
| **Layer 2: Standalone Admin** | Email allowlist in `assets/js/admin-auth.js` lines 29–32 | Controls access to `admin/index.html` with Supabase email auth |
| **Layer 3: Dashboard Admin Panel** | Supabase `member_accounts.role` column | Shows dashboard admin panels (super_admin/moderator/user) |

---

## User Verification

### 1. **jamespropane00** (DJ Faceless Animal — Founder)

**Current Status:**
- ✅ In hardcoded admin list (`script.js` line 31)
- ✅ In standalone admin email allowlist (`admin-auth.js`: `djfacelessanimal@gmail.com`)
- ✅ In seed file as premium member (`profiles` table)
- ⚠️ **Role in member_accounts.role UNKNOWN** — needs verification

**What Should Happen:**
- Sees Admin Dashboard link on all pages (via script.js)
- Can access `admin/index.html` with email auth (djfacelessanimal@gmail.com)
- Dashboard should show super_admin panel with User Manager

**Recommended Supabase Role:**
```
UPDATE member_accounts SET role = 'super_admin' WHERE username = 'jamespropane00';
```

**Unlocks on Dashboard:**
- ✅ User Manager (list all member_accounts, change roles)
- ✅ Moderation Queue (demo UI)
- ✅ `loadAllUsers()` function call

---

### 2. **arianamnm** (Ariana — Premium Member)

**Current Status:**
- ✅ In hardcoded admin list (`script.js` line 31)
- ❌ **NOT in standalone admin email allowlist** — cannot access admin/index.html
- ✅ In seed file as premium creator (`profiles` table)
- ⚠️ **Role in member_accounts.role UNKNOWN** — needs verification

**What Should Happen:**
- Sees Admin Dashboard link on all pages (via script.js)
- Dashboard should show super_admin panel with User Manager
- **BUT cannot access admin/index.html** because email is not in allowlist

**Decision Required:**

**Option A — Add to admin email allowlist:**
```javascript
// assets/js/admin-auth.js line 31
const ADMIN_EMAILS = new Set([
  'djfacelessanimal@gmail.com',
  'jamespropane00@gmail.com',
  'ariana.email@example.com',  // ← ADD IF ARIANA SHOULD ACCESS STANDALONE ADMIN
])
```

**Option B — Keep arianamnm as dashboard-only admin:**
- Set role = `'moderator'` or `'super_admin'` for dashboard access only
- Do not add to standalone admin email allowlist

**Recommended Supabase Role (both options):**
```
UPDATE member_accounts SET role = 'super_admin' WHERE username = 'arianamnm';
```

---

### 3. **Renee Account**

**Status:**
- ❌ **NOT found in codebase** — no profile, no seed, no mentions
- ❌ Not in hardcoded admin list
- ❌ Not in email allowlist

**Action:**
- If Renee is a new admin account: Add username and details to this verification
- If Renee is an existing member with different username: Clarify username
- If Renee doesn't need admin access yet: Skip for now

---

## Role Definitions (Per admin-permissions.js)

### `'super_admin'`
**Dashboard Panel:** "Admin Overview" (full access)

**Permissions:**
- ✅ manageUsers: true
- ✅ viewAdminLogs: true
- ✅ manageMembership: true
- ✅ enforceUsers: true
- ✅ moderateContent: true
- ✅ can_upload_music: true
- ✅ can_send_messages: true
- ✅ can_vote_on_radio: true
- ✅ can_make_calls: true

**Dashboard Features:**
- User Manager (list all members, change roles)
- Moderation Queue (placeholder UI)
- Full admin overview

---

### `'moderator'`
**Dashboard Panel:** "Moderator Panel" (limited access)

**Permissions:**
- ❌ manageUsers: false
- ❌ viewAdminLogs: false
- ❌ manageMembership: false
- ✅ enforceUsers: true
- ✅ moderateContent: true
- ✅ can_upload_music: true
- ✅ can_send_messages: true
- ✅ can_vote_on_radio: true
- ✅ can_make_calls: true

**Dashboard Features:**
- Moderation tools (limited — placeholder "coming soon")
- Cannot manage users or view logs

---

### `'user'` (default)
**Dashboard Panel:** Standard member panel (no admin features)

**Permissions:**
- ❌ All admin permissions false
- ✅ Basic platform access (music, messaging, voting, calls)

---

## Verification Checklist

### Pre-Check (Before Any Changes)

- [ ] Query Supabase: what are current role values for jamespropane00 and arianamnm?
- [ ] Query Supabase: what email addresses are associated with these usernames in auth.users?
- [ ] Clarify: Is arianamnm supposed to access standalone admin (admin/index.html)?

### Role Alignment (If All Checks Pass)

**If both should be super_admin:**
```sql
UPDATE member_accounts SET role = 'super_admin' WHERE username IN ('jamespropane00', 'arianamnm');
```

**If arianamnm should also access standalone admin:**
```javascript
// assets/js/admin-auth.js — add her email to ADMIN_EMAILS
```

**If arianamnm should NOT access standalone admin:**
- Set her role = 'super_admin' in member_accounts
- Do NOT add email to standaloneLATE admin allowlist
- She will see the link but cannot authenticate

### Post-Verification

- [ ] Test: Log in as jamespropane00 → Dashboard shows super_admin panel
- [ ] Test: Log in as arianamnm → Dashboard shows super_admin panel (if role set)
- [ ] Test: jamespropane00 can access admin/index.html with email auth
- [ ] Test: arianamnm cannot access admin/index.html (unless email added to allowlist)
- [ ] Test: Admin Dashboard link visible on all pages for both users

---

## Next Steps (Smallest Safe Patch)

**DO NOT PATCH CODE YET.**

1. **Verify** current Supabase state for both users
2. **Decide** whether arianamnm needs standalone admin access
3. **Update** member_accounts.role for both users to `'super_admin'`
4. **Optionally** add arianamnm's email to standalone admin allowlist (if needed)
5. **Test** all three verification points above
6. **Document** the decision in code so future admins understand the alignment

---

## Summary

| Account | Admin Link | Dashboard Panel | Standalone Admin | Action |
|---------|---|---|---|---|
| jamespropane00 | ✅ YES | ⚠️ Check DB | ✅ YES (email auth) | Set role = super_admin |
| arianamnm | ✅ YES | ⚠️ Check DB | ❓ Decision needed | Set role = super_admin + (optionally add email to allowlist) |
| renee | ❌ Not found | N/A | N/A | Clarify username / create profile |
