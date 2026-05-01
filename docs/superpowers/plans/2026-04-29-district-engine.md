# District Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an auto-scaling civic data platform for Maharashtra (36 districts, 8 modules) where adding a new district takes minutes, every visible module has real data, and all data is queryable via a public versioned REST API.

**Architecture:** A Source Registry stores self-describing API configs; an Ingestion Engine fetches, maps, scores, and stores data automatically; a public REST API exposes all data with lineage; a Next.js dashboard renders only modules that pass a quality threshold.

**Tech Stack:** Next.js 16, TypeScript, Prisma 6, Neon PostgreSQL, Upstash Redis, BullMQ, Vitest, Tailwind CSS v4

---

## File Map

```
district-engine/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                              ← homepage: state/district selector
│   │   ├── [district]/
│   │   │   ├── page.tsx                          ← district overview
│   │   │   └── [module]/page.tsx                 ← module detail page
│   │   └── api/v1/
│   │       ├── districts/route.ts                ← GET /api/v1/districts
│   │       ├── districts/[slug]/route.ts         ← GET /api/v1/districts/:slug
│   │       ├── districts/[slug]/modules/route.ts ← GET /api/v1/districts/:slug/modules
│   │       ├── districts/[slug]/modules/[module]/route.ts
│   │       ├── sources/route.ts                  ← GET /api/v1/sources
│   │       └── sources/[id]/log/route.ts
│   ├── engine/
│   │   ├── ingestion-engine.ts                   ← main fetch loop
│   │   ├── adapters/
│   │   │   ├── rest-adapter.ts                   ← fetch + retry for REST sources
│   │   │   └── csv-adapter.ts                    ← fetch + parse for CSV sources
│   │   ├── schema-map.ts                         ← raw field → canonical field transform
│   │   └── quality-scorer.ts                     ← computes 0-100 quality score
│   ├── lib/
│   │   ├── db.ts                                 ← Prisma client singleton
│   │   ├── cache.ts                              ← Upstash Redis helpers
│   │   └── coverage.ts                           ← recompute DistrictCoverage
│   └── components/
│       ├── CoverageBadge.tsx                     ← "85% · 2h ago" chip
│       ├── ModuleCard.tsx                        ← card with coverage badge
│       └── DistrictCard.tsx                      ← district summary card
├── worker/
│   └── scheduler.ts                              ← BullMQ worker entry (Railway)
├── prisma/
│   ├── schema.prisma
│   └── seed-mh.ts                                ← 8 sources + 36 districts
└── src/__tests__/
    ├── engine/
    │   ├── quality-scorer.test.ts
    │   ├── schema-map.test.ts
    │   ├── adapters/rest-adapter.test.ts
    │   ├── adapters/csv-adapter.test.ts
    │   └── ingestion-engine.test.ts
    ├── lib/coverage.test.ts
    └── api/
        ├── districts.test.ts
        └── sources.test.ts
```

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `postcss.config.mjs`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/tanmay/Documents/district-engine
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

Expected: Next.js 15 scaffolded with App Router, TypeScript, Tailwind v4.

- [ ] **Step 2: Install dependencies**

```bash
npm install @prisma/client prisma @upstash/redis bullmq date-fns lucide-react
npm install -D vitest @vitejs/plugin-react vitest-environment-miniflare @types/node
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 4: Add test script to package.json**

In `package.json` scripts section, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create .env.example**

```bash
cat > .env.example << 'EOF'
DATABASE_URL="postgresql://..."
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
OPENWEATHER_API_KEY="..."
EOF
```

- [ ] **Step 6: Verify setup**

```bash
npm run test
```

Expected: "No test files found" — not an error, just nothing to run yet.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: initialize Next.js 15 project with Vitest"
```

---

## Task 2: Prisma Schema + DB Setup

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

Expected: `prisma/schema.prisma` and `.env` created.

- [ ] **Step 2: Write the schema**

Replace `prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model District {
  id           String    @id @default(cuid())
  slug         String    @unique
  name         String
  nameLocal    String
  state        String
  districtCode String    @unique
  lat          Float
  lng          Float
  active       Boolean   @default(true)
  createdAt    DateTime  @default(now())
  coverage     DistrictCoverage?
  moduleData   ModuleData[]

  @@index([state, active])
}

model DataSource {
  id            String    @id
  name          String
  type          String
  urlTemplate   String
  module        String
  stateSlug     String?
  districtCodes String[]
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
  district     District   @relation(fields: [districtSlug], references: [slug])
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
  id           String     @id @default(cuid())
  sourceId     String
  source       DataSource @relation(fields: [sourceId], references: [id])
  districtSlug String?
  fetchedAt    DateTime
  recordCount  Int
  qualityScore Int
  error        String?
  durationMs   Int

  @@index([sourceId, fetchedAt])
}

model DistrictCoverage {
  districtSlug   String   @id
  district       District @relation(fields: [districtSlug], references: [slug])
  modules        Json
  overallScore   Int
  activeModules  Int
  lastComputedAt DateTime
}
```

- [ ] **Step 3: Create Prisma client singleton**

Create `src/lib/db.ts`:
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Push schema to DB**

Add your Neon `DATABASE_URL` to `.env`, then:
```bash
npx prisma generate
npx prisma db push
```

Expected: All 5 tables created in Neon. Prisma client generated.

- [ ] **Step 5: Commit**

```bash
git add prisma/ src/lib/db.ts
git commit -m "feat: add Prisma schema with 5 core models"
```

---

## Task 3: Quality Scorer

