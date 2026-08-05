# Test Plan

Create automated tests for:

1. A sender cannot read another sender's private request details.
2. A runner cannot offer on a disabled jurisdiction.
3. Interstate pickup/drop-off combinations are rejected during intrastate-only launch.
4. Restricted categories are rejected server-side.
5. PIN verification is rate-limited and hashes are never returned.
6. Only job participants can view proof images.
7. Invalid state transitions fail.
8. Referral rewards require a completed, non-refunded job.
9. Expired credentials remove runner eligibility when required.
10. Payment finalization is idempotent.
