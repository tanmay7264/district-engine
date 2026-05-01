import Link from 'next/link'
import { CoverageBadge } from './CoverageBadge'

interface Props {
  districtSlug: string
  module: string
  qualityScore: number
  fetchedAt: Date | string | null
}

const MODULE_LABELS: Record<string, string> = {
  crops: 'Crop Prices',
  budget: 'Budget',
  elections: 'Elections',
  dams: 'Water & Dams',
  weather: 'Weather',
  schemes: 'Gov. Schemes',
  mpi: 'Poverty Index',
  demographics: 'Demographics',
}

export function ModuleCard({ districtSlug, module, qualityScore, fetchedAt }: Props) {
  const label = MODULE_LABELS[module] ?? module
  return (
    <Link
      href={`/${districtSlug}/${module}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900">{label}</h3>
        <CoverageBadge score={qualityScore} fetchedAt={fetchedAt} />
      </div>
    </Link>
  )
}
