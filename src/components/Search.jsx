import { useState } from 'react'
import { Photo } from './Photo'

/* CORS proxy — same as VinLookup, change here if proxy dies */
var PROXY = window.PROXY || 'https://corsproxy.io/?'

/* Filter options */
var MAKES = ['Всі марки', 'Toyota', 'BMW', 'Honda', 'Volkswagen', 'Mercedes-Benz', 'Audi', 'Hyundai', 'Kia', 'Mazda', 'Nissan', 'Ford']
var REGIONS = ['Вся Україна', 'Київ', 'Львів', 'Одеса', 'Харків', 'Дніпро', 'Запоріжжя']
var FUELS = ['Будь-яке', 'Бензин', 'Дизель', 'Гібрид', 'Електро']

/* AutoRia API IDs for regions and fuels */
var REGION_IDS = { 'Київ': 10, 'Львів': 5, 'Одеса': 18, 'Харків': 8, 'Дніпро': 3, 'Запоріжжя': 4 }
var FUEL_IDS = { 'Бензин': 1, 'Дизель': 2, 'Гібрид': 4, 'Електро': 5 }

/* Send car data to Claude for AI scoring */
function aiAnalyze(car) {
  var currentYear = new Date().getFullYear()
  var carYear = car.autoData?.year || 0
  var carAge = carYear ? (currentYear - carYear) : '?'

  var prompt = 'Ти експерт з підбору авто в Україні. Зараз ' + currentYear + ' рік.\n\nДані:\n'
  prompt += '- ' + car.markName + ' ' + car.modelName + ' ' + carYear + ' (' + carAge + ' років)\n'
  prompt += '- Пробіг: ' + (car.autoData?.raceInt || '?') + ' тис. км (очікуваний: ' + (carAge * 15) + '-' + (carAge * 20) + ' тис)\n'
  prompt += '- Паливо: ' + (car.autoData?.fuelName || '?') + '\n'
  prompt += '- Ціна: $' + (car.USD || '?') + '\n'
  prompt += '- Регіон: ' + (car.stateData?.name || '?') + '\n\n'
  prompt += 'Оціни конкретно ЦЕ оголошення. Відповідь ТІЛЬКИ JSON:\n'
  prompt += '{"score": 0-100, "verdict": "конкретне речення про це оголошення", "problems": ["1","2","3"], "strengths": ["1","2"]}'

  return fetch('https://wandering-breeze-9e18.trustauto-api.workers.dev/ai-claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_KEY,


    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
    .then(function (res) { return res.json() })
    .then(function (data) {
      var text = data.content[0].text
      return JSON.parse(text.replace(/```json|```/g, '').trim())
    })
}

export function Search() {
  const [filters, setFilters] = useState({
    make: '', yearFrom: '', yearTo: '',
    priceFrom: '', priceTo: '',
    kmFrom: '', kmTo: '',
    region: '', fuel: '', minScore: 50,
  })
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [scores, setScores] = useState({})
  const [analyzing, setAnalyzing] = useState(null)

  function f(key, val) { setFilters(function (p) { return { ...p, [key]: val } }) }

  /* Search AutoRia */
  async function handleSearch() {
    setLoading(true)
    setResults([])
    setSelected(null)
    setScores({})

    try {
      var key = import.meta.env.VITE_AUTORIA_KEY
      var url = 'https://developers.ria.com/auto/search?api_key=' + key + '&category_id=1&count=10&page=0'
      if (filters.yearFrom) url += '&year[0]=' + filters.yearFrom
      if (filters.yearTo) url += '&year[1]=' + filters.yearTo
      if (filters.priceFrom) url += '&price[0]=' + filters.priceFrom
      if (filters.priceTo) url += '&price[1]=' + filters.priceTo
      if (filters.region && REGION_IDS[filters.region]) url += '&state_id=' + REGION_IDS[filters.region]
      if (filters.fuel && FUEL_IDS[filters.fuel]) url += '&fuel_id=' + FUEL_IDS[filters.fuel]

      var res = await fetch(PROXY + encodeURIComponent(url))
      var data = await res.json()
      var ids = data.result?.search_result?.ids || []

      /* Fetch details for each car */
      var cars = await Promise.all(ids.slice(0, 8).map(async function (id) {
        var r = await fetch(PROXY + encodeURIComponent('https://developers.ria.com/auto/info?api_key=' + key + '&auto_id=' + id))
        return r.json()
      }))

      /* Filter out broken results */
      setResults(cars.filter(function (car) { return car.markName }))
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  /* Analyze one car with AI */
  async function handleAnalyze(car) {
    var id = car.autoData?.autoid || car.linkToView
    if (scores[id]) { setSelected(selected === id ? null : id); return }
    if (analyzing === id) return
    setSelected(id)
    setAnalyzing(id)

    try {
      var result = await aiAnalyze(car)
      setScores(function (p) { return { ...p, [id]: result } })
    } catch (e) {
      console.error(e)
    }
    setAnalyzing(null)
  }

  /* Helper: get photo URL from car data */
  function getPhoto(car) { return car.photoData?.seoLinkF || car.photoData?.seoLinkM || null }

  /* Helper: format car name */
  function getName(car) { return [car.markName, car.modelName, car.autoData?.year].filter(Boolean).join(' ') || 'Без назви' }

  /* Helper: format car metadata line */
  function getMeta(car) {
    var parts = []
    if (car.autoData?.raceInt) parts.push(car.autoData.raceInt.toLocaleString() + ' км')
    if (car.stateData?.name) parts.push(car.stateData.name)
    if (car.autoData?.fuelName) parts.push(car.autoData.fuelName)
    return parts.join(' · ') || '—'
  }

  return (
    <div className="search-layout">

      {/* === LEFT SIDEBAR: filters === */}
      <div className="sidebar">
        <div>
          <span className="label">Марка</span>
          <select className="select" onChange={function (e) { f('make', e.target.value) }}>
            {MAKES.map(function (m) { return <option key={m}>{m}</option> })}
          </select>
        </div>
        <div className="divider" />
        <div>
          <span className="label">Рік</span>
          <div className="grid-2col">
            <input className="input input-mono" placeholder="від" value={filters.yearFrom} onChange={function (e) { f('yearFrom', e.target.value) }} />
            <input className="input input-mono" placeholder="до" value={filters.yearTo} onChange={function (e) { f('yearTo', e.target.value) }} />
          </div>
        </div>
        <div>
          <span className="label">Бюджет, USD</span>
          <div className="grid-2col">
            <input className="input input-mono" placeholder="від" value={filters.priceFrom} onChange={function (e) { f('priceFrom', e.target.value) }} />
            <input className="input input-mono" placeholder="до" value={filters.priceTo} onChange={function (e) { f('priceTo', e.target.value) }} />
          </div>
        </div>
        <div>
          <span className="label">Пробіг, км</span>
          <div className="grid-2col">
            <input className="input input-mono" placeholder="від" value={filters.kmFrom} onChange={function (e) { f('kmFrom', e.target.value) }} />
            <input className="input input-mono" placeholder="до" value={filters.kmTo} onChange={function (e) { f('kmTo', e.target.value) }} />
          </div>
        </div>
        <div>
          <span className="label">Регіон</span>
          <select className="select" onChange={function (e) { f('region', e.target.value) }}>
            {REGIONS.map(function (r) { return <option key={r}>{r}</option> })}
          </select>
        </div>
        <div>
          <span className="label">Паливо</span>
          <select className="select" onChange={function (e) { f('fuel', e.target.value) }}>
            {FUELS.map(function (fl) { return <option key={fl}>{fl}</option> })}
          </select>
        </div>
        <div className="divider" />
        <div>
          <span className="label">Мін. оцінка — {filters.minScore}</span>
          <input type="range" className="slider" min="0" max="100" step="1" value={filters.minScore} onChange={function (e) { f('minScore', parseInt(e.target.value)) }} />
          <div className="slider-labels"><span>0</span><span>100</span></div>
        </div>
        <button className="btn-apply" onClick={handleSearch}>{loading ? 'Шукаємо...' : 'Застосувати'}</button>
      </div>

      {/* === RIGHT: search bar + results === */}
      <div className="search-main">
        <div className="search-bar">
          <div className="flex-1">
            <input className="input" placeholder="Або опишіть словами: дизельний SUV до $12K..." />
          </div>
        </div>

        {/* Column headers */}
        {results.length > 0 && (
          <div className="col-head">
            <div className="th" />
            <div className="th">Авто</div>
            <div className="th" style={{ textAlign: 'right' }}>Ціна</div>
            <div className="th" style={{ textAlign: 'center' }}>Перевірка</div>
          </div>
        )}

        {/* Empty / loading states */}
        {results.length === 0 && !loading && <div className="empty-state"><p className="empty-text">Задайте параметри та натисніть застосувати</p></div>}
        {loading && <div className="empty-state"><p className="empty-text">Шукаємо...</p></div>}

        {/* Results list */}
        <div style={{ overflowY: 'auto' }}>
          {results.map(function (car, idx) {
            var id = car.autoData?.autoid || car.linkToView || idx
            var isSelected = selected === id
            var score = scores[id]
            var isAnalyzing = analyzing === id
            var photo = getPhoto(car)

            return (
              <div key={id}>
                {/* Car row */}
                <div className={'result-row' + (isSelected ? ' active' : '')}>
                  <div className="thumb-cell"><Photo src={photo} size="thumb" /></div>
                  <div className="car-cell">
                    <div className="car-name">{getName(car)}</div>
                    <div className="car-meta">{getMeta(car)}</div>
                  </div>
                  <div className="price-cell"><span className="price">{car.USD ? '$' + car.USD.toLocaleString() : '—'}</span></div>
                  <div className="action-cell">
                    {score
                      ? <button className="btn-check scored" onClick={function () { setSelected(isSelected ? null : id) }}>{score.score} / 100</button>
                      : <button className="btn-check" onClick={function () { handleAnalyze(car) }}>{isAnalyzing ? '...' : 'Перевірити'}</button>
                    }
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isSelected && score && (
                  <div className="detail-wrap">
                    <div className="detail-inner">
                      <Photo src={photo} size="big" />
                      <div className="detail-content">
                        <div className="detail-head">
                          <span className="detail-title">{score.score} / 100</span>
                          <span className="detail-verdict">{score.verdict}</span>
                        </div>
                        <div className="detail-grid">
                          <div>
                            <span className="label">Проблеми</span>
                            {score.problems.map(function (p, i) { return <div key={i} className="row"><span className="item-text">{p}</span></div> })}
                          </div>
                          <div>
                            <span className="label">Переваги</span>
                            {score.strengths.map(function (s, i) { return <div key={i} className="row"><span className="item-text">{s}</span></div> })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
