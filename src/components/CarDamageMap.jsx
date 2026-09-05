import { useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════
   CarDamageMap — minimalist horizontal pill, abstract.

   Design principles:
   - Single hairline stroke (no filled body)
   - Soft tinted zones (low opacity), status dot in center
   - Hairline dashed dividers — minimal structural hint
   - Restrained type (tracked uppercase mono)
   - No realistic decorations (no wheels, lights, grille, gradients)

   Self-contained drop-in. To remove: delete file + import + JSX usage.
   ═══════════════════════════════════════════════════════════════════ */

var STATUS_FILL = {
  official: 'rgba(220, 64, 64, 0.32)',
  ai:       'rgba(217, 164, 58, 0.30)',
  intact:   'rgba(95, 168, 95, 0.22)',
  unknown:  'transparent',
}

var STATUS_DOT = {
  official: '#dc4040',
  ai:       '#d9a43a',
  intact:   '#5fa85f',
  unknown:  'transparent',
}

var STATUS_LABEL = {
  official: 'Офіційно з аукціону',
  ai:       'AI знайшов на фото',
  intact:   'AI підтвердив що ціле',
  unknown:  'Немає даних',
}

/* Zones — viewBox 720x250, body x=40..680, y=45..205 */
var ZONES = [
  { id: 'rear',        label: 'Задня частина',      x: 40,  y: 45,  w: 50,  h: 160 },
  { id: 'trunk',       label: 'Кришка багажника',   x: 90,  y: 45,  w: 100, h: 160 },
  { id: 'left_rear',   label: 'Лівий бік (зад)',    x: 190, y: 45,  w: 160, h: 50  },
  { id: 'left_front',  label: 'Лівий бік (перед)',  x: 350, y: 45,  w: 160, h: 50  },
  { id: 'roof',        label: 'Дах',                x: 190, y: 95,  w: 320, h: 60  },
  { id: 'right_rear',  label: 'Правий бік (зад)',   x: 190, y: 155, w: 160, h: 50  },
  { id: 'right_front', label: 'Правий бік (перед)', x: 350, y: 155, w: 160, h: 50  },
  { id: 'hood',        label: 'Капот',              x: 510, y: 45,  w: 120, h: 160 },
  { id: 'front',       label: 'Передня частина',    x: 630, y: 45,  w: 50,  h: 160 },
]

/* ═══════════════════════════════════════════════════════════════════
   Map Copart damage → zones
   ═══════════════════════════════════════════════════════════════════ */
function mapCopartToZones(auction) {
  if (!auction) return []
  var tc = auction['title-and-condition']
  if (!tc) return []
  var text = ((tc['Primary Damage'] || '') + ' ' + (tc['Secondary Damage'] || '')).toLowerCase()
  if (!text.trim()) return []

  if (text.includes('all over') || text.includes('rollover') || text.includes('roll over') ||
      text.includes('water') || text.includes('flood') ||
      text.includes('burn') || text.includes('fire')) {
    return ZONES.map(function (z) { return z.id })
  }

  var z = new Set()
  if (text.includes('hail')) {
    z.add('hood'); z.add('roof'); z.add('trunk')
  }
  if (text.includes('left front')) z.add('left_front')
  if (text.includes('right front')) z.add('right_front')
  if (text.includes('left rear')) z.add('left_rear')
  if (text.includes('right rear')) z.add('right_rear')
  if (text.includes('left side')) { z.add('left_front'); z.add('left_rear') }
  if (text.includes('right side')) { z.add('right_front'); z.add('right_rear') }
  if (text.includes('front end') ||
      (text.includes('front') && !text.includes('left front') && !text.includes('right front'))) {
    z.add('front'); z.add('hood')
  }
  if (text.includes('rear end') ||
      (text.includes('rear') && !text.includes('left rear') && !text.includes('right rear'))) {
    z.add('rear'); z.add('trunk')
  }
  if (text.includes('roof') || text.includes(' top ') || text.endsWith('top') || text.startsWith('top ')) {
    z.add('roof')
  }
  if (text.includes('mechanical') || text.includes('engine')) z.add('hood')
  if (text.includes('undercarriage')) z.add('hood')
  return Array.from(z)
}

/* ═══════════════════════════════════════════════════════════════════
   Text → zones (uses .includes() not regex \b — \b doesn't work
   with cyrillic in JavaScript without /u flag).
   ═══════════════════════════════════════════════════════════════════ */
function textToZones(text, parentIsFront, parentIsRear) {
  if (!text) return []
  var name = String(text).toLowerCase()
  var zones = new Set()

  /* Front zone (bumper, grille, headlights — symmetric, no left/right) */
  if (name.includes('решіт') || name.includes('grille')) zones.add('front')
  if (name.includes('фар') && !name.includes('задн') && !name.includes('ліхтар')) zones.add('front')
  if (name.includes('передн') && name.includes('бампер')) zones.add('front')
  if (name.includes('передній бампер')) zones.add('front')

  /* Hood */
  if (name.includes('капот') || name.includes('hood')) zones.add('hood')

  /* Roof / windshield */
  if (name.includes('дах') || name.includes('roof')) zones.add('roof')
  if (name.includes('лоб') || name.includes('windshield')) zones.add('roof')

  /* Trunk */
  if (name.includes('кришка') || name.includes('багажни') || name.includes('trunk')) zones.add('trunk')

  /* Rear bumper / taillights */
  if (name.includes('задн') && name.includes('бампер')) zones.add('rear')
  if (name.includes('задній бампер')) zones.add('rear')
  if (name.includes('ліхтар')) zones.add('rear')
  if (name.includes('rear') && name.includes('bumper')) zones.add('rear')

  /* Side panels — use .includes (cyrillic-safe) */
  var hasLeft = name.includes('лів') || name.includes('left')
  var hasRight = name.includes('прав') || name.includes('right')
  var hasFront = name.includes('передн') || name.includes('front')
  var hasRear = name.includes('задн') || name.includes('rear')
  var hasSidePart = name.includes('двер') || name.includes('door') ||
                    name.includes('крил') || name.includes('fender') ||
                    name.includes('quarter')

  if (hasSidePart) {
    var resolveFront = hasFront || (parentIsFront && !hasRear)
    var resolveRear = hasRear || (parentIsRear && !hasFront)

    if (hasLeft && resolveFront) zones.add('left_front')
    if (hasLeft && resolveRear) zones.add('left_rear')
    if (hasRight && resolveFront) zones.add('right_front')
    if (hasRight && resolveRear) zones.add('right_rear')

    if (!resolveFront && !resolveRear) {
      if (hasLeft) { zones.add('left_front'); zones.add('left_rear') }
      if (hasRight) { zones.add('right_front'); zones.add('right_rear') }
    }
  }

  return Array.from(zones)
}

/* ═══════════════════════════════════════════════════════════════════
   Map AI part → zones (scans partName + descriptionItems separately)
   ═══════════════════════════════════════════════════════════════════ */
function mapAiPartsToZones(parts) {
  if (!parts) return []
  var zones = new Set()

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i]
    var pName = (part.partName || '')
    var pNameLower = pName.toLowerCase()

    /* Parent context detection */
    var parentIsFront = pNameLower.includes('передн') || pNameLower.includes('перед') ||
                        pNameLower === 'передня частина'
    var parentIsRear = pNameLower.includes('задн') || pNameLower.includes('зад') ||
                       pNameLower === 'задня частина'

    /* Implicit zone from broad partName */
    if (parentIsFront) zones.add('front')
    if (parentIsRear) zones.add('rear')

    /* Direct partName mapping */
    var pZones = textToZones(pName, parentIsFront, parentIsRear)
    for (var pz = 0; pz < pZones.length; pz++) zones.add(pZones[pz])

    /* Each descriptionItem scanned separately */
    if (part.descriptionItems && part.descriptionItems.length > 0) {
      for (var j = 0; j < part.descriptionItems.length; j++) {
        var itemText = part.descriptionItems[j].text || ''
        var iZones = textToZones(itemText, parentIsFront, parentIsRear)
        for (var iz = 0; iz < iZones.length; iz++) zones.add(iZones[iz])
      }
    } else if (part.description) {
      var dZones = textToZones(part.description, parentIsFront, parentIsRear)
      for (var dz = 0; dz < dZones.length; dz++) zones.add(dZones[dz])
    }
  }

  return Array.from(zones)
}

