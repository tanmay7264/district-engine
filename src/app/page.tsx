import { prisma } from '@/lib/db'
import { DistrictCard } from '@/components/DistrictCard'

export const revalidate = 3600

export default async function HomePage() {
  const districts = await prisma.district.findMany({
    where: { active: true },
    include: { coverage: true },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">District Data</h1>
      <p className="mt-2 text-gray-500">
        Real-time government data for {districts.length} Maharashtra districts.
        Every number carries its source.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {districts.map(d => (
          <DistrictCard
            key={d.slug}
            slug={d.slug}
            name={d.name}
            state={d.state}
            activeModules={d.coverage?.activeModules ?? null}
            overallScore={d.coverage?.overallScore ?? null}
          />
        ))}
      </div>

      <div className="mt-12 rounded-lg border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-medium text-blue-900">Public API</p>
        <code className="mt-1 block text-xs text-blue-700">GET /api/v1/districts?state=maharashtra</code>
        <p className="mt-1 text-xs text-blue-600">Every data point includes source URL, fetch timestamp, and quality score.</p>
      </div>
    </main>
  )
}
