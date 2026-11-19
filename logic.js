// Расчёты экскурсии без привязки к странице: работают и в браузере (window.Logic), и в Node.
(function (root) {
  "use strict";
  const R = 6371008.8; // средний радиус Земли, м

  // Расстояние по дуге большого круга (формула гаверсинусов), метры.
  function haversine(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Длина маршрута по прямым между соседними точками, км.
  function routeLength(points) {
    let m = 0;
    for (let i = 1; i < points.length; i++) m += haversine(points[i - 1].coord, points[i].coord);
    return m / 1000;
  }

  // Порядок точек: "chrono" — как в данных; "theme" — сгруппировать по темам (порядок тем из themes), внутри — по году.
  function orderPoints(points, mode, themes) {
    const idx = points.map((p, i) => i);
    if (mode !== "theme") return idx;
    const tOrder = Object.keys(themes);
    return idx.sort((i, j) => (tOrder.indexOf(points[i].theme) - tOrder.indexOf(points[j].theme)) || (points[i].start - points[j].start) || (i - j));
  }

  // System Usability Scale: 10 ответов 1..5 → 0..100 (Brooke, 1996).
  function susScore(ans) {
    if (!Array.isArray(ans) || ans.length !== 10 || ans.some((x) => !(x >= 1 && x <= 5))) throw new Error("SUS: нужно 10 ответов от 1 до 5");
    let s = 0;
    ans.forEach((x, i) => { s += i % 2 === 0 ? x - 1 : 5 - x; });
    return s * 2.5;
  }

  // Детерминированное перемешивание (одинаковый тест у обеих групп).
  function seededShuffle(arr, seed) {
    const a = arr.slice(); let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Итоговый тест из 10 вопросов. Ответы на все вопросы есть и в экскурсии, и в текстовой версии.
  function finalTest(T) {
    const byId = Object.fromEntries(T.points.map((p) => [p.id, p]));
    const names = T.points.map((p) => p.name);
    const qs = [];
    const quoteQ = ["gymn", "sobaka", "tuchkov", "mramorny", "fontanny", "komarovo"];
    quoteQ.forEach((id, k) => {
      const p = byId[id];
      const wrong = seededShuffle(names.filter((n) => n !== p.name), 7 + k).slice(0, 3);
      qs.push({ q: "С каким местом связаны строки?", quote: p.quote, options: seededShuffle([p.name, ...wrong], 31 + k), answer: p.name });
    });
    const yearQ = [["kresty", "1938 – 1939"], ["tuchkov", "1912 – 1914"]];
    yearQ.forEach(([id, ans], k) => {
      qs.push({ q: `Когда Ахматова связана с местом «${byId[id].name}»?`, options: seededShuffle(["1912 – 1914", "1938 – 1939", "1955 – 1966", "1919 – 1920"], 50 + k), answer: ans });
    });
    qs.push({ q: "Какое произведение выросло из очередей у стен «Крестов»?", options: ["«Реквием»", "«Вечер»", "«Чётки»", "«Белая стая»"], answer: "«Реквием»" });
    qs.push({ q: "Где сейчас находится Музей Анны Ахматовой?", options: seededShuffle(["В Фонтанном доме", "В Мраморном дворце", "В «Бродячей собаке»", "В Комарове"], 77), answer: "В Фонтанном доме" });
    return qs;
  }

  function gradeTest(qs, answers) {
    const correct = qs.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
    return { correct, total: qs.length, pct: Math.round((correct / qs.length) * 1000) / 10 };
  }

  function toCSV(rows) {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    const cell = (v) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\n");
  }

  const api = { haversine, routeLength, orderPoints, susScore, seededShuffle, finalTest, gradeTest, toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Logic = api;
})(typeof window !== "undefined" ? window : globalThis);
