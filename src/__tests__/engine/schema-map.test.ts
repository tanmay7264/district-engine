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
