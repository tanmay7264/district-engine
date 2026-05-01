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
