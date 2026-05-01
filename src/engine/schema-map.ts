export function applySchemaMap(
  raw: Record<string, unknown>,
  schemaMap: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [rawKey, canonicalKey] of Object.entries(schemaMap)) {
    // Use != null (loose) to drop both null and undefined — consistent with quality scorer
    if (raw[rawKey] != null) {
      result[canonicalKey] = raw[rawKey]
    }
  }
  return result
}

export function applySchemaMapToArray(
  rawArray: Record<string, unknown>[],
  schemaMap: Record<string, string>,
): Record<string, unknown>[] {
  return rawArray.map(item => applySchemaMap(item, schemaMap))
}
