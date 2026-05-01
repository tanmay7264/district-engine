import { prisma } from '@/lib/db'
import { recomputeCoverage } from '@/lib/coverage'
import { fetchRest } from './adapters/rest-adapter'
import { fetchCsv } from './adapters/csv-adapter'
import { applySchemaMapToArray } from './schema-map'
import { computeQualityScore } from './quality-scorer'
import { MODULE_FIELDS } from './module-fields'
import type { DataSource, District } from '@prisma/client'

export async function runIngestion(): Promise<void> {
  const sources = await prisma.dataSource.findMany({ where: { active: true } })
  const affectedDistricts = new Set<string>()

  for (const source of sources) {
    if (!isDue(source)) continue

    const districts = await getTargetDistricts(source)

    let anySuccess = false
    for (const district of districts) {
      const ok = await ingestOne(source, district)
      if (ok) anySuccess = true
      affectedDistricts.add(district.slug)
    }

    // Only mark as fetched when at least one district succeeded — prevents
    // a total-failure run from suppressing the source for a full refresh window
    if (anySuccess) {
      await prisma.dataSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date() },
      })
    }
  }

  for (const slug of affectedDistricts) {
    await recomputeCoverage(slug)
  }
}

function isDue(source: DataSource): boolean {
  if (!source.lastFetchedAt) return true
  const ageHours = (Date.now() - source.lastFetchedAt.getTime()) / 3_600_000
  return ageHours >= source.refreshHours
}

async function getTargetDistricts(source: DataSource): Promise<District[]> {
  if (source.districtCodes.length > 0) {
    return prisma.district.findMany({
      where: { districtCode: { in: source.districtCodes }, active: true },
    })
  }
  if (source.stateSlug) {
    return prisma.district.findMany({ where: { state: source.stateSlug, active: true } })
  }
  return prisma.district.findMany({ where: { active: true } })
}

/** Returns true on success, false on error. */
async function ingestOne(source: DataSource, district: District): Promise<boolean> {
  const start = Date.now()
  const fetchedAt = new Date()
  const url = source.urlTemplate.replace('{district_code}', district.districtCode)

  try {
    const { data: raw } = source.type === 'CSV_DOWNLOAD'
      ? await fetchCsv(url)
      : await fetchRest(url)

    const rawArray = Array.isArray(raw) ? raw : [raw]
    const schemaMap = source.schemaMap as Record<string, string>
    const mapped = applySchemaMapToArray(rawArray as Record<string, unknown>[], schemaMap)

    const fields = MODULE_FIELDS[source.module] ?? { required: [], optional: [] }
    // Average quality across all records (not just first) for accurate representation
    const qualityScore = mapped.length > 0
      ? Math.round(
          mapped.reduce((sum, record) =>
            sum + computeQualityScore({
              data: record,
              requiredFields: fields.required,
              optionalFields: fields.optional,
              fetchedAt,
              refreshHours: source.refreshHours,
            }), 0) / mapped.length
        )
      : 0

    await prisma.moduleData.upsert({
      where: {
        districtSlug_module_sourceId: {
          districtSlug: district.slug,
          module: source.module,
          sourceId: source.id,
        },
      },
      create: {
        districtSlug: district.slug,
        module: source.module,
        sourceId: source.id,
        data: mapped,
        qualityScore,
        fetchedAt,
      },
      update: { data: mapped, qualityScore, fetchedAt },
    })

    await prisma.ingestionLog.create({
      data: {
        sourceId: source.id,
        districtSlug: district.slug,
        fetchedAt,
        recordCount: mapped.length,
        qualityScore,
        durationMs: Date.now() - start,
      },
    })
    return true
  } catch (err) {
    await prisma.ingestionLog.create({
      data: {
        sourceId: source.id,
        districtSlug: district.slug,
        fetchedAt,
        recordCount: 0,
        qualityScore: 0,
        error: String(err),
        durationMs: Date.now() - start,
      },
    })
    return false
  }
}