/* ═══════════════════════════════════════════════════════════════════
   Build per-zone tooltip details
   ═══════════════════════════════════════════════════════════════════ */
function buildZoneDetails(auction, photoAnalysis, status) {
  var details = {}
  for (var i = 0; i < ZONES.length; i++) details[ZONES[i].id] = []

  if (auction?.['title-and-condition']) {
    var primary = auction['title-and-condition']['Primary Damage']
    var secondary = auction['title-and-condition']['Secondary Damage']
    var officialZones = mapCopartToZones(auction)
    for (var k = 0; k < officialZones.length; k++) {
      var zid = officialZones[k]
      if (primary) details[zid].push({ kind: 'official', text: 'Аукціон: ' + primary })
      if (secondary && secondary !== 'N/A' && secondary !== '-' && secondary !== '') {
        details[zid].push({ kind: 'official', text: '+ ' + secondary })
      }
    }
  }

  if (photoAnalysis?.damagedParts) {
    for (var p = 0; p < photoAnalysis.damagedParts.length; p++) {
      var part = photoAnalysis.damagedParts[p]
      var partZones = mapAiPartsToZones([part])
      for (var pz = 0; pz < partZones.length; pz++) {
        if (status[partZones[pz]] === 'official') continue
        details[partZones[pz]].push({ kind: 'ai', text: part.partName })
      }
    }
  }

  if (photoAnalysis?.intactParts) {
    for (var ip = 0; ip < photoAnalysis.intactParts.length; ip++) {
      var ipart = photoAnalysis.intactParts[ip]
      var ipZones = mapAiPartsToZones([ipart])
      for (var ipz = 0; ipz < ipZones.length; ipz++) {
        var zoneStatus = status[ipZones[ipz]]
        if (zoneStatus === 'official' || zoneStatus === 'ai') continue
        details[ipZones[ipz]].push({ kind: 'intact', text: ipart.partName + ' — ціле' })
      }
    }
  }

  return details
}

