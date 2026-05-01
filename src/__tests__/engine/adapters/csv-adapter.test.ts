import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchCsv } from '@/engine/adapters/csv-adapter'

describe('fetchCsv', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

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
