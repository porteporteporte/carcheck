/* ═══════════════════════════════════════════════════════════════════
   analyzeZoneGroup.js v2 — index remapping для evidence_photo і note

   КРИТИЧНО:
   AI відповідає в індексах БАТЧУ (0..N-1 де N = subset фото).
   Ми мапаємо ці індекси на ОРИГІНАЛЬНІ позиції в auction.images
   щоб UI міг показати правильне фото.

   v1 → v2: тепер ремапаємо НЕ ТІЛЬКИ evidence_photo (поле),
   а ЩЕ Й номери в тексті note (бо JS потім парсить "Видно на фото X").
   ═══════════════════════════════════════════════════════════════════ */

import { buildZoneGroupStaticRules, buildZoneGroupCarContext, buildZoneGroupDynamicContext } from './prompts'


var MODEL = 'claude-sonnet-4-5'

export var GROUP_ZONES = {
  exterior: ['front', 'rear', 'side_left', 'side_right', 'roof'],
  interior: ['interior'],
  mechanical: ['mechanical'],
}

export async function analyzeZoneGroup(opts) {
  var groupName = opts.groupName
  var photos = opts.photos
  var photoSelection = opts.photoSelection
  var checkpoints = opts.checkpoints
  var reference = opts.reference
  var declared = opts.declared
  var secondary = opts.secondary
  var titleClass = opts.titleClass
  var titleType = opts.titleType

  if (photoSelection.length === 0) {
    return makeAllUnclearResponse(checkpoints)
  }
  if (checkpoints.flat.length === 0) {
    return makeAllUnclearResponse(checkpoints)
  }

  var subsetUrls = []
  var photoRolesForPrompt = []
  var indexMapping = []  /* indexMapping[batchIdx] = originalIdx */
  photoSelection.forEach(function (sel, batchIdx) {
    subsetUrls.push(photos[sel.original_index])
    photoRolesForPrompt.push({ index_in_batch: batchIdx, role: sel.role })
    indexMapping.push(sel.original_index)
  })

  /* Статичні правила (однакові для ВСІХ машин/зон/перевірок) і
     контекст машини+зони (однаковий для цього покоління+зони, різний
     між оголошеннями) ідуть в system[] з cache_control — вони не
     змінюються між викликами і кешуються на боці Anthropic.
     Динамічний контекст (ролі фото, задекларовані пошкодження) —
     унікальний для цього оголошення, без кешування. */
  var staticRules = buildZoneGroupStaticRules()
  var carContext = buildZoneGroupCarContext(reference, checkpoints)
  var dynamicContext = buildZoneGroupDynamicContext({
    groupName: groupName,
    photoCount: subsetUrls.length,
    photoRoles: photoRolesForPrompt,
    declared: declared,
    secondary: secondary,
    titleClass: titleClass,
    titleType: titleType,
  })

  var content = [{ type: 'text', text: dynamicContext }].concat(
    subsetUrls.map(function (url) {
      return { type: 'image', source: { type: 'url', url: url } }
    })
  )

  try {
    var res = await fetch('https://wandering-breeze-9e18.trustauto-api.workers.dev/ai-claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',



      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        temperature: 0,
        system: [
          { type: 'text', text: staticRules, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: carContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: content }],
      }),
    })
    var j = await res.json()
    if (j.error) {
      console.warn('[photoAI/' + groupName + '] API error:', j.error?.message)
      return makeAllUnclearResponse(checkpoints)
    }
    var text = j.content?.[0]?.text || ''
    var parsed = extractJson(text)
    if (!parsed?.checkpoints) {
      console.warn('[photoAI/' + groupName + '] no checkpoints in response')
      return makeAllUnclearResponse(checkpoints)
    }

    /* Ремапаємо batch indices → original indices ДВІЧІ:
       1. evidence_photo (число)
       2. номери у тексті note ("Видно на фото X, Y: ...")  */
    var remapped = parsed.checkpoints.map(function (c) {
      var ev = c.evidence_photo
      var origEv = (typeof ev === 'number' && ev >= 0 && ev < indexMapping.length)
        ? indexMapping[ev]
        : null

      var origNote = c.note ? remapNotePhotoNumbers(String(c.note), indexMapping) : ''

      return {
        zone_id: c.zone_id,
        checkpoint_id: c.checkpoint_id,
        answer: c.answer,
        evidence_photo: origEv,
        note: origNote,
      }
    })

    return {
      checkpoints: remapped,
      matches_declared: parsed.matches_declared,
      additional_observations: parsed.additional_observations || [],
      _group: groupName,
      _photos_used: indexMapping,
    }
  } catch (e) {
    console.warn('[photoAI/' + groupName + '] failed:', e.message)
    return makeAllUnclearResponse(checkpoints)
  }
}

/* Замінює "Видно на фото X" / "Видно на фото X, Y" на ОРИГІНАЛЬНІ індекси.
   Працює і з варіантами: "на фото X", "на фото X та Y" і т.п.
   AI пише номери батчу (0..N-1), ми перекладаємо на оригінальні (з auction.images).
   Користувач бачить номер фото = position в gallery + 1 (бо UI показує 1-based). */
function remapNotePhotoNumbers(note, indexMapping) {
  /* Знаходимо паттерн "фото X" або "фото X, Y, Z" (через кому/пробіли/'та'/'і') */
  return note.replace(/фото\s*([\d,\s]+(?:та\s*\d+)?(?:\s*і\s*\d+)?)/gi, function (match, numsStr) {
    /* Витягуємо всі числа з підрядка */
    var nums = numsStr.match(/\d+/g)
    if (!nums) return match
    /* Мапаємо кожне через indexMapping */
    var mapped = nums.map(function (n) {
      var batchIdx = parseInt(n)
      if (batchIdx >= 0 && batchIdx < indexMapping.length) {
        return indexMapping[batchIdx]
      }
      return n  /* за межами батчу — залишаємо як є */
    })
    return 'фото ' + mapped.join(', ')
  })
}

function makeAllUnclearResponse(checkpoints) {
  var result = []
  checkpoints.flat.forEach(function (cp) {
    result.push({
      zone_id: cp.zone_id,
      checkpoint_id: cp.checkpoint_id,
      answer: 'unclear',
      evidence_photo: null,
      note: '',
    })
  })
  return {
    checkpoints: result,
    matches_declared: null,
    additional_observations: [],
    _group: null,
    _photos_used: [],
  }
}

function extractJson(text) {
  var start = text.indexOf('{')
  if (start < 0) return null
  var depth = 0, end = -1
  for (var i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) return null
  try {
    return JSON.parse(text.substring(start, end + 1))
  } catch (e) {
    return null
  }
}