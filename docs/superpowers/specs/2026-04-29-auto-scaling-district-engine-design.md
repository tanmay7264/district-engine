# Auto-Scaling District Engine — Design Spec
**Date:** 2026-04-29  
**Status:** Approved  
**Domain:** Civic transparency platform for Indian districts  
**MVP scope:** Maharashtra (36 districts), then national expansion

---

## Problem

ForThePeople.in (the reference implementation) requires 6+ hand-written seed files and ~2 weeks of work to launch each new district. At that pace, reaching all 780 Indian districts is infeasible. Most of its 29 modules per district are empty or "coming soon." Data has no lineage — journalists and developers cannot build on top of it.

## Goal

Build an auto-scaling civic data platform where:
- Adding a new district takes minutes, not weeks
- Only modules with real, verified data are shown (no ghost dashboards)
- Every data point carries full lineage (source URL, fetch timestamp, quality score)
- All data is accessible via a public versioned REST API

---

## Architecture

### 1. Source Registry

Central table of all data sources. Every source self-describes what it covers.

```
DataSource {
  id              String  @id          // e.g. "agmarknet-mh-crop-prices"
  name            String
  type            SourceType           // REST | CSV_DOWNLOAD | JSON_FEED
  urlTemplate     String               // supports {district_code}, {state_code}
  module          String               // "crops" | "budget" | "elections" | ...
  stateSlug       String?              // null = national source
  districtSlugs   String[]             // ["pune", "nashik"] or empty = all in state
  refreshHours    Int
  schemaMap       Json                 // raw field → canonical field mapping
  qualityBaseline Int                  // expected quality score 0-100
  active          Boolean @default(true)
  lastFetchedAt   DateTime?
  uptime30d       Float?               // computed: % successful fetches last 30 days
}
```

**Adding a new source = one DB record. No code change required.**

### 2. Ingestion Engine

Runs on BullMQ queues (Railway worker). Processes all active sources on their refresh schedule.

```
For each source due for refresh:
  1. Fetch raw data (3 retries, exponential backoff, 30s timeout)
  2. Apply schemaMap → canonical ModuleData fields
  3. Validate: required fields present?
  4. Compute quality_score = (fields_present / total_fields) × recency_factor × 100
  5. Upsert into ModuleData table
  6. Write IngestionLog (source_id, district, fetched_at, record_count, quality_score, error?)
  7. Invalidate Redis cache keys for affected district+module
  8. Recompute DistrictCoverage scores
```

The engine is **source-type-agnostic** — REST, CSV, and JSON feeds all route through the same pipeline via adapters.

### 3. Module Visibility Rule

A module is shown on the citizen dashboard only when:

```
quality_score >= 40
AND all required_fields are present
AND last_fetched within (2 × refresh_hours)
```

Otherwise the module does not appear in the sidebar at all. **No ghost modules.**

### 4. District Config

One record per district. No seed files. No manual module wiring.

```
District {
  slug          String   @unique    // "pune"
  name          String              // "Pune"
  nameLocal     String              // "पुणे"
  state         String              // "maharashtra"
  districtCode  String              // "MH-PN" — used in source URL templates
  lat           Float
  lng           Float
  active        Boolean @default(true)
  // All data comes from sources registered against this district.
  // No per-district seed files.
}
```

### 5. Public REST API

Every ingested data point is externally queryable with full lineage.

**Endpoints:**
```
GET /api/v1/districts?state=maharashtra
GET /api/v1/districts/:slug
GET /api/v1/districts/:slug/modules              → list with coverage scores
GET /api/v1/districts/:slug/modules/:module      → data + lineage
GET /api/v1/sources                              → registry (public)
GET /api/v1/sources/:id/log                      → fetch history
```

**Response envelope:**
```json
{
  "data": [...],
  "meta": {
    "source_id": "agmarknet-mh-crop-prices",
    "source_url": "https://agmarknet.gov.in/...",
    "fetched_at": "2026-04-29T18:00:00Z",
    "quality_score": 85,
    "district": "pune",
    "module": "crops"
  }
}
```

### 6. Citizen Dashboard

Auto-generated from the API. Key UX differences from ForThePeople:

