import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing coverage
vi.mock('@/lib/db', () => ({
  prisma: {
    moduleData: { findMany: vi.fn() },
    districtCoverage: { upsert: vi.fn() },
  },
}))

import { recomputeCoverage } from '@/lib/coverage'
import { prisma } from '@/lib/db'

describe('recomputeCoverage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes overallScore and activeModules from module data', async () => {
    vi.mocked(prisma.moduleData.findMany).mockResolvedValue([
      { module: 'crops', qualityScore: 85 },
      { module: 'budget', qualityScore: 72 },
      { module: 'weather', qualityScore: 20 }, // below threshold — inactive
    ] as any)
    vi.mocked(prisma.districtCoverage.upsert).mockResolvedValue({} as any)

    await recomputeCoverage('pune')

    expect(prisma.districtCoverage.upsert).toHaveBeenCalledWith(
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
    vi.mocked(prisma.moduleData.findMany).mockResolvedValue([])
    vi.mocked(prisma.districtCoverage.upsert).mockResolvedValue({} as any)

    await recomputeCoverage('nagpur')

    expect(prisma.districtCoverage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ overallScore: 0, activeModules: 0 }),
      }),
    )
  })
})
