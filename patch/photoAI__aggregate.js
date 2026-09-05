/* ═══════════════════════════════════════════════════════════════════
   aggregate.js v2 — description як масив для UI bullet rendering

   Зміни v1 → v2:
   - description перетворюється на масив строк замість одного рядка
   - кожний елемент = одна проблема з конкретного checkpoint
   - якщо AI у note вказав "Видно на фото X" — JS витягує фото-ідекси
   ═══════════════════════════════════════════════════════════════════ */

var ZONES = [
  { id: 'front',      name: 'Передня частина' },
  { id: 'rear',       name: 'Задня частина' },
  { id: 'side_left',  name: 'Лівий бік (водійський)' },
  { id: 'side_right', name: 'Правий бік (пасажирський)' },
  { id: 'roof',       name: 'Дах і скла' },
  { id: 'interior',   name: 'Інтерʼєр і подушки безпеки' },
  { id: 'mechanical', name: 'Двигун і ходова' },
]

var WEIGHT_VALUES = { minor: 1, normal: 2, major: 4 }

export function aggregate(opts) {
  var groupResults = opts.groupResults
  var checkpointSet = opts.checkpointSet
  var relevantZones = opts.relevantZones
  var profile = opts.profile
  var reference = opts.reference
  var photoCount = opts.photoCount
  var totalPhotos = opts.totalPhotos
  var titleClass = opts.titleClass
  var declared = opts.declared
  var classifications = opts.classifications

  var allCheckpoints = []
  var allObservations = []
  var matchesDeclaredFromAI = null

  Object.keys(groupResults).forEach(function(groupName) {
    var gr = groupResults[groupName]
    if (!gr) return
    if (gr.checkpoints) allCheckpoints = allCheckpoints.concat(gr.checkpoints)
    if (gr.additional_observations) allObservations = allObservations.concat(gr.additional_observations)
    if (gr.matches_declared === false) matchesDeclaredFromAI = false
    else if (matchesDeclaredFromAI === null && typeof gr.matches_declared === 'boolean') {
      matchesDeclaredFromAI = gr.matches_declared
    }
  })

  var answers = {}
  allCheckpoints.forEach(function(c) {
    answers[c.zone_id + '/' + c.checkpoint_id] = c
  })

  var damaged = []
  var intact = []
  var unclear = []

  relevantZones.forEach(function(zone) {
    var zoneCheckpoints = checkpointSet.byZone[zone.id] || []
    if (zoneCheckpoints.length === 0) return

    var problems = []
    var unclearCps = []
    var intactCps = []

    zoneCheckpoints.forEach(function(cp) {
      var ans = answers[cp.zone_id + '/' + cp.checkpoint_id]
      if (!ans) {
        unclearCps.push(cp)
        return
      }
      if (ans.answer === 'no') {
        problems.push({
          cpId: cp.checkpoint_id,
          weight: cp.weight,
          evidencePhoto: typeof ans.evidence_photo === 'number' ? ans.evidence_photo : null,
          note: ans.note ? String(ans.note).trim() : '',
          shortLabel: extractShortLabel(cp.damaged_signal),
        })
      } else if (ans.answer === 'yes') {
        intactCps.push(cp)
      } else {
        unclearCps.push(cp)
      }
    })

    var totalWeight = zoneCheckpoints.reduce(function(s, c) { return s + WEIGHT_VALUES[c.weight] }, 0)
    var damagedWeight = problems.reduce(function(s, p) { return s + WEIGHT_VALUES[p.weight] }, 0)
    var damageRatio = totalWeight > 0 ? damagedWeight / totalWeight : 0

    var status
    if (problems.length === 0) {
      status = (intactCps.length === 0 && unclearCps.length > 0) ? 'not_visible' : 'intact'
    } else {
      var majorCount = problems.filter(function(p) { return p.weight === 'major' }).length
      if (damageRatio >= 0.5 || majorCount >= 2)        status = 'severe'
      else if (majorCount >= 1 || problems.length >= 3) status = 'moderate'
      else                                                status = 'cosmetic'
    }

    /* description — тепер МАСИВ. Кожен елемент: { text, photos } */
    var descriptionItems = buildZoneDescriptionItems(problems, intactCps, unclearCps)
    var firstEvidence = problems.find(function(p) { return p.evidencePhoto != null })
    var photoIndex = firstEvidence ? firstEvidence.evidencePhoto : null

    var entry = {
      partId: zone.id,
      partName: zone.name,
      side: null,
      zone: zone.id,
      status: status,
      photoIndex: photoIndex,
      /* Backward compat — фоллбек string склеює всі items для старого UI */
      description: descriptionItems.length > 0
        ? descriptionItems.map(function(it) { return it.text }).join('; ')
        : (intactCps.length > 0 ? 'Видимих пошкоджень не виявлено.' : 'Зону не видно достатньо чітко.'),
      /* Новий формат — масив для bullet rendering */
      descriptionItems: descriptionItems,
      issues: problems.map(function(p) { return p.note || p.shortLabel }).filter(Boolean),
      evidencePhotos: problems.map(function(p) { return p.evidencePhoto }).filter(function(x) { return x != null }),
      checkpointResults: {
        total: zoneCheckpoints.length,
        damaged: problems.length,
        intact: intactCps.length,
        unclear: unclearCps.length,
        damageRatio: Math.round(damageRatio * 100) / 100,
      },
    }

    if (status === 'severe' || status === 'moderate' || (status === 'cosmetic' && problems.length > 0)) {
      damaged.push(entry)
    } else if (status === 'intact') {
      intact.push(entry)
    } else {
      unclear.push(entry)
    }
  })

  var statusRank = { intact: 0, cosmetic: 1, moderate: 2, severe: 3 }
  var maxStatus = 'intact'
  damaged.forEach(function(d) {
    if (statusRank[d.status] > statusRank[maxStatus]) maxStatus = d.status
  })
  var overallSeverity = maxStatus === 'severe' ? 'severe' : maxStatus === 'moderate' ? 'moderate' : 'minor'
  if (damaged.filter(function(d) { return d.status === 'severe' }).length >= 3) {
    overallSeverity = 'total_loss'
  }

  var assessable = damaged.length + intact.length
  var totalZones = relevantZones.length
  var coverage = totalZones > 0 ? assessable / totalZones : 0
  var confidence = 'high'
  if (coverage < 0.3) confidence = 'insufficient'
  else if (coverage < 0.6) confidence = 'partial'

  var matchesDeclared = matchesDeclaredFromAI
  var declaredLower = String(declared || '').toLowerCase()
  var declaredIsWaterRelated = /water|flood/.test(declaredLower)
  var observations = allObservations.slice()

  if (titleClass === 'flood' && !declaredIsWaterRelated) {
    matchesDeclared = false
    observations.unshift('УВАГА: title = FLOOD але primary damage задекларовано як "' + declared + '". Це невідповідність — авто було у воді незалежно від того що написано про передок.')
  } else if (titleClass === 'salvage' && !declaredIsWaterRelated && declaredLower.indexOf('all over') === -1 && declaredLower.indexOf('roll') === -1) {
    if (matchesDeclared !== false) {
      observations.unshift('Title = SALVAGE — авто було списане як total loss страховою.')
    }
  } else if (titleClass === 'rebuilt') {
    observations.unshift('Title = REBUILT — авто пройшло відновлення після списання.')
  }

  var severityLabel = {
    minor: 'мінімальні', moderate: 'помірні', severe: 'серйозні', total_loss: 'тотал',
  }[overallSeverity] || 'невизначені'

  var summary
  if (confidence === 'insufficient') {
    summary = 'Недостатньо фото для повної оцінки. Видно ' + assessable + ' з ' + totalZones + ' зон.'
  } else if (damaged.length === 0) {
    summary = 'Видимих пошкоджень не виявлено. Перевірено ' + assessable + ' з ' + totalZones + ' зон.'
  } else {
    summary = 'Загальна важкість: ' + severityLabel + '. Пошкоджено ' + damaged.length + ' з ' + totalZones + ' зон.'
    if (matchesDeclared === false) {
      summary += ' УВАГА: видимі пошкодження не повністю збігаються з заявленими аукціоном.'
    }
  }

  return {
    declaredDamage: profile?.ua_label || null,
    referenceUsed: {
      id: reference.id,
      make: reference.make,
      model: reference.model,
      generation: reference.generation,
      isFallback: !!reference._is_fallback,
    },
    titleType: titleClass,
    classifications: classifications || [],
    damagedParts: damaged,
    intactParts: intact,
    unclearParts: unclear,
    disassembledParts: [],
    missingViews: [],
    confidence: confidence,
    coverage: coverage,
    summary: summary,
    overallSeverity: overallSeverity,
    matchesDeclared: matchesDeclared,
    additionalObservations: observations,
    totalPhotosAnalyzed: photoCount,
    totalPhotosAvailable: totalPhotos,
    rawCheckpoints: allCheckpoints,
  }
}

