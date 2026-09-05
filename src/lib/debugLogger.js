/* ═══════════════════════════════════════════════════════════════════
   debugLogger.js — збір даних про Photo AI лукапи в localStorage
   Логуються ТІЛЬКИ випадки де:
     - є дані з аукціону США (auction != null)
     - Photo AI відпрацював (photoAnalysis != null)
   ═══════════════════════════════════════════════════════════════════ */

var STORAGE_KEY = 'trustauto:debug:logs'
var MAX_LOGS = 50           // максимум записів у localStorage
var MAX_RAW_LEN = 50000     // обрізаємо raw response якщо AI випустив гігантський текст

/* Безпечно читаємо масив логів */
export function getDebugLogs() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    var parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.warn('debugLogger: failed to read', e)
    return []
  }
}

/* Записуємо новий entry. Старі скидаємо коли переходимо MAX_LOGS або упираємось в квоту. */
export function pushDebugLog(entry) {
  try {
    var logs = getDebugLogs()
    logs.push(entry)
    while (logs.length > MAX_LOGS) logs.shift()

    var json = JSON.stringify(logs)
    try {
      localStorage.setItem(STORAGE_KEY, json)
    } catch (quotaErr) {
      // Квота — викидаємо найстаріші поки не влізе
      while (logs.length > 1) {
        logs.shift()
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
          break
        } catch (e) { /* try again */ }
      }
    }
    return logs.length
  } catch (e) {
    console.warn('debugLogger: failed to push', e)
    return 0
  }
}

export function clearDebugLogs() {
  try { localStorage.removeItem(STORAGE_KEY) } catch (e) {}
}

/* Звантажуємо як один JSON файл */
export function downloadDebugLogs() {
  var logs = getDebugLogs()
  if (logs.length === 0) {
    alert('Немає логів для звантаження')
    return
  }
  var blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url
  var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.download = 'trustauto-photoai-debug-' + ts + '-n' + logs.length + '.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(function() { URL.revokeObjectURL(url) }, 1000)
}

/* Допоміжна обрізка великих рядків */
export function truncate(str, maxLen) {
  if (typeof str !== 'string') return str
  maxLen = maxLen || MAX_RAW_LEN
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '\n\n[...TRUNCATED ' + (str.length - maxLen) + ' chars]'
}