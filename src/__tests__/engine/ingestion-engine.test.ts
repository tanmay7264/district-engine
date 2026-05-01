import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  dataSource: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  district: { findMany: vi.fn() },
  moduleData: { upsert: vi.fn() },
  ingestionLog: { create: vi.fn() },
}))
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
