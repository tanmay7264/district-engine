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