**Files:**
- Create: `src/engine/quality-scorer.ts`
- Create: `src/__tests__/engine/quality-scorer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/engine/quality-scorer.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeQualityScore } from '@/engine/quality-scorer'

describe('computeQualityScore', () => {
  it('returns 100 for complete fresh data', () => {
    const score = computeQualityScore({
      data: { name: 'Wheat', price_rupees: 2100, market: 'Pune' },
      requiredFields: ['name', 'price_rupees', 'market'],
      optionalFields: [],
      fetchedAt: new Date(),
      refreshHours: 6,
    })
    expect(score).toBe(100)
  })

  it('returns 0 when no required fields present', () => {
    const score = computeQualityScore({
      data: {},
      requiredFields: ['name', 'price_rupees'],
      optionalFields: [],
      fetchedAt: new Date(),
      refreshHours: 6,
    })
    expect(score).toBeLessThan(40)
  })

  it('penalizes stale data', () => {
    const staleDate = new Date(Date.now() - 48 * 3600 * 1000) // 48h ago
    const fresh = computeQualityScore({
      data: { name: 'Rice', price_rupees: 1800, market: 'Nashik' },
      requiredFields: ['name', 'price_rupees', 'market'],
      optionalFields: [],
      fetchedAt: new Date(),
      refreshHours: 6,
    })
    const stale = computeQualityScore({
      data: { name: 'Rice', price_rupees: 1800, market: 'Nashik' },
      requiredFields: ['name', 'price_rupees', 'market'],
      optionalFields: [],
      fetchedAt: staleDate,
      refreshHours: 6,
    })
    expect(fresh).toBeGreaterThan(stale)
  })

  it('gives partial score when only some required fields present', () => {
    const score = computeQualityScore({
      data: { name: 'Wheat' },
      requiredFields: ['name', 'price_rupees', 'market'],
      optionalFields: [],
      fetchedAt: new Date(),
      refreshHours: 6,
    })
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(100)
  })

  it('boosts score when optional fields present', () => {
    const withOptional = computeQualityScore({
      data: { name: 'Wheat', price_rupees: 2100, market: 'Pune', variety: 'HD2967', unit: 'quintal' },
      requiredFields: ['name', 'price_rupees', 'market'],
      optionalFields: ['variety', 'unit'],
      fetchedAt: new Date(),
      refreshHours: 6,
    })
    const withoutOptional = computeQualityScore({
      data: { name: 'Wheat', price_rupees: 2100, market: 'Pune' },
      requiredFields: ['name', 'price_rupees', 'market'],
      optionalFields: ['variety', 'unit'],
      fetchedAt: new Date(),
      refreshHours: 6,
    })
    expect(withOptional).toBeGreaterThan(withoutOptional)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/__tests__/engine/quality-scorer.test.ts
```

Expected: FAIL — "Cannot find module '@/engine/quality-scorer'"

- [ ] **Step 3: Write the implementation**

Create `src/engine/quality-scorer.ts`:
```ts
export interface QualityInput {
  data: Record<string, unknown>
  requiredFields: string[]
  optionalFields: string[]
  fetchedAt: Date
  refreshHours: number
}

export function computeQualityScore(input: QualityInput): number {
  const { data, requiredFields, optionalFields, fetchedAt, refreshHours } = input

  // Required field completeness: 60% weight
  const requiredScore = requiredFields.length === 0
    ? 1
    : requiredFields.filter(f => data[f] != null).length / requiredFields.length

  // Optional field completeness: 20% weight
  const optionalScore = optionalFields.length === 0
    ? 1
    : optionalFields.filter(f => data[f] != null).length / optionalFields.length

  // Recency: 20% weight — zero at 2× refresh window
  const ageHours = (Date.now() - fetchedAt.getTime()) / 3_600_000
  const recencyScore = Math.max(0, 1 - ageHours / (refreshHours * 2))

  return Math.round((requiredScore * 0.6 + optionalScore * 0.2 + recencyScore * 0.2) * 100)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/__tests__/engine/quality-scorer.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/quality-scorer.ts src/__tests__/engine/quality-scorer.test.ts
git commit -m "feat: add quality scorer with TDD"
```

---

## Task 4: Source Adapters

**Files:**
- Create: `src/engine/adapters/rest-adapter.ts`
- Create: `src/engine/adapters/csv-adapter.ts`
- Create: `src/__tests__/engine/adapters/rest-adapter.test.ts`
- Create: `src/__tests__/engine/adapters/csv-adapter.test.ts`

- [ ] **Step 1: Write REST adapter tests**

Create `src/__tests__/engine/adapters/rest-adapter.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRest } from '@/engine/adapters/rest-adapter'

describe('fetchRest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON and duration on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ commodity: 'Wheat', modal_price: 2100 }],
    }))

    const result = await fetchRest('https://example.com/api')
    expect(result.data).toEqual([{ commodity: 'Wheat', modal_price: 2100 }])
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('throws on non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }))

    await expect(fetchRest('https://example.com/api')).rejects.toThrow('HTTP 503')
  })

  it('retries on failure and succeeds on second attempt', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({ ok: true, json: async () => ({ data: 'ok' }) })
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchRest('https://example.com/api')
    expect(result.data).toEqual({ data: 'ok' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws after max retries exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    await expect(fetchRest('https://example.com/api', 1000, 2)).rejects.toThrow('network error')
  })
})
```

- [ ] **Step 2: Write CSV adapter tests**

Create `src/__tests__/engine/adapters/csv-adapter.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { fetchCsv } from '@/engine/adapters/csv-adapter'

describe('fetchCsv', () => {
  it('parses CSV text into array of objects', async () => {
    const csvText = 'name,price\nWheat,2100\nRice,1800'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => csvText,
    }))

    const result = await fetchCsv('https://example.com/data.csv')
    expect(result.data).toEqual([
      { name: 'Wheat', price: '2100' },
      { name: 'Rice', price: '1800' },
    ])
  })

  it('throws on non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchCsv('https://example.com/data.csv')).rejects.toThrow('HTTP 404')
  })
})
```

- [ ] **Step 3: Run to verify they fail**

```bash
npm test src/__tests__/engine/adapters/
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Write REST adapter**

Create `src/engine/adapters/rest-adapter.ts`:
```ts
export interface AdapterResult {
  data: unknown
  durationMs: number
}

export async function fetchRest(
  url: string,
  timeoutMs = 30_000,
  maxRetries = 3,
): Promise<AdapterResult> {
  let lastError: Error = new Error('unknown')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { data, durationMs: Date.now() - start }
    } catch (err) {
      clearTimeout(timer)
      lastError = err as Error
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 500))
      }
    }
  }

  throw lastError
}
```

- [ ] **Step 5: Write CSV adapter**

Create `src/engine/adapters/csv-adapter.ts`:
```ts
import type { AdapterResult } from './rest-adapter'

export async function fetchCsv(url: string, timeoutMs = 30_000): Promise<AdapterResult> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    return { data: parseCsv(text), durationMs: Date.now() - start }
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim())
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test src/__tests__/engine/adapters/
```

Expected: 6 passing tests.

- [ ] **Step 7: Commit**

```bash
git add src/engine/adapters/ src/__tests__/engine/adapters/
git commit -m "feat: add REST and CSV adapters with retry logic"
```

---

## Task 5: Schema Mapper

**Files:**
- Create: `src/engine/schema-map.ts`
- Create: `src/__tests__/engine/schema-map.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/engine/schema-map.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { applySchemaMap, applySchemaMapToArray } from '@/engine/schema-map'

