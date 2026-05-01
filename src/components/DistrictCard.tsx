import Link from 'next/link'

interface Props {
  slug: string
  name: string
  state: string
  activeModules: number | null
  overallScore: number | null
}

export function DistrictCard({ slug, name, state, activeModules, overallScore }: Props) {
  return (
    <Link
      href={`/${slug}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <h3 className="font-semibold text-gray-900">{name}</h3>
      <p className="text-sm text-gray-500 capitalize">{state}</p>
      {activeModules != null && (
        <p className="mt-2 text-xs text-gray-400">
          {activeModules} module{activeModules !== 1 ? 's' : ''} live
          {overallScore != null && ` · ${overallScore}% avg coverage`}
        </p>
      )}
    </Link>
  )
}