/* === Description builder — тепер повертає МАСИВ items === */
function buildZoneDescriptionItems(problems, intactCps, unclearCps) {
  if (problems.length === 0) return []
  var items = []
  var seen = {}
  problems.forEach(function(p) {
    var text = p.note && p.note.length > 3 ? p.note : p.shortLabel
    text = String(text).trim()
    /* Дедуплікація по перших 30 символах нижнього регістру */
    var key = text.toLowerCase().slice(0, 30)
    if (seen[key]) return
    seen[key] = true

    /* Витягуємо номери фото з note якщо AI написав "Видно на фото X, Y:" */
    var photos = extractPhotoNumbers(text, p.evidencePhoto)
    items.push({
      text: text,
      photos: photos,
      weight: p.weight,
    })
  })
  return items
}

/* Шукаємо в note патерн "Видно на фото X" або "Видно на фото X, Y" — повертаємо масив чисел.
   Якщо у note нема — fallback на evidence_photo поле. */
function extractPhotoNumbers(noteText, fallbackPhoto) {
  var match = String(noteText).match(/Видно на фото\s*([\d,\s]+):/i)
  if (match) {
    var nums = match[1].split(/[,\s]+/).map(function(s) { return parseInt(s) }).filter(function(n) { return !isNaN(n) })
    if (nums.length > 0) return nums
  }
  if (typeof fallbackPhoto === 'number') return [fallbackPhoto]
  return []
}

function extractShortLabel(damagedSignal) {
  if (!damagedSignal) return 'пошкодження'
  var s = String(damagedSignal).split(/[—,]/)[0].trim()
  if (s.length > 60) s = s.slice(0, 57) + '...'
  return s
}
