// Виртуальная экскурсия «По следам Анны Ахматовой» — логика страницы.
(function () {
  "use strict";
  const T = window.TOUR, Lg = window.Logic;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const params = new URLSearchParams(location.search);
  const GROUP = params.get("group") === "text" ? "text" : "tour";
  const MOBILE = window.matchMedia("(max-width: 1024px)");
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

  // На телефоне карточка остановки идёт первой: порядок DOM повторяет визуальный,
  // чтобы порядок обхода с клавиатуры и чтения скринридером совпадал с экраном.
  function syncDomOrder() {
    const layout = $(".layout");
    if (!layout) return;
    const side = layout.querySelector(".side");
    const mapw = layout.querySelector(".mapwrap");
    const card = layout.querySelector("#card");
    if (!side || !mapw || !card) return;
    if (MOBILE.matches) {
      if (layout.firstElementChild !== card) { layout.append(card); layout.append(mapw); layout.append(side); }
    } else if (layout.firstElementChild !== side) {
      layout.append(side); layout.append(mapw); layout.append(card);
    }
  }
  syncDomOrder();
  function onLayoutChange() {
    syncDomOrder();
    syncTopHeight();
    setTimeout(() => { if (map) map.invalidateSize(); }, 0);
  }
  if (MOBILE.addEventListener) MOBILE.addEventListener("change", onLayoutChange);
  else MOBILE.addListener(onLayoutChange);

  // Высота шапки может меняться (перенос вкладок, баннер) — от неё зависит высота карты и карточки.
  function syncTopHeight() {
    const top = $(".top");
    const banner = $("#group-banner");
    const h = (top ? top.getBoundingClientRect().height : 0) + (banner && !banner.hidden ? banner.getBoundingClientRect().height : 0);
    document.documentElement.style.setProperty("--topH", Math.round(h) + "px");
  }
  syncTopHeight();
  window.addEventListener("resize", syncTopHeight);
  if (window.ResizeObserver) {
    const header = $(".top");
    if (header) new ResizeObserver(syncTopHeight).observe(header);
  }

  // ---------- хранилище результатов (только этот браузер) ----------
  const KEY = "akhmatova-results-v1";
  const store = {
    all() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } },
    add(r) { try { const a = store.all(); a.push(r); localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* без хранения */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ } },
  };

  // ---------- прогресс прослушивания (только этот браузер) ----------
  const PKEY = "akhmatova-progress-v1";
  let listened = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(PKEY) || "[]");
    if (Array.isArray(saved)) listened = new Set(saved.filter((x) => typeof x === "string"));
  } catch (e) { /* без прогресса */ }
  function saveProgress() { try { localStorage.setItem(PKEY, JSON.stringify([...listened])); } catch (e) { /* ничего */ } }
  function countListened() { return T.points.filter((p) => listened.has(p.id)).length; }
  function markListened(id) {
    if (listened.has(id)) return;
    listened.add(id);
    saveProgress();
    renderList();
    if ($("#progress-box")) renderProgress();
  }

  // ---------- вкладки ----------
  function show(view) {
    document.querySelectorAll(".tab").forEach((x) => {
      const on = x.dataset.view === view;
      x.classList.toggle("active", on);
      x.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== "view-" + view; });
    if (view === "tour" && map) setTimeout(() => map.invalidateSize(), 0);
    if (view === "quiz") startQuiz();
    if (view === "test") startTest();
    if (view === "sus") renderSus();
    if (view === "about") { renderResults(); renderProgress(); }
  }
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

  // ---------- маршрут: порядок, фильтр, список ----------
  let order = Lg.orderPoints(T.points, "chrono", T.themes);
  let visible = order.slice();
  let current = 0, map = null, markers = [], line = null, first = true;

  const sel = $("#theme-filter");
  Object.entries(T.themes).forEach(([k, v]) => sel.insertAdjacentHTML("beforeend", `<option value="${k}">${esc(v)}</option>`));

  function updatePinLabels() {
    markers.forEach((m, i) => {
      const el = m && m.getElement && m.getElement();
      const pin = el && el.querySelector(".pin");
      const pos = visible.indexOf(i);
      if (pin && pos >= 0) pin.textContent = pos + 1;
    });
  }

  function applyFilter() {
    order = Lg.orderPoints(T.points, $("#order").value, T.themes);
    visible = order.filter((i) => !sel.value || T.points[i].theme === sel.value);
    markers.forEach((m, i) => m && (visible.includes(i) ? m.addTo(map) : m.remove()));
    updatePinLabels();
    drawLine();
    renderList();
    if (visible.length) select(visible[0]);
  }
  sel.addEventListener("change", applyFilter);
  $("#order").addEventListener("change", applyFilter);

  function renderList() {
    const pts = visible.map((i) => T.points[i]);
    const done = countListened();
    $("#routeinfo").textContent = `${pts.length} ${pts.length === 1 ? "точка" : pts.length < 5 ? "точки" : "точек"} · ${Lg.routeLength(pts).toFixed(1)} км по прямой · прослушано ${done} из ${T.points.length}`;
    $("#point-list").innerHTML = visible.map((i, pos) => {
      const p = T.points[i];
      const isDone = listened.has(p.id);
      return `<li><button data-i="${i}" ${i === current ? 'aria-current="true"' : ""}>
        <span class="n">${pos + 1}</span><span class="plabel"><b>${esc(p.name)}</b><small>${esc(p.years)}</small></span>${isDone ? '<span class="done" aria-hidden="true">✓</span><span class="sr-only">прослушано</span>' : ""}</button></li>`;
    }).join("");
    document.querySelectorAll("#point-list button").forEach((b) => b.addEventListener("click", () => select(+b.dataset.i, { reveal: true })));
    updatePinLabels();
  }

  // ---------- карта ----------
  function drawLine() {
    if (!map) return;
    if (line) line.remove();
    line = L.polyline(visible.map((i) => T.points[i].coord), { color: "#6b2737", weight: 3, opacity: .6, dashArray: "6 6" }).addTo(map);
  }
  function fit() { if (map && visible.length) map.fitBounds(L.latLngBounds(visible.map((i) => T.points[i].coord)), { padding: [30, 30] }); }
  function initMap() {
    if (typeof L === "undefined") {
      $("#map").hidden = true;
      $("#map-fallback").hidden = false;
      $("#fit").hidden = true;
      return;
    }
    map = L.map("map", { scrollWheelZoom: true });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© участники OpenStreetMap" }).addTo(map);
    markers = T.points.map((p, i) => L.marker(p.coord, {
      icon: L.divIcon({ className: "", html: `<div class="pin">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      title: p.name, keyboard: true,
    }).addTo(map).bindTooltip(p.name, { direction: "top", offset: [0, -12] }).on("click", () => select(i, { reveal: true })));
    drawLine(); fit();
    $("#fit").addEventListener("click", fit);
  }

  // ---------- карточка точки ----------
  const credits = window.PHOTO_CREDITS || {};
  const PHOTO_DIM = {
    "img/gymn_now.jpg": [960, 720], "img/malaya_now.jpg": [960, 720], "img/sobaka_now.jpg": [960, 720],
    "img/tuchkov_now.jpg": [960, 636], "img/letniy_now.jpg": [960, 603], "img/mramorny_now.jpg": [960, 636],
    "img/smolensk_now.jpg": [960, 636], "img/fontanny_now.jpg": [960, 480], "img/kresty_now.jpg": [960, 636],
    "img/pamyatnik_now.jpg": [960, 640], "img/komarovo_now.jpg": [800, 600],
  };
  function photo(url, alt, cls) {
    if (!url) return `<div class="img ${cls}" role="img" aria-label="${esc(alt)}">${esc(alt)}<br><small>снимок подбирается</small></div>`;
    const d = PHOTO_DIM[url] || [960, 640];
    return `<img class="img ${cls}" src="${esc(url)}" alt="${esc(alt)}" width="${d[0]}" height="${d[1]}" loading="lazy" decoding="async">`;
  }

  function stopUrl(id) {
    try {
      const u = new URL(location.href);
      u.hash = id;
      if (u.searchParams.get("group") === "text") u.searchParams.delete("group");
      return u.href;
    } catch (e) { return location.href.split("#")[0] + "#" + id; }
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  function setShareStatus(text) { const el = $("#share-status"); if (el) el.textContent = text; }
  function shareStop(p) {
    const url = stopUrl(p.id);
    const data = { title: `${p.name} — По следам Анны Ахматовой`, text: `${p.name}, ${p.address}`, url: url };
    if (navigator.share) {
      navigator.share(data).then(() => setShareStatus("Ссылка отправлена."), (err) => {
        if (err && err.name === "AbortError") return;
        copyText(url).then((ok) => setShareStatus(ok ? "Ссылка на остановку скопирована." : "Не удалось скопировать. Ссылка: " + url));
      });
      return;
    }
    copyText(url).then((ok) => setShareStatus(ok ? "Ссылка на остановку скопирована." : "Не удалось скопировать. Ссылка: " + url));
  }

  function updateHash(id) {
    if (GROUP !== "tour") return;
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// и старые браузеры */ }
  }
  function revealCard(focus) {
    if (!MOBILE.matches) return;
    const card = $("#card");
    if (!card) return;
    if (focus) { try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); } }
    try { card.scrollIntoView({ behavior: REDUCED.matches ? "auto" : "smooth", block: "start" }); } catch (e) { card.scrollIntoView(); }
  }

  function select(i, opts) {
    opts = opts || {};
    if (!(i >= 0 && i < T.points.length)) return;
    current = i;
    const p = T.points[i];
    const pos = visible.indexOf(i);
    const cr = credits[p.id + "_now"];
    const hasThen = !!p.photo_then;
    const isDone = listened.has(p.id);
    $("#card").innerHTML = `
      <div class="kick">Точка ${pos + 1} из ${visible.length} · ${esc(T.themes[p.theme] || "")}</div>
      <h2>${esc(p.name)}</h2>
      <p class="addr">${esc(p.address)} · ${esc(p.years)}</p>
      <blockquote class="quote">${esc(p.quote)}<cite>Анна Ахматова. ${esc(p.source)}</cite></blockquote>
      <audio id="audio-guide" controls preload="none" src="${esc(p.audio)}" aria-label="Аудиогид: ${esc(p.name)}"></audio>
      <p class="audio-state" id="audio-state" aria-live="polite">${isDone ? "✓ Уже прослушано" : "Аудиогид: нажмите «▶», чтобы слушать."}</p>
      <p class="note">Чтение: нейросетевой синтез речи (черновик).</p>
      <p>${esc(p.bio)}</p>
      <p><span class="tag">мотив</span>${esc(p.motif)}</p>
      <div class="compare ${hasThen ? "" : "single"}" id="cmp">
        ${photo(p.photo_now, p.name + " — современный вид", "now")}
        ${hasThen ? photo(p.photo_then, p.name + " — архивный вид", "then") + '<input type="range" min="0" max="100" value="50" aria-label="Сравнить: тогда / сейчас">' : ""}
      </div>
      ${cr ? `<p class="credit">Фото: ${esc(cr.author)}, ${esc(cr.license)} — <a href="${esc(cr.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></p>` : ""}
      <div class="nav">
        <button class="btn ghost" id="prev" ${pos <= 0 ? "disabled" : ""}>← Назад</button>
        <button class="btn ghost" id="share">Поделиться</button>
        <button class="btn" id="next">${pos >= visible.length - 1 ? "К заданию →" : "Дальше →"}</button>
      </div>
      <p class="share-status" id="share-status" aria-live="polite"></p>`;

    if (hasThen) {
      const range = $("#cmp input"), then = $("#cmp .then");
      const clip = () => { then.style.clipPath = `inset(0 ${100 - range.value}% 0 0)`; };
      range.addEventListener("input", clip); clip();
    }

    const audio = $("#audio-guide");
    if (audio) {
      const state = $("#audio-state");
      const setState = (t) => { if (state) state.textContent = t; };
      audio.addEventListener("play", () => setState("Идёт воспроизведение…"));
      audio.addEventListener("pause", () => { if (!audio.ended) setState("Пауза"); });
      audio.addEventListener("timeupdate", () => {
        if (audio.duration && audio.currentTime / audio.duration >= 0.85) markListened(p.id);
      });
      audio.addEventListener("ended", () => { markListened(p.id); setState("✓ Прослушано"); });
      audio.addEventListener("error", () => setState("Аудио не загрузилось — проверьте подключение."));
    }

    $("#prev").addEventListener("click", () => select(visible[pos - 1], { reveal: true }));
    $("#next").addEventListener("click", () => (pos >= visible.length - 1 ? show("quiz") : select(visible[pos + 1], { reveal: true })));
    $("#share").addEventListener("click", () => { setShareStatus(""); shareStop(p); });

    markers.forEach((m, k) => {
      const el = m && m.getElement && m.getElement();
      const pin = el && el.querySelector(".pin");
      if (pin) pin.classList.toggle("on", k === i);
    });
    if (map && !first) map.setView(p.coord, Math.max(map.getZoom(), 13));
    first = false;
    if (opts.updateHash !== false) updateHash(p.id);
    renderList();
    if (opts.reveal) revealCard(!!opts.focus);
  }

  document.addEventListener("keydown", (e) => {
    if ($("#view-tour").hidden) return;
    const t = e.target;
    const tag = t && t.tagName ? t.tagName : "";
    if (/^(INPUT|SELECT|TEXTAREA|AUDIO)$/.test(tag) || (t && t.isContentEditable)) return;
    if (t && t.closest && t.closest("#map")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const pos = visible.indexOf(current);
    if (pos < 0) return;
    let next = -1;
    if (e.key === "ArrowRight") next = pos + 1;
    else if (e.key === "ArrowLeft") next = pos - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = visible.length - 1;
    if (next < 0 || next >= visible.length || next === pos) return;
    e.preventDefault();
    select(visible[next], { reveal: true, focus: true });
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

  function renderProgress() {
    const box = $("#progress-box");
    if (!box) return;
    const n = countListened();
    box.innerHTML = `<p>Прослушано ${n} из ${T.points.length} остановок. Отметки сохраняются только в этом браузере.</p>` +
      (n ? `<button class="btn ghost" id="reset-progress">Сбросить прогресс</button>` : "");
    if (n) $("#reset-progress").onclick = () => {
      if (confirm("Сбросить отметки о прослушанных остановках?")) { listened.clear(); saveProgress(); renderList(); renderProgress(); }
    };
  }

  // ---------- старт ----------
  let startId = "";
  try { startId = decodeURIComponent((location.hash || "").replace(/^#/, "")); } catch (e) { startId = ""; }
  const startPos = T.points.findIndex((p) => p.id === startId);

  initMap();
  renderList();

  if (GROUP === "text") {
    select(visible[0], { updateHash: false });
    $("#group-banner").hidden = false;
    document.querySelectorAll('.tab[data-view="tour"], .tab[data-view="quiz"], .tab[data-view="sus"]').forEach((b) => { b.hidden = true; });
    show("test");
  } else if (startId === "test") {
    select(visible[0], { updateHash: false });
    show("test");
  } else if (startPos >= 0) {
    select(startPos, { updateHash: false });
    if (map) map.setView(T.points[startPos].coord, 14);
  } else {
    select(visible[0]);
  }
})();
