import { useState } from 'react'
import { Photo } from './Photo'
import { AdvancedSpecsBlock } from './AdvancedSpecsBlock'
import { CarDamageMap } from './CarDamageMap'
import { analyzePhotos } from '../lib/photoAnalysis'
import { calculateScore } from '../lib/scoreCalculator'
import { runAdvancedDecode, extractFactsFromAdvanced } from '../lib/runAdvancedDecode'

var WORKER = window.WORKER_URL || 'https://wandering-breeze-9e18.trustauto-api.workers.dev'
var MODEL = 'claude-haiku-4-5-20251001'

function parseId(input) {
  var match = input.match(/[_-](\d{7,})\.html/)
  if (!match) match = input.match(/auto_id=(\d+)/)
  if (!match) match = input.match(/\/(\d{7,})$/)
  return match ? match[1] : null
}

function daysSince(dateStr) {
  if (!dateStr) return null
  var d = new Date(dateStr.replace(' ', 'T'))
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function daysBetween(a, b) {
  if (!a || !b) return null
  var da = new Date(a.replace(' ', 'T'))
  var db = new Date(b.replace(' ', 'T'))
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null
  return Math.floor((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

function parseCopartDate(str) {
  if (!str) return null
  var m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (m) return new Date(parseInt(m[3]), parseInt(m[1])-1, parseInt(m[2]))
  return null
}

function parseMoney(str) {
  if (!str) return null
  var m = String(str).match(/\$?([\d,]+)/)
  if (!m) return null
  return parseInt(m[1].replace(/,/g, ''))
}

function parseOdometer(str) {
  if (!str) return null
  var miMatch = str.match(/([\d,]+)\s*mi/)
  var kmMatch = str.match(/([\d,]+)\s*km/)
  return {
    mi: miMatch ? parseInt(miMatch[1].replace(/,/g, '')) : null,
    km: kmMatch ? parseInt(kmMatch[1].replace(/,/g, '')) : null,
  }
}

function safeFetch(url, opts) {
  return fetch(url, opts)
    .then(function(r) { return r.ok ? r.json() : null })
    .catch(function() { return null })
}

/* ═══ FACT EXTRACTOR ═══ */
function extractFacts(autoria, nhtsa, vinDecode, auction) {
  var facts = []
  var year = autoria?.autoData?.year || parseInt(nhtsa?.ModelYear) || null
  var currentYear = new Date().getFullYear()
  var autoRiaPrice = autoria?.USD || null
  var autoRiaMileageKm = autoria?.autoData?.raceInt ? autoria.autoData.raceInt * 1000 : null
  var copartPrice = auction ? parseMoney(auction.price) : null
  var copartOdo = auction ? parseOdometer(auction['technical-specs']?.['Odometer']) : null
  var copartDate = auction ? parseCopartDate(auction['sale-date-location']?.['Auction Date']) : null
  var copartDamage = auction?.['title-and-condition']?.['Primary Damage']
  var copartSecondary = auction?.['title-and-condition']?.['Secondary Damage']
  var msrp = vinDecode?.price?.base_msrp ? parseInt(String(vinDecode.price.base_msrp).replace(/,/g, '')) : null

  if (year) {
    var age = currentYear - year
    facts.push({ kind: 'info', icon: '✓', text: 'Рік: ' + year + ' (' + age + ' років)' })
  }

  if (autoria?.autoData?.year && vinDecode?.year) {
    var yearDiff = Math.abs(autoria.autoData.year - vinDecode.year)
    if (yearDiff > 1) {
      facts.push({ kind: 'bad', icon: '✗', text: 'Невідповідність року: AutoRia ' + autoria.autoData.year + ' проти VIN ' + vinDecode.year })
    }
  }

  if (autoria?.autoData?.engineVolume && vinDecode) {
    var vinDecodeEngine = null
    if (vinDecode.engine?.size) {
      var m = String(vinDecode.engine.size).match(/([\d.]+)/)
      if (m) vinDecodeEngine = parseFloat(m[1])
    }
    if (vinDecodeEngine) {
      var aEngine = parseFloat(autoria.autoData.engineVolume)
      var diff = Math.abs(aEngine - vinDecodeEngine)
      if (diff > 0.2) {
        facts.push({ kind: 'warn', icon: '⚠', text: "Об'єм двигуна: AutoRia " + aEngine + 'л проти VIN ' + vinDecodeEngine + 'л' })
      }
    }
  }

  if (autoria?.autoInfoBar?.damage) facts.push({ kind: 'bad', icon: '⚠', text: 'AutoRia позначив: "Був в ДТП"' })
  if (autoria?.autoInfoBar?.confiscatedCar) facts.push({ kind: 'bad', icon: '⚠', text: 'AutoRia позначив: конфіскат' })
  if (autoria?.autoInfoBar?.onRepairParts) facts.push({ kind: 'bad', icon: '⚠', text: 'AutoRia позначив: на запчастини' })
  if (autoria?.autoInfoBar?.abroad) facts.push({ kind: 'info', icon: '⚠', text: 'AutoRia позначив: за кордоном' })
  if (autoria?.userBlocked && Object.keys(autoria.userBlocked).length > 0) {
    facts.push({ kind: 'bad', icon: '✗', text: 'Продавець заблокований AutoRia' })
  }

  var listedDays = daysSince(autoria?.addDate)
  if (listedDays != null) {
    if (listedDays > 90) facts.push({ kind: 'warn', icon: '⚠', text: 'Висить на сайті ' + listedDays + ' днів (довго — можливо переоцінене)' })
    else if (listedDays > 30) facts.push({ kind: 'info', icon: '·', text: 'Висить на сайті ' + listedDays + ' днів' })
    else facts.push({ kind: 'info', icon: '·', text: 'Оголошення свіже: ' + listedDays + ' днів на сайті' })
  }

  if (autoria?.addDate && autoria?.updateDate) {
    var editDays = daysBetween(autoria.addDate, autoria.updateDate)
    if (editDays != null && editDays > 0) {
      facts.push({ kind: 'info', icon: '·', text: 'Оголошення редагувалось (різниця додавання→оновлення: ' + editDays + ' днів)' })
    }
  }

  var dealerId = autoria?.dealer?.id || 0
  if (dealerId > 0) {
    var dealerTxt = 'Продавець: автосалон'
    if (autoria.dealer.name) dealerTxt += ' "' + autoria.dealer.name + '"'
    facts.push({ kind: 'info', icon: '·', text: dealerTxt })
  } else if (autoria) {
    facts.push({ kind: 'info', icon: '·', text: 'Продавець: приватна особа' })
  }

  if (autoria?.verifiedByInspectionCenter) facts.push({ kind: 'good', icon: '✓', text: 'Перевірено в центрі діагностики AutoRia' })
  if (autoria?.technicalChecked) facts.push({ kind: 'good', icon: '✓', text: 'Технічно перевірено' })

  if (autoria?.photoData?.count != null) {
    var n = autoria.photoData.count
    if (n < 5) facts.push({ kind: 'warn', icon: '⚠', text: 'Мало фото: ' + n + ' (зазвичай 15+)' })
    else facts.push({ kind: 'info', icon: '·', text: 'Фото в оголошенні: ' + n })
  }

  var descLen = (autoria?.autoData?.description || '').trim().length
  if (autoria && descLen < 50) {
    facts.push({ kind: 'warn', icon: '⚠', text: 'Короткий опис (' + descLen + ' символів) — мало інформації про авто' })
  }

  if (autoRiaPrice) facts.push({ kind: 'info', icon: '·', text: 'Ціна AutoRia: $' + autoRiaPrice.toLocaleString() })

  if (msrp && autoRiaPrice && year) {
    var depreciation = Math.round((1 - autoRiaPrice / msrp) * 100)
    var ageM = currentYear - year
    var expectedDepr = Math.min(15 + ageM * 8, 75)
    facts.push({ kind: 'info', icon: '·', text: 'MSRP нової: $' + msrp.toLocaleString() + ' → знецінення ' + depreciation + '% (' + ageM + ' років)' })
    if (depreciation < expectedDepr - 15) {
      facts.push({ kind: 'warn', icon: '⚠', text: 'Авто втратило в ціні лише ' + depreciation + '% — дорого як для свого віку' })
    } else if (depreciation > expectedDepr + 15) {
      facts.push({ kind: 'warn', icon: '⚠', text: 'Авто втратило ' + depreciation + '% — підозріло дешево' })
    }
  }

  if (auction) {
    facts.push({ kind: 'bad', icon: '⚠', text: 'Знайдено на аукціоні США (Copart/IAAI)' })
    if (copartPrice) facts.push({ kind: 'info', icon: '·', text: 'Продано на аукціоні за $' + copartPrice.toLocaleString() + ' (' + (auction['sale status'] || '—') + ')' })
    if (auction['sale-date-location']?.['Auction Date']) facts.push({ kind: 'info', icon: '·', text: 'Дата продажу на аукціоні: ' + auction['sale-date-location']['Auction Date'] })
    if (copartDamage) {
      var dmgTxt = 'Задекларовані пошкодження на аукціоні: ' + copartDamage
      if (copartSecondary && copartSecondary !== 'N/A' && copartSecondary !== '-') dmgTxt += ' + ' + copartSecondary
      facts.push({ kind: 'bad', icon: '⚠', text: dmgTxt })
    }
    var titleType = auction['title-and-condition']?.['Title Type']
    if (titleType && titleType !== 'N/A') facts.push({ kind: 'info', icon: '·', text: 'Тип документів: ' + titleType })
    var feat = auction['car-features']
    if (feat) {
      if (feat.Engine_Starts === 'no' || feat.Runs_Drives === 'no') {
        var fTxt = 'На аукціоні: '
        if (feat.Engine_Starts === 'no') fTxt += 'не заводилося'
        if (feat.Engine_Starts === 'no' && feat.Runs_Drives === 'no') fTxt += ', '
        if (feat.Runs_Drives === 'no') fTxt += 'не їздило'
        facts.push({ kind: 'bad', icon: '⚠', text: fTxt })
      } else {
        facts.push({ kind: 'good', icon: '✓', text: 'На аукціоні заводилося і їздило' })
      }
      if (feat.Has_Keys === 'no') facts.push({ kind: 'warn', icon: '⚠', text: 'На аукціоні продавалось без ключів' })
    }
    var estRepair = auction['technical-specs']?.['Estimated Repair Cost']
    if (estRepair && estRepair !== 'N/A' && estRepair !== '$0') {
      facts.push({ kind: 'info', icon: '·', text: 'Оцінка ремонту аукціоном: ' + estRepair })
    }
    if (auction['sale-date-location']?.['Location']) {
      facts.push({ kind: 'info', icon: '·', text: 'Локація аукціону: ' + auction['sale-date-location']['Location'] })
    }

    if (copartDate && autoria?.addDate) {
      var daysFromCopart = Math.floor((new Date(autoria.addDate.replace(' ','T')).getTime() - copartDate.getTime()) / (1000*60*60*24))
      if (daysFromCopart > 0 && daysFromCopart < 365*5) {
        facts.push({ kind: 'info', icon: '·', text: 'Від продажу на аукціоні до появи на AutoRia: ' + daysFromCopart + ' днів' })
      }
    }

    if (copartOdo?.km && autoRiaMileageKm) {
      var diffKm = autoRiaMileageKm - copartOdo.km
      if (diffKm < -10000) {
        facts.push({ kind: 'bad', icon: '✗', text: 'Пробіг скручений: на аукціоні був ' + copartOdo.km.toLocaleString() + ' км, на AutoRia ' + autoRiaMileageKm.toLocaleString() + ' км (менше на ' + Math.abs(diffKm).toLocaleString() + ')' })
      } else if (diffKm < 5000) {
        facts.push({ kind: 'warn', icon: '⚠', text: 'Пробіг майже не змінився з часу аукціону: було ' + copartOdo.km.toLocaleString() + ' км, зараз ' + autoRiaMileageKm.toLocaleString() + ' км' })
      } else {
        facts.push({ kind: 'good', icon: '✓', text: 'Пробіг зріс нормально: з ' + copartOdo.km.toLocaleString() + ' км на аукціоні до ' + autoRiaMileageKm.toLocaleString() + ' км зараз' })
      }
    }
  } else if (vinDecode || nhtsa) {
    facts.push({ kind: 'good', icon: '✓', text: 'На американських аукціонах не знайдено' })
  }

  return facts
}

/* ═══ Repair fallback ═══ */
function estimateRepairFromDamage(primaryDamage) {
  if (!primaryDamage) return 0
  var d = primaryDamage.toLowerCase()
  if (d.includes('engine') || d.includes('mechanical')) return 2500
  if (d.includes('normal wear') || d.includes('minor')) return 800
  if (d.includes('hail')) return 2000
  if (d.includes('vandalism')) return 1500
  if (d.includes('front')) return 5500
  if (d.includes('rear')) return 3500
  if (d.includes('side')) return 4000
  if (d.includes('top') || d.includes('roof')) return 4000
  if (d.includes('all over') || d.includes('roll')) return 12000
  if (d.includes('water') || d.includes('flood')) return 8000
  if (d.includes('burn') || d.includes('fire')) return 15000
  return 3000
}

function estimateImportEconomics(copartPrice, year, engineVolume, primaryDamage) {
  if (!copartPrice) return null
  var currentYear = new Date().getFullYear()
  var age = year ? currentYear - year : 8

  var transport = 2000
  var fees = 800
  var paperwork = 500

  var duty = 1500
  if (engineVolume) {
    if (engineVolume >= 3.0) duty += 1500
    else if (engineVolume >= 2.0) duty += 800
  }
  if (age > 8) duty += 500
  if (age > 15) duty += 500

  var repair = primaryDamage ? estimateRepairFromDamage(primaryDamage) : 0

  var baseCost = copartPrice + transport + fees + paperwork + duty + repair
  var margin = Math.round(baseCost * 0.15)
  var total = baseCost + margin

  return {
    copart: copartPrice,
    logistics: transport + fees + paperwork,
    duty: duty,
    repair: repair,
    margin: margin,
    fairRetail: total,
    fairRetailLow: Math.round(total * 0.92),
    fairRetailHigh: Math.round(total * 1.30),
  }
}

/* ═══ Step Loader ═══ */
function StepLoader({ steps, currentStep }) {
  return (
    <div className="step-loader">
      <div className="step-loader-row">
        {steps.map(function(s, i) {
          var status = i < currentStep ? 'done' : (i === currentStep ? 'active' : 'pending')
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className={'step-item ' + status}>
                <span className="step-circle">{status === 'done' ? '✓' : (i + 1)}</span>
                <span className="step-label">{s}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={'step-connector ' + (i < currentStep ? 'passed' : '')} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Lightbox ═══ */
function Lightbox({ photos, index, onClose, onNav }) {
  if (index == null) return null
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-inner" onClick={function(e) { e.stopPropagation() }}>
        <button className="lightbox-close" onClick={onClose}>×</button>
        <img src={photos[index]} className="lightbox-img" alt="" />
        <div className="lightbox-nav">
          <button className="lightbox-btn" onClick={function() { onNav(-1) }} disabled={index === 0}>‹</button>
          <span className="lightbox-counter">{index + 1} / {photos.length}</span>
          <button className="lightbox-btn" onClick={function() { onNav(1) }} disabled={index === photos.length - 1}>›</button>
        </div>
      </div>
    </div>
  )
}

function InfoCards() {
  return (
    <div className="info-cards">
      <div className="info-card">
        <div className="info-card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="info-card-title">Точна оцінка</div>
        <div className="info-card-text">5 категорій по факту даних. Без вгадувань — однакові дані завжди дають однаковий бал.</div>
      </div>
      <div className="info-card">
        <div className="info-card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z" />
            <path d="M12 7v10M7 12h10" />
          </svg>
        </div>
        <div className="info-card-title">Перевірка пробігу</div>
        <div className="info-card-text">Зіставлення пробігу з аукціону і AutoRia — виявляємо скручування</div>
      </div>
      <div className="info-card">
        <div className="info-card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="info-card-title">Заводська комплектація</div>
        <div className="info-card-text">Точний trim, опції, MSRP, заводські кольори, всі специфікації — порівнюємо з оголошенням.</div>
      </div>
    </div>
  )
}

function StatsBar() {
  return (
    <div className="stats-bar">
      <div className="stat"><div className="stat-value">AutoRia</div><div className="stat-label">Оголошення</div></div>
      <div className="stat-divider" />
      <div className="stat"><div className="stat-value">VehicleDB</div><div className="stat-label">Заводська комплектація</div></div>
      <div className="stat-divider" />
      <div className="stat"><div className="stat-value">Copart</div><div className="stat-label">Історія США</div></div>
      <div className="stat-divider" />
      <div className="stat"><div className="stat-value">Score</div><div className="stat-label">5 категорій / 100</div></div>
    </div>
  )
}

/* ═══ Main ═══ */
export function VinLookup() {
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('idle')
  const [stepIdx, setStepIdx] = useState(0)
  const [error, setError] = useState(null)

  const [autoria, setAutoria] = useState(null)
  const [nhtsa, setNhtsa] = useState(null)
  const [vinDecode, setVinDecode] = useState(null)
  const [advancedDecode, setAdvancedDecode] = useState(null)
  const [auction, setAuction] = useState(null)
  const [aiReport, setAiReport] = useState(null)
  const [photoAnalysis, setPhotoAnalysis] = useState(null)

  var STEPS = ['Оголошення', 'Аукціони США', 'Аналіз AI', 'Готово']

  async function handleCheck() {
    if (!query.trim()) return
    setStage('loading')
    setStepIdx(0)
    setError(null)
    setAutoria(null); setNhtsa(null); setVinDecode(null); setAdvancedDecode(null)
    setAuction(null); setAiReport(null); setPhotoAnalysis(null)

    var input = query.trim()
    var isLink = input.startsWith('http') || input.includes('auto.ria.com')

    var autoRiaData = null
    var nhtsaData = null
    var vin = null

    /* Step 1 — listing or VIN */
    try {
      if (isLink) {
        var id = parseId(input)
        if (!id) throw new Error('Не вдалося розпізнати посилання AutoRia.')
        var autoriaUrl = WORKER + '/autoria?auto_id=' + id
        var res = await fetch(autoriaUrl)
        var data = await res.json()
        if (data.error || !data.markName) throw new Error(data.error || 'Оголошення не знайдено.')
        autoRiaData = data
        setAutoria(data)
        vin = data.VIN
      } else {
        vin = input.toUpperCase()
        /* NHTSA — best effort. European VINs (Audi WAU..., VW W..., тощо) тут падають, це нормально. */
        try {
          var nres = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/' + vin + '?format=json')
          var ndata = await nres.json()
          var r = ndata.Results[0]
          if (r.ErrorCode === '0' && r.Make) {
            nhtsaData = r
            setNhtsa(r)
          }
        } catch (e) {
          console.warn('[NHTSA] failed:', e.message)
        }
      }
    } catch (e) {
      setError(e.message)
      setStage('error')
      return
    }

    if (!vin || vin.length < 11) {
      setError('VIN не знайдено.')
      setStage('error')
      return
    }

    setStepIdx(1)

    /* Step 2 — enrichment via Worker (parallel) */
    var vinDecodeData = null
    var auctionData = null
    var advancedDecodeData = null

    var results = await Promise.all([
      safeFetch(WORKER + '/vin-decode?vin=' + vin),
      safeFetch(WORKER + '/auction?vin=' + vin),
      runAdvancedDecode(WORKER, vin),
    ])
    if (results[0]?.status === 'success') { vinDecodeData = results[0].data; setVinDecode(vinDecodeData) }
    if (results[1]?.status === 'success' && results[1].data?.length > 0) {
      auctionData = results[1].data[0]
      setAuction(auctionData)
    }
    if (results[2]) { advancedDecodeData = results[2]; setAdvancedDecode(advancedDecodeData) }

    if (!autoRiaData && !nhtsaData && !vinDecodeData && !advancedDecodeData) {
      setError('VIN не розпізнано в жодній з баз даних. Перевір правильність VIN.')
      setStage('error')
      return
    }

    setStepIdx(2)

    /* Step 3 — AI */
    var mainPromise = runMainAI(autoRiaData, nhtsaData, vinDecodeData, auctionData, advancedDecodeData)
      .then(setAiReport).catch(function(e) { console.error('Main AI:', e) })

    var photoPromise = auctionData?.images?.length > 0
      ? analyzePhotos(auctionData, autoRiaData, vinDecodeData).then(setPhotoAnalysis).catch(function(e) { console.error('Photo AI:', e) })
      : Promise.resolve()

    await Promise.all([mainPromise, photoPromise])
    setStepIdx(3)
    setTimeout(function() { setStage('done') }, 250)
  }

  return (
    <div className="vin-page">
      <div className="vin-hero">
        <p className="vin-eyebrow">TrustAuto</p>
        <h1 className="vin-heading">Перевірка автомобіля</h1>
        <p className="vin-sub">Вставте VIN-код або посилання з AutoRia — отримаєте повний звіт</p>

        <div className="vin-search">
          <div className="flex-1">
            <input
              className="input input-mono"
              placeholder="VIN або https://auto.ria.com/..."
              value={query}
              onChange={function(e) { setQuery(e.target.value) }}
              onKeyDown={function(e) { if (e.key === 'Enter') handleCheck() }}
            />
          </div>
          <button className="btn" onClick={handleCheck}>
            {stage === 'loading' ? '...' : 'Перевірити'}
          </button>
        </div>

        {error && <p className="vin-error">{error}</p>}
      </div>

      {stage === 'idle' && (<><InfoCards /><StatsBar /></>)}

      {stage === 'loading' && (
        <StepLoader steps={STEPS} currentStep={stepIdx} />
      )}

      {(stage === 'done' || stage === 'error') && (
        <FullReport
          autoria={autoria}
          nhtsa={nhtsa}
          vinDecode={vinDecode}
          advancedDecode={advancedDecode}
          auction={auction}
          aiReport={aiReport}
          photoAnalysis={photoAnalysis}
        />
      )}
    </div>
  )
}

/* ═══ Main AI — calls Worker /ai-claude proxy ═══ */
async function runMainAI(autoria, nhtsa, vinDecode, auction, advanced) {
  var facts = extractFacts(autoria, nhtsa, vinDecode, auction)
  var advFacts = extractFactsFromAdvanced(advanced, autoria)
  var allFacts = facts.concat(advFacts)
  var factsTxt = allFacts.map(function(f) { return f.icon + ' ' + f.text }).join('\n')

  var copartPrice = auction ? parseMoney(auction.price) : null
  var year = autoria?.autoData?.year || parseInt(nhtsa?.ModelYear) || null
  var engineVol = autoria?.autoData?.engineVolume ? parseFloat(autoria.autoData.engineVolume) : null
  var primaryDamage = auction?.['title-and-condition']?.['Primary Damage']
  var econ = copartPrice ? estimateImportEconomics(copartPrice, year, engineVol, primaryDamage) : null
  var autoRiaPrice = autoria?.USD || null

  var p = 'ДАНІ ПО АВТО:\n' + factsTxt + '\n\n'

  if (econ && autoRiaPrice) {
    var verdict = 'в межах справедливої ціни'
    if (autoRiaPrice < econ.fairRetailLow) verdict = 'НИЖЧЕ справедливої ціни (підозріло дешево)'
    else if (autoRiaPrice > econ.fairRetailHigh) verdict = 'ВИЩЕ справедливої ціни (продавець завищує)'

    p += 'РОЗРАХОВАНА ЕКОНОМІКА ІМПОРТУ:\n'
    p += '- Copart $' + econ.copart.toLocaleString() + ' + логістика $' + econ.logistics.toLocaleString() + ' + мито $' + econ.duty.toLocaleString()
    if (econ.repair > 0) p += ' + ремонт $' + econ.repair.toLocaleString()
    p += ' + маржа $' + econ.margin.toLocaleString() + '\n'
    p += '- Справедлива ціна: $' + econ.fairRetailLow.toLocaleString() + ' — $' + econ.fairRetailHigh.toLocaleString() + '\n'
    p += '- Ціна на AutoRia $' + autoRiaPrice.toLocaleString() + ' — ' + verdict + '.\n\n'
  }

  if (autoria?.autoData?.description) {
    p += 'ОПИС ПРОДАВЦЯ:\n«' + autoria.autoData.description.substring(0, 400) + '»\n\n'
  }

  p += 'ЗАВДАННЯ: На основі фактів вище дай короткий висновок. Бал НЕ ВИГАДУЙ — він рахується окремо.\n\n'
  p += 'МОВА — ЧИСТА УКРАЇНСЬКА:\n'
  p += '- Жодних русизмів і суржику.\n'
  p += '- "потрапляння в ДТП" → "після ДТП". "ціна перевищує" → "ціна вища за".\n'
  p += '- "накручує" → "завищує ціну". "проблеми з" → "несправності".\n'
  p += '- "любий" → "будь-який". "машина" → "автомобіль/авто".\n\n'
  p += 'ПРАВИЛА:\n'
  p += '1. Факти вже зібрані — НЕ переписуй їх.\n'
  p += '2. Пиши ТІЛЬКИ по фактах з переліку.\n'
  p += '3. Питання продавцю мають узгоджуватись з висновком про ціну.\n'
  p += '4. Типові проблеми моделі (двигун, КПП, підвіска) — можна, коротко.\n'
  p += '5. ЗАБОРОНЕНО: крипту/готівку/безнал, "не перевірений автосалон", сумніви щодо розмитнення.\n\n'

  p += 'ТІЛЬКИ JSON (без числової оцінки — її рахуємо окремо):\n'
  p += '{\n'
  p += '  "verdict": "одне речення висновку",\n'
  p += '  "category": "спорт/сімейник/преміум/бюджет/кросовер/позашляховик",\n'
  p += '  "target_buyer": "коротко хто купує таку машину",\n'
  p += '  "typical_problems": ["типова проблема моделі 1", "2", "3"],\n'
  p += '  "questions": ["3 конкретні питання продавцю"],\n'
  p += '  "inspection": ["3 пункти на СТО"],\n'
  p += '  "maintenance": "дешеве/середнє/дороге"\n'
  p += '}'

  var res = await fetch(WORKER + '/ai-claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      messages: [{ role: 'user', content: p }],
    }),
  })
  var j = await res.json()
  var text = j.content?.[0]?.text || ''
  var start = text.indexOf('{')
  if (start < 0) throw new Error('no json')
  var depth = 0, end = -1
  for (var i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) throw new Error('unbalanced')
  return JSON.parse(text.substring(start, end + 1))
}

/* ═══ Score Breakdown UI ═══ */
function ScoreBreakdown({ score }) {
  if (!score) return null

  function tierClass(s, max) {
    var pct = s / max
    if (pct >= 0.7) return 'tier-good'
    if (pct >= 0.4) return 'tier-mid'
    return 'tier-bad'
  }

  function totalClass(t) {
    if (t >= 70) return 'score-green'
    if (t >= 40) return 'score-amber'
    return 'score-red'
  }

  if (score.blocked) {
    return (
      <div className="report" style={{ marginTop: '28px' }}>
        <div style={{
          padding: '20px 24px',
          background: 'rgba(220, 60, 60, 0.08)',
          border: '1px solid rgba(220, 60, 60, 0.4)',
          borderLeft: '4px solid #dc3c3c',
          borderRadius: '6px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: '11px',
            color: '#dc3c3c', letterSpacing: '0.08em',
            marginBottom: '10px', fontWeight: 600,
          }}>⚠ НЕ КУПУЙ — ВИЯВЛЕНО ШАХРАЙСТВО</div>
          {score.blockReasons.map(function(r, i) {
            return (
              <div key={i} style={{ marginBottom: i < score.blockReasons.length - 1 ? '10px' : 0 }}>
                <div style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                  {r.title}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.5 }}>
                  {r.detail}
                </div>
              </div>
            )
          })}
          <div style={{
            marginTop: '12px', paddingTop: '10px',
            borderTop: '1px solid rgba(220, 60, 60, 0.2)',
            color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--mono)',
            letterSpacing: '0.04em',
          }}>
            БАЛ НЕ ПОКАЗУЄМО — АВТО ПОТРАПЛЯЄ В КАТЕГОРІЮ ШАХРАЙСЬКИХ. ОЦІНКА ПО КАТЕГОРІЯХ ЛИШЕ ДЛЯ ДОВІДКИ.
          </div>
        </div>

        <div className="score-cats" style={{ opacity: 0.5 }}>
          {score.breakdown.map(function(cat) {
            var pct = (cat.score / cat.max) * 100
            return (
              <div key={cat.name} className="score-cat">
                <div className="score-cat-head">
                  <span className="score-cat-name">{cat.name}</span>
                  <span className={'score-cat-pts ' + tierClass(cat.score, cat.max)}>{cat.score}/{cat.max}</span>
                </div>
                <div className="score-cat-bar">
                  <div className={'score-cat-fill ' + tierClass(cat.score, cat.max)} style={{ width: pct + '%' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="report" style={{ marginTop: '28px' }}>
      <div className="report-header">
        <div className={'report-score ' + totalClass(score.total)}>
          <span className="report-score-num">{score.total}</span>
          <span className="report-score-max">/100</span>
        </div>
        <div className="report-verdict">
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: '4px' }}>ТОЧНА ОЦІНКА</div>
          <div>5 категорій × факти. Однакові дані → той самий бал.</div>
        </div>
      </div>

      <div className="score-cats">
        {score.breakdown.map(function(cat) {
          var pct = (cat.score / cat.max) * 100
          return (
            <div key={cat.name} className="score-cat">
              <div className="score-cat-head">
                <span className="score-cat-name">{cat.name}</span>
                <span className={'score-cat-pts ' + tierClass(cat.score, cat.max)}>{cat.score}/{cat.max}</span>
              </div>
              <div className="score-cat-bar">
                <div
                  className={'score-cat-fill ' + tierClass(cat.score, cat.max)}
                  style={{ width: pct + '%' }}
                />
              </div>
              {cat.notes && cat.notes.length > 0 && (
                <div className="score-cat-notes">
                  {cat.notes.map(function(n, i) {
                    var cls = n.pts < 0 ? 'score-note-neg' : n.pts > 0 ? 'score-note-pos' : 'score-note-neutral'
                    var sign = n.pts > 0 ? '+' : ''
                    return (
                      <div key={i} className={'score-note ' + cls}>
                        <span className="score-note-pts">{n.pts !== 0 ? sign + n.pts : '·'}</span>
                        <span className="score-note-text">{n.text}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Photo Analysis Display ═══ */
function PhotoAnalysisBlock({ pa }) {
  if (!pa) return null

  var confidenceColor = pa.confidence === 'high' ? 'tag-green'
    : pa.confidence === 'partial' ? 'tag-amber'
    : 'tag-red'
  var confidenceLabel = pa.confidence === 'high' ? 'Повна оцінка'
    : pa.confidence === 'partial' ? 'Часткова'
    : 'Недостатньо даних'

  return (
    <div className="report-section-full" style={{ marginTop: '16px' }}>
      <div className="section-header">Аналіз фото з аукціону</div>

      <div style={{ marginBottom: '14px' }}>
        <span className={'ai-price-tag ' + confidenceColor} style={{ marginRight: '8px' }}>{confidenceLabel}</span>
        <span className="item-text" style={{ verticalAlign: 'middle' }}>{pa.summary}</span>
      </div>

      {pa.referenceUsed && (
        <div style={{
          padding: '8px 12px', marginBottom: '14px',
          background: 'var(--surface2)', borderRadius: '4px',
          fontSize: '11px', color: 'var(--muted)',
          fontFamily: 'var(--mono)', letterSpacing: '0.03em',
        }}>
          Референс: {pa.referenceUsed.make} {pa.referenceUsed.model}
          {pa.referenceUsed.generation && pa.referenceUsed.generation !== 'unknown' ? ' ' + pa.referenceUsed.generation : ''}
          {pa.referenceUsed.isFallback ? ' (generic fallback)' : ''}
        </div>
      )}

      {pa.damagedParts && pa.damagedParts.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div className="section-header section-red" style={{ marginBottom: '10px', borderBottom: 'none', padding: 0 }}>
            Пошкоджені деталі ({pa.damagedParts.length})
          </div>
          {pa.damagedParts.map(function(p, i) {
            var items = p.descriptionItems && p.descriptionItems.length > 0 ? p.descriptionItems : null
            return (
              <div key={i} style={{ marginBottom: '14px' }}>
                <div className="section-item" style={{ fontWeight: 600 }}>
                  <span className="item-dot dot-red"></span>
                  <span className="item-text" style={{ color: 'var(--text)' }}>
                    {p.partName}
                    {p.checkpointResults && (
                      <span style={{ color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--mono)', marginLeft: '8px' }}>
                        ({p.checkpointResults.damaged} з {p.checkpointResults.total})
                      </span>
                    )}
                  </span>
                </div>
                {items ? items.map(function(it, j) {
                  return (
                    <div key={j} style={{
                      paddingLeft: '32px', paddingTop: '4px', paddingBottom: '4px',
                      fontSize: '12px', lineHeight: 1.5, color: 'var(--muted)',
                      borderLeft: '1px solid rgba(255,255,255,0.06)',
                      marginLeft: '5px',
                    }}>
                      <span style={{ color: 'var(--accent)', marginRight: '6px' }}>•</span>
                      {it.text}
                    </div>
                  )
                }) : (
                  <div style={{ paddingLeft: '32px', fontSize: '12px', color: 'var(--muted)' }}>
                    {p.description}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {pa.intactParts && pa.intactParts.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div className="section-header section-green" style={{ marginBottom: '6px', borderBottom: 'none', padding: 0 }}>
            Цілі деталі ({pa.intactParts.length})
          </div>
          {pa.intactParts.map(function(p, i) {
            return (
              <div key={i} className="section-item">
                <span className="item-dot dot-green"></span>
                <span className="item-text">{p.partName}</span>
              </div>
            )
          })}
        </div>
      )}

      {pa.unclearParts && pa.unclearParts.length > 0 && (
        <div>
          <div className="section-header" style={{ marginBottom: '6px', borderBottom: 'none', padding: 0 }}>
            Не визначено ({pa.unclearParts.length}) — потрібен особистий огляд
          </div>
          {pa.unclearParts.map(function(p, i) {
            return (
              <div key={i} className="section-item">
                <span className="item-dot" style={{ background: 'var(--dim)' }}></span>
                <span className="item-text" style={{ color: 'var(--dim)' }}>{p.partName}</span>
              </div>
            )
          })}
        </div>
      )}

      {pa.additionalObservations && pa.additionalObservations.length > 0 && (
        <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(217,123,58,0.06)', borderLeft: '2px solid var(--amber)', borderRadius: '4px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--amber)', marginBottom: '6px', letterSpacing: '0.05em' }}>ДОДАТКОВІ СПОСТЕРЕЖЕННЯ</div>
          {pa.additionalObservations.map(function(obs, i) {
            return (
              <div key={i} className="section-item" style={{ paddingLeft: 0 }}>
                <span className="item-text">· {obs}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══ Full Report ═══ */
function FullReport({ autoria, nhtsa, vinDecode, advancedDecode, auction, aiReport, photoAnalysis }) {
  const [lightboxIdx, setLightboxIdx] = useState(null)

  var photo = autoria ? (autoria.photoData?.seoLinkF || autoria.photoData?.seoLinkM || null) : null
  var facts = extractFacts(autoria, nhtsa, vinDecode, auction)
  var advFacts = extractFactsFromAdvanced(advancedDecode, autoria)
  var allFacts = facts.concat(advFacts)
  var a = aiReport
  var photos = auction?.images || []

  var copartPrice = auction ? parseMoney(auction.price) : null
  var year = autoria?.autoData?.year || parseInt(nhtsa?.ModelYear) || null
  var engineVol = autoria?.autoData?.engineVolume ? parseFloat(autoria.autoData.engineVolume) : null
  var primaryDamage = auction?.['title-and-condition']?.['Primary Damage']
  var econ = copartPrice ? estimateImportEconomics(copartPrice, year, engineVol, primaryDamage) : null
  var autoRiaPrice = autoria?.USD || null

  var score = (autoria || nhtsa) ? calculateScore(autoria, nhtsa, vinDecode, auction, econ, autoRiaPrice, photoAnalysis) : null

  var rows = []
  if (autoria) {
    rows = [
      ['Марка', autoria.markName],
      ['Модель', autoria.modelName],
      ['Рік', autoria.autoData?.year],
      ['Пробіг', autoria.autoData?.raceInt ? autoria.autoData.raceInt.toLocaleString() + ' км' : '—'],
      ['Паливо', autoria.autoData?.fuelName],
      ["Об'єм", autoria.autoData?.engineVolume ? autoria.autoData.engineVolume + ' л' : '—'],
      ['Ціна', autoria.USD ? '$' + autoria.USD.toLocaleString() : '—'],
      ['Регіон', autoria.stateData?.name],
    ]
  } else if (nhtsa) {
    rows = [
      ['Марка', nhtsa.Make],
      ['Модель', nhtsa.Model],
      ['Рік', nhtsa.ModelYear],
      ['Тип', nhtsa.VehicleType],
      ['Двигун', nhtsa.DisplacementL ? parseFloat(nhtsa.DisplacementL).toFixed(1) + 'L' : '—'],
      ['Привід', nhtsa.DriveType || '—'],
      ['Країна', nhtsa.PlantCountry],
    ]
  }

  function priceVerdict() {
    if (!econ || !autoRiaPrice) return null
    if (autoRiaPrice < econ.fairRetailLow) return { tag: 'підозріло дешева', cls: 'tag-red' }
    if (autoRiaPrice > econ.fairRetailHigh) return { tag: 'завищена', cls: 'tag-amber' }
    return { tag: 'в межах ринку', cls: 'tag-green' }
  }
  var pv = priceVerdict()

  function factKindClass(kind) {
    if (kind === 'bad') return 'dot-red'
    if (kind === 'warn') return 'dot-amber'
    if (kind === 'good') return 'dot-green'
    return 'dot-blue'
  }

  return (
    <div className="vin-result">
      <div className="vin-layout">
        <Photo src={photo} size="big" />
        <div className="vin-info">
          {autoria && (
            <>
              <div className="vin-car-title">
                {[autoria.markName, autoria.modelName, autoria.autoData?.year].filter(Boolean).join(' ')}
              </div>
              <div className="vin-car-meta">
                {[
                  autoria.autoData?.raceInt ? autoria.autoData.raceInt.toLocaleString() + ' км' : null,
                  autoria.stateData?.name,
                  autoria.autoData?.fuelName,
                ].filter(Boolean).join(' · ')}
              </div>
            </>
          )}
          {rows.map(function(item) {
            return (
              <div key={item[0]} className="row">
                <span className="row-label">{item[0]}</span>
                <span className="row-value">{item[1] || '—'}</span>
              </div>
            )
          })}
        </div>
      </div>

      <ScoreBreakdown score={score} />

      {/* ▼▼▼ Карта пошкоджень — швидкознімне, видали цей блок щоб прибрати ▼▼▼ */}
      <CarDamageMap auction={auction} photoAnalysis={photoAnalysis} />
      {/* ▲▲▲ Карта пошкоджень ▲▲▲ */}

      {a?.verdict && (
        <div className="report-section-full" style={{ marginTop: '12px' }}>
          <div className="section-header">Висновок</div>
          <span className="item-text" style={{ fontSize: '13px', color: 'var(--text)' }}>{a.verdict}</span>
          {a.target_buyer && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>{a.target_buyer}</div>
          )}
        </div>
      )}

      <div className="report-section-full" style={{ marginTop: '12px' }}>
        <div className="section-header">Факти які ми знайшли ({allFacts.length})</div>
        {allFacts.map(function(f, i) {
          return (
            <div key={i} className="section-item">
              <span className={'item-dot ' + factKindClass(f.kind)}></span>
              <span className="item-text">{f.text}</span>
            </div>
          )
        })}
      </div>

      {econ && (
        <div className="report-section-full" style={{ marginTop: '12px' }}>
          <div className="section-header">Економіка імпорту</div>
          <div className="row"><span className="row-label">Ціна на аукціоні</span><span className="row-value">${econ.copart.toLocaleString()}</span></div>
          <div className="row"><span className="row-label">+ Доставка/комісії</span><span className="row-value">~${econ.logistics.toLocaleString()}</span></div>
          <div className="row"><span className="row-label">+ Мито/ПДВ/акциз</span><span className="row-value">~${econ.duty.toLocaleString()}</span></div>
          {econ.repair > 0 && (
            <div className="row"><span className="row-label">+ Ремонт в Україні</span><span className="row-value">~${econ.repair.toLocaleString()}</span></div>
          )}
          <div className="row"><span className="row-label">+ Маржа продавця (15%)</span><span className="row-value">~${econ.margin.toLocaleString()}</span></div>
          <div className="row"><span className="row-label">= Справедлива ціна в Україні</span><span className="row-value">${econ.fairRetailLow.toLocaleString()} — ${econ.fairRetailHigh.toLocaleString()}</span></div>
          {autoRiaPrice && pv && (
            <div className="row">
              <span className="row-label">Ціна на AutoRia</span>
              <span className={'row-value ' + pv.cls}>${autoRiaPrice.toLocaleString()} ({pv.tag})</span>
            </div>
          )}
        </div>
      )}

      {a && (
        <>
          {a.typical_problems && a.typical_problems.length > 0 && (
            <div className="report-section-full" style={{ marginTop: '12px' }}>
              <div className="section-header">Типові проблеми моделі</div>
              {a.typical_problems.map(function(p, i) {
                return <div key={i} className="section-item"><span className="item-dot dot-amber"></span><span className="item-text">{p}</span></div>
              })}
            </div>
          )}

          {a.questions && a.questions.length > 0 && (
            <div className="report-section-full" style={{ marginTop: '12px' }}>
              <div className="section-header">Запитай у продавця</div>
              {a.questions.map(function(q, i) {
                return <div key={i} className="section-item"><span className="item-num">{i+1}</span><span className="item-text">{q}</span></div>
              })}
            </div>
          )}

          {a.inspection && a.inspection.length > 0 && (
            <div className="report-section-full" style={{ marginTop: '12px' }}>
              <div className="section-header">Перевір на СТО</div>
              {a.inspection.map(function(item, i) {
                return <div key={i} className="section-item"><span className="item-check">☐</span><span className="item-text">{item}</span></div>
              })}
            </div>
          )}
        </>
      )}

      {advancedDecode ? (
        <div style={{ marginTop: '20px' }}>
          <AdvancedSpecsBlock data={advancedDecode} />
        </div>
      ) : vinDecode ? (
        <div className="report-section-full" style={{ marginTop: '20px' }}>
          <div className="section-header">Заводські дані (VIN)</div>
          {vinDecode.trim_and_style && <div className="row"><span className="row-label">Комплектація</span><span className="row-value">{vinDecode.trim_and_style}</span></div>}
          {vinDecode.price?.base_msrp && <div className="row"><span className="row-label">MSRP нової</span><span className="row-value">${vinDecode.price.base_msrp}</span></div>}
          {vinDecode.vehicle?.body_type && <div className="row"><span className="row-label">Кузов</span><span className="row-value">{vinDecode.vehicle.body_type}{vinDecode.vehicle.doors ? ' · ' + vinDecode.vehicle.doors + ' дв.' : ''}</span></div>}
          {vinDecode.vehicle?.epa_classification && <div className="row"><span className="row-label">Клас</span><span className="row-value">{vinDecode.vehicle.epa_classification}</span></div>}
        </div>
      ) : null}

      {auction && (
        <div className="usa-wrap" style={{ marginTop: '20px' }}>
          <div className="usa-header">
            <span className="label">Історія з США</span>
            <span className={'ai-price-tag ' + (auction['sale status'] === 'Sold' ? 'tag-red' : 'tag-amber')}>
              {(auction['sale status'] || 'Unknown').toUpperCase()}
            </span>
          </div>
          <div className="report-summary">
            <div className="summary-card"><div className="summary-label">Продано за</div><div className="summary-value">{auction.price || '—'}</div></div>
            <div className="summary-card"><div className="summary-label">Пошкодження</div><div className="summary-value tag-red">{auction['title-and-condition']?.['Primary Damage'] || '—'}</div></div>
            <div className="summary-card"><div className="summary-label">Дата</div><div className="summary-value">{auction['sale-date-location']?.['Auction Date'] || '—'}</div></div>
            <div className="summary-card"><div className="summary-label">Пробіг</div><div className="summary-value">{auction['technical-specs']?.['Odometer'] || '—'}</div></div>
          </div>

          {photos.length > 0 && (
            <div className="usa-photos">
              <div className="section-header">Фото з аукціону ({photos.length}) · клікни щоб збільшити</div>
              <div className="photo-grid-lg">
                {photos.map(function(url, i) {
                  return (
                    <img key={i} src={url} className="photo-usa-lg" alt=""
                      onClick={function() { setLightboxIdx(i) }} />
                  )
                })}
              </div>
            </div>
          )}

          <PhotoAnalysisBlock pa={photoAnalysis} />
        </div>
      )}

      <Lightbox
        photos={photos}
        index={lightboxIdx}
        onClose={function() { setLightboxIdx(null) }}
        onNav={function(delta) {
          setLightboxIdx(function(prev) {
            var next = prev + delta
            if (next < 0 || next >= photos.length) return prev
            return next
          })
        }}
      />
    </div>
  )
}
