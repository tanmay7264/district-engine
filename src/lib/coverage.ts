import { prisma } from './db'
import { QUALITY_THRESHOLD } from './constants'

export async function recomputeCoverage(districtSlug: string): Promise<void> {
  const rows = await prisma.moduleData.findMany({ where: { districtSlug } })

  const modules: Record<string, number> = {}
  for (const row of rows) {
    // Keep highest score if multiple sources cover same module
    if (modules[row.module] === undefined || row.qualityScore > modules[row.module]) {
      modules[row.module] = row.qualityScore
    }
  }

  const scores = Object.values(modules)
  const activeModules = scores.filter(s => s >= QUALITY_THRESHOLD).length
  const overallScore = scores.length === 0
    ? 0
    : Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)

  await prisma.districtCoverage.upsert({
    where: { districtSlug },
    create: { districtSlug, modules, overallScore, activeModules, lastComputedAt: new Date() },
    update: { modules, overallScore, activeModules, lastComputedAt: new Date() },
  })
}
