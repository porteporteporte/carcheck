/* ═══════════════════════════════════════════════════════════════════
   runAdvancedDecode.js
   Fetches advanced VIN data through Worker proxy, extracts facts list.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Fetch advanced VIN decode data via Worker.
 * Returns flattened `data` object or null on any failure.
 */
export async function runAdvancedDecode(workerUrl, vin) {
  if (!vin || vin.length !== 17) return null
  try {
    const r = await fetch(workerUrl + '/advanced-vin-decode?vin=' + vin)
    if (!r.ok) return null
    const j = await r.json()
    if (j.status !== 'success' || !j.data) return null
    return j.data
  } catch (e) {
    console.warn('[runAdvancedDecode] failed:', e.message)
    return null
  }
}

/**
 * Extract additional facts from advanced decode data.
 * Designed to APPEND to existing extractFacts() output — does not duplicate.
 *
 * Returns array of { kind, icon, text } objects.
 */
export function extractFactsFromAdvanced(adv, autoria) {
  if (!adv) return []
  const facts = []

  // ── Trim ──
  if (adv.basic?.trim?.Trim) {
    let txt = 'Заводський trim: ' + (adv.basic.vehicle_name || '') + ' ' + adv.basic.trim.Trim
    facts.push({ kind: 'good', icon: '✓', text: txt.trim() })
  }

  // ── Hybrid alert (relevant for UA import duty rules) ──
  if (adv.engine?.engine_model && /hybrid|electric/i.test(adv.engine.engine_model)) {
    facts.push({
      kind: 'warn',
      icon: '⚠',
      text: 'Гібрид/електричний привід — спеціальні правила розмитнення в Україні',
    })
  }

  // ── Engine displacement match: AutoRia vs factory ──
  if (autoria?.autoData?.engineVolume && adv.engine?.['displacement_(l_ci)']) {
    const ariaL = parseFloat(String(autoria.autoData.engineVolume).replace(',', '.'))
    const advCC = parseFloat(adv.engine['displacement_(l_ci)'])
    const advL = advCC / 1000
    if (!isNaN(ariaL) && !isNaN(advL) && advL > 0) {
      const diff = Math.abs(ariaL - advL)
      if (diff > 0.5) {
        facts.push({
          kind: 'bad',
          icon: '✗',
          text:
            "Невідповідність двигуна: AutoRia " +
            ariaL.toFixed(1) +
            'л проти заводського ' +
            advL.toFixed(1) +
            'л',
        })
      } else if (diff > 0.2) {
        facts.push({
          kind: 'warn',
          icon: '⚠',
          text:
            "Об'єм двигуна трохи відрізняється: AutoRia " +
            ariaL.toFixed(1) +
            'л / завод ' +
            advL.toFixed(1) +
            'л',
        })
      }
    }
  }

  // ── Curb weight (helps user understand UA customs duty calc) ──
  if (adv.weight?.curb_weight) {
    facts.push({
      kind: 'info',
      icon: '·',
      text: 'Споряджена маса: ' + adv.weight.curb_weight,
    })
  }

  // ── Fuel economy ──
  if (adv.fuel?.fuel_economy) {
    facts.push({
      kind: 'info',
      icon: '·',
      text: 'Витрата (EPA): ' + adv.fuel.fuel_economy,
    })
  }

  // ── Horsepower / torque (technical context for buyer) ──
  if (adv.engine?.horsepower) {
    const hp = String(adv.engine.horsepower).split('@')[0].trim()
    let txt = 'Потужність: ' + hp + ' HP'
    if (adv.engine.net_torque) txt += ' / ' + adv.engine.net_torque + ' lb-ft'
    facts.push({ kind: 'info', icon: '·', text: txt })
  }

  return facts
}