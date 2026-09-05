/* ═══════════════════════════════════════════════════════════════════
   prompts.js v2 — стронгер чесність і cross-reference

   Зміни v1 → v2:
   - Правило "якщо <80% впевнений → unclear" 
   - Кожен note має починатися з "Видно на фото X: ..."
   - Cross-reference: якщо ознака видна на кількох фото — перелічити всі
   ═══════════════════════════════════════════════════════════════════ */

export var PHOTO_ROLES = [
  'front_full', 'front_close',
  'rear_full', 'rear_close',
  'side_left_full', 'side_right_full', 'side_close',
  'roof_top',
  'interior_steering', 'interior_dashboard',
  'interior_seats_front', 'interior_seats_rear', 'interior_other',
  'engine_bay', 'frame_undercarriage', 'wheel_close',
  'vin_plate', 'odometer_screen', 'damage_marker',
  'unclear',
]

export function buildClassifyPrompt(photoCount) {
  var p = ''
  p += 'Ти класифікуєш ' + photoCount + ' фото з аукціону Copart/IAAI.\n'
  p += 'Для КОЖНОГО фото визнач його роль з фіксованого списку нижче.\n\n'

  p += 'РОЛІ (вибирай ТІЛЬКИ з цього списку):\n'
  PHOTO_ROLES.forEach(function(role) { p += '- ' + role + '\n' })

  p += '\nПОЯСНЕННЯ:\n'
  p += '- "front_full" — видно весь перед авто (фронтальний або ¾ ракурс)\n'
  p += '- "front_close" — крупний план переду: фара, решітка, бампер як деталь\n'
  p += '- "rear_full" / "rear_close" — те саме для заду\n'
  p += '- "side_left_full" / "side_right_full" — водійський/пасажирський бік збоку\n'
  p += '- "side_close" — бічна деталь (двері крупно, дзеркало, поріг)\n'
  p += '- "roof_top" — дах згори\n'
  p += '- "interior_steering" — кермо ЗБЛИЗЬКА (з логотипом)\n'
  p += '- "interior_dashboard" — приладова панель/екран\n'
  p += '- "interior_seats_front" / "interior_seats_rear" — сидіння\n'
  p += '- "interior_other" — стеля, оббивка, інше всередині\n'
  p += '- "engine_bay" — відкритий моторний відсік\n'
  p += '- "frame_undercarriage" — днище, підвіска\n'
  p += '- "wheel_close" — колесо/тормоз\n'
  p += '- "vin_plate" — VIN табличка\n'
  p += '- "odometer_screen" — одометр\n'
  p += '- "damage_marker" — стрілка/marker з аукціону\n'
  p += '- "unclear" — мутне, темне, не зрозуміло\n\n'

  p += 'ОРІЄНТАЦІЯ:\n'
  p += '- ЛІВИЙ бік авто = водійський (авто ліворульне).\n'
  p += '- Профіль з водійськими дверима = side_left_full.\n'
  p += '- Профіль з пасажирськими = side_right_full.\n\n'

  p += 'ВИВІД (ТІЛЬКИ JSON):\n'
  p += '{\n'
  p += '  "classifications": [\n'
  p += '    {"photo_index": 0, "role": "front_full", "confidence": 0.0-1.0},\n'
  p += '    ... (по одному на КОЖНЕ з ' + photoCount + ' фото)\n'
  p += '  ]\n'
  p += '}\n'

  return p
}

