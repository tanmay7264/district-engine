import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50')
  const cursor = req.nextUrl.searchParams.get('cursor')

  const logs = await prisma.ingestionLog.findMany({
    where: { sourceId: id, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { fetchedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    data: logs,
    meta: {
      sourceId: id,
      nextCursor: logs.length === limit ? logs[logs.length - 1].id : null,
    },
  })
}
