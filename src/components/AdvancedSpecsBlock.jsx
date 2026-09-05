import { useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════
   AdvancedSpecsBlock — VIN-specific data only
   Removed: colors and options (those are trim-level palettes, not real
   factory equipment of this exact car)
   ═══════════════════════════════════════════════════════════════════ */

var MONO = 'var(--mono, "JetBrains Mono", Consolas, monospace)'

/* ═══════════════════════════════════════════════════════════════════
   UNIT CONVERSIONS
   ═══════════════════════════════════════════════════════════════════ */

function convertInches(s) {
  if (!s) return null
  var m = String(s).match(/^([\d.]+)\s*in$/i)
  if (!m) return null
  var inches = parseFloat(m[1])
  if (isNaN(inches)) return null
  var mm = Math.round(inches * 25.4)
  return { ua: mm.toLocaleString('uk') + ' мм', en: s }
}

function convertLbs(s) {
  if (!s) return null
  var m = String(s).match(/^([\d,]+)\s*lbs?$/i)
  if (!m) return null
  var lbs = parseFloat(m[1].replace(/,/g, ''))
  if (isNaN(lbs)) return null
  var kg = Math.round(lbs * 0.4536)
  return { ua: kg.toLocaleString('uk') + ' кг', en: s }
}

function convertGal(s) {
  if (!s) return null
  var m = String(s).match(/^([\d.]+)\s*gal$/i)
  if (!m) return null
  var gal = parseFloat(m[1])
  if (isNaN(gal)) return null
  return { ua: (gal * 3.785).toFixed(1) + ' л', en: s }
}

function convertFt(s) {
  if (!s) return null
  var m = String(s).match(/^([\d.]+)\s*ft$/i)
  if (!m) return null
  var ft = parseFloat(m[1])
  if (isNaN(ft)) return null
  return { ua: (ft * 0.3048).toFixed(1) + ' м', en: s }
}

function convertMpg(s) {
  if (!s) return null
  var str = String(s)
  var both = str.match(/(\d+)\s*City\s*\/\s*(\d+)\s*Highway/i)
  if (both) {
    var c = (235.215 / parseFloat(both[1])).toFixed(1)
    var h = (235.215 / parseFloat(both[2])).toFixed(1)
    return { ua: c + ' / ' + h + ' л/100 км', en: str }
  }
  var single = str.match(/^(\d+)\s*MPG/i)
  if (single) {
    return { ua: (235.215 / parseFloat(single[1])).toFixed(1) + ' л/100 км', en: str }
  }
  return null
}

function metric(s) {
  if (s == null || s === '' || s === 'undefined in') return null
  return convertInches(s) || convertLbs(s) || convertGal(s) || convertFt(s) || convertMpg(s) || { ua: String(s), en: null }
}

/* ═══════════════════════════════════════════════════════════════════
   HUMANIZE
   ═══════════════════════════════════════════════════════════════════ */

var DRIVE = {
  'AWD': 'Повний', '4WD': '4×4', '4X4': '4×4',
  'FWD': 'Передній', 'RWD': 'Задній',
  'Front Wheel Drive': 'Передній', 'Rear Wheel Drive': 'Задній',
  'All Wheel Drive': 'Повний', 'Four Wheel Drive': 'Повний',
}
var BODY = {
  'Sedan': 'Седан', 'SUV': 'Позашляховик', 'Coupe': 'Купе',
  'Hatchback': 'Хетчбек', 'Wagon': 'Універсал', 'Pickup': 'Пікап',
  'Truck': 'Вантажівка', 'Van': 'Мінівен', 'Convertible': 'Кабріолет',
  'Crossover': 'Кросовер', 'Minivan': 'Мінівен',
}
var SIZE = {
  'Compact Cars': 'Компактний', 'Subcompact Cars': 'Малий',
  'Midsize Cars': 'Середній', 'Large Cars': 'Великий',
  'Standard SUV 4WD': 'Стандартний SUV', 'Standard SUV 2WD': 'Стандартний SUV',
  'Compact SUV 4WD': 'Компактний SUV', 'Compact SUV 2WD': 'Компактний SUV',
  'Small SUV 4WD': 'Малий SUV', 'Small SUV 2WD': 'Малий SUV',
}

function humanize(raw, dict) {
  if (!raw) return null
  var clean = String(raw).trim()
  if (dict[clean]) return { ua: dict[clean], en: clean }
  for (var k in dict) {
    if (k.toLowerCase() === clean.toLowerCase()) return { ua: dict[k], en: clean }
  }
  return { ua: clean, en: null }
}

function humanizeEngine(raw) {
  if (!raw) return null
  var s = String(raw)
  var parts = []
  if (/turbo/i.test(s)) parts.push('Турбо')
  if (/hybrid|electric/i.test(s)) parts.push('гібрид')
  else if (/diesel/i.test(s)) parts.push('дизель')
  else if (/gas|petrol|unleaded/i.test(s)) parts.push('бензин')
  var cm = s.match(/[IV]-?\d+/i)
  if (cm) {
    var cfg = cm[0].toUpperCase().replace('-', '')
    parts.push(cfg.startsWith('I') ? 'рядний ' + cfg.slice(1) : cfg)
  }
  if (parts.length === 0) return { ua: s, en: null }
  var ua = parts.join(' ')
  return { ua: ua.charAt(0).toUpperCase() + ua.slice(1), en: s }
}

function humanizeTransmission(raw) {
  if (!raw) return null
  var s = String(raw)
  var sm = s.match(/(\d+)[\s-]?speed/i)
  var speed = sm ? sm[1] + '-ст' : null
  var type = ''
  if (/manual/i.test(s)) type = 'Механіка'
  else if (/cvt/i.test(s)) type = 'Варіатор'
  else if (/dct|dual.?clutch|sport.?automatic/i.test(s)) type = 'Робот'
  else if (/automatic|auto/i.test(s)) type = 'Автомат'
  if (!type) return { ua: s, en: null }
  return { ua: speed ? type + ' ' + speed : type, en: s }
}

function humanizeBrakes(raw) {
  if (!raw) return null
  var s = String(raw)
  if (/disc/i.test(s)) return { ua: 'Дисковий', en: s }
  if (/drum/i.test(s)) return { ua: 'Барабанний', en: s }
  return { ua: s, en: null }
}

function humanizeSuspension(raw) {
  if (!raw) return null
  var s = String(raw), lower = s.toLowerCase()
  if (lower.includes('multi-link')) return { ua: 'Багатоважільна', en: s }
  if (lower.includes('macpherson')) return { ua: 'Макферсон', en: s }
  if (lower.includes('double wishbone')) return { ua: 'Двоважільна', en: s }
  if (lower.includes('torsion')) return { ua: 'Торсіонна', en: s }
  if (lower.includes('leaf')) return { ua: 'Ресорна', en: s }
  return { ua: s, en: null }
}

function humanizeSteering(raw) {
  if (!raw) return null
  if (/rack.?pinion/i.test(raw)) return { ua: 'Рейкове', en: String(raw) }
  return { ua: String(raw), en: null }
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

function StatCard({ ua, en, label }) {
  if (ua == null || ua === '' || ua === 'undefined in') return null
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 4,
      minHeight: 86,
      height: '100%',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text)',
          lineHeight: 1.3,
          wordBreak: 'break-word',
        }}>
          {ua}
        </div>
        {en && (
          <div style={{
            fontSize: 11,
            color: 'var(--dim)',
            fontFamily: MONO,
            letterSpacing: '0.02em',
            wordBreak: 'break-word',
          }}>
            {en}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 10,
        color: 'var(--dim)',
        fontFamily: MONO,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        fontSize: 18,
        fontWeight: 700,
        color: 'var(--text)',
        letterSpacing: '-0.01em',
        marginBottom: 14,
        paddingBottom: 10,
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function CardsGrid({ items, minWidth }) {
  var visible = items.filter(function (it) {
    return it && it.ua != null && it.ua !== '' && it.ua !== 'undefined in'
  })
  if (visible.length === 0) return null
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(' + (minWidth || 200) + 'px, 1fr))',
      gridAutoRows: '1fr',
      gap: 8,
    }}>
      {visible.map(function (it, i) {
        return <StatCard key={i} ua={it.ua} en={it.en} label={it.label} />
      })}
    </div>
  )
}

