import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const ROOT       = path.join(__dirname, '..', 'src', 'data', 'reference')

function walkSync(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkSync(full, results)
    else if (entry.isFile() && entry.name.endsWith('.json')) results.push(full)
  }
  return results
}

function relPath(p) {
  return path.relative(ROOT, p).split(path.sep).join('/')
}

function isProfileFile(rel) {
  if (rel.startsWith('_')) return false
  if (rel.includes('/_')) return false
  const parts = rel.split('/')
  return parts.length === 3 && parts[2].endsWith('.json')
}

function validateProfile(profile, file) {
  const required = ['id', 'schema_version', 'make', 'model', 'generation', 'year_from', 'year_to', 'category', 'identification', 'zones', 'created_at', 'updated_at']
  const missing = required.filter(k => profile[k] === undefined || profile[k] === null)
  if (missing.length > 0) throw new Error(`${file}: missing required fields: ${missing.join(', ')}`)
  if (typeof profile.year_from !== 'number' || typeof profile.year_to !== 'number') throw new Error(`${file}: year_from/year_to must be numbers`)
  if (profile.year_to < profile.year_from) throw new Error(`${file}: year_to (${profile.year_to}) < year_from (${profile.year_from})`)
  if (!/^\d+\.\d+\.\d+$/.test(profile.schema_version)) throw new Error(`${file}: invalid schema_version "${profile.schema_version}"`)
  for (const zoneId in profile.zones) {
    const zone = profile.zones[zoneId]
    if (!zone.checkpoints || typeof zone.checkpoints !== 'object') throw new Error(`${file}: zone "${zoneId}" missing checkpoints`)
    for (const cpId in zone.checkpoints) {
      const cp = zone.checkpoints[cpId]
      if (!cp.question || !cp.intact_signal || !cp.damaged_signal) throw new Error(`${file}: checkpoint ${zoneId}/${cpId} missing question/intact_signal/damaged_signal`)
    }
  }
}

if (!fs.existsSync(ROOT)) {
  console.error('ERROR: directory not found:', ROOT)
  console.error('Expected layout: <project>/src/data/reference/  and  <project>/scripts/buildReferenceIndex.mjs')
  process.exit(1)
}

console.log('Scanning', ROOT)
const files = walkSync(ROOT)
console.log('Found', files.length, 'JSON files')

const profiles = []
const fallbacks = []
const makes = []
const seenIds = new Set()

for (const file of files) {
  const rel = relPath(file)
  if (rel === '_schema.json' || rel === '_index.json') continue

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.error('PARSE ERROR in', rel, ':', e.message)
    process.exit(1)
  }

  if (rel.startsWith('_fallback/')) {
    fallbacks.push({ category: raw.category, path: rel })
    continue
  }
  if (rel.endsWith('/_make.json')) {
    makes.push({ make: raw.make, path: rel })
    continue
  }
  if (!isProfileFile(rel)) {
    console.warn('Skipping unrecognized file:', rel)
    continue
  }

  try {
    validateProfile(raw, rel)
  } catch (e) {
    console.error('VALIDATION ERROR:', e.message)
    process.exit(1)
  }

  if (seenIds.has(raw.id)) {
    console.error('DUPLICATE ID:', raw.id, 'in', rel)
    process.exit(1)
  }
  seenIds.add(raw.id)

  profiles.push({
    id: raw.id,
    make: raw.make,
    model: raw.model,
    generation: raw.generation,
    year_from: raw.year_from,
    year_to: raw.year_to,
    category: raw.category,
    schema_version: raw.schema_version,
    verified: !!raw.verified,
    path: rel,
  })
}

const byModel = {}
for (const p of profiles) {
  const key = (p.make + '/' + p.model).toLowerCase().replace(/[^a-z0-9/]+/g, '-')
  if (!byModel[key]) byModel[key] = []
  byModel[key].push({
    generation: p.generation,
    year_from: p.year_from,
    year_to: p.year_to,
    path: p.path,
  })
}
for (const k in byModel) byModel[k].sort((a, b) => a.year_from - b.year_from)

const indexData = {
  generated_at: new Date().toISOString(),
  schema_version: '1.0.0',
  total_profiles: profiles.length,
  total_fallbacks: fallbacks.length,
  total_makes: makes.length,
  profiles,
  byModel,
  fallbacks,
  makes,
}

const outPath = path.join(ROOT, '_index.json')
fs.writeFileSync(outPath, JSON.stringify(indexData, null, 2) + '\n')
console.log('OK')
console.log('  profiles:', profiles.length)
console.log('  fallbacks:', fallbacks.length)
console.log('  makes:', makes.length)
console.log('  index written to:', path.relative(process.cwd(), outPath))
