# Security Specification — Mingalar Mart POS Firestore Rules

## 1. Data Invariants
1. **Store Isolation (`ownerId`)**: Every document in `branches`, `products`, `sales`, `movements`, and `settings` MUST carry an immutable `ownerId` matching `request.auth.uid` (verified Google user) or be accessed by the verified bootstrapped store admin (`aungpaingphyo.com.mm@gmail.com`).
2. **PII Protection**: Branch phone numbers and street addresses in `branches` and `settings` are readable ONLY by the owning store account or verified admin—never via blanket `isSignedIn()` reads.
3. **Referential Integrity**: Creating a `Sale` MUST verify that `branchId` exists in `/branches/{branchId}` and belongs to the same `ownerId` (when created in standalone or batched writes).
4. **Terminal State Locking on Sales**: Once a `Sale` reaches `status == 'voided'`, non-admin clients cannot modify it further. Partial reversals may only update `reversedItems`, `reversalReason`, `reversedAt`, `synced`, and `serverUpdatedAt`.
5. **Immutable Audit Ledger (`movements`)**: Stock movements cannot be deleted or edited after creation by non-admin clients.
6. **Temporal Integrity**: `serverCreatedAt` must equal `request.time` on create and remain immutable on update; `serverUpdatedAt` must equal `request.time` on create and update.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Read/List on `/products`**: `{ auth: null, op: "list", path: "/products" }` -> Denied.
2. **Unverified Email Spoofing**: `{ auth: { uid: "u1", token: { email: "aungpaingphyo.com.mm@gmail.com", email_verified: false } }, op: "get", path: "/sales/s1" }` -> Denied.
3. **Cross-Tenant List Scraping**: `{ auth: { uid: "attacker", token: { email_verified: true } }, op: "list", path: "/branches", query: "all" }` -> Denied unless filtered by `ownerId == attacker`.
4. **Identity Spoofing on Product Create**: `{ auth: { uid: "u1" }, op: "create", path: "/products/p1", data: { ownerId: "victim", ... } }` -> Denied.
5. **Shadow / Ghost Field Injection on Branch Create**: `{ auth: { uid: "u1" }, op: "create", path: "/branches/b1", data: { ...validBranch, isAdminApproved: true } }` -> Denied by `keys().hasOnly(...)`.
6. **ID Poisoning (1.5KB Document ID)**: `{ auth: { uid: "u1" }, op: "create", path: "/products/" + "a".repeat(1500) }` -> Denied by `isValidId()`.
7. **Unbounded Line Items Array Attack on Sale**: `{ auth: { uid: "u1" }, op: "create", path: "/sales/s1", data: { ...validSale, items: Array(250).fill(validItem) } }` -> Denied by `data.items.size() <= 100`.
8. **Invalid Enum Category on Product**: `{ auth: { uid: "u1" }, op: "create", path: "/products/p1", data: { ...validProduct, category: "weapons" } }` -> Denied.
9. **Terminal Voided Sale Resurrection**: `{ auth: { uid: "u1" }, op: "update", path: "/sales/voided-sale", data: { status: "completed" } }` -> Denied by terminal state lock.
10. **Immutable `ownerId` / `serverCreatedAt` Tampering on Update**: `{ auth: { uid: "u1" }, op: "update", path: "/products/p1", data: { ownerId: "u2", serverUpdatedAt: request.time } }` -> Denied by `affectedKeys().hasOnly(...)` & immutability check.
11. **Orphaned Sale Branch Reference**: `{ auth: { uid: "u1" }, op: "create", path: "/sales/s1", data: { ...validSale, branchId: "non-existent-branch" } }` -> Denied by `exists(/databases/$(database)/documents/branches/$(incoming().branchId))` (or `existsAfter` during batch migration).
12. **Client-Forged Server Timestamp**: `{ auth: { uid: "u1" }, op: "create", path: "/products/p1", data: { ...validProduct, serverCreatedAt: "2020-01-01T00:00:00Z" } }` -> Denied by `incoming().serverCreatedAt == request.time`.
