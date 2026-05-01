import { NextRequest, NextResponse } from 'next/server'
import { runIngestion } from '@/engine/ingestion-engine'

// Simple secret check — set INGEST_SECRET in env vars
const SECRET = process.env.INGEST_SECRET

export async function POST(req: NextRequest) {
  if (SECRET) {
    const auth = req.headers.get('x-ingest-secret')
    if (auth !== SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const start = Date.now()
  try {
    await runIngestion()
    return NextResponse.json({ ok: true, durationMs: Date.now() - start })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message, durationMs: Date.now() - start }, { status: 500 })
  }
}
