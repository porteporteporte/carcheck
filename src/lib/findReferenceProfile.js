/* ═══════════════════════════════════════════════════════════════════
   findReferenceProfile.js
   
   Пошук референсного профілю для пари (make, model, year).
   - читає _index.json (build artifact, генерується скриптом)
   - підвантажує конкретне покоління
   - мерджить з _make.json (brand traits)
   - якщо нема покоління — fallback за категорією

   ПЕРЕЇЗД В БД: щоб переїхати на D1/Postgres — переписати ТІЛЬКИ
   тіло цієї функції. Контракт повернення (object) той самий.
   Все що викликає findReferenceProfile() далі не торкається.
   ═══════════════════════════════════════════════════════════════════ */

import index from '../data/reference/_index.json'

/* Vite import.meta.glob — eager:false завантажує лише потрібні файли */
var profileModules = import.meta.glob('../data/reference/**/*.json', { import: 'default' })

/* Категорія за моделлю — для fallback. Розширюється з ростом БД. */
var CATEGORY_HINTS = {
  // SUV / crossover
  suv: /(x[1-7]|q[2-8]|gle|glc|gls|glb|gla|x5|x3|rav4|cr-?v|highlander|tahoe|escalade|cayenne|macan|model y|model x|tucson|sportage|outlander|forester|atlas|tiguan|escape|explorer|grand cherokee|wrangler|expedition|sequoia|4runner|pilot|murano|pathfinder|edge|equinox)/i,
  sedan: /(3-?series|5-?series|7-?series|c-?class|e-?class|s-?class|a4|a6|a8|model 3|model s|camry|accord|civic|altima|corolla|sentra|jetta|passat|elantra|sonata|optima|legacy|impreza|fusion|focus)/i,
  coupe: /(4-?series|8-?series|m[2-8]|rs[3-7]|c-?class coupe|amg gt|911|cayman|718|mustang|camaro|challenger|supra|brz|gr86|m4|m8)/i,
  pickup: /(f-?150|f-?250|f-?350|silverado|sierra|ram|tundra|tacoma|ridgeline|titan|colorado|canyon|frontier)/i,
  ev: /(model 3|model y|model s|model x|cybertruck|mach-?e|lightning|ioniq|ev6|i4|ix|eqs|eqe|taycan)/i,
  hatchback: /(golf|gti|rabbit|fit|veloster|impreza hatch|mazda3 hatch)/i,
  wagon: /(estate|wagon|allroad|outback|cross country)/i,
  van: /(odyssey|sienna|pacifica|carnival|sprinter|transit|metris)/i,
  convertible: /(convertible|cabriolet|spider|spyder|miata|mx-5|z4|sl-?class)/i,
}

function inferCategory(make, model) {
  var query = ((make || '') + ' ' + (model || '')).toLowerCase()
  for (var cat in CATEGORY_HINTS) {
    if (CATEGORY_HINTS[cat].test(query)) return cat
  }
  return 'sedan'  // дефолт
}

function normalizeKey(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/* Глибокий мердж — вкладений об'єкт зливаються, скаляри замінюються */
function deepMerge(target, source) {
  if (!source) return target
  if (!target) return source
  var out = Object.assign({}, target)
  for (var k in source) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      out[k] = deepMerge(target[k], source[k])
    } else {
      out[k] = source[k]
    }
  }
  return out
}

async function loadJson(relPath) {
  /* relPath форма: 'bmw/x5/g05.json' або '_fallback/suv.json' */
  var key = '../data/reference/' + relPath
  var loader = profileModules[key]
  if (!loader) return null
  try {
    return await loader()
  } catch (e) {
    console.warn('findReferenceProfile: failed to load', relPath, e)
    return null
  }
}

/* ═══ Public API ═══ */
export async function findReferenceProfile(make, model, year) {
  var makeKey = normalizeKey(make)
  var modelKey = normalizeKey(model)
  var yr = parseInt(year) || null

  /* 1. Шукаємо в індексі покоління що підходить за роком */
  var modelEntries = index?.byModel?.[makeKey + '/' + modelKey] || []
  var generationEntry = null
  if (yr) {
    generationEntry = modelEntries.find(function(e) {
      return yr >= e.year_from && yr <= e.year_to
    })
  }
  /* Якщо року немає — беремо найновіше покоління */
  if (!generationEntry && modelEntries.length > 0) {
    generationEntry = modelEntries.reduce(function(a, b) {
      return b.year_from > a.year_from ? b : a
    })
  }

  if (generationEntry) {
    var [generation, makeData] = await Promise.all([
      loadJson(generationEntry.path),
      loadJson(makeKey + '/_make.json'),
    ])
    if (generation) {
      /* мерджимо: brand traits з _make.json в identification профіля */
      if (makeData && makeData.brand_traits) {
        generation = deepMerge(generation, {
          identification: makeData.brand_traits,
        })
      }
      return generation
    }
  }

  /* 2. Fallback за категорією */
  var category = inferCategory(make, model)
  var fallback = await loadJson('_fallback/' + category + '.json')
  if (fallback) {
    /* Перезаписуємо make/model на справжні щоб промпт виглядав природно */
    return Object.assign({}, fallback, {
      make: make || fallback.make,
      model: model || fallback.model,
      generation: 'unknown',
      _is_fallback: true,
      _fallback_category: category,
    })
  }

  /* 3. Останній fallback — generic SUV (як safest default) */
  return await loadJson('_fallback/suv.json')
}

/* Експортуємо ще для тестування / debug */
export { inferCategory, normalizeKey }
