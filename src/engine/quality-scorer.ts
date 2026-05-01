export interface QualityInput {
  data: Record<string, unknown>
  requiredFields: string[]
  optionalFields: string[]
  fetchedAt: Date
  refreshHours: number
}

export function computeQualityScore(input: QualityInput): number {
  const { data, requiredFields, optionalFields, fetchedAt, refreshHours } = input

  // Required field completeness: 60% weight
  const requiredScore = requiredFields.length === 0
    ? 1
    : requiredFields.filter(f => data[f] != null).length / requiredFields.length

  // Optional field completeness: 20% weight
  const optionalScore = optionalFields.length === 0
    ? 1
    : optionalFields.filter(f => data[f] != null).length / optionalFields.length

  // Recency: 20% weight — zero at 2× refresh window
  const ageHours = (Date.now() - fetchedAt.getTime()) / 3_600_000
  const recencyScore = Math.max(0, 1 - ageHours / (refreshHours * 2))

  const compositeScore = (requiredScore * 0.6 + optionalScore * 0.2 + recencyScore * 0.2) * 100

  // If no required fields are present, further penalize by reducing the score
  if (requiredScore === 0) {
    return Math.round(compositeScore * 0.9)
  }

  return Math.round(compositeScore)
}
