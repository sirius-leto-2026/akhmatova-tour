// Виртуальная экскурсия «По следам Анны Ахматовой» — логика страницы.
(function () {
  "use strict";
  const T = window.TOUR, Lg = window.Logic;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const params = new URLSearchParams(location.search);
  const GROUP = params.get("group") === "text" ? "text" : "tour";

  // ---------- хранилище результатов (только этот браузер) ----------
  const KEY = "akhmatova-results-v1";
  const store = {
    all() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } },
    add(r) { try { const a = store.all(); a.push(r); localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* без хранения */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ } },
  };

  // ---------- вкладки ----------
  function show(view) {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.view === view));
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== "view-" + view; });
    if (view === "tour" && map) setTimeout(() => map.invalidateSize(), 0);
    if (view === "quiz") startQuiz();
    if (view === "test") startTest();
    if (view === "sus") renderSus();
    if (view === "about") renderResults();
  }
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

  // ---------- маршрут: порядок, фильтр, список ----------
  let order = Lg.orderPoints(T.points, "chrono", T.themes);
  let visible = order.slice();
  let current = 0, map = null, markers = [], line = null, first = true;

  const sel = $("#theme-filter");
  Object.entries(T.themes).forEach(([k, v]) => sel.insertAdjacentHTML("beforeend", `<option value="${k}">${esc(v)}</option>`));
  function applyFilter() {
    order = Lg.orderPoints(T.points, $("#order").value, T.themes);
    visible = order.filter((i) => !sel.value || T.points[i].theme === sel.value);
    markers.forEach((m, i) => m && (visible.includes(i) ? m.addTo(map) : m.remove()));
    drawLine();
    renderList();
    if (visible.length) select(visible[0]);
  }
  sel.addEventListener("change", applyFilter);
  $("#order").addEventListener("change", applyFilter);

  function renderList() {
    const pts = visible.map((i) => T.points[i]);
    $("#routeinfo").textContent = `${pts.length} ${pts.length === 1 ? "точка" : pts.length < 5 ? "точки" : "точек"} · ${Lg.routeLength(pts).toFixed(1)} км по прямой`;
    $("#point-list").innerHTML = visible.map((i) => {
      const p = T.points[i];
      return `<li><button data-i="${i}" ${i === current ? 'aria-current="true"' : ""}>
        <span class="n">${i + 1}</span><span><b>${esc(p.name)}</b><small>${esc(p.years)}</small></span></button></li>`;
    }).join("");
    document.querySelectorAll("#point-list button").forEach((b) => b.addEventListener("click", () => select(+b.dataset.i)));
  }

  // ---------- карта ----------
  function drawLine() {
    if (!map) return;
    if (line) line.remove();
    line = L.polyline(visible.map((i) => T.points[i].coord), { color: "#6b2737", weight: 3, opacity: .6, dashArray: "6 6" }).addTo(map);
  }
  function fit() { if (map && visible.length) map.fitBounds(L.latLngBounds(visible.map((i) => T.points[i].coord)), { padding: [30, 30] }); }
  function initMap() {
    if (typeof L === "undefined") { $("#map-fallback").hidden = false; return; }
    map = L.map("map", { scrollWheelZoom: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© участники OpenStreetMap" }).addTo(map);
    markers = T.points.map((p, i) => L.marker(p.coord, {
      icon: L.divIcon({ className: "", html: `<div class="pin">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      title: p.name, keyboard: true,
    }).addTo(map).on("click", () => select(i)));
    drawLine(); fit();
    $("#fit").addEventListener("click", fit);
  }

  // ---------- карточка точки ----------
  const credits = window.PHOTO_CREDITS || {};
  function photo(url, label, cls) {
    if (!url) return `<div class="img ${cls}">${esc(label)}<br><small>архивный снимок подбирается</small></div>`;
    return `<div class="img ${cls}" style="background-image:url('${esc(url)}')" role="img" aria-label="${esc(label)}"></div>`;
  }
  function select(i) {
    current = i;
    const p = T.points[i];
    const pos = visible.indexOf(i);
    const cr = credits[p.id + "_now"];
    const hasThen = !!p.photo_then;
    $("#card").innerHTML = `
      <div class="kick">Точка ${pos + 1} из ${visible.length} · ${esc(T.themes[p.theme] || "")}</div>
      <h2>${esc(p.name)}</h2>
      <p class="addr">${esc(p.address)} · ${esc(p.years)}</p>
      <blockquote class="quote">${esc(p.quote)}<cite>Анна Ахматова. ${esc(p.source)}</cite></blockquote>
      <audio controls preload="none" src="${esc(p.audio)}" aria-label="Чтение фрагмента"></audio>
      <p class="note">Чтение: синтезированный голос (черновик).</p>
      <p>${esc(p.bio)}</p>
      <p><span class="tag">мотив</span>${esc(p.motif)}</p>
      <div class="compare ${hasThen ? "" : "single"}" id="cmp">
        ${photo(p.photo_now, "Сейчас: " + p.name, "now")}
        ${hasThen ? photo(p.photo_then, "Тогда", "then") + '<input type="range" min="0" max="100" value="50" aria-label="Сравнить: тогда / сейчас">' : ""}
      </div>
      <p class="credit">${cr ? `Фото: ${esc(cr.author)}, ${esc(cr.license)} — <a href="${esc(cr.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>` : ""}${hasThen ? "" : " · Архивное фото «тогда» команда добавит из pastvu.com / архивов."}</p>
      <div class="nav">
        <button class="btn ghost" id="prev" ${pos <= 0 ? "disabled" : ""}>← Назад</button>
        <button class="btn" id="next">${pos >= visible.length - 1 ? "К заданию →" : "Дальше →"}</button>
      </div>`;
    if (hasThen) {
      const range = $("#cmp input"), then = $("#cmp .then");
      const clip = () => { then.style.clipPath = `inset(0 ${100 - range.value}% 0 0)`; };
      range.addEventListener("input", clip); clip();
    }
    $("#prev").addEventListener("click", () => select(visible[pos - 1]));
    $("#next").addEventListener("click", () => (pos >= visible.length - 1 ? show("quiz") : select(visible[pos + 1])));
    markers.forEach((m, k) => m && m.getElement() && m.getElement().firstChild.classList.toggle("on", k === i));
    if (map && !first) map.setView(p.coord, Math.max(map.getZoom(), 13));
    first = false;
    renderList();
  }
  document.addEventListener("keydown", (e) => {
    if ($("#view-tour").hidden || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const pos = visible.indexOf(current);
    if (e.key === "ArrowRight" && pos < visible.length - 1) select(visible[pos + 1]);
    if (e.key === "ArrowLeft" && pos > 0) select(visible[pos - 1]);
  });

  // ---------- тренировочное задание ----------
  let qs = [], qi = 0, score = 0;
  function startQuiz() {
    qs = Lg.seededShuffle(T.points, Date.now() % 100000).slice(0, 6).map((p, k) => ({
      p, opts: Lg.seededShuffle([p, ...Lg.seededShuffle(T.points.filter((x) => x.id !== p.id), k + Date.now() % 997).slice(0, 3)], k + 3),
    }));
    qi = 0; score = 0; showQ();
  }
  function showQ() {
    const box = $("#quiz-box");
    if (qi >= qs.length) {
      box.innerHTML = `<p><b>Результат: ${score} из ${qs.length}.</b></p><button class="btn" id="again">Ещё раз</button> <button class="btn ghost" id="totest">К итоговому тесту</button>`;
      $("#again").onclick = startQuiz; $("#totest").onclick = () => show("test");
      return;
    }
    const q = qs[qi];
    box.innerHTML = `<div class="progress">Вопрос ${qi + 1} из ${qs.length} · верно: ${score}</div>
      <blockquote class="quote">${esc(q.p.quote)}</blockquote>
      <div class="opts">${q.opts.map((o) => `<button class="opt" data-id="${o.id}">${esc(o.name)}</button>`).join("")}</div><div id="fb"></div>`;
    box.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
      const ok = b.dataset.id === q.p.id; if (ok) score++;
      box.querySelectorAll(".opt").forEach((x) => { x.disabled = true; if (x.dataset.id === q.p.id) x.classList.add("ok"); else if (x === b) x.classList.add("bad"); });
      $("#fb").innerHTML = `<p>${ok ? "Верно!" : "Не совсем."} ${esc(q.p.source)}. ${esc(q.p.bio)}</p><button class="btn" id="nextq">${qi + 1 < qs.length ? "Следующий вопрос" : "Итог"}</button>`;
      $("#nextq").onclick = () => { qi++; showQ(); }; $("#nextq").focus();
    }));
  }

  // ---------- итоговый тест (для проверки гипотезы) ----------
  const TEST = Lg.finalTest(T);
  let tAns = [], tStart = 0;
  function startTest() {
    tAns = new Array(TEST.length).fill(null); tStart = Date.now();
    $("#test-box").innerHTML = TEST.map((q, i) => `<fieldset class="tq"><legend>${i + 1}. ${esc(q.q)}</legend>
      ${q.quote ? `<blockquote class="quote small">${esc(q.quote)}</blockquote>` : ""}
      ${q.options.map((o, k) => `<label class="radio"><input type="radio" name="t${i}" value="${k}"> ${esc(o)}</label>`).join("")}</fieldset>`).join("") +
      `<button class="btn" id="test-done">Завершить тест</button><div id="test-result"></div>`;
    $("#test-box").querySelectorAll("input[type=radio]").forEach((r) => r.addEventListener("change", () => {
      const i = +r.name.slice(1); tAns[i] = TEST[i].options[+r.value];
    }));
    $("#test-done").onclick = () => {
      const miss = tAns.filter((a) => a == null).length;
      if (miss && !confirm(`Без ответа: ${miss}. Завершить?`)) return;
      const g = Lg.gradeTest(TEST, tAns);
      store.add({ date: new Date().toISOString().slice(0, 16), group: GROUP, test_correct: g.correct, test_total: g.total, test_pct: g.pct, time_s: Math.round((Date.now() - tStart) / 1000), sus: "" });
      $("#test-result").innerHTML = `<p class="resultline"><b>${g.correct} из ${g.total}</b> (${g.pct}%). Спасибо! ${GROUP === "tour" ? "Ответьте, пожалуйста, на короткий опрос об удобстве сайта." : ""}</p>` +
        (GROUP === "tour" ? `<button class="btn" id="tosus">К опросу</button>` : "");
      if ($("#tosus")) $("#tosus").onclick = () => show("sus");
      $("#test-done").disabled = true;
    };
  }

  // ---------- опрос SUS ----------
  const SUS_Q = [
    "Я бы хотел(а) пользоваться этим сайтом часто.",
    "Сайт неоправданно сложный.",
    "Сайтом легко пользоваться.",
    "Мне понадобилась бы помощь, чтобы разобраться с сайтом.",
    "Разделы сайта хорошо связаны между собой.",
    "На сайте слишком много несогласованного.",
    "Большинство людей быстро научатся пользоваться этим сайтом.",
    "Сайт неудобный, им тяжело пользоваться.",
    "Я чувствовал(а) себя уверенно, пользуясь сайтом.",
    "Мне пришлось многое узнать, прежде чем начать работать с сайтом.",
  ];
  function renderSus() {
    $("#sus-result").innerHTML = "";
    $("#sus-form").innerHTML = SUS_Q.map((q, i) => `<fieldset class="tq"><legend>${i + 1}. ${esc(q)}</legend>
      ${[1, 2, 3, 4, 5].map((v) => `<label class="radio inline"><input type="radio" name="s${i}" value="${v}" required> ${v}</label>`).join("")}</fieldset>`).join("") +
      `<button class="btn" type="submit">Отправить</button>`;
    $("#sus-form").onsubmit = (e) => {
      e.preventDefault();
      const ans = SUS_Q.map((_, i) => +((document.querySelector(`input[name=s${i}]:checked`) || {}).value || 0));
      let s; try { s = Lg.susScore(ans); } catch (err) { $("#sus-result").textContent = "Ответьте на все 10 утверждений."; return; }
      const all = store.all(); const last = [...all].reverse().find((r) => r.group === "tour" && r.sus === "");
      if (last) { last.sus = s; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (er) { /* */ } }
      else store.add({ date: new Date().toISOString().slice(0, 16), group: "tour", test_correct: "", test_total: "", test_pct: "", time_s: "", sus: s });
      $("#sus-result").innerHTML = `<p class="resultline">Оценка удобства: <b>${s}</b> из 100. Спасибо!</p>`;
    };
  }

  // ---------- результаты и выгрузка ----------
  function renderResults() {
    const rows = store.all();
    const box = $("#results-box");
    if (!rows.length) { box.innerHTML = `<p class="muted">Пока нет результатов.</p>`; return; }
    const avg = (g, k) => { const v = rows.filter((r) => r.group === g && r[k] !== "").map((r) => +r[k]); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) + ` (n=${v.length})` : "—"; };
    box.innerHTML = `<p>Тест, средний %: экскурсия — ${avg("tour", "test_pct")}, текст — ${avg("text", "test_pct")}. SUS: ${avg("tour", "sus")}.</p>
      <button class="btn" id="csv">Скачать CSV</button> <button class="btn ghost" id="clr">Удалить результаты</button>`;
    $("#csv").onclick = () => {
      const blob = new Blob(["﻿" + Lg.toCSV(rows)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "results.csv"; a.click();
    };
    $("#clr").onclick = () => { if (confirm("Удалить все результаты на этом устройстве?")) { store.clear(); renderResults(); } };
  }

  // ---------- старт ----------
  initMap();
  renderList();
  select(visible[0]);
  if (GROUP === "text") {
    $("#group-banner").hidden = false;
    document.querySelectorAll('.tab[data-view="tour"], .tab[data-view="quiz"], .tab[data-view="sus"]').forEach((b) => { b.hidden = true; });
    show("test");
  } else if (location.hash === "#test") show("test");
})();
