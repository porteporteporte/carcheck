/* ═══════════════════════════════════════════════════════════════════
   photoAnalysis.js  v4 — two-pass orchestrator

   Тонкий orchestrator. Реальна логіка в ./photoAI/*.

   Flow:
   1. classifyPhotos (Haiku) — визначає роль кожного фото
   2. selectAllGroups — ділить фото на 3 групи: exterior/interior/mechanical
   3. analyzeZoneGroup × 3 (Sonnet) — паралельно через Promise.all
   4. aggregate — збирає результати в стабільний контракт для UI/score

   Якщо Pass 1 впав — fallback на heuristic split фото.
   Якщо група має 0 фото — пропускаємо API виклик, всі checkpoints → not_visible.

   Контракт повернення СТАБІЛЬНИЙ: VinLookup.jsx і scoreCalculator.js
   не торкаються при цій зміні.
   ═══════════════════════════════════════════════════════════════════ */

import damageTypeMap from '../data/damageTypeMap.json'
import { findReferenceProfile } from './findReferenceProfile'
import { classifyPhotos } from './photoAI/classifyPhotos'
import { selectAllGroups, fallbackSelection } from './photoAI/selectPhotosForGroup'
import { analyzeZoneGroup, GROUP_ZONES } from './photoAI/analyzeZoneGroup'
import { aggregate } from './photoAI/aggregate'

var MAX_PHOTOS = 12

var ZONE_NAMES = [
  { id: 'front',      name: 'Передня частина' },
  { id: 'rear',       name: 'Задня частина' },
  { id: 'side_left',  name: 'Лівий бік (водійський)' },
  { id: 'side_right', name: 'Правий бік (пасажирський)' },
  { id: 'roof',       name: 'Дах і скла' },
  { id: 'interior',   name: 'Інтерʼєр і подушки безпеки' },
  { id: 'mechanical', name: 'Двигун і ходова' },
]

var COLLISION_ZONE_IDS = ['front', 'rear', 'side_left', 'side_right', 'roof', 'interior']

/* ═══ Public API — той самий що раніше ═══ */
export async function analyzePhotos(auction, autoria, vinDecode) {
  var allPhotos = auction?.images || []
  if (allPhotos.length === 0) return null

  var photos = allPhotos.slice(0, MAX_PHOTOS)
  var declared = auction['title-and-condition']?.['Primary Damage'] || ''
  var secondary = auction['title-and-condition']?.['Secondary Damage'] || ''
  var titleType = auction['title-and-condition']?.['Title Type'] || ''
  var titleClass = classifyTitleType(titleType)
  var primaryProfile = findDamageProfile(declared)

  /* Find reference profile */
  var make = autoria?.markName || vinDecode?.make || null
  var model = autoria?.modelName || vinDecode?.model || null
  var year = autoria?.autoData?.year || vinDecode?.year || null
  var reference = await findReferenceProfile(make, model, year)
  if (!reference) {
    console.warn('[photoAnalysis] no reference profile, aborting')
    return null
  }

  /* Decide which zones we care about */
  var relevantZoneIds = pickRelevantZoneIds(primaryProfile, reference, titleClass)
  var relevantZones = ZONE_NAMES.filter(function(z) { return relevantZoneIds.indexOf(z.id) !== -1 })

  /* Build full checkpoint set */
  var fullCheckpoints = buildCheckpointSet(reference, relevantZoneIds)
  if (fullCheckpoints.flat.length === 0) {
    console.warn('[photoAnalysis] reference has no checkpoints for relevant zones')
    return null
  }

  /* ─── Pass 1: classify photos ─── */
  var classifications = await classifyPhotos(photos)

  /* ─── Decide photo selection per group ─── */
  var groupSelections
  if (classifications) {
    groupSelections = selectAllGroups(classifications)
  } else {
    /* Pass 1 fail: fallback heuristic */
    console.warn('[photoAnalysis] Pass 1 failed, using heuristic split')
    groupSelections = fallbackSelection(photos)
  }

  /* ─── Pass 2: analyze each group in parallel ─── */
  var groupPromises = Object.keys(GROUP_ZONES).map(function(groupName) {
    var groupZoneIds = GROUP_ZONES[groupName].filter(function(zid) {
      return relevantZoneIds.indexOf(zid) !== -1
    })
    if (groupZoneIds.length === 0) {
      return Promise.resolve(null)
    }

    /* Slice checkpoints: only zones from this group */
    var groupCheckpoints = sliceCheckpointSet(fullCheckpoints, groupZoneIds)
    if (groupCheckpoints.flat.length === 0) return Promise.resolve(null)

    return analyzeZoneGroup({
      groupName: groupName,
      photos: photos,
      photoSelection: groupSelections[groupName] || [],
      checkpoints: groupCheckpoints,
      reference: reference,
      declared: declared,
      secondary: secondary,
      titleClass: titleClass,
      titleType: titleType,
    }).then(function(result) {
      return { groupName: groupName, result: result }
    })
  })

  var groupResultsArray = await Promise.all(groupPromises)
  var groupResults = {}
  groupResultsArray.forEach(function(item) {
    if (item) groupResults[item.groupName] = item.result
  })

  /* ─── Aggregate ─── */
  return aggregate({
    groupResults: groupResults,
    checkpointSet: fullCheckpoints,
    relevantZones: relevantZones,
    profile: primaryProfile,
    reference: reference,
    photoCount: photos.length,
    totalPhotos: allPhotos.length,
    titleClass: titleClass,
    declared: declared,
    classifications: classifications,
  })
}

