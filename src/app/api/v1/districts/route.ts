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

  const data = districts.map((d: typeof districts[number]) => ({
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
