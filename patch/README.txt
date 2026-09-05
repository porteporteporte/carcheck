═══════════════════════════════════════════════════════════════════
TRUSTAUTO Photo AI v2.1 — bullet rendering + чесність
═══════════════════════════════════════════════════════════════════

В архіві 3 файли. Поклади їх ось так:

1. photoAI__prompts.js     →  src/lib/photoAI/prompts.js   (ЗАМІНИ існуючий)
2. photoAI__aggregate.js   →  src/lib/photoAI/aggregate.js (ЗАМІНИ існуючий)
3. VinLookup__PATCH.txt    →  ІНСТРУКЦІЯ як руками поправити VinLookup.jsx
                              (всередині детальний DIFF що замінити)

Що змінилось:

PROMPTS:
- Правило "якщо <80% впевнений → unclear" 
- Note ОБОВ'ЯЗКОВО починається з "Видно на фото X: ..."
- Cross-reference: якщо ознака на кількох фото — перелічити всі
- Чітко: краще 100 раз unclear ніж раз помилково yes/no

AGGREGATE:
- description тепер має додаткове поле descriptionItems = масив
- кожен item: { text: "Видно на фото X: ...", photos: [0, 4], weight: "major" }
- старе поле description теж залишилось — backward compat

VinLookup PATCH:
- Render блок "Пошкоджені деталі" перероблений
- Кожна зона тепер: header (назва зони + 5 з 14) + bullets під ним
- Кожен bullet — окреме повідомлення від AI з посиланням на фото
