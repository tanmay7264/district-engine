import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { QUALITY_THRESHOLD } from '@/lib/constants'

type Ctx = { params: Promise<{ slug: string }> }

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