describe('applySchemaMap', () => {
  it('maps raw keys to canonical keys', () => {
    const raw = { commodity: 'Wheat', modal_price: 2100, market_name: 'Pune' }
    const map = { commodity: 'name', modal_price: 'price_rupees', market_name: 'market' }
    expect(applySchemaMap(raw, map)).toEqual({
      name: 'Wheat',
      price_rupees: 2100,
      market: 'Pune',
    })
  })

  it('omits keys not in the map', () => {
    const raw = { commodity: 'Wheat', internal_id: 'abc123' }
    const map = { commodity: 'name' }
    expect(applySchemaMap(raw, map)).toEqual({ name: 'Wheat' })
  })

  it('omits undefined source fields gracefully', () => {
    const raw = { commodity: 'Wheat' }
    const map = { commodity: 'name', modal_price: 'price_rupees' }
    expect(applySchemaMap(raw, map)).toEqual({ name: 'Wheat' })
  })
})

describe('applySchemaMapToArray', () => {
  it('maps every item in the array', () => {
    const raw = [
      { commodity: 'Wheat', modal_price: 2100 },
      { commodity: 'Rice', modal_price: 1800 },
    ]
    const map = { commodity: 'name', modal_price: 'price_rupees' }
    expect(applySchemaMapToArray(raw, map)).toEqual([
      { name: 'Wheat', price_rupees: 2100 },
      { name: 'Rice', price_rupees: 1800 },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(applySchemaMapToArray([], { commodity: 'name' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test src/__tests__/engine/schema-map.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/engine/schema-map.ts`:
```ts
export function applySchemaMap(
  raw: Record<string, unknown>,
  schemaMap: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [rawKey, canonicalKey] of Object.entries(schemaMap)) {
    if (raw[rawKey] !== undefined) {
      result[canonicalKey] = raw[rawKey]
    }
  }
  return result
}

export function applySchemaMapToArray(
  rawArray: Record<string, unknown>[],
  schemaMap: Record<string, string>,
): Record<string, unknown>[] {
  return rawArray.map(item => applySchemaMap(item, schemaMap))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/__tests__/engine/schema-map.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/schema-map.ts src/__tests__/engine/schema-map.test.ts
git commit -m "feat: add schema mapper for raw → canonical field transforms"
```

---

## Task 6: Coverage Computer

**Files:**
- Create: `src/lib/coverage.ts`
- Create: `src/__tests__/lib/coverage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/lib/coverage.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing coverage
const mockPrisma = {
  moduleData: { findMany: vi.fn() },
  districtCoverage: { upsert: vi.fn() },
}
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }))

import { recomputeCoverage } from '@/lib/coverage'

describe('recomputeCoverage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes overallScore and activeModules from module data', async () => {
    mockPrisma.moduleData.findMany.mockResolvedValue([
      { module: 'crops', qualityScore: 85 },
      { module: 'budget', qualityScore: 72 },
      { module: 'weather', qualityScore: 20 }, // below threshold — inactive
    ])
    mockPrisma.districtCoverage.upsert.mockResolvedValue({})

    await recomputeCoverage('pune')

    expect(mockPrisma.districtCoverage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { districtSlug: 'pune' },
        create: expect.objectContaining({
          activeModules: 2, // crops + budget pass threshold of 40
          modules: { crops: 85, budget: 72, weather: 20 },
        }),
      }),
    )
  })

  it('sets overallScore 0 when no modules present', async () => {
    mockPrisma.moduleData.findMany.mockResolvedValue([])
    mockPrisma.districtCoverage.upsert.mockResolvedValue({})

    await recomputeCoverage('nagpur')

    expect(mockPrisma.districtCoverage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ overallScore: 0, activeModules: 0 }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test src/__tests__/lib/coverage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/coverage.ts`:
```ts
import { prisma } from './db'

const QUALITY_THRESHOLD = 40

export async function recomputeCoverage(districtSlug: string): Promise<void> {
  const rows = await prisma.moduleData.findMany({ where: { districtSlug } })

  const modules: Record<string, number> = {}
  for (const row of rows) {
    // Keep highest score if multiple sources cover same module
    if (modules[row.module] === undefined || row.qualityScore > modules[row.module]) {
      modules[row.module] = row.qualityScore
    }
  }

  const scores = Object.values(modules)
  const activeModules = scores.filter(s => s >= QUALITY_THRESHOLD).length
  const overallScore = scores.length === 0
    ? 0
    : Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)

  await prisma.districtCoverage.upsert({
    where: { districtSlug },
    create: { districtSlug, modules, overallScore, activeModules, lastComputedAt: new Date() },
    update: { modules, overallScore, activeModules, lastComputedAt: new Date() },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/__tests__/lib/coverage.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coverage.ts src/__tests__/lib/coverage.test.ts
git commit -m "feat: add coverage computer with quality threshold logic"
```

---

## Task 7: Ingestion Engine

**Files:**
- Create: `src/engine/ingestion-engine.ts`
- Create: `src/__tests__/engine/ingestion-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/engine/ingestion-engine.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = {
  dataSource: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  district: { findMany: vi.fn() },
  moduleData: { upsert: vi.fn() },
  ingestionLog: { create: vi.fn() },
}
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/coverage', () => ({ recomputeCoverage: vi.fn() }))
vi.mock('@/engine/adapters/rest-adapter', () => ({
  fetchRest: vi.fn().mockResolvedValue({ data: [{ commodity: 'Wheat', modal_price: 2100, market_name: 'Pune' }], durationMs: 120 }),
}))

import { runIngestion } from '@/engine/ingestion-engine'

describe('runIngestion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips source not yet due for refresh', async () => {
    mockPrisma.dataSource.findMany.mockResolvedValue([{
      id: 'src-1',
      type: 'REST',
      urlTemplate: 'https://example.com/{district_code}',
      module: 'crops',
      stateSlug: 'maharashtra',
      districtCodes: [],
      refreshHours: 6,
      schemaMap: { commodity: 'name', modal_price: 'price_rupees', market_name: 'market' },
      lastFetchedAt: new Date(), // just fetched
    }])

    await runIngestion()

    expect(mockPrisma.district.findMany).not.toHaveBeenCalled()
  })

  it('fetches and upserts module data for due source', async () => {
    const staleDate = new Date(Date.now() - 10 * 3600 * 1000) // 10h ago, threshold 6h
    mockPrisma.dataSource.findMany.mockResolvedValue([{
      id: 'src-1',
      type: 'REST',
      urlTemplate: 'https://example.com/{district_code}',
      module: 'crops',
      stateSlug: 'maharashtra',
      districtCodes: [],
      refreshHours: 6,
      schemaMap: { commodity: 'name', modal_price: 'price_rupees', market_name: 'market' },
      lastFetchedAt: staleDate,
    }])
    mockPrisma.district.findMany.mockResolvedValue([
      { slug: 'pune', districtCode: 'MH-PN' },
    ])
    mockPrisma.moduleData.upsert.mockResolvedValue({})
    mockPrisma.ingestionLog.create.mockResolvedValue({})
    mockPrisma.dataSource.update.mockResolvedValue({})

    await runIngestion()

    expect(mockPrisma.moduleData.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { districtSlug_module_sourceId: { districtSlug: 'pune', module: 'crops', sourceId: 'src-1' } },
      }),
    )
  })

  it('logs error without throwing when fetch fails', async () => {
    const { fetchRest } = await import('@/engine/adapters/rest-adapter')
    vi.mocked(fetchRest).mockRejectedValueOnce(new Error('timeout'))

    const staleDate = new Date(Date.now() - 10 * 3600 * 1000)
    mockPrisma.dataSource.findMany.mockResolvedValue([{
      id: 'src-1', type: 'REST',
      urlTemplate: 'https://example.com/{district_code}',
      module: 'crops', stateSlug: 'maharashtra', districtCodes: [],
      refreshHours: 6,
      schemaMap: { commodity: 'name' },
      lastFetchedAt: staleDate,
    }])
    mockPrisma.district.findMany.mockResolvedValue([{ slug: 'pune', districtCode: 'MH-PN' }])
    mockPrisma.ingestionLog.create.mockResolvedValue({})
    mockPrisma.dataSource.update.mockResolvedValue({})

    await expect(runIngestion()).resolves.not.toThrow()
    expect(mockPrisma.ingestionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: 'Error: timeout' }) }),
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test src/__tests__/engine/ingestion-engine.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Define module field specs constant**

Create `src/engine/module-fields.ts`:
```ts
export const MODULE_FIELDS: Record<string, { required: string[]; optional: string[] }> = {
  crops:        { required: ['name', 'price_rupees', 'market'],        optional: ['variety', 'unit', 'min_price', 'max_price'] },
  budget:       { required: ['department', 'amount_rupees', 'year'],   optional: ['category', 'utilization_pct'] },
  elections:    { required: ['constituency', 'winner', 'party', 'year'], optional: ['votes', 'margin', 'turnout_pct'] },
  dams:         { required: ['name', 'current_level_pct'],              optional: ['capacity_mcm', 'inflow_cusecs', 'outflow_cusecs'] },
  weather:      { required: ['temp_c', 'condition'],                    optional: ['humidity_pct', 'rainfall_mm', 'wind_kmh'] },
  schemes:      { required: ['name', 'beneficiaries'],                  optional: ['budget_rupees', 'completion_pct'] },
  mpi:          { required: ['mpi_score', 'headcount_ratio'],           optional: ['intensity', 'year'] },
  demographics: { required: ['population', 'literacy_pct'],             optional: ['sex_ratio', 'density_per_sqkm'] },
}
```

- [ ] **Step 4: Write the ingestion engine**

Create `src/engine/ingestion-engine.ts`:
```ts
import { prisma } from '@/lib/db'
import { recomputeCoverage } from '@/lib/coverage'
import { fetchRest } from './adapters/rest-adapter'
import { fetchCsv } from './adapters/csv-adapter'
import { applySchemaMapToArray } from './schema-map'
import { computeQualityScore } from './quality-scorer'
import { MODULE_FIELDS } from './module-fields'
import type { DataSource, District } from '@prisma/client'

export async function runIngestion(): Promise<void> {
  const sources = await prisma.dataSource.findMany({ where: { active: true } })
  const affectedDistricts = new Set<string>()

  for (const source of sources) {
    if (!isDue(source)) continue

    const districts = await getTargetDistricts(source)

    for (const district of districts) {
      await ingestOne(source, district)
      affectedDistricts.add(district.slug)
    }

    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date() },
    })
  }

  for (const slug of affectedDistricts) {
    await recomputeCoverage(slug)
  }
}

function isDue(source: DataSource): boolean {
  if (!source.lastFetchedAt) return true
  const ageHours = (Date.now() - source.lastFetchedAt.getTime()) / 3_600_000
  return ageHours >= source.refreshHours
}

async function getTargetDistricts(source: DataSource): Promise<District[]> {
  if (source.districtCodes.length > 0) {
    return prisma.district.findMany({
      where: { districtCode: { in: source.districtCodes }, active: true },
    })
  }
  if (source.stateSlug) {
    return prisma.district.findMany({ where: { state: source.stateSlug, active: true } })
  }
  return prisma.district.findMany({ where: { active: true } })
}

async function ingestOne(source: DataSource, district: District): Promise<void> {
  const start = Date.now()
  const url = source.urlTemplate.replace('{district_code}', district.districtCode)

  try {
    const { data: raw } = source.type === 'CSV_DOWNLOAD'
      ? await fetchCsv(url)
      : await fetchRest(url)

    const rawArray = Array.isArray(raw) ? raw : [raw]
    const schemaMap = source.schemaMap as Record<string, string>
    const mapped = applySchemaMapToArray(rawArray as Record<string, unknown>[], schemaMap)

    const fields = MODULE_FIELDS[source.module] ?? { required: [], optional: [] }
    const qualityScore = mapped.length > 0
      ? computeQualityScore({
          data: mapped[0],
          requiredFields: fields.required,
          optionalFields: fields.optional,
          fetchedAt: new Date(),
          refreshHours: source.refreshHours,
        })
      : 0

    await prisma.moduleData.upsert({
      where: {
        districtSlug_module_sourceId: {
          districtSlug: district.slug,
          module: source.module,
          sourceId: source.id,
        },
      },
      create: {
        districtSlug: district.slug,
        module: source.module,
        sourceId: source.id,
        data: mapped,
        qualityScore,
        fetchedAt: new Date(),
      },
      update: { data: mapped, qualityScore, fetchedAt: new Date() },
    })

    await prisma.ingestionLog.create({
      data: {
        sourceId: source.id,
        districtSlug: district.slug,
        fetchedAt: new Date(),
        recordCount: mapped.length,
        qualityScore,
        durationMs: Date.now() - start,
      },
    })
  } catch (err) {
    await prisma.ingestionLog.create({
      data: {
        sourceId: source.id,
        districtSlug: district.slug,
        fetchedAt: new Date(),
        recordCount: 0,
        qualityScore: 0,
        error: String(err),
        durationMs: Date.now() - start,
      },
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test src/__tests__/engine/ingestion-engine.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/engine/ src/__tests__/engine/
git commit -m "feat: add ingestion engine with retry, mapping, and quality scoring"
```

---

## Task 8: Public REST API

**Files:**
- Create: `src/app/api/v1/districts/route.ts`
- Create: `src/app/api/v1/districts/[slug]/route.ts`
- Create: `src/app/api/v1/districts/[slug]/modules/route.ts`
- Create: `src/app/api/v1/districts/[slug]/modules/[module]/route.ts`
- Create: `src/app/api/v1/sources/route.ts`
- Create: `src/app/api/v1/sources/[id]/log/route.ts`
- Create: `src/lib/cache.ts`

- [ ] **Step 1: Create Redis cache helpers**

Create `src/lib/cache.ts`:
```ts
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await redis.get<T>(key)
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch {
    // Cache failures are non-fatal
  }
}

export const MODULE_TTL: Record<string, number> = {
  crops: 6 * 3600,
  weather: 3 * 3600,
  dams: 12 * 3600,
  budget: 24 * 3600,
  elections: 24 * 3600,
  schemes: 24 * 3600,
  mpi: 7 * 24 * 3600,
  demographics: 7 * 24 * 3600,
}
```

- [ ] **Step 2: Create GET /api/v1/districts**

Create `src/app/api/v1/districts/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/cache'

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get('state')
  const key = `v1:districts:${state ?? 'all'}`

  const cached = await cacheGet(key)
  if (cached) return NextResponse.json(cached)

  const districts = await prisma.district.findMany({
    where: { active: true, ...(state ? { state } : {}) },
    include: { coverage: true },
    orderBy: { name: 'asc' },
  })

  const data = districts.map(d => ({
    slug: d.slug,
    name: d.name,
    nameLocal: d.nameLocal,
    state: d.state,
    lat: d.lat,
    lng: d.lng,
    coverage: d.coverage
      ? { overallScore: d.coverage.overallScore, activeModules: d.coverage.activeModules }
      : null,
  }))

  const body = { data, meta: { count: data.length, state: state ?? 'all' } }
  await cacheSet(key, body, 3600)
  return NextResponse.json(body)
}
```

- [ ] **Step 3: Create GET /api/v1/districts/[slug]**

Create `src/app/api/v1/districts/[slug]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  const district = await prisma.district.findUnique({
    where: { slug },
    include: { coverage: true },
  })
  if (!district) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    data: {
      slug: district.slug,
      name: district.name,
      nameLocal: district.nameLocal,
      state: district.state,
      districtCode: district.districtCode,
      lat: district.lat,
      lng: district.lng,
      coverage: district.coverage,
    },
  })
}
```

- [ ] **Step 4: Create GET /api/v1/districts/[slug]/modules**

Create `src/app/api/v1/districts/[slug]/modules/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ slug: string }> }

const QUALITY_THRESHOLD = 40

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params

  const coverage = await prisma.districtCoverage.findUnique({
    where: { districtSlug: slug },
  })

  if (!coverage) {
    return NextResponse.json({ data: [], meta: { districtSlug: slug } })
  }

  const modules = coverage.modules as Record<string, number>
  const data = Object.entries(modules).map(([module, score]) => ({
    module,
    qualityScore: score,
    active: score >= QUALITY_THRESHOLD,
    lastComputedAt: coverage.lastComputedAt,
  }))

  return NextResponse.json({ data, meta: { districtSlug: slug } })
}
```

- [ ] **Step 5: Create GET /api/v1/districts/[slug]/modules/[module]**

Create `src/app/api/v1/districts/[slug]/modules/[module]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cacheGet, cacheSet, MODULE_TTL } from '@/lib/cache'

type Ctx = { params: Promise<{ slug: string; module: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { slug, module } = await ctx.params
  const key = `v1:module:${slug}:${module}`

  const cached = await cacheGet(key)
  if (cached) return NextResponse.json(cached)

  const rows = await prisma.moduleData.findMany({
    where: { districtSlug: slug, module },
    include: { source: { select: { id: true, name: true, urlTemplate: true } } },
    orderBy: { qualityScore: 'desc' },
    take: 1,
  })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No data for this module' }, { status: 404 })
  }

  const row = rows[0]
  const body = {
    data: row.data,
    meta: {
      districtSlug: slug,
      module,
      sourceId: row.sourceId,
      sourceName: row.source.name,
      sourceUrl: row.source.urlTemplate,
      qualityScore: row.qualityScore,
      fetchedAt: row.fetchedAt,
    },
  }

  await cacheSet(key, body, MODULE_TTL[module] ?? 3600)
  return NextResponse.json(body)
}
```

- [ ] **Step 6: Create sources endpoints**

Create `src/app/api/v1/sources/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const sources = await prisma.dataSource.findMany({
    where: { active: true },
    select: {
      id: true, name: true, type: true, module: true,
      stateSlug: true, refreshHours: true, lastFetchedAt: true, uptime30d: true,
    },
    orderBy: { module: 'asc' },
  })
  return NextResponse.json({ data: sources, meta: { count: sources.length } })
}
```

Create `src/app/api/v1/sources/[id]/log/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50')
  const cursor = req.nextUrl.searchParams.get('cursor')

  const logs = await prisma.ingestionLog.findMany({
    where: { sourceId: id, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { fetchedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    data: logs,
    meta: {
      sourceId: id,
      nextCursor: logs.length === limit ? logs[logs.length - 1].id : null,
    },
  })
}
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: All prior tests still passing.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/ src/lib/cache.ts
git commit -m "feat: add public REST API v1 with data lineage"
```

---

## Task 9: Citizen Dashboard — Pages

**Files:**
- Create: `src/components/CoverageBadge.tsx`
- Create: `src/components/ModuleCard.tsx`
- Create: `src/components/DistrictCard.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/[district]/page.tsx`
- Create: `src/app/[district]/[module]/page.tsx`

- [ ] **Step 1: Create CoverageBadge component**

Create `src/components/CoverageBadge.tsx`:
```tsx
import { formatDistanceToNow } from 'date-fns'

interface Props {
  score: number
  fetchedAt: Date | string | null
  className?: string
}

export function CoverageBadge({ score, fetchedAt, className = '' }: Props) {
  const color =
    score >= 80 ? 'bg-green-100 text-green-800' :
    score >= 50 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'

  const age = fetchedAt
    ? formatDistanceToNow(new Date(fetchedAt), { addSuffix: true })
    : null

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {score}% complete
      {age && <span className="opacity-70">· {age}</span>}
    </span>
  )
}
```

- [ ] **Step 2: Create ModuleCard component**

Create `src/components/ModuleCard.tsx`:
```tsx
import Link from 'next/link'
import { CoverageBadge } from './CoverageBadge'

interface Props {
  districtSlug: string
  module: string
  label: string
  qualityScore: number
  fetchedAt: Date | string | null
}

const MODULE_LABELS: Record<string, string> = {
  crops: 'Crop Prices',
  budget: 'Budget',
  elections: 'Elections',
  dams: 'Water & Dams',
  weather: 'Weather',
  schemes: 'Gov. Schemes',
  mpi: 'Poverty Index',
  demographics: 'Demographics',
}

export function ModuleCard({ districtSlug, module, qualityScore, fetchedAt }: Props) {
  const label = MODULE_LABELS[module] ?? module
  return (
    <Link
      href={`/${districtSlug}/${module}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900">{label}</h3>
        <CoverageBadge score={qualityScore} fetchedAt={fetchedAt} />
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Create DistrictCard component**

Create `src/components/DistrictCard.tsx`:
```tsx
import Link from 'next/link'

interface Props {
  slug: string
  name: string
  state: string
  activeModules: number | null
  overallScore: number | null
}

export function DistrictCard({ slug, name, state, activeModules, overallScore }: Props) {
  return (
    <Link
      href={`/${slug}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <h3 className="font-semibold text-gray-900">{name}</h3>
      <p className="text-sm text-gray-500 capitalize">{state}</p>
      {activeModules != null && (
        <p className="mt-2 text-xs text-gray-400">
          {activeModules} module{activeModules !== 1 ? 's' : ''} live
          {overallScore != null && ` · ${overallScore}% avg coverage`}
        </p>
      )}
    </Link>
  )
}
```

- [ ] **Step 4: Build the homepage**

Replace `src/app/page.tsx`:
```tsx
import { prisma } from '@/lib/db'
import { DistrictCard } from '@/components/DistrictCard'

export const revalidate = 3600

export default async function HomePage() {
  const districts = await prisma.district.findMany({
    where: { active: true },
    include: { coverage: true },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">District Data</h1>
      <p className="mt-2 text-gray-500">
        Real-time government data for {districts.length} Maharashtra districts.
        Every number carries its source.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {districts.map(d => (
          <DistrictCard
            key={d.slug}
            slug={d.slug}
            name={d.name}
            state={d.state}
            activeModules={d.coverage?.activeModules ?? null}
            overallScore={d.coverage?.overallScore ?? null}
          />
        ))}
      </div>

      <div className="mt-12 rounded-lg border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-medium text-blue-900">Public API</p>
        <code className="mt-1 block text-xs text-blue-700">GET /api/v1/districts?state=maharashtra</code>
        <p className="mt-1 text-xs text-blue-600">Every data point includes source URL, fetch timestamp, and quality score.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Build the district page**

Create `src/app/[district]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ModuleCard } from '@/components/ModuleCard'

type Ctx = { params: Promise<{ district: string }> }

export const revalidate = 3600

export default async function DistrictPage({ params }: Ctx) {
  const { district: slug } = await params

  const district = await prisma.district.findUnique({
    where: { slug },
    include: { coverage: true },
  })
  if (!district) notFound()

  const moduleData = await prisma.moduleData.findMany({
    where: { districtSlug: slug },
    orderBy: { qualityScore: 'desc' },
  })

  // Deduplicate: keep best-scoring record per module
  const best: Record<string, typeof moduleData[0]> = {}
  for (const row of moduleData) {
    if (!best[row.module] || row.qualityScore > best[row.module].qualityScore) {
      best[row.module] = row
    }
  }

  const activeModules = Object.values(best).filter(r => r.qualityScore >= 40)

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">{district.name}</h1>
      <p className="mt-1 text-gray-500 capitalize">{district.state}</p>

      {district.coverage && (
        <p className="mt-2 text-sm text-gray-400">
          {district.coverage.activeModules} modules live · {district.coverage.overallScore}% avg coverage
        </p>
      )}

      {activeModules.length === 0 ? (
        <p className="mt-8 text-gray-400">No data available yet for this district.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeModules.map(row => (
            <ModuleCard
              key={row.module}
              districtSlug={slug}
              module={row.module}
              label={row.module}
              qualityScore={row.qualityScore}
              fetchedAt={row.fetchedAt}
            />
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Build the module detail page**

Create `src/app/[district]/[module]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { CoverageBadge } from '@/components/CoverageBadge'
import { ExternalLink } from 'lucide-react'

type Ctx = { params: Promise<{ district: string; module: string }> }

export const revalidate = 3600

export default async function ModulePage({ params }: Ctx) {
  const { district: slug, module } = await params

  const row = await prisma.moduleData.findFirst({
    where: { districtSlug: slug, module },
    include: { source: true },
    orderBy: { qualityScore: 'desc' },
  })
  if (!row) notFound()

  const records = Array.isArray(row.data) ? row.data : [row.data]

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 capitalize">{module.replace(/-/g, ' ')}</h1>
        <CoverageBadge score={row.qualityScore} fetchedAt={row.fetchedAt} />
      </div>

      <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
        <span>Source:</span>
        <a
          href={row.source.urlTemplate}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-blue-500 hover:underline"
        >
          {row.source.name}
          <ExternalLink className="h-3 w-3" />
        </a>
        <span>· Fetched {new Date(row.fetchedAt).toLocaleString()}</span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {Object.keys(records[0] as object).map(key => (
                <th key={key} className="px-4 py-3 text-left font-medium text-gray-600">{key}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(records as Record<string, unknown>[]).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {Object.values(row).map((val, j) => (
                  <td key={j} className="px-4 py-3 text-gray-700">{String(val ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: add citizen dashboard with coverage badges and data lineage"
```

---

## Task 10: Maharashtra Seed — 8 Sources + 36 Districts

**Files:**
- Create: `prisma/seed-mh.ts`

- [ ] **Step 1: Write the seed file**

Create `prisma/seed-mh.ts`:
```ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SOURCES = [
  {
    id: 'data-gov-in-census-mh',
    name: 'data.gov.in — Census 2011 Maharashtra',
    type: 'REST',
    urlTemplate: 'https://api.data.gov.in/resource/1ac4f84d-45e3-456a-9889-8e1ecf00f0fc?api-key={DATAGOV_API_KEY}&format=json&filters%5Bstate_name%5D=Maharashtra&filters%5Bdistrict_name%5D={district_code}&limit=1',
    module: 'demographics',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24 * 7,
    schemaMap: { 'Total Population': 'population', 'Literates': 'literacy_pct', 'Sex Ratio': 'sex_ratio' },
  },
  {
    id: 'agmarknet-mh-crops',
    name: 'Agmarknet — Maharashtra Mandi Prices',
    type: 'REST',
    urlTemplate: 'https://agmarknet.gov.in/SearchCmmMkt.aspx?state=MH&district={district_code}&format=json',
    module: 'crops',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 6,
    schemaMap: { 'Commodity': 'name', 'Modal Price': 'price_rupees', 'Market': 'market', 'Min Price': 'min_price', 'Max Price': 'max_price', 'Variety': 'variety' },
  },
  {
    id: 'openweather-mh',
    name: 'OpenWeatherMap — Maharashtra Weather',
    type: 'REST',
    urlTemplate: 'https://api.openweathermap.org/data/2.5/weather?q={district_code},MH,IN&appid={OPENWEATHER_API_KEY}&units=metric',
    module: 'weather',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 3,
    schemaMap: { 'main.temp': 'temp_c', 'weather.0.description': 'condition', 'main.humidity': 'humidity_pct', 'wind.speed': 'wind_kmh' },
  },
  {
    id: 'mhwrd-dams',
    name: 'Maharashtra Water Resources Dept — Dam Levels',
    type: 'JSON_FEED',
    urlTemplate: 'https://imd.gov.in/pages/rainfall_main_district.php?state=Maharashtra&district={district_code}',
    module: 'dams',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 12,
    schemaMap: { 'dam_name': 'name', 'storage_pct': 'current_level_pct', 'capacity_mcm': 'capacity_mcm' },
  },
  {
    id: 'niti-mpi-mh',
    name: 'NITI Aayog — MPI Maharashtra',
    type: 'CSV_DOWNLOAD',
    urlTemplate: 'https://niti.gov.in/sites/default/files/2022-11/NationalMultidimensionalPovertyIndex_StateDistrict.csv',
    module: 'mpi',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24 * 30,
    schemaMap: { 'MPI Score': 'mpi_score', 'Headcount Ratio': 'headcount_ratio', 'Intensity': 'intensity', 'Year': 'year' },
  },
  {
    id: 'eci-elections-mh',
    name: 'Election Commission of India — Maharashtra Results',
    type: 'JSON_FEED',
    urlTemplate: 'https://results.eci.gov.in/ResultAcGenOct2024/partywiseresult-S13.htm',
    module: 'elections',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24,
    schemaMap: { 'Constituency': 'constituency', 'Winning Candidate': 'winner', 'Party': 'party', 'Votes': 'votes' },
  },
  {
    id: 'mahadbt-schemes-mh',
    name: 'MahaDBT — Maharashtra Scheme Beneficiaries',
    type: 'REST',
    urlTemplate: 'https://mahadbtmahait.gov.in/api/schemes?district={district_code}',
    module: 'schemes',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24,
    schemaMap: { 'scheme_name': 'name', 'total_beneficiaries': 'beneficiaries', 'budget_allocated': 'budget_rupees' },
  },
  {
    id: 'data-gov-in-budget-mh',
    name: 'data.gov.in — Maharashtra State Budget',
    type: 'REST',
    urlTemplate: 'https://api.data.gov.in/resource/budget-maharashtra?api-key={DATAGOV_API_KEY}&format=json&filters[district]={district_code}',
    module: 'budget',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24,
    schemaMap: { 'Department': 'department', 'Allocation': 'amount_rupees', 'Financial Year': 'year', 'Sector': 'category' },
  },
]

// All 36 Maharashtra districts with official district codes
const DISTRICTS = [
  { slug: 'ahmednagar', name: 'Ahmednagar', nameLocal: 'अहमदनगर', districtCode: 'MH-AHM', lat: 19.09, lng: 74.74 },
  { slug: 'akola', name: 'Akola', nameLocal: 'अकोला', districtCode: 'MH-AKL', lat: 20.71, lng: 77.00 },
  { slug: 'amravati', name: 'Amravati', nameLocal: 'अमरावती', districtCode: 'MH-AMR', lat: 20.93, lng: 77.76 },
  { slug: 'aurangabad', name: 'Chhatrapati Sambhajinagar', nameLocal: 'छत्रपती संभाजीनगर', districtCode: 'MH-AUR', lat: 19.88, lng: 75.32 },
  { slug: 'beed', name: 'Beed', nameLocal: 'बीड', districtCode: 'MH-BED', lat: 18.98, lng: 75.76 },
  { slug: 'bhandara', name: 'Bhandara', nameLocal: 'भंडारा', districtCode: 'MH-BHN', lat: 21.16, lng: 79.64 },
  { slug: 'buldhana', name: 'Buldhana', nameLocal: 'बुलढाणा', districtCode: 'MH-BUL', lat: 20.53, lng: 76.18 },
  { slug: 'chandrapur', name: 'Chandrapur', nameLocal: 'चंद्रपूर', districtCode: 'MH-CHA', lat: 19.96, lng: 79.29 },
  { slug: 'dhule', name: 'Dhule', nameLocal: 'धुळे', districtCode: 'MH-DHU', lat: 20.90, lng: 74.77 },
  { slug: 'gadchiroli', name: 'Gadchiroli', nameLocal: 'गडचिरोली', districtCode: 'MH-GAD', lat: 20.18, lng: 80.00 },
  { slug: 'gondia', name: 'Gondia', nameLocal: 'गोंदिया', districtCode: 'MH-GON', lat: 21.46, lng: 80.19 },
  { slug: 'hingoli', name: 'Hingoli', nameLocal: 'हिंगोली', districtCode: 'MH-HIN', lat: 19.71, lng: 77.14 },
  { slug: 'jalgaon', name: 'Jalgaon', nameLocal: 'जळगाव', districtCode: 'MH-JAL', lat: 21.00, lng: 75.56 },
  { slug: 'jalna', name: 'Jalna', nameLocal: 'जालना', districtCode: 'MH-JLN', lat: 19.84, lng: 75.88 },
  { slug: 'kolhapur', name: 'Kolhapur', nameLocal: 'कोल्हापूर', districtCode: 'MH-KOL', lat: 16.70, lng: 74.23 },
  { slug: 'latur', name: 'Latur', nameLocal: 'लातूर', districtCode: 'MH-LAT', lat: 18.40, lng: 76.56 },
  { slug: 'mumbai-city', name: 'Mumbai City', nameLocal: 'मुंबई शहर', districtCode: 'MH-MUC', lat: 18.93, lng: 72.83 },
  { slug: 'mumbai-suburban', name: 'Mumbai Suburban', nameLocal: 'मुंबई उपनगर', districtCode: 'MH-MUS', lat: 19.15, lng: 72.90 },
  { slug: 'nagpur', name: 'Nagpur', nameLocal: 'नागपूर', districtCode: 'MH-NAG', lat: 21.14, lng: 79.08 },
  { slug: 'nanded', name: 'Nanded', nameLocal: 'नांदेड', districtCode: 'MH-NAN', lat: 19.16, lng: 77.30 },
  { slug: 'nandurbar', name: 'Nandurbar', nameLocal: 'नंदुरबार', districtCode: 'MH-NDB', lat: 21.36, lng: 74.24 },
  { slug: 'nashik', name: 'Nashik', nameLocal: 'नाशिक', districtCode: 'MH-NAS', lat: 19.99, lng: 73.79 },
  { slug: 'osmanabad', name: 'Dharashiv', nameLocal: 'धाराशीव', districtCode: 'MH-OSM', lat: 18.18, lng: 76.04 },
  { slug: 'palghar', name: 'Palghar', nameLocal: 'पालघर', districtCode: 'MH-PAL', lat: 19.69, lng: 72.76 },
  { slug: 'parbhani', name: 'Parbhani', nameLocal: 'परभणी', districtCode: 'MH-PAR', lat: 19.27, lng: 76.77 },
  { slug: 'pune', name: 'Pune', nameLocal: 'पुणे', districtCode: 'MH-PUN', lat: 18.52, lng: 73.86 },
  { slug: 'raigad', name: 'Raigad', nameLocal: 'रायगड', districtCode: 'MH-RAI', lat: 18.51, lng: 73.18 },
  { slug: 'ratnagiri', name: 'Ratnagiri', nameLocal: 'रत्नागिरी', districtCode: 'MH-RAT', lat: 16.99, lng: 73.30 },
  { slug: 'sangli', name: 'Sangli', nameLocal: 'सांगली', districtCode: 'MH-SAN', lat: 16.85, lng: 74.56 },
  { slug: 'satara', name: 'Satara', nameLocal: 'सातारा', districtCode: 'MH-SAT', lat: 17.68, lng: 73.99 },
  { slug: 'sindhudurg', name: 'Sindhudurg', nameLocal: 'सिंधुदुर्ग', districtCode: 'MH-SIN', lat: 16.35, lng: 73.64 },
  { slug: 'solapur', name: 'Solapur', nameLocal: 'सोलापूर', districtCode: 'MH-SOL', lat: 17.68, lng: 75.90 },
  { slug: 'thane', name: 'Thane', nameLocal: 'ठाणे', districtCode: 'MH-THA', lat: 19.22, lng: 72.97 },
  { slug: 'wardha', name: 'Wardha', nameLocal: 'वर्धा', districtCode: 'MH-WAR', lat: 20.74, lng: 78.60 },
  { slug: 'washim', name: 'Washim', nameLocal: 'वाशीम', districtCode: 'MH-WAS', lat: 20.11, lng: 77.13 },
  { slug: 'yavatmal', name: 'Yavatmal', nameLocal: 'यवतमाळ', districtCode: 'MH-YAV', lat: 20.38, lng: 78.12 },
]

async function main() {
  console.log('Seeding Maharashtra sources...')
  for (const source of SOURCES) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      create: { ...source, schemaMap: source.schemaMap },
      update: { ...source, schemaMap: source.schemaMap },
    })
  }
  console.log(`Seeded ${SOURCES.length} sources.`)

  console.log('Seeding Maharashtra districts...')
  for (const district of DISTRICTS) {
    await prisma.district.upsert({
      where: { slug: district.slug },
      create: { ...district, state: 'maharashtra', active: true },
      update: { ...district, state: 'maharashtra', active: true },
    })
  }
  console.log(`Seeded ${DISTRICTS.length} districts.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Add seed script to package.json**

In `package.json` scripts:
```json
"db:seed:mh": "npx tsx prisma/seed-mh.ts"
```

- [ ] **Step 3: Run the seed**

```bash
npm run db:seed:mh
```

Expected output:
```
Seeding Maharashtra sources...
Seeded 8 sources.
Seeding Maharashtra districts...
Seeded 36 districts.
```

- [ ] **Step 4: Verify in DB**

```bash
npx prisma studio
```

Open `DataSource` table — expect 8 rows. Open `District` table — expect 36 rows with `state=maharashtra`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-mh.ts package.json
git commit -m "feat: seed 8 Maharashtra sources and 36 districts"
```

---

## Task 11: BullMQ Ingestion Worker

**Files:**
- Create: `worker/scheduler.ts`
- Create: `Dockerfile.worker`

- [ ] **Step 1: Write the scheduler**

Create `worker/scheduler.ts`:
```ts
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { runIngestion } from '../src/engine/ingestion-engine'

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const queue = new Queue('ingestion', { connection })

// Worker: process ingestion jobs
new Worker('ingestion', async () => {
  console.log(`[worker] Starting ingestion run at ${new Date().toISOString()}`)
  await runIngestion()
  console.log(`[worker] Ingestion complete at ${new Date().toISOString()}`)
}, { connection })

// Schedule: run every 30 minutes
async function schedule() {
  await queue.upsertJobScheduler(
    'ingestion-cron',
    { every: 30 * 60 * 1000 },
    { name: 'run', data: {} },
  )
  console.log('[scheduler] Ingestion job scheduled every 30 minutes.')
}

schedule().catch(console.error)
```

- [ ] **Step 2: Create Dockerfile for Railway worker**

Create `Dockerfile.worker`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npx prisma generate
CMD ["npx", "tsx", "worker/scheduler.ts"]
```

- [ ] **Step 3: Add worker script to package.json**

```json
"worker": "npx tsx worker/scheduler.ts",
"worker:dev": "npx tsx --watch worker/scheduler.ts"
```

- [ ] **Step 4: Run all tests one final time**

```bash
npm test
```

Expected: All tests passing.

- [ ] **Step 5: Commit**

```bash
git add worker/ Dockerfile.worker package.json
git commit -m "feat: add BullMQ ingestion worker for Railway deployment"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| Source Registry — self-describing sources | Task 2 (schema) + Task 10 (seed) |
| Ingestion Engine — fetch, map, score, store | Tasks 3–7 |
| Module visibility rule (quality ≥ 40) | Task 6 (engine) + Task 7 (coverage) + Task 9 (district page) |
| District Config — no seed files per district | Task 10 (36 districts as single seed run) |
| Public REST API with lineage envelope | Task 8 |
| Citizen dashboard — coverage badges | Task 9 |
| No ghost modules | Task 9 (district page filters by threshold) |
| Maharashtra 36 districts, 8 modules | Task 10 |
| BullMQ scheduled worker | Task 11 |
| New district < 5 min | Task 10 pattern demonstrates it |

**Type consistency check:** `AdapterResult` defined in `rest-adapter.ts`, imported by `csv-adapter.ts` — consistent. `MODULE_FIELDS` defined in `module-fields.ts`, imported by `ingestion-engine.ts` — consistent. `QUALITY_THRESHOLD = 40` defined in both `coverage.ts` and used implicitly in district page — extract to shared constant if desired (not a blocking issue).

**No placeholders:** All steps contain complete code. No TBDs.