export function buildZoneGroupPrompt(opts) {
  var groupName = opts.groupName
  var photoCount = opts.photoCount
  var photoRoles = opts.photoRoles
  var reference = opts.reference
  var declared = opts.declared
  var secondary = opts.secondary
  var titleClass = opts.titleClass
  var titleType = opts.titleType
  var checkpoints = opts.checkpoints

  var p = ''

  p += 'Ти оцінюєш ' + reference.make + ' ' + reference.model
  if (reference.generation && reference.generation !== 'unknown') {
    p += ' (' + reference.generation + ', ' + reference.year_from + '-' + reference.year_to + ')'
  }
  p += '.\n\n'

  p += 'Тобі дано ' + photoCount + ' фото — ВСІ вони відносяться до зони "' + groupName + '".\n'
  p += 'ВАЖЛИВО: ти бачиш ЦІ фото РАЗОМ — можеш cross-reference між ними і порівнювати.\n'
  p += 'Інших фото ти НЕ бачиш — не намагайся посилатись на фото яких немає у списку нижче.\n\n'

  p += 'РОЛІ ФОТО (як я класифікував):\n'
  photoRoles.forEach(function(pr) {
    p += '- Фото ' + pr.index_in_batch + ': ' + pr.role + '\n'
  })

  p += '\nЗАДЕКЛАРОВАНО АУКЦІОНОМ:\n'
  p += '- Primary: ' + declared + '\n'
  if (secondary && secondary !== 'N/A' && secondary !== '-') {
    p += '- Secondary: ' + secondary + '\n'
  }
  if (titleType) p += '- Title Type: ' + titleType + '\n'

  if (titleClass === 'flood') {
    p += '\n!!! TITLE = FLOOD. Авто було у воді — шукай сліди води навіть якщо primary не водяний.\n'
  } else if (titleClass === 'salvage') {
    p += '\nTitle = SALVAGE — авто списане страховою.\n'
  } else if (titleClass === 'rebuilt') {
    p += '\nTitle = REBUILT — авто пройшло відновлення.\n'
  }

  if (reference.identification && Object.keys(reference.identification).length > 0) {
    p += '\nЯК МАЄ ВИГЛЯДАТИ ЦІЛЕ АВТО ЦІЄЇ МОДЕЛІ:\n'
    Object.keys(reference.identification).forEach(function(k) {
      p += '- ' + reference.identification[k] + '\n'
    })
  }

  p += '\n═══ ЗАВДАННЯ ═══\n'
  p += 'Я задам ' + checkpoints.flat.length + ' конкретних питань про візуальні ознаки.\n'
  p += 'Для кожного дай:\n'
  p += '- "yes" — ознака чітко присутня (intact_signal). Вкажи фото де це видно.\n'
  p += '- "no" — ознака порушена (damaged_signal). Вкажи фото І напиши КОНКРЕТНО що бачиш у "note".\n'
  p += '- "unclear" — фото НЕ дають однозначної відповіді або ти впевнений менше 80%.\n\n'

  p += '═══ ПРАВИЛО ЧЕСНОСТІ — НАДВАЖЛИВО ═══\n'
  p += 'Якщо ти впевнений МЕНШЕ 80% — пиши "unclear", не "no" і не "yes".\n'
  p += 'Краще десять разів unclear ніж одне неправдиве твердження. Користувач прийме рішення сам.\n'
  p += 'Перед кожною відповіддю запитай себе: "Я це БАЧУ чітко на конкретному фото?".\n'
  p += 'Якщо думаєш "ну, мабуть, схоже так..." — це unclear, не yes/no.\n\n'

  p += '═══ ПРАВИЛО NOTE — ОБОВʼЯЗКОВЕ ДЛЯ "no" ═══\n'
  p += 'Кожна відповідь "no" МАЄ мати поле "note" що ПОЧИНАЄТЬСЯ з "Видно на фото X:" (або "Видно на фото X, Y:" якщо кілька).\n'
  p += 'Без "Видно на фото..." на початку — note вважається невалідним.\n\n'
  p += 'Структура note: "Видно на фото X: <конкретний опис того що ти бачиш>"\n\n'
  p += 'Приклади ПРАВИЛЬНОГО note:\n'
  p += '- "Видно на фото 2: бампер на місці але має пробій 30см зліва внизу — рваний пластик"\n'
  p += '- "Видно на фото 0, 4: ліва фара повністю відсутня, порожній чорний отвір"\n'
  p += '- "Видно на фото 1: капот має складку 15см зліва біля фари"\n'
  p += '- "Видно на фото 3: на приладовій панелі горить airbag warning"\n\n'
  p += 'Приклади ПОГАНОГО note (НЕ ПИШИ ТАК):\n'
  p += '- "пошкоджено" — занадто загально, нема фото\n'
  p += '- "не на місці" — не пояснив (знятий? відсутній? пробитий?)\n'
  p += '- копіювати damaged_signal дослівно\n\n'

  p += '═══ CROSS-REFERENCE ═══\n'
  p += 'Якщо ознака видна на кількох фото — перелічи ВСІ номери: "Видно на фото 0, 2, 5: ...".\n'
  p += 'Якщо суперечливо (одне фото показує yes, інше no) — обери те де видно крупніше і ЯВНО згадай суперечність у note.\n'
  p += 'Якщо ознака очікувано має бути на ракурсі а її не видно — це не "yes" і не "no", це "unclear" (нема ракурсу).\n\n'

  p += '═══ ІНШІ ПРАВИЛА ═══\n'
  p += '1. Не реконструюй "як зазвичай після удару". Дивись ТІЛЬКИ що буквально на фото.\n'
  p += '2. Знято ≠ розбито. У note розрізняй: "знятий і лежить поряд" / "відсутній" / "на місці але пробитий".\n'
  p += '3. Бруд, відблиски, тіні — НЕ пошкодження.\n'
  p += '4. evidence_photo має бути номером з фото які я тобі дав (0 до ' + (photoCount-1) + ').\n\n'

  p += '═══ ПИТАННЯ ═══\n\n'

  Object.keys(checkpoints.byZone).forEach(function(zid) {
    p += '── Зона: ' + zid + ' ──\n'
    checkpoints.byZone[zid].forEach(function(cp) {
      p += '\n• ' + cp.checkpoint_id + ':\n'
      p += '    Питання: ' + cp.question + '\n'
      p += '    "yes" коли: ' + cp.intact_signal + '\n'
      p += '    "no" коли:  ' + cp.damaged_signal + '\n'
    })
    p += '\n'
  })

  p += '═══ ВИВІД (ТІЛЬКИ JSON) ═══\n'
  p += '{\n'
  p += '  "checkpoints": [\n'
  p += '    {\n'
  p += '      "zone_id": "...",\n'
  p += '      "checkpoint_id": "...",\n'
  p += '      "answer": "yes" | "no" | "unclear",\n'
  p += '      "evidence_photo": число 0-' + (photoCount-1) + ' (основне фото) або null,\n'
  p += '      "note": "Видно на фото X: <опис>" — ОБОВʼЯЗКОВО якщо answer=no"\n'
  p += '    }\n'
  p += '  ],\n'
  p += '  "matches_declared": true | false,\n'
  p += '  "additional_observations": ["спостереження поза checkpoints"]\n'
  p += '}\n'

  return p
}
