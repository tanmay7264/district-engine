import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { runIngestion } from '../src/engine/ingestion-engine'

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const queue = new Queue('ingestion', { connection })

// Worker: process ingestion jobs
new Worker('ingestion', async () => {
  console.log(`[worker] Starting ingestion run at ${new Date().toISOString()}`)
  await runIngestion()
  console.log(`[worker] Ingestion complete at ${new Date().toISOString()}`)
}, { connection })

// Schedule: run every 30 minutes
async function schedule() {
  await queue.upsertJobScheduler(
    'ingestion-cron',
    { every: 30 * 60 * 1000 },
    { name: 'run', data: {} },
  )
  console.log('[scheduler] Ingestion job scheduled every 30 minutes.')
}

schedule().catch(console.error)