function ShowMore({ extras, minWidth }) {
  var [open, setOpen] = useState(false)
  var visible = extras.filter(function (it) {
    return it && it.ua != null && it.ua !== '' && it.ua !== 'undefined in'
  })
  if (visible.length === 0) return null

  return (
    <>
      {open && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(' + (minWidth || 200) + 'px, 1fr))',
          gridAutoRows: '1fr',
          gap: 8,
          marginTop: 8,
        }}>
          {visible.map(function (it, i) {
            return <StatCard key={i} ua={it.ua} en={it.en} label={it.label} />
          })}
        </div>
      )}
      <button
        onClick={function () { setOpen(!open) }}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          fontFamily: MONO,
          fontSize: 11,
          padding: '6px 12px',
          borderRadius: 4,
          cursor: 'pointer',
          marginTop: 10,
          letterSpacing: '0.05em',
        }}
      >
        {open ? '↑ Згорнути' : '↓ Показати ще (' + visible.length + ')'}
      </button>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════ */
export function AdvancedSpecsBlock({ data }) {
  if (!data) return null

  var basic = data.basic || {}
  var engine = data.engine || {}
  var transmission = data.transmission || {}
  var dimensions = data.dimensions || {}
  var weight = data.weight || {}
  var wheels = data.wheels_and_tires || {}
  var braking = data.braking || {}
  var fuel = data.fuel || {}
  var market = data.market_value || {}
  var drivetrain = data.drivetrain || {}
  var manufacturer = data.manufacturer || {}
  var suspension = data.suspension || {}
  var seating = data.seating || {}

  function plain(value, label) {
    if (value == null || value === '') return null
    return { ua: String(value), en: null, label: label }
  }
  function withLabel(humanized, label) {
    if (!humanized) return null
    return { ua: humanized.ua, en: humanized.en, label: label }
  }
  function metricLabel(rawValue, label) {
    var m = metric(rawValue)
    if (!m) return null
    return { ua: m.ua, en: m.en, label: label }
  }

  /* engine displacement */
  var displL = null
  if (engine['displacement_(l_ci)']) {
    var ccVal = parseFloat(engine['displacement_(l_ci)'])
    if (!isNaN(ccVal) && ccVal > 0) displL = { ua: (ccVal / 1000).toFixed(1) + ' л', en: null }
  }

  /* horsepower */
  var hpStr = null
  if (engine.horsepower) {
    var hpRaw = String(engine.horsepower)
    var hpNum = hpRaw.split('@')[0].trim()
    var rpmMatch = hpRaw.match(/@\s*(\d+)/)
    hpStr = {
      ua: hpNum + ' к.с.',
      en: rpmMatch ? '@ ' + rpmMatch[1] + ' об/хв' : null,
    }
  }

  /* torque: lb-ft → Нм */
  var torqueStr = null
  if (engine.net_torque) {
    var nm = Math.round(parseFloat(engine.net_torque) * 1.356)
    torqueStr = { ua: nm + ' Нм', en: engine.net_torque + ' lb-ft' }
  }

  /* dimensions combined: convert to mm */
  var dimensionsCombined = null
  if (dimensions.length && dimensions.width && dimensions.height) {
    var Lm = convertInches(dimensions.length)
    var Wm = convertInches(dimensions.width)
    var Hm = convertInches(dimensions.height)
    if (Lm && Wm && Hm) {
      var lmm = Lm.ua.replace(/[^\d]/g, '')
      var wmm = Wm.ua.replace(/[^\d]/g, '')
      var hmm = Hm.ua.replace(/[^\d]/g, '')
      dimensionsCombined = {
        ua: lmm + ' × ' + wmm + ' × ' + hmm + ' мм',
        en: dimensions.length + ' × ' + dimensions.width + ' × ' + dimensions.height,
      }
    }
  }

  /* trim */
  var trimShort = null
  if (basic.trim?.Trim) {
    trimShort = { ua: basic.trim.Trim, en: basic.trim.Style || null }
  }

  /* ─── Section 1: Огляд ─── */
  var overviewPrimary = [
    withLabel(trimShort, 'Trim'),
    plain(market.msrp, 'MSRP заводу'),
    withLabel(humanize(drivetrain.drive_type, DRIVE), 'Привід'),
    withLabel(humanize(basic.body_type, BODY), 'Тип кузова'),
    withLabel(humanize(basic.vehicle_size, SIZE), 'Розмір'),
    plain(seating.standard_seating, 'Кількість місць'),
  ]
  var overviewExtras = [
    plain(market.destination_charge, 'Доставка з заводу'),
    plain(manufacturer.manufacturer, 'Виробник'),
    plain(manufacturer.country, 'Країна виробництва'),
    plain(data.intro?.vin, 'VIN'),
  ]

  /* ─── Section 2: Engine + transmission ─── */
  var enginePrimary = [
    withLabel(humanizeEngine(engine.engine_model), 'Двигун'),
    displL ? { ua: displL.ua, en: displL.en, label: "Об'єм" } : null,
    hpStr ? { ua: hpStr.ua, en: hpStr.en, label: 'Потужність' } : null,
    torqueStr ? { ua: torqueStr.ua, en: torqueStr.en, label: 'Крутний момент' } : null,
    withLabel(humanizeTransmission(transmission.transmission_style), 'Трансмісія'),
    plain(engine.engine_number_of_cylinders, 'Конфігурація'),
  ]
  var engineExtras = [
    plain(drivetrain.final_drive_axle_ratio, 'Головна передача'),
    plain(transmission.first_gear_ratio, '1-ша передача'),
    plain(transmission.second_gear_ratio, '2-га передача'),
    plain(transmission.third_gear_ratio, '3-тя передача'),
    plain(transmission.fourth_gear_ratio, '4-та передача'),
    plain(transmission.fifth_gear_ratio, '5-та передача'),
    plain(transmission.sixth_gear_ratio, '6-та передача'),
    plain(transmission.seventh_gear_ratio, '7-ма передача'),
    plain(transmission.eighth_gear_ratio, '8-ма передача'),
    plain(transmission.reverse_ratio, 'Реверс'),
  ]

  /* ─── Section 3: Body / wheels — all dimensions converted to mm/kg/m ─── */
  var bodyPrimary = [
    dimensionsCombined ? { ua: dimensionsCombined.ua, en: dimensionsCombined.en, label: 'Габарити (Д × Ш × В)' } : null,
    metricLabel(dimensions.wheelbase, 'Колісна база'),
    metricLabel(weight.curb_weight, 'Споряджена маса'),
    plain(wheels.front_tire_size, 'Шини (перед)'),
    plain(wheels['wheel_size_front_(inches)'], 'Диски'),
    withLabel(humanizeBrakes(braking.front_brake_type), 'Гальма'),
  ]
  var bodyExtras = [
    metricLabel(dimensions.min_ground_clearance, 'Кліренс'),
    metricLabel(dimensions.turning_diameter, 'Радіус розвороту'),
    plain(wheels.rear_tire_size, 'Шини (зад)'),
    plain(wheels.front_wheel_material, 'Матеріал дисків'),
    plain(wheels.anti_lock_brakes, 'ABS'),
    withLabel(humanizeSuspension(suspension.front_suspension), 'Підвіска (перед)'),
    withLabel(humanizeSuspension(suspension.rear_suspension), 'Підвіска (зад)'),
    withLabel(humanizeSteering(suspension.steering_type), 'Тип керма'),
    metricLabel(dimensions.front_legroom, 'Простір ніг (перед)'),
    metricLabel(dimensions.rear_legroom, 'Простір ніг (зад)'),
    metricLabel(dimensions.front_headroom, 'Висота (перед)'),
    metricLabel(dimensions.rear_headroom, 'Висота (зад)'),
    metricLabel(dimensions.front_shoulder_room, 'Плечі (перед)'),
    metricLabel(dimensions.rear_shoulder_room, 'Плечі (зад)'),
    metricLabel(dimensions.track_width_front, 'Колія (перед)'),
    metricLabel(dimensions.track_width_rear, 'Колія (зад)'),
  ]

  /* ─── Section 4: Fuel — all converted ─── */
  var fuelCards = [
    metricLabel(fuel.city_mileage, 'Місто'),
    metricLabel(fuel.highway_mileage, 'Траса'),
    metricLabel(fuel.fuel_economy_est_combined, 'Комбіновано'),
    metricLabel(fuel.fuel_capacity, "Об'єм бака"),
  ]

  return (
    <div>
      <Section title="Заводська комплектація">
        <CardsGrid items={overviewPrimary} minWidth={200} />
        <ShowMore extras={overviewExtras} minWidth={200} />
      </Section>

      <Section title="Двигун і трансмісія">
        <CardsGrid items={enginePrimary} minWidth={200} />
        <ShowMore extras={engineExtras} minWidth={150} />
      </Section>

      <Section title="Габарити, маса, колеса">
        <CardsGrid items={bodyPrimary} minWidth={200} />
        <ShowMore extras={bodyExtras} minWidth={180} />
      </Section>

      {fuelCards.some(function (c) { return c }) && (
        <Section title="Витрата палива">
          <CardsGrid items={fuelCards} minWidth={170} />
        </Section>
      )}
    </div>
  )
}
