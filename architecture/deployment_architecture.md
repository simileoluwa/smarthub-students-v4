# SOP-008: Deployment & Infrastructure Architecture

## 1. Objective
Define the infrastructure layout, edge caching configurations, Supabase security settings, and deployment pipelines for Smart Student Hub v4. The infrastructure must provide low latency, secure access, and optimized caching suitable for Nigerian mobile networks.

## 2. Scope
This protocol governs Vercel deployment variables, Cloudflare CDN cache rule settings, and Supabase RLS security profiles.

---

## 3. Infrastructure Topography

```
               [ Nigerian Mobile Student ]
                           │
                           ▼ (MTN, Airtel, Glo, 9mobile)
              [ Cloudflare CDN Edge WAF ]
              ┌────────────┴────────────┐
              ▼                         ▼
      [ Vercel Hosting ]       [ Supabase Cloud ]
       - Static PWA Assets      - PostgreSQL Database
       - Next.js Serverless     - Supabase Auth Service
       - API Edge Routes        - Supabase Realtime Bus
```

---

## 4. Edge Networking & CDN Caching (Cloudflare Setup)

To mitigate unstable local network connections and high data usage costs, we utilize Cloudflare CDN as an active performance wrapper:

### A. Static Asset Caching
*   **PWA Cache Headers:** All static files (compiled JS, CSS, public icons, SVG icons) are wrapped with aggressive cache rules:
    `Cache-Control: public, max-age=31536000, immutable`
*   **Offline Manifest Delivery:** Service workers retrieve static pages directly from local browser caches, bypassing the network entirely for returning sessions.

### B. Cloudflare WAF & Speed Rules
*   **Brotli Compression:** Activated at level 4 to guarantee files are highly compressed before transport.
*   **Rocket Loader:** Disabled (Rocket Loader interferes with PWA service worker lifecycle hooks).
*   **MTN/Airtel Route Optimizations:** Route all API traffic via nearby African edge nodes (e.g. Lagos, Nigeria / Johannesburg, South Africa) to cut network ping times.

---

## 5. Backend Security & Row Level Security (RLS)

Smart Student Hub is hosted on Supabase. RLS policies are activated on all tables to prevent cross-user data exposure.

### A. PostgreSQL Security Profile Configuration:
```sql
-- 1. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaced_repetition_cards ENABLE ROW LEVEL SECURITY;

-- 2. Create User Profiles Access Policy
CREATE POLICY "Students can access their own profile only" 
ON profiles FOR ALL 
TO authenticated 
USING (auth.uid() = id);

-- 3. Create Semester Access Policy
CREATE POLICY "Students can access their own semesters only" 
ON semesters FOR ALL 
TO authenticated 
USING (profile_id = auth.uid());

-- 4. Create Course Access Policy
CREATE POLICY "Students can access their own courses only" 
ON courses FOR ALL 
TO authenticated 
USING (
  semester_id IN (
    SELECT id FROM semesters WHERE profile_id = auth.uid()
  )
);

-- 5. Create Cards Access Policy
CREATE POLICY "Students can access their own cards only" 
ON spaced_repetition_cards FOR ALL 
TO authenticated 
USING (
  course_id IN (
    SELECT id FROM courses WHERE semester_id IN (
      SELECT id FROM semesters WHERE profile_id = auth.uid()
    )
  )
);
```

---

## 6. Payment Gateway Integration (Paystack Rules)

Payments (premium study features, past questions packages) are integrated exclusively through **Paystack** (Nigerian standard payment gateway).

### A. Integration Protocols:
1.  **Client-side Initialization:** Use Paystack's lightweight Pop-up library or standard inline payment hooks.
2.  **Serverless Verification:** When a transaction completes, Paystack returns a reference ID. The PWA sends this reference to a Next.js Serverless API Route `/api/verify-payment`.
3.  **Webhook Validation:** The backend verify route calls Paystack's secure verification endpoint, confirms the signature using the private key, and updates the local profile's payment status to `'premium'`.
4.  **Offline State Check:** If a user purchases premium access but loses network connection immediately after transaction completion, the transaction reference is logged in the IndexedDB WAL. On reconnection, the sync worker verifies the reference to unlock premium features locally.
