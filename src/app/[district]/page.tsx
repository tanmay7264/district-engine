import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ModuleCard } from '@/components/ModuleCard'
import { QUALITY_THRESHOLD } from '@/lib/constants'

type Ctx = { params: Promise<{ district: string }> }

export const revalidate = 3600

export default async function DistrictPage({ params }: Ctx) {
  const { district: slug } = await params

  const district = await prisma.district.findUnique({
    where: { slug },
    include: { coverage: true },
  })
  if (!district) notFound()

  const moduleData = await prisma.moduleData.findMany({
    where: { districtSlug: slug },
    orderBy: { qualityScore: 'desc' },
  })

  // Deduplicate: keep best-scoring record per module
  const best: Record<string, typeof moduleData[0]> = {}
  for (const row of moduleData) {
    if (!best[row.module] || row.qualityScore > best[row.module].qualityScore) {
      best[row.module] = row
    }
  }

  const activeModules = Object.values(best).filter(r => r.qualityScore >= QUALITY_THRESHOLD)

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">{district.name}</h1>
      <p className="mt-1 text-gray-500 capitalize">{district.state}</p>

      {district.coverage && (
        <p className="mt-2 text-sm text-gray-400">
          {district.coverage.activeModules} modules live · {district.coverage.overallScore}% avg coverage
        </p>
      )}

      {activeModules.length === 0 ? (
        <p className="mt-8 text-gray-400">No data available yet for this district.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeModules.map(row => (
            <ModuleCard
              key={row.module}
              districtSlug={slug}
              module={row.module}
              label={row.module}
              qualityScore={row.qualityScore}
              fetchedAt={row.fetchedAt}
            />
          ))}
        </div>
      )}
    </main>
  )
}
