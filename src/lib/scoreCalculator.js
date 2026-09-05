/* ═══════════════════════════════════════════════════════════════════
   scoreCalculator.js v2.1
   - Kill-Switch + 5 категорій 30+25+20+15+10 = 100
   - "Аналіз фото" тепер працює з новою checkpoint-структурою
   ═══════════════════════════════════════════════════════════════════ */

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

function parseOdometer(str) {
  if (!str) return null
  var miMatch = str.match(/([\d,]+)\s*mi/)
  var kmMatch = str.match(/([\d,]+)\s*km/)
  return {
    mi: miMatch ? parseInt(miMatch[1].replace(/,/g, '')) : null,
    km: kmMatch ? parseInt(kmMatch[1].replace(/,/g, '')) : null,
  }
}

function daysSince(dateStr) {
  if (!dateStr) return null
  var d = new Date(dateStr.replace(' ', 'T'))
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function extractState(location) {
  if (!location) return null
  var m1 = location.match(/\(([A-Z]{2})\)/)
  if (m1) return m1[1]
  var m2 = location.match(/\b([A-Z]{2})\b\s*$/)
  if (m2) return m2[1]
  return null
}

var COASTAL_HUMID_STATES = ['FL', 'LA', 'MS', 'AL', 'GA', 'SC', 'NC', 'TX']
var SALT_BELT_STATES    = ['MI', 'MN', 'NY', 'IL', 'OH', 'WI', 'MA', 'PA', 'IN', 'NJ', 'CT', 'NH', 'VT', 'ME']
var DRY_FRIENDLY_STATES = ['CA', 'AZ', 'NV', 'NM', 'CO', 'UT']

/* ═══ Kill-Switch ═══ */
function checkKillSwitch(autoria, vinDecode, auction) {
  var reasons = []

  var copartOdo = auction ? parseOdometer(auction['technical-specs']?.['Odometer']) : null
  var autoRiaKm = autoria?.autoData?.raceInt ? autoria.autoData.raceInt * 1000 : null
  if (copartOdo?.km && autoRiaKm) {
    var diff = autoRiaKm - copartOdo.km
    if (diff < -10000) {
      reasons.push({
        code: 'mileage_rollback',
        title: 'Скручений пробіг',
        detail: 'На аукціоні було ' + copartOdo.km.toLocaleString() + ' км, на AutoRia ' +
                autoRiaKm.toLocaleString() + ' км — менше на ' + Math.abs(diff).toLocaleString() + ' км.'
      })
    }
  }

  if (autoria?.autoData?.year && vinDecode?.year) {
    var yearDiff = Math.abs(autoria.autoData.year - vinDecode.year)
    if (yearDiff > 1) {
      reasons.push({
        code: 'year_mismatch',
        title: 'Невідповідність року',
        detail: 'AutoRia: ' + autoria.autoData.year + ', VIN: ' + vinDecode.year +
                '. Можливо перебитий VIN або підмінені документи.'
      })
    }
  }

  if (autoria?.userBlocked && Object.keys(autoria.userBlocked).length > 0) {
    reasons.push({
      code: 'seller_blocked',
      title: 'Продавець заблокований AutoRia',
      detail: 'AutoRia заблокував цього продавця.'
    })
  }

  if (autoria?.autoInfoBar?.confiscatedCar) {
    reasons.push({
      code: 'confiscated',
      title: 'Конфіскат',
      detail: 'Авто має статус конфіскату — можливі проблеми з документами.'
    })
  }

  return reasons
}

/* ═══ Main entry ═══ */
export function calculateScore(autoria, nhtsa, vinDecode, auction, econ, autoRiaPrice, photoAnalysis) {
  var blockReasons = checkKillSwitch(autoria, vinDecode, auction)

  var tech   = scoreTechnical(autoria, auction)
  var price  = scorePrice(econ, autoRiaPrice)
  var photo  = scorePhoto(photoAnalysis, auction)
  var trans  = scoreTransparency(autoria)
  var oper   = scoreOperational(autoria, nhtsa, auction)

  var total = tech.score + price.score + photo.score + trans.score + oper.score

  return {
    blocked: blockReasons.length > 0,
    blockReasons: blockReasons,
    total: total,
    breakdown: [tech, price, photo, trans, oper],
  }
}

/* ─── 1. Технічні пошкодження (30) ─── */
function scoreTechnical(autoria, auction) {
  var max = 30
  var score = max
  var notes = []

  var copartDmg = auction?.['title-and-condition']?.['Primary Damage']
  var copartSec = auction?.['title-and-condition']?.['Secondary Damage']

  if (copartDmg && copartDmg !== 'N/A') {
    var d = copartDmg.toLowerCase()
    if (/water|flood|burn|fire/.test(d)) {
      score -= 30
      notes.push({ pts: -30, text: 'аукціон: ' + copartDmg + ' (критично)' })
    } else if (/all over|roll/.test(d)) {
      score -= 26
      notes.push({ pts: -26, text: 'аукціон: ' + copartDmg })
    } else if (/front|rear|side|top|roof/.test(d)) {
      score -= 12
      notes.push({ pts: -12, text: 'аукціон: ' + copartDmg })
    } else if (/engine|mechanical/.test(d)) {
      score -= 6
      notes.push({ pts: -6, text: 'аукціон: ' + copartDmg + ' (кузов цілий)' })
    } else if (/normal wear|minor/.test(d)) {
      /* no deduction */
    } else {
      score -= 7
      notes.push({ pts: -7, text: 'аукціон: ' + copartDmg })
    }

    if (copartSec && copartSec !== 'N/A' && copartSec !== '-') {
      score -= 4
      notes.push({ pts: -4, text: 'додаткові пошкодження: ' + copartSec })
    }
  } else if (autoria?.autoInfoBar?.damage) {
    score -= 10
    notes.push({ pts: -10, text: 'AutoRia: був в ДТП' })
  }

  var feat = auction?.['car-features']
  if (feat) {
    if (feat.Engine_Starts === 'yes' && feat.Runs_Drives === 'yes') {
      score += 4
      notes.push({ pts: +4, text: 'на аукціоні заводилося і їхало' })
    } else if (feat.Engine_Starts === 'no' && feat.Runs_Drives === 'no') {
      score -= 4
      notes.push({ pts: -4, text: 'на аукціоні не заводилося і не їхало' })
    }
    if (feat.Has_Keys === 'no') {
      score -= 3
      notes.push({ pts: -3, text: 'без ключів' })
    }
  }

  if (autoria?.autoInfoBar?.onRepairParts) {
    score -= 10
    notes.push({ pts: -10, text: 'AutoRia позначив: на запчастини' })
  }

  return { name: 'Технічні пошкодження', score: clamp(score, 0, max), max: max, notes: notes }
}

/* ─── 2. Адекватність ціни (25) ─── */
function scorePrice(econ, autoRiaPrice) {
  var max = 25
  var notes = []

  if (!econ || !autoRiaPrice) {
    notes.push({ pts: 0, text: 'немає даних аукціонів для звірки — нейтральна оцінка' })
    return { name: 'Адекватність ціни', score: 20, max: max, notes: notes }
  }

  var low = econ.fairRetailLow
  var high = econ.fairRetailHigh
  var score, label

  if (autoRiaPrice >= low && autoRiaPrice <= high) {
    score = 25
    label = 'в межах справедливої ($' + low.toLocaleString() + '–$' + high.toLocaleString() + ')'
  } else if (autoRiaPrice < low) {
    var underPct = (low - autoRiaPrice) / low
    if (underPct > 0.30)      { score = 6;  label = 'підозріло дешевше ринку на ' + Math.round(underPct * 100) + '%' }
    else if (underPct > 0.15) { score = 15; label = 'дешевше ринку на ' + Math.round(underPct * 100) + '%' }
    else                       { score = 22; label = 'трохи нижче ринку (-' + Math.round(underPct * 100) + '%)' }
  } else {
    var overPct = (autoRiaPrice - high) / high
    if (overPct > 0.70)      { score = 9;  label = 'дуже дорого, +' + Math.round(overPct * 100) + '% від імпорту' }
    else if (overPct > 0.40) { score = 15; label = 'дорого, +' + Math.round(overPct * 100) + '% від імпорту' }
    else if (overPct > 0.20) { score = 20; label = 'трохи дорого, +' + Math.round(overPct * 100) + '% від імпорту' }
    else                      { score = 24; label = 'практично в нормі (+' + Math.round(overPct * 100) + '%)' }
  }

  notes.push({ pts: score, text: label })
  return { name: 'Адекватність ціни', score: score, max: max, notes: notes }
}

/* ─── 3. Аналіз фото (20) — оновлено під checkpoint-структуру ─── */
function scorePhoto(photoAnalysis, auction) {
  var max = 20
  var notes = []

  if (!photoAnalysis) {
    if (auction) {
      notes.push({ pts: 0, text: 'аналіз фото не виконано' })
      return { name: 'Аналіз фото', score: max, max: max, notes: notes }
    }
    notes.push({ pts: 0, text: 'на аукціоні США не знайдено — фото для аналізу немає' })
    return { name: 'Аналіз фото', score: max, max: max, notes: notes }
  }

  var score = max
  var damaged = photoAnalysis.damagedParts || []

  /* Airbags — у новій схемі живуть як checkpoints у зоні interior.
     Шукаємо їх через rawCheckpoints. */
  var raw = photoAnalysis.rawCheckpoints || []
  var airbagDeployed = raw.some(function(c) {
    return c.zone_id === 'interior' &&
           /airbag/i.test(c.checkpoint_id) &&
           c.answer === 'no'
  })
  if (airbagDeployed) {
    score -= 10
    notes.push({ pts: -10, text: 'подушки безпеки спрацювали' })
  }

  /* Dashboard warnings */
  var dashWarning = raw.some(function(c) {
    return c.zone_id === 'interior' &&
           /dashboard|warning/i.test(c.checkpoint_id) &&
           c.answer === 'no'
  })
  if (dashWarning) {
    score -= 3
    notes.push({ pts: -3, text: 'попередження на приладовій панелі' })
  }

  /* Matches declared */
  if (photoAnalysis.matchesDeclared === false) {
    score -= 6
    notes.push({ pts: -6, text: 'видимі пошкодження не сходяться з декларацією аукціону' })
  }

  /* Severity */
  var sev = photoAnalysis.overallSeverity
  if (sev === 'total_loss') {
    score -= 6
    notes.push({ pts: -6, text: 'тотал за фото' })
  } else if (sev === 'severe') {
    score -= 3
    notes.push({ pts: -3, text: 'серйозні пошкодження за фото' })
  }

  /* Multiple zones */
  var severeZones = damaged.filter(function(p) {
    return p.partId !== 'airbags' && p.status === 'severe' && (p.evidencePhotos || []).length > 0
  })
  var moderateZones = damaged.filter(function(p) {
    return p.partId !== 'airbags' && p.status === 'moderate' && (p.evidencePhotos || []).length > 0
  })

  if (severeZones.length > 1) {
    var extraSev = severeZones.length - 1
    var sevPenalty = Math.min(extraSev * 3, 6)
    score -= sevPenalty
    notes.push({ pts: -sevPenalty, text: 'severe-пошкодження в ' + severeZones.length + ' зонах' })
  }
  if (moderateZones.length > 2) {
    var extraMod = moderateZones.length - 2
    var modPenalty = Math.min(extraMod * 1, 3)
    score -= modPenalty
    notes.push({ pts: -modPenalty, text: 'moderate-пошкодження в ' + moderateZones.length + ' зонах' })
  }

  if (photoAnalysis.confidence === 'insufficient') {
    score -= 4
    notes.push({ pts: -4, text: 'недостатньо фото для повного висновку' })
  }

  return { name: 'Аналіз фото', score: clamp(score, 0, max), max: max, notes: notes }
}

/* ─── 4. Прозорість продавця (15) ─── */
function scoreTransparency(autoria) {
  var max = 15
  var score = max
  var notes = []

  if (!autoria) return { name: 'Прозорість продавця', score: 8, max: max, notes: [{ pts: 0, text: 'дані продавця недоступні' }] }

  if (autoria.photoData?.count != null) {
    var n = autoria.photoData.count
    if (n < 3)       { score -= 10; notes.push({ pts: -10, text: 'дуже мало фото (' + n + ')' }) }
    else if (n < 5)  { score -= 6;  notes.push({ pts: -6,  text: 'мало фото (' + n + ')' }) }
    else if (n < 10) { score -= 2;  notes.push({ pts: -2,  text: 'фото менше ніж зазвичай (' + n + ')' }) }
  }

  var descLen = (autoria.autoData?.description || '').trim().length
  if (descLen < 30)      { score -= 6; notes.push({ pts: -6, text: 'опис майже відсутній (' + descLen + ' симв.)' }) }
  else if (descLen < 80) { score -= 3; notes.push({ pts: -3, text: 'короткий опис (' + descLen + ' симв.)' }) }

  var listed = daysSince(autoria.addDate)
  if (listed != null) {
    if (listed > 180)     { score -= 4; notes.push({ pts: -4, text: 'висить понад 180 днів (' + listed + ')' }) }
    else if (listed > 90) { score -= 2; notes.push({ pts: -2, text: 'висить понад 90 днів (' + listed + ')' }) }
  }

  if (autoria.verifiedByInspectionCenter) { score += 2; notes.push({ pts: +2, text: 'перевірено в інспекції AutoRia' }) }
  if (autoria.technicalChecked)            { score += 1; notes.push({ pts: +1, text: 'технічно перевірено' }) }

  return { name: 'Прозорість продавця', score: clamp(score, 0, max), max: max, notes: notes }
}

/* ─── 5. Експлуатаційні ризики (10) ─── */
function scoreOperational(autoria, nhtsa, auction) {
  var max = 10
  var score = max
  var notes = []

  var year = autoria?.autoData?.year || parseInt(nhtsa?.ModelYear) || null
  if (year) {
    var age = new Date().getFullYear() - year
    if (age > 15)      { score -= 3; notes.push({ pts: -3, text: 'вік ' + age + ' років — багато експлуатаційних ризиків' }) }
    else if (age > 12) { score -= 2; notes.push({ pts: -2, text: 'вік ' + age + ' років — більше витрат на обслуговування' }) }
  }

  var loc = auction?.['sale-date-location']?.['Location']
  var state = loc ? extractState(loc) : null
  if (state) {
    if (COASTAL_HUMID_STATES.indexOf(state) !== -1)      { score -= 3; notes.push({ pts: -3, text: 'штат ' + state + ' — вологий клімат / корозія' }) }
    else if (SALT_BELT_STATES.indexOf(state) !== -1)     { score -= 2; notes.push({ pts: -2, text: 'штат ' + state + ' — сіль на дорогах зимою' }) }
    else if (DRY_FRIENDLY_STATES.indexOf(state) !== -1)  { score += 1; notes.push({ pts: +1, text: 'штат ' + state + ' — сухий клімат, мʼякий для авто' }) }
  }

  return { name: 'Експлуатаційні ризики', score: clamp(score, 0, max), max: max, notes: notes }
}
