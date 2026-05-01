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
