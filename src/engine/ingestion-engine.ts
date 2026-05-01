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

    for (const district of districts) {
      await ingestOne(source, district)
      affectedDistricts.add(district.slug)
    }

    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date() },
    })
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

async function ingestOne(source: DataSource, district: District): Promise<void> {
  const start = Date.now()
  const url = source.urlTemplate.replace('{district_code}', district.districtCode)

  try {
    const { data: raw } = source.type === 'CSV_DOWNLOAD'
      ? await fetchCsv(url)
      : await fetchRest(url)

    const rawArray = Array.isArray(raw) ? raw : [raw]
    const schemaMap = source.schemaMap as Record<string, string>
    const mapped = applySchemaMapToArray(rawArray as Record<string, unknown>[], schemaMap)

    const fields = MODULE_FIELDS[source.module] ?? { required: [], optional: [] }
    const qualityScore = mapped.length > 0
      ? computeQualityScore({
          data: mapped[0],
          requiredFields: fields.required,
          optionalFields: fields.optional,
          fetchedAt: new Date(),
          refreshHours: source.refreshHours,
        })
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
        fetchedAt: new Date(),
      },
      update: { data: mapped, qualityScore, fetchedAt: new Date() },
    })

    await prisma.ingestionLog.create({
      data: {
        sourceId: source.id,
        districtSlug: district.slug,
        fetchedAt: new Date(),
        recordCount: mapped.length,
        qualityScore,
        durationMs: Date.now() - start,
      },
    })
  } catch (err) {
    await prisma.ingestionLog.create({
      data: {
        sourceId: source.id,
        districtSlug: district.slug,
        fetchedAt: new Date(),
        recordCount: 0,
        qualityScore: 0,
        error: String(err),
        durationMs: Date.now() - start,
      },
    })
  }
}
