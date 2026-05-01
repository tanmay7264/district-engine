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