| Feature | ForThePeople | This Platform |
|---------|-------------|---------------|
| Module visibility | All 29 shown, many empty | Only modules passing quality threshold |
| Data freshness | Manual seeds + fragile scrapers | Auto-ingested, last-fetch timestamp visible |
| Data lineage | None | Source chip on every number |
| Coverage signal | None | `85% complete · Updated 2h ago` badge |
| District comparison | None | Side-by-side any two districts |
| Public API | None | Full REST API with versioning |

---

## MVP: Maharashtra

**36 districts, 8 modules, day one.**

| Module | Source | API Type | Refresh |
|--------|--------|---------|---------|
| Demographics | data.gov.in Census 2011 | REST | Weekly |
| Budget | data.gov.in Maharashtra Budget | REST | Daily |
| Elections | ECI results portal | REST + CSV | On event |
| Crop Prices | Agmarknet Maharashtra | REST | 6h |
| Water / Dams | Maharashtra Water Resources | REST | 12h |
| Schemes | MahaDBT beneficiaries | REST | Daily |
| Poverty Index | NITI Aayog MPI dataset | CSV | Monthly |
| Weather | OpenWeatherMap | REST | 3h |

**Result: 36 × 8 = 288 populated module dashboards on launch day.**  
ForThePeople equivalent after 1 year: 10 districts × variable empty modules.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15, TypeScript, App Router |
| Database | PostgreSQL (Neon), Prisma ORM |
| Cache | Upstash Redis |
| Ingestion worker | BullMQ on Railway |
| Frontend hosting | Vercel |
| AI | Claude API (Anthropic SDK) — module insights only, never in ingestion pipeline |
| Analytics | Plausible (cookieless) |
| Errors | Sentry |

**New vs ForThePeople:** `DataSource` + `IngestionEngine` + `ModuleData` tables replace 40+ hand-written seed files.

---

## Prisma Schema (core new tables)

```prisma
model DataSource {
  id            String    @id
  name          String
  type          String    // REST | CSV_DOWNLOAD | JSON_FEED
  urlTemplate   String
  module        String
  stateSlug     String?
  districtSlugs String[]
  refreshHours  Int
  schemaMap     Json
  active        Boolean   @default(true)
  lastFetchedAt DateTime?
  uptime30d     Float?
  logs          IngestionLog[]
  moduleData    ModuleData[]
}

model ModuleData {
  id           String     @id @default(cuid())
  districtSlug String
  module       String
  sourceId     String
  source       DataSource @relation(fields: [sourceId], references: [id])
  data         Json
  qualityScore Int
  fetchedAt    DateTime
  createdAt    DateTime   @default(now())
  @@unique([districtSlug, module, sourceId])
  @@index([districtSlug, module])
}

model IngestionLog {
  id          String     @id @default(cuid())
  sourceId    String
  source      DataSource @relation(fields: [sourceId], references: [id])
  district    String?
  fetchedAt   DateTime
  recordCount Int
  qualityScore Int
  error       String?
  durationMs  Int
  @@index([sourceId, fetchedAt])
}

model DistrictCoverage {
  districtSlug    String   @id
  modules         Json     // { crops: 85, budget: 72, ... }
  overallScore    Int
  activeModules   Int
  lastComputedAt  DateTime
}
```

---

## Key Files (planned)

```
src/
├── app/
│   ├── api/v1/              ← public REST API
│   └── [district]/          ← citizen dashboards
├── engine/
│   ├── ingestion-engine.ts  ← core fetch + transform + store loop
│   ├── adapters/            ← REST | CSV | JSON adapters
│   ├── schema-map.ts        ← raw → canonical field transforms
│   └── quality-scorer.ts    ← computes quality_score per fetch
├── lib/
│   ├── db.ts
│   ├── cache.ts
│   └── coverage.ts          ← district coverage recompute
prisma/
├── schema.prisma
└── seed-sources-mh.ts       ← 8 Maharashtra source records (one-time)
```

---

## Non-Goals (deferred)

- Civic action layer (RTI filing, issue reporting) — Phase 2
- LLM-powered PDF extraction — explicitly excluded (API-only sources only)
- National expansion beyond Maharashtra — Phase 2, same engine
- Mobile app — Phase 2

---

## Success Criteria

- All 36 Maharashtra districts live on day one
- ≥ 8 modules populated per district at launch
- Zero ghost modules (every visible module passes quality threshold)
- Public API returns data with lineage for all modules
- New district onboarding time < 5 minutes (config record + district code)
- New source onboarding time < 30 minutes (one DB record + adapter test)
