/* ═══════════════════════════════════════════════════════════════════
   selectPhotosForGroup.js — який subset фото іде в кожну групу

   3 групи: exterior / interior / mechanical
   Кожна група отримує до N релевантних фото.

   Логіка пріоритетів (від найважливіших):
   - exterior: front_full > rear_full > side_*_full > front_close > rear_close > side_close > roof_top
   - interior: interior_steering > interior_dashboard > interior_seats_front > interior_seats_rear > interior_other
   - mechanical: engine_bay > frame_undercarriage > wheel_close

   Якщо у групі менше N фото зі своїми ролями — беремо що є.
   Якщо взагалі 0 — група пропускається у Pass 2 (всі checkpoints → not_visible).
   ═══════════════════════════════════════════════════════════════════ */

/* Карта roles → group + priority */
var GROUP_RULES = {
  exterior: {
    maxPhotos: 6,
    rolePriority: [
      'front_full',       /* 100 */
      'rear_full',        /* 95  */
      'side_left_full',   /* 90  */
      'side_right_full',  /* 88  */
      'front_close',      /* 70  */
      'rear_close',       /* 68  */
      'side_close',       /* 60  */
      'roof_top',         /* 50  */
    ],
  },
  interior: {
    maxPhotos: 5,
    rolePriority: [
      'interior_steering',     /* 100 — критично для airbag */
      'interior_dashboard',    /* 95  — warnings */
      'interior_seats_front',  /* 80  — airbag passenger + water */
      'interior_seats_rear',   /* 70  */
      'interior_other',        /* 50  */
    ],
  },
  mechanical: {
    maxPhotos: 3,
    rolePriority: [
      'engine_bay',          /* 100 */
      'frame_undercarriage', /* 80 */
      'wheel_close',         /* 40 — рідко критично */
    ],
  },
}

/* Конвертуємо priority array → score за позицією в масиві.
   Перший елемент = 100, кожен наступний -10 (мін 10). */
function priorityScore(role, priorityArray) {
  var idx = priorityArray.indexOf(role)
  if (idx === -1) return 0
  return Math.max(10, 100 - idx * 10)
}

/* Скільки фото взяти в групу. Повертає масив { original_index, role, confidence }
   де original_index — позиція в оригінальному auction.images масиві. */
export function selectPhotosForGroup(groupName, classifications) {
  var rules = GROUP_RULES[groupName]
  if (!rules) return []
  if (!classifications || classifications.length === 0) return []

  /* Score every photo for this group */
  var scored = classifications
    .map(function(c) {
      return {
        original_index: c.photo_index,
        role: c.role,
        confidence: c.confidence || 0.5,
        score: priorityScore(c.role, rules.rolePriority) * (c.confidence || 0.5),
      }
    })
    .filter(function(s) { return s.score > 0 })

  /* Sort descending by score, take top N */
  scored.sort(function(a, b) { return b.score - a.score })
  return scored.slice(0, rules.maxPhotos)
}

export function selectAllGroups(classifications) {
  return {
    exterior: selectPhotosForGroup('exterior', classifications),
    interior: selectPhotosForGroup('interior', classifications),
    mechanical: selectPhotosForGroup('mechanical', classifications),
  }
}

/* Fallback: коли Pass 1 впав — рівномірно ділимо всі фото на групи
   за припущенням типового аукціонного порядку (перші — exterior, далі інтерʼєр). */
export function fallbackSelection(allPhotos) {
  var n = allPhotos.length
  if (n === 0) return { exterior: [], interior: [], mechanical: [] }

  /* Просте евристичне ділення:
     - exterior: перші 60% фото (зазвичай зовнішні фото перші в Copart)
     - interior: наступні 25%
     - mechanical: останні 15%
     Це грубе наближення. Краще ніж нічого. */
  var splitExterior = Math.max(1, Math.floor(n * 0.6))
  var splitInterior = Math.max(splitExterior + 1, Math.floor(n * 0.85))

  function makeFallbackEntries(start, end) {
    var arr = []
    for (var i = start; i < end && i < n; i++) {
      arr.push({
        original_index: i,
        role: 'unclear',
        confidence: 0,
        score: 50,
      })
    }
    return arr
  }

  return {
    exterior: makeFallbackEntries(0, splitExterior),
    interior: makeFallbackEntries(splitExterior, splitInterior),
    mechanical: makeFallbackEntries(splitInterior, n),
  }
}
