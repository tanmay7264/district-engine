export const MODULE_FIELDS: Record<string, { required: string[]; optional: string[] }> = {
  crops:        { required: ['name', 'price_rupees', 'market'],        optional: ['variety', 'unit', 'min_price', 'max_price'] },
  budget:       { required: ['department', 'amount_rupees', 'year'],   optional: ['category', 'utilization_pct'] },
  elections:    { required: ['constituency', 'winner', 'party', 'year'], optional: ['votes', 'margin', 'turnout_pct'] },
  dams:         { required: ['name', 'current_level_pct'],              optional: ['capacity_mcm', 'inflow_cusecs', 'outflow_cusecs'] },
  weather:      { required: ['temp_c', 'condition'],                    optional: ['humidity_pct', 'rainfall_mm', 'wind_kmh'] },
  schemes:      { required: ['name', 'beneficiaries'],                  optional: ['budget_rupees', 'completion_pct'] },
  mpi:          { required: ['mpi_score', 'headcount_ratio'],           optional: ['intensity', 'year'] },
  demographics: { required: ['population', 'literacy_pct'],             optional: ['sex_ratio', 'density_per_sqkm'] },
}
