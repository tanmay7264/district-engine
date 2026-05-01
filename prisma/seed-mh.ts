import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const SOURCES = [
  {
    id: 'data-gov-in-census-mh',
    name: 'data.gov.in — Census 2011 Maharashtra',
    type: 'REST',
    urlTemplate: 'https://api.data.gov.in/resource/1ac4f84d-45e3-456a-9889-8e1ecf00f0fc?api-key={DATAGOV_API_KEY}&format=json&filters%5Bstate_name%5D=Maharashtra&filters%5Bdistrict_name%5D={district_code}&limit=1',
    module: 'demographics',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24 * 7,
    schemaMap: { 'Total Population': 'population', 'Literates': 'literacy_pct', 'Sex Ratio': 'sex_ratio' },
  },
  {
    id: 'agmarknet-mh-crops',
    name: 'Agmarknet — Maharashtra Mandi Prices',
    type: 'REST',
    urlTemplate: 'https://agmarknet.gov.in/SearchCmmMkt.aspx?state=MH&district={district_code}&format=json',
    module: 'crops',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 6,
    schemaMap: { 'Commodity': 'name', 'Modal Price': 'price_rupees', 'Market': 'market', 'Min Price': 'min_price', 'Max Price': 'max_price', 'Variety': 'variety' },
  },
  {
    id: 'openweather-mh',
    name: 'OpenWeatherMap — Maharashtra Weather',
    type: 'REST',
    urlTemplate: 'https://api.openweathermap.org/data/2.5/weather?q={district_code},MH,IN&appid={OPENWEATHER_API_KEY}&units=metric',
    module: 'weather',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 3,
    schemaMap: { 'main.temp': 'temp_c', 'weather.0.description': 'condition', 'main.humidity': 'humidity_pct', 'wind.speed': 'wind_kmh' },
  },
  {
    id: 'mhwrd-dams',
    name: 'Maharashtra Water Resources Dept — Dam Levels',
    type: 'JSON_FEED',
    urlTemplate: 'https://imd.gov.in/pages/rainfall_main_district.php?state=Maharashtra&district={district_code}',
    module: 'dams',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 12,
    schemaMap: { 'dam_name': 'name', 'storage_pct': 'current_level_pct', 'capacity_mcm': 'capacity_mcm' },
  },
  {
    id: 'niti-mpi-mh',
    name: 'NITI Aayog — MPI Maharashtra',
    type: 'CSV_DOWNLOAD',
    urlTemplate: 'https://niti.gov.in/sites/default/files/2022-11/NationalMultidimensionalPovertyIndex_StateDistrict.csv',
    module: 'mpi',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24 * 30,
    schemaMap: { 'MPI Score': 'mpi_score', 'Headcount Ratio': 'headcount_ratio', 'Intensity': 'intensity', 'Year': 'year' },
  },
  {
    id: 'eci-elections-mh',
    name: 'Election Commission of India — Maharashtra Results',
    type: 'JSON_FEED',
    urlTemplate: 'https://results.eci.gov.in/ResultAcGenOct2024/partywiseresult-S13.htm',
    module: 'elections',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24,
    schemaMap: { 'Constituency': 'constituency', 'Winning Candidate': 'winner', 'Party': 'party', 'Votes': 'votes' },
  },
  {
    id: 'mahadbt-schemes-mh',
    name: 'MahaDBT — Maharashtra Scheme Beneficiaries',
    type: 'REST',
    urlTemplate: 'https://mahadbtmahait.gov.in/api/schemes?district={district_code}',
    module: 'schemes',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24,
    schemaMap: { 'scheme_name': 'name', 'total_beneficiaries': 'beneficiaries', 'budget_allocated': 'budget_rupees' },
  },
  {
    id: 'data-gov-in-budget-mh',
    name: 'data.gov.in — Maharashtra State Budget',
    type: 'REST',
    urlTemplate: 'https://api.data.gov.in/resource/budget-maharashtra?api-key={DATAGOV_API_KEY}&format=json&filters[district]={district_code}',
    module: 'budget',
    stateSlug: 'maharashtra',
    districtCodes: [] as string[],
    refreshHours: 24,
    schemaMap: { 'Department': 'department', 'Allocation': 'amount_rupees', 'Financial Year': 'year', 'Sector': 'category' },
  },
]

