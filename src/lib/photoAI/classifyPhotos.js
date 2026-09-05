/* ═══════════════════════════════════════════════════════════════════
   classifyPhotos.js  — Pass 1: photo role classification

   ОДИН виклик Haiku 4.5 з усіма фото.
   Повертає: [{photo_index: 0, role: "front_full", confidence: 0.9}, ...]

   Якщо виклик впав або відповідь невалідна — повертає null.
   Caller робить fallback (всі фото в Pass 2 без класифікації).
   ═══════════════════════════════════════════════════════════════════ */

import { buildClassifyPrompt, PHOTO_ROLES } from './prompts'


var MODEL = 'claude-haiku-4-5-20251001'

var ROLE_SET = new Set(PHOTO_ROLES)

export async function classifyPhotos(photos) {
  if (!photos || photos.length === 0) return null

  var prompt = buildClassifyPrompt(photos.length)
  var content = photos.map(function(url) {
    return { type: 'image', source: { type: 'url', url: url } }
  })
  content.push({ type: 'text', text: prompt })

  try {
    var res = await fetch('https://wandering-breeze-9e18.trustauto-api.workers.dev/ai-claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        
        
        
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,    /* 12 фото × ~50 tokens на запис = 600, з запасом */
        temperature: 0,
        messages: [{ role: 'user', content: content }],
      }),
    })
    var j = await res.json()
    if (j.error) {
      console.warn('[photoAI/classify] API error:', j.error?.message)
      return null
    }
    var text = j.content?.[0]?.text || ''
    var parsed = extractJson(text)
    if (!parsed?.classifications) return null

    /* Sanitize: тримаємо тільки відомі ролі, доповнюємо до photoCount,
       сортуємо за photo_index для детермінізму */
    var byIndex = {}
    parsed.classifications.forEach(function(c) {
      var idx = c.photo_index
      if (typeof idx !== 'number' || idx < 0 || idx >= photos.length) return
      var role = ROLE_SET.has(c.role) ? c.role : 'unclear'
      var conf = typeof c.confidence === 'number' ? c.confidence : 0.5
      byIndex[idx] = { photo_index: idx, role: role, confidence: conf }
    })

    /* Якщо AI пропустив якісь індекси — заповнюємо unclear */
    var result = []
    for (var i = 0; i < photos.length; i++) {
      result.push(byIndex[i] || { photo_index: i, role: 'unclear', confidence: 0 })
    }
    return result
  } catch (e) {
    console.warn('[photoAI/classify] failed:', e.message)
    return null
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
