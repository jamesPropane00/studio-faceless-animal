# Copilot/Branch Chat Directive: Miner + Wallet Only

MISSION:
Finish miner + wallet + visible balance. Make it stable, stored, and believable. Do NOT touch phone or anything else.

RULES:
- Only patch what is required for miner/wallet/balance to function.
- No rewrites.
- No refactors.
- No new systems.
- No scope drift.
- No “improvements” outside the miner/wallet flow.
- Audit FIRST. Do not code immediately.
- If multiple fixes exist, choose:
  - FEWEST changed files
  - LEAST new logic
  - HIGHEST chance of working immediately
- Reuse existing variables, storage, and structure whenever possible.
- Do NOT rename coins, wallet fields, or core variables.
- Do NOT introduce a new architecture unless the current one is completely broken.

STRICT BOUNDARY:
Do NOT touch:
- phone system
- radio
- auth flow (unless required for balance to display)
- dashboard features not related to wallet/miner
- upload/admin/moderation systems

TARGET RESULT:
- User sees their coin balance clearly
- Balance loads correctly
- Balance updates correctly
- Balance persists (if persistence already exists)
- Miner:
  - looks active
  - uses a simple timer/session
  - does NOT rely on tick systems or constant polling
  - grants reward on completion/claim
  - updates wallet immediately
  - resets cleanly
- The miner can be simulated. The stored value must be real and consistent.

PROCESS:
1. Audit current miner + wallet system
2. Identify exact failure points
3. Apply the simplest possible fix
4. Patch ONLY necessary files
5. Verify logic is consistent
6. STOP

RESPONSE FORMAT:
- Current system summary
- Failure points
- Simplest fix
- Exact patch
- What changed
- What was preserved

FINAL RULE:
After the patch is complete and explained: STOP.
Do not suggest next features. Do not continue building. Do not expand scope.