// All 36 Maharashtra districts
const DISTRICTS = [
  { slug: 'ahmednagar', name: 'Ahmednagar', nameLocal: 'अहमदनगर', districtCode: 'MH-AHM', lat: 19.09, lng: 74.74 },
  { slug: 'akola', name: 'Akola', nameLocal: 'अकोला', districtCode: 'MH-AKL', lat: 20.71, lng: 77.00 },
  { slug: 'amravati', name: 'Amravati', nameLocal: 'अमरावती', districtCode: 'MH-AMR', lat: 20.93, lng: 77.76 },
  { slug: 'aurangabad', name: 'Chhatrapati Sambhajinagar', nameLocal: 'छत्रपती संभाजीनगर', districtCode: 'MH-AUR', lat: 19.88, lng: 75.32 },
  { slug: 'beed', name: 'Beed', nameLocal: 'बीड', districtCode: 'MH-BED', lat: 18.98, lng: 75.76 },
  { slug: 'bhandara', name: 'Bhandara', nameLocal: 'भंडारा', districtCode: 'MH-BHN', lat: 21.16, lng: 79.64 },
  { slug: 'buldhana', name: 'Buldhana', nameLocal: 'बुलढाणा', districtCode: 'MH-BUL', lat: 20.53, lng: 76.18 },
  { slug: 'chandrapur', name: 'Chandrapur', nameLocal: 'चंद्रपूर', districtCode: 'MH-CHA', lat: 19.96, lng: 79.29 },
  { slug: 'dhule', name: 'Dhule', nameLocal: 'धुळे', districtCode: 'MH-DHU', lat: 20.90, lng: 74.77 },
  { slug: 'gadchiroli', name: 'Gadchiroli', nameLocal: 'गडचिरोली', districtCode: 'MH-GAD', lat: 20.18, lng: 80.00 },
  { slug: 'gondia', name: 'Gondia', nameLocal: 'गोंदिया', districtCode: 'MH-GON', lat: 21.46, lng: 80.19 },
  { slug: 'hingoli', name: 'Hingoli', nameLocal: 'हिंगोली', districtCode: 'MH-HIN', lat: 19.71, lng: 77.14 },
  { slug: 'jalgaon', name: 'Jalgaon', nameLocal: 'जळगाव', districtCode: 'MH-JAL', lat: 21.00, lng: 75.56 },
  { slug: 'jalna', name: 'Jalna', nameLocal: 'जालना', districtCode: 'MH-JLN', lat: 19.84, lng: 75.88 },
  { slug: 'kolhapur', name: 'Kolhapur', nameLocal: 'कोल्हापूर', districtCode: 'MH-KOL', lat: 16.70, lng: 74.23 },
  { slug: 'latur', name: 'Latur', nameLocal: 'लातूर', districtCode: 'MH-LAT', lat: 18.40, lng: 76.56 },
  { slug: 'mumbai-city', name: 'Mumbai City', nameLocal: 'मुंबई शहर', districtCode: 'MH-MUC', lat: 18.93, lng: 72.83 },
  { slug: 'mumbai-suburban', name: 'Mumbai Suburban', nameLocal: 'मुंबई उपनगर', districtCode: 'MH-MUS', lat: 19.15, lng: 72.90 },
  { slug: 'nagpur', name: 'Nagpur', nameLocal: 'नागपूर', districtCode: 'MH-NAG', lat: 21.14, lng: 79.08 },
  { slug: 'nanded', name: 'Nanded', nameLocal: 'नांदेड', districtCode: 'MH-NAN', lat: 19.16, lng: 77.30 },
  { slug: 'nandurbar', name: 'Nandurbar', nameLocal: 'नंदुरबार', districtCode: 'MH-NDB', lat: 21.36, lng: 74.24 },
  { slug: 'nashik', name: 'Nashik', nameLocal: 'नाशिक', districtCode: 'MH-NAS', lat: 19.99, lng: 73.79 },
  { slug: 'osmanabad', name: 'Dharashiv', nameLocal: 'धाराशीव', districtCode: 'MH-OSM', lat: 18.18, lng: 76.04 },
  { slug: 'palghar', name: 'Palghar', nameLocal: 'पालघर', districtCode: 'MH-PAL', lat: 19.69, lng: 72.76 },
  { slug: 'parbhani', name: 'Parbhani', nameLocal: 'परभणी', districtCode: 'MH-PAR', lat: 19.27, lng: 76.77 },
  { slug: 'pune', name: 'Pune', nameLocal: 'पुणे', districtCode: 'MH-PUN', lat: 18.52, lng: 73.86 },
  { slug: 'raigad', name: 'Raigad', nameLocal: 'रायगड', districtCode: 'MH-RAI', lat: 18.51, lng: 73.18 },
  { slug: 'ratnagiri', name: 'Ratnagiri', nameLocal: 'रत्नागिरी', districtCode: 'MH-RAT', lat: 16.99, lng: 73.30 },
  { slug: 'sangli', name: 'Sangli', nameLocal: 'सांगली', districtCode: 'MH-SAN', lat: 16.85, lng: 74.56 },
  { slug: 'satara', name: 'Satara', nameLocal: 'सातारा', districtCode: 'MH-SAT', lat: 17.68, lng: 73.99 },
  { slug: 'sindhudurg', name: 'Sindhudurg', nameLocal: 'सिंधुदुर्ग', districtCode: 'MH-SIN', lat: 16.35, lng: 73.64 },
  { slug: 'solapur', name: 'Solapur', nameLocal: 'सोलापूर', districtCode: 'MH-SOL', lat: 17.68, lng: 75.90 },
  { slug: 'thane', name: 'Thane', nameLocal: 'ठाणे', districtCode: 'MH-THA', lat: 19.22, lng: 72.97 },
  { slug: 'wardha', name: 'Wardha', nameLocal: 'वर्धा', districtCode: 'MH-WAR', lat: 20.74, lng: 78.60 },
  { slug: 'washim', name: 'Washim', nameLocal: 'वाशीम', districtCode: 'MH-WAS', lat: 20.11, lng: 77.13 },
  { slug: 'yavatmal', name: 'Yavatmal', nameLocal: 'यवतमाळ', districtCode: 'MH-YAV', lat: 20.38, lng: 78.12 },
]

async function main() {
  console.log('Seeding Maharashtra sources...')
  for (const source of SOURCES) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      create: { ...source, schemaMap: source.schemaMap },
      update: { ...source, schemaMap: source.schemaMap },
    })
  }
  console.log(`Seeded ${SOURCES.length} sources.`)

  console.log('Seeding Maharashtra districts...')
  for (const district of DISTRICTS) {
    await prisma.district.upsert({
      where: { slug: district.slug },
      create: { ...district, state: 'maharashtra', active: true },
      update: { ...district, state: 'maharashtra', active: true },
    })
  }
  console.log(`Seeded ${DISTRICTS.length} districts.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
