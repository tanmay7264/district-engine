import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { CoverageBadge } from '@/components/CoverageBadge'
import { ExternalLink } from 'lucide-react'

type Ctx = { params: Promise<{ district: string; module: string }> }

export const revalidate = 3600

export default async function ModulePage({ params }: Ctx) {
  const { district: slug, module } = await params

  const row = await prisma.moduleData.findFirst({
    where: { districtSlug: slug, module },
    include: { source: true },
    orderBy: { qualityScore: 'desc' },
  })
  if (!row) notFound()

  const records = Array.isArray(row.data) ? row.data : [row.data]

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 capitalize">{module.replace(/-/g, ' ')}</h1>
        <CoverageBadge score={row.qualityScore} fetchedAt={row.fetchedAt} />
      </div>

      <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
        <span>Source:</span>
        <a
          href={row.source.urlTemplate}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-blue-500 hover:underline"
        >
          {row.source.name}
          <ExternalLink className="h-3 w-3" />
        </a>
        <span>· Fetched {new Date(row.fetchedAt).toLocaleString()}</span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {Object.keys(records[0] as object).map(key => (
                <th key={key} className="px-4 py-3 text-left font-medium text-gray-600">{key}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(records as Record<string, unknown>[]).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {Object.values(row).map((val, j) => (
                  <td key={j} className="px-4 py-3 text-gray-700">{String(val ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
