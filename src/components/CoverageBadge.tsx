'use client'

import { formatDistanceToNow } from 'date-fns'

interface Props {
  score: number
  fetchedAt: Date | string | null
  className?: string
}

export function CoverageBadge({ score, fetchedAt, className = '' }: Props) {
  const color =
    score >= 80 ? 'bg-green-100 text-green-800' :
    score >= 50 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'

  const age = fetchedAt
    ? formatDistanceToNow(new Date(fetchedAt), { addSuffix: true })
    : null

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {score}% complete
      {age && <span className="opacity-70">· {age}</span>}
    </span>
  )
}
