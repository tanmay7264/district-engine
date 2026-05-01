export interface AdapterResult {
  data: unknown
  durationMs: number
}

export async function fetchRest(
  url: string,
  timeoutMs = 30_000,
  maxRetries = 3,
): Promise<AdapterResult> {
  let lastError: Error = new Error('unknown')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { data, durationMs: Date.now() - start }
    } catch (err) {
      clearTimeout(timer)
      lastError = err as Error
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 500))
      }
    }
  }

  throw lastError
}
