import { useState } from 'react'

export function AiAnalysis({ carData }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleAnalyze() {
    setLoading(true)
    setAnalysis(null)

    var currentYear = new Date().getFullYear()
    var carAge = carData.year ? (currentYear - carData.year) : '?'

    var prompt = 'Ти досвідчений автопідбірник в Україні. Говориш прямо, без води.\n'
    prompt += 'Зараз ' + currentYear + ' рік. Вік авто: ' + carAge + ' років.\n\n'
    prompt += 'Дані з оголошення:\n'
    prompt += '- Марка / модель: ' + carData.make + ' ' + carData.model + '\n'
    prompt += '- Рік випуску: ' + carData.year + '\n'
    prompt += '- Двигун: ' + carData.engine + '\n'
    if (carData.gearbox) prompt += '- КПП: ' + carData.gearbox + '\n'
    if (carData.mileage != null) prompt += '- Пробіг: ' + carData.mileage + ' тис. км\n'
    if (carData.price) prompt += '- Ціна: $' + carData.price + '\n'
    if (carData.fuel) prompt += '- Паливо: ' + carData.fuel + '\n'
    if (carData.country) prompt += '- Регіон: ' + carData.country + '\n'
    if (carData.description) {
      prompt += '\nОПИС ПРОДАВЦЯ (читай уважно — тут часто приховані проблеми):\n'
      prompt += '«' + carData.description.substring(0, 500) + '»\n'
    }
    prompt += '\nПРАВИЛА:\n'
    prompt += '- Будь практичним, не педантичним. Об\'єм 2.5 це 2.5, не роздмухуй дрібниці.\n'
    prompt += '- Зверни увагу на ОПИС — фрази типу "потребує доопрацювань", "після ДТП", "не фарбована" (часто брехня) — це сигнали.\n'
    prompt += '- Якщо пробіг реальний для віку — не кричи що він підозрілий.\n'
    prompt += '- Оцінюй як людина яка реально купує авто, а не як робот який перевіряє чекліст.\n\n'
    prompt += 'Відповідь ТІЛЬКИ JSON:\n'
    prompt += '{\n'
    prompt += '  "score": число 0-100,\n'
    prompt += '  "verdict": "одне речення — головний висновок для покупця",\n'
    prompt += '  "problems": ["реальна проблема 1", "проблема 2", "проблема 3"],\n'
    prompt += '  "strengths": ["перевага 1", "перевага 2"],\n'
    prompt += '  "fair_price_low": число USD,\n'
    prompt += '  "fair_price_high": число USD,\n'
    prompt += '  "price_verdict": "вигідна" або "завищена" або "адекватна" або "підозріло дешева",\n'
    prompt += '  "maintenance": "дешеве/середнє/дороге — коротко чому",\n'
    prompt += '  "questions": ["конкретне питання продавцю 1", "питання 2", "питання 3"],\n'
    prompt += '  "inspection": ["що перевірити на СТО 1", "перевірити 2", "перевірити 3"],\n'
    prompt += '  "alternatives": ["альтернатива за ці гроші 1", "альтернатива 2"],\n'
    prompt += '  "trend": "зростає" або "падає" або "стабільна"\n'
    prompt += '}'

    try {
      var res = await fetch('https://wandering-breeze-9e18.trustauto-api.workers.dev/ai-claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_KEY,
          
          
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      var data = await res.json()
      var text = data.content[0].text
      var clean = text.replace(/```json|```/g, '').trim()
      try {
        setAnalysis(JSON.parse(clean))
      } catch (parseErr) {
        var fixed = clean
        var opens = (fixed.match(/\[/g) || []).length
        var closes = (fixed.match(/\]/g) || []).length
        while (closes < opens) { fixed += ']'; closes++ }
        if (!fixed.endsWith('}')) fixed += '}'
        try { setAnalysis(JSON.parse(fixed)) } catch (e2) { console.error('Parse error', e2) }
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  /* Score color */
  function scoreColor(s) {
    if (s >= 70) return 'score-green'
    if (s >= 40) return 'score-amber'
    return 'score-red'
  }

  /* Price tag color */
  function priceTag(v) {
    if (v === 'вигідна') return 'tag-green'
    if (v === 'підозріло дешева') return 'tag-red'
    if (v === 'завищена') return 'tag-amber'
    return 'tag-neutral'
  }

  /* Trend arrow */
  function trendArrow(t) {
    if (!t) return '→'
    if (t.includes('зростає')) return '↑'
    if (t.includes('падає')) return '↓'
    return '→'
  }

  /* External links */
  function getLinks() {
    return [
      { name: 'Copart', desc: 'Аукціон США', url: 'https://www.copart.com/lotSearchResults/?free=true&query=' + encodeURIComponent(carData.make + ' ' + carData.model) },
      { name: 'IAAI', desc: 'Insurance Auctions', url: 'https://www.iaai.com/Search?Keyword=' + encodeURIComponent(carData.make + ' ' + carData.model) },
      { name: 'AutoRia', desc: 'Схожі оголошення', url: 'https://auto.ria.com/uk/search/?categories.main.id=1&brand.name=' + encodeURIComponent(carData.make || '') + '&model.name=' + encodeURIComponent(carData.model || '') },
    ]
  }

  var a = analysis

  return (
    <div className="ai-wrap">
      <button className="btn" onClick={handleAnalyze}>
        {loading ? 'Аналізуємо...' : 'AI аналіз'}
      </button>

      {a && (
        <div className="report">

          {/* ── HEADER: score + verdict ── */}
          <div className="report-header">
            <div className={'report-score ' + scoreColor(a.score)}>
              <span className="report-score-num">{a.score}</span>
              <span className="report-score-max">/100</span>
            </div>
            <div className="report-verdict">{a.verdict}</div>
          </div>

          {/* ── SUMMARY CARDS ── */}
          <div className="report-summary">
            <div className="summary-card">
              <div className="summary-label">Справедлива ціна</div>
              <div className="summary-value">${(a.fair_price_low||0).toLocaleString()} — ${(a.fair_price_high||0).toLocaleString()}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Оцінка ціни</div>
              <div className={'summary-value ' + priceTag(a.price_verdict)}>{a.price_verdict || '—'}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Обслуговування</div>
              <div className="summary-value">{a.maintenance || '—'}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Тренд ціни</div>
              <div className="summary-value"><span className="trend-arrow">{trendArrow(a.trend)}</span> {a.trend || '—'}</div>
            </div>
          </div>

          {/* ── PROBLEMS + STRENGTHS ── */}
          <div className="report-grid">
            <div className="report-section">
              <div className="section-header section-red">Ризики та проблеми</div>
              {(a.problems || []).map(function(p, i) {
                return <div key={i} className="section-item"><span className="item-dot dot-red"></span><span className="item-text">{p}</span></div>
              })}
            </div>
            <div className="report-section">
              <div className="section-header section-green">Переваги</div>
              {(a.strengths || []).map(function(s, i) {
                return <div key={i} className="section-item"><span className="item-dot dot-green"></span><span className="item-text">{s}</span></div>
              })}
            </div>
          </div>

          {/* ── QUESTIONS FOR SELLER ── */}
          {a.questions && a.questions.length > 0 && (
            <div className="report-section-full">
              <div className="section-header">Запитай у продавця</div>
              {a.questions.map(function(q, i) {
                return <div key={i} className="section-item"><span className="item-num">{i+1}</span><span className="item-text">{q}</span></div>
              })}
            </div>
          )}

          {/* ── INSPECTION CHECKLIST ── */}
          {a.inspection && a.inspection.length > 0 && (
            <div className="report-section-full">
              <div className="section-header">Перевір на СТО</div>
              {a.inspection.map(function(item, i) {
                return <div key={i} className="section-item"><span className="item-check">☐</span><span className="item-text">{item}</span></div>
              })}
            </div>
          )}

          {/* ── ALTERNATIVES ── */}
          {a.alternatives && a.alternatives.length > 0 && (
            <div className="report-section-full">
              <div className="section-header">Альтернативи за ці гроші</div>
              {a.alternatives.map(function(alt, i) {
                return <div key={i} className="section-item"><span className="item-dot dot-blue"></span><span className="item-text">{alt}</span></div>
              })}
            </div>
          )}

          {/* ── EXTERNAL LINKS ── */}
          <div className="report-links">
            <div className="section-header">Перевірити самостійно</div>
            <div className="links-row">
              {getLinks().map(function(link) {
                return (
                  <a key={link.name} className="ext-link" href={link.url} target="_blank" rel="noopener noreferrer">
                    <span className="ext-link-name">{link.name}</span>
                    <span className="ext-link-desc">{link.desc}</span>
                    <span className="ext-link-arrow">→</span>
                  </a>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