/* ═══ Inline legend chip ═══ */
function LegendChip({ dot, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dot,
        flexShrink: 0,
      }} />
      <div style={{
        fontSize: 11,
        color: 'var(--muted)',
        fontFamily: 'var(--mono, monospace)',
        letterSpacing: '0.04em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text)',
        fontFamily: 'var(--mono, monospace)',
        fontWeight: 600,
      }}>
        {count}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export function CarDamageMap({ auction, photoAnalysis }) {
  var [hovered, setHovered] = useState(null)

  if (!auction && !photoAnalysis) return null

  var officialZones = mapCopartToZones(auction)
  var aiDamagedZones = mapAiPartsToZones(photoAnalysis?.damagedParts || [])
  var aiIntactZones = mapAiPartsToZones(photoAnalysis?.intactParts || [])

  var status = {}
  for (var i = 0; i < ZONES.length; i++) {
    var z = ZONES[i].id
    if (officialZones.indexOf(z) >= 0) status[z] = 'official'
    else if (aiDamagedZones.indexOf(z) >= 0) status[z] = 'ai'
    else if (aiIntactZones.indexOf(z) >= 0) status[z] = 'intact'
    else status[z] = 'unknown'
  }

  var officialCount = 0, aiCount = 0, intactCount = 0
  for (var k = 0; k < ZONES.length; k++) {
    var s = status[ZONES[k].id]
    if (s === 'official') officialCount++
    else if (s === 'ai') aiCount++
    else if (s === 'intact') intactCount++
  }

  if (officialCount === 0 && aiCount === 0 && intactCount === 0) return null

  var details = buildZoneDetails(auction, photoAnalysis, status)
  var hoveredZone = hovered ? ZONES.find(function (z) { return z.id === hovered }) : null
  var hoveredDetails = hovered ? details[hovered] : null
  var hoveredStatus = hovered ? status[hovered] : null

  return (
    <div style={{ marginTop: 28 }}>
      {/* Title — calmer than h2 */}
      <div style={{
        fontSize: 11,
        fontFamily: 'var(--mono, monospace)',
        color: 'var(--muted)',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        marginBottom: 18,
      }}>
        Карта пошкоджень
      </div>

      {/* Legend — borderless inline */}
      <div style={{
        display: 'flex',
        gap: 32,
        flexWrap: 'wrap',
        marginBottom: 24,
      }}>
        <LegendChip dot={STATUS_DOT.official} label={STATUS_LABEL.official} count={officialCount} />
        <LegendChip dot={STATUS_DOT.ai}       label={STATUS_LABEL.ai}       count={aiCount} />
        <LegendChip dot={STATUS_DOT.intact}   label={STATUS_LABEL.intact}   count={intactCount} />
      </div>

      {/* SVG — minimalist pill silhouette */}
      <div style={{ position: 'relative' }}>
        <svg
          viewBox="0 0 720 250"
          style={{ width: '100%', height: 'auto', display: 'block', maxWidth: 920 }}
        >
          <defs>
            <clipPath id="bodyClipDmgV4">
              <rect x="40" y="45" width="640" height="160" rx="55" />
            </clipPath>
          </defs>

          {/* Damage zones — soft tinted fills, clipped to body shape */}
          <g clipPath="url(#bodyClipDmgV4)">
            {ZONES.map(function (zone) {
              var st = status[zone.id]
              var isHovered = hovered === zone.id
              return (
                <rect
                  key={zone.id}
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  fill={STATUS_FILL[st]}
                  stroke={isHovered ? STATUS_DOT[st] : 'transparent'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  onMouseEnter={function () { setHovered(zone.id) }}
                  onMouseLeave={function () { setHovered(null) }}
                  style={{ cursor: 'pointer', transition: 'stroke 0.15s, opacity 0.15s' }}
                />
              )
            })}
          </g>

          {/* Internal panel hairlines — extremely subtle */}
          <g
            stroke="var(--border)"
            strokeWidth="0.5"
            strokeDasharray="1,4"
            pointerEvents="none"
            opacity="0.35"
            clipPath="url(#bodyClipDmgV4)"
          >
            <line x1="90" y1="45" x2="90" y2="205" />
            <line x1="190" y1="45" x2="190" y2="205" />
            <line x1="510" y1="45" x2="510" y2="205" />
            <line x1="630" y1="45" x2="630" y2="205" />
            <line x1="190" y1="95" x2="510" y2="95" />
            <line x1="190" y1="155" x2="510" y2="155" />
            <line x1="350" y1="45" x2="350" y2="95" />
            <line x1="350" y1="155" x2="350" y2="205" />
          </g>

          {/* Body outline — single hairline pill */}
          <rect
            x="40" y="45" width="640" height="160" rx="55"
            fill="none"
            stroke="var(--border)"
            strokeWidth="1.2"
            pointerEvents="none"
          />

          {/* Status indicator dots — center of each colored zone */}
          {ZONES.map(function (zone) {
            var st = status[zone.id]
            if (st === 'unknown') return null
            var cx = zone.x + zone.w / 2
            var cy = zone.y + zone.h / 2
            return (
              <circle
                key={'dot-' + zone.id}
                cx={cx} cy={cy} r="2.5"
                fill={STATUS_DOT[st]}
                pointerEvents="none"
              />
            )
          })}

          {/* REAR / FRONT labels — tracked uppercase mono */}
          <text
            x="40" y="232"
            fill="var(--dim)"
            fontSize="9"
            fontFamily="var(--mono, monospace)"
            letterSpacing="0.22em"
            pointerEvents="none"
          >
            ЗАДОК
          </text>
          <text
            x="680" y="232"
            textAnchor="end"
            fill="var(--dim)"
            fontSize="9"
            fontFamily="var(--mono, monospace)"
            letterSpacing="0.22em"
            pointerEvents="none"
          >
            ПЕРЕДОК
          </text>
        </svg>

        {/* Hover overlay tooltip — top-right */}
        {hovered && (
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            maxWidth: 280,
            minWidth: 220,
            padding: '12px 14px',
            background: 'rgba(20,20,20,0.96)',
            backdropFilter: 'blur(6px)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            pointerEvents: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: STATUS_DOT[hoveredStatus],
              }} />
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
              }}>
                {hoveredZone.label}
              </div>
            </div>
            <div style={{
              fontSize: 9,
              color: 'var(--dim)',
              fontFamily: 'var(--mono, monospace)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: '1px solid var(--border)',
            }}>
              {STATUS_LABEL[hoveredStatus]}
            </div>
            {hoveredDetails && hoveredDetails.length > 0 ? (
              hoveredDetails.map(function (item, i) {
                return (
                  <div key={i} style={{
                    fontSize: 12,
                    color: item.kind === 'official' ? '#dc4040'
                      : item.kind === 'ai' ? '#d9a43a'
                      : 'var(--muted)',
                    marginBottom: 4,
                    lineHeight: 1.5,
                  }}>
                    {item.text}
                  </div>
                )
              })
            ) : (
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                Нема додаткових даних
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
