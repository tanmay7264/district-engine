import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const sources = await prisma.dataSource.findMany({
    where: { active: true },
    select: {
      id: true, name: true, type: true, module: true,
      stateSlug: true, refreshHours: true, lastFetchedAt: true, uptime30d: true,
    },
    orderBy: { module: 'asc' },
  })
  return NextResponse.json({ data: sources, meta: { count: sources.length } })
}
