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
  // If required fields are defined but none are present, data is unusable — score 0.
  const presentRequired = requiredFields.filter(f => data[f] != null).length
  if (requiredFields.length > 0 && presentRequired === 0) return 0
  const requiredScore = requiredFields.length === 0 ? 1 : presentRequired / requiredFields.length

  // Optional field completeness: 20% weight
  const optionalScore = optionalFields.length === 0
    ? 1
    : optionalFields.filter(f => data[f] != null).length / optionalFields.length

  // Recency: 20% weight — zero at 2× refresh window
  const ageHours = (Date.now() - fetchedAt.getTime()) / 3_600_000
  const recencyScore = Math.max(0, 1 - ageHours / (refreshHours * 2))

  return Math.round((requiredScore * 0.6 + optionalScore * 0.2 + recencyScore * 0.2) * 100)
}