/* ═══ Helpers (pure) ═══ */

function classifyTitleType(titleType) {
  if (!titleType) return null
  var t = String(titleType).toLowerCase()
  if (/flood|water|hurricane|katrina|sandy/i.test(t)) return 'flood'
  if (/rebuilt|reconstructed/i.test(t)) return 'rebuilt'
  if (/salvage|junk|scrap|certificate of destruction|parts only|non-?repairable/i.test(t)) return 'salvage'
  return null
}

function findDamageProfile(damage) {
  if (!damage || damage === 'N/A' || damage === '-') return null
  if (damageTypeMap[damage]) return damageTypeMap[damage]
  var l = damage.toLowerCase()
  if (/front/.test(l)) return damageTypeMap['Front End']
  if (/rear/.test(l)) return damageTypeMap['Rear End']
  if (/side/.test(l)) return damageTypeMap['Side']
  if (/top|roof/.test(l)) return damageTypeMap['Top/Roof']
  if (/all over/.test(l)) return damageTypeMap['All Over']
  if (/roll/.test(l)) return damageTypeMap['Roll Over']
  if (/engine/.test(l)) return damageTypeMap['Engine damage']
  if (/mech/.test(l)) return damageTypeMap['Mechanical']
  if (/wear/.test(l)) return damageTypeMap['Normal Wear']
  if (/minor|dent|scratch/.test(l)) return damageTypeMap['Minor Dent/Scratches']
  if (/hail/.test(l)) return damageTypeMap['Hail']
  if (/vandal/.test(l)) return damageTypeMap['Vandalism']
  if (/water|flood/.test(l)) return damageTypeMap['Water/Flood']
  if (/burn|fire/.test(l)) return damageTypeMap['Burn']
  return null
}

function pickRelevantZoneIds(primary, reference, titleClass) {
  var available = Object.keys(reference.zones || {})
  if (titleClass === 'flood') {
    return available.filter(function(id) {
      return id === 'interior' || id === 'mechanical' || COLLISION_ZONE_IDS.indexOf(id) !== -1
    })
  }
  if (primary && primary.body_intact) {
    return available.filter(function(id) { return id === 'interior' || id === 'mechanical' })
  }
  return available.filter(function(id) { return COLLISION_ZONE_IDS.indexOf(id) !== -1 })
}

function buildCheckpointSet(reference, zoneIds) {
  var flat = []
  var byZone = {}
  zoneIds.forEach(function(zid) {
    var zone = reference.zones[zid]
    if (!zone || !zone.checkpoints) return
    byZone[zid] = []
    Object.keys(zone.checkpoints).forEach(function(cpId) {
      var cp = zone.checkpoints[cpId]
      var entry = {
        zone_id: zid,
        checkpoint_id: cpId,
        question: cp.question,
        intact_signal: cp.intact_signal,
        damaged_signal: cp.damaged_signal,
        weight: cp.weight || 'normal',
      }
      flat.push(entry)
      byZone[zid].push(entry)
    })
  })
  return { flat: flat, byZone: byZone }
}

function sliceCheckpointSet(fullSet, zoneIds) {
  var byZone = {}
  var flat = []
  zoneIds.forEach(function(zid) {
    if (!fullSet.byZone[zid]) return
    byZone[zid] = fullSet.byZone[zid]
    flat = flat.concat(fullSet.byZone[zid])
  })
  return { byZone: byZone, flat: flat }
}
