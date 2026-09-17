(() => {
  const S = window.G2bSearch;
  const $ = (id) => document.getElementById(id);
  const WEEKDAYS = '일월화수목금토';

  const els = {
    updated: $('updated'),
    periodButtons: [...document.querySelectorAll('[data-period]')],
    dayNav: $('day-nav'), daySelect: $('day-select'), prevDay: $('prev-day'), nextDay: $('next-day'),
    customRange: $('custom-range'), from: $('from'), to: $('to'), rangeLabel: $('range-label'),
    q: $('q'),
    typeChips: [...document.querySelectorAll('[data-type]')],
    budgetPreset: $('budget-preset'), budgetCustom: $('budget-custom'), budgetMin: $('budget-min'), budgetMax: $('budget-max'),
    reset: $('reset'),
    tiles: [...document.querySelectorAll('[data-tile]')],
    checkAll: $('check-all'), resultCount: $('result-count'), sort: $('sort'),
    results: $('results'), empty: $('empty'), emptyReset: $('empty-reset'),
    actionText: $('action-text'), clearSelection: $('clear-selection'), copy: $('copy-button'), copyLabel: $('copy-label'),
    excel: $('excel-button'),
    conditions: $('conditions'), openConditions: $('open-conditions'),
    toast: $('toast'),
  };

  const state = {
    dates: [],          // 목록 날짜 (최근 순)
    counts: new Map(),  // 날짜 → 건수
    criteria: null,
    period: 'day',      // day | 7 | 30 | all | custom
    results: [],        // 화면에 보이는 공고 (정렬됨)
    selected: new Set(),
    customBudget: false, // 예산 직접 입력 칸을 열었는지
  };
  const listCache = new Map();
  let searchToken = 0;

  // ---------- 공통 ----------

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  function icon(name, className = 'icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function todayString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function dateLabel(date, withYear = false) {
    const d = new Date(`${date}T00:00:00`);
    const md = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
    return withYear ? `${d.getFullYear()}년 ${md}` : md;
  }

  const itemKey = (item) => `${item.listDate}#${item.seqNo}`;

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} (${res.status})`);
    return res.json();
  }

  function loadDate(date) {
    if (!listCache.has(date)) {
      listCache.set(date, getJson(`data/lists/${date}.json`)
        .then((data) => data.items.map((item) => ({ ...item, listDate: date }))));
    }
    return listCache.get(date);
  }

  // ---------- 기간 ----------

  function startDateFor(days) {
    const latest = new Date(`${state.dates[0]}T00:00:00`);
    latest.setDate(latest.getDate() - (days - 1));
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${latest.getFullYear()}-${pad(latest.getMonth() + 1)}-${pad(latest.getDate())}`;
    return [...state.dates].reverse().find((d) => d >= start) ?? state.dates[0];
  }

  function detectPeriod(c) {
    const latest = state.dates[0];
    const oldest = state.dates[state.dates.length - 1];
    if (c.from === c.to) return 'day';
    if (c.to === latest && c.from === startDateFor(7)) return '7';
    if (c.to === latest && c.from === startDateFor(30)) return '30';
    if (c.to === latest && c.from === oldest) return 'all';
    return 'custom';
  }

  function applyPeriod(period) {
    const c = state.criteria;
    const latest = state.dates[0];
    state.period = period;
    if (period === 'day') c.from = c.to = state.dates.includes(c.to) ? c.to : latest;
    else if (period === '7' || period === '30') { c.to = latest; c.from = startDateFor(Number(period)); }
    else if (period === 'all') { c.to = latest; c.from = state.dates[state.dates.length - 1]; }
    search();
  }

  function renderPeriod() {
    const c = state.criteria;
    for (const b of els.periodButtons) b.setAttribute('aria-pressed', String(b.dataset.period === state.period));
    els.dayNav.hidden = state.period !== 'day';
    els.customRange.hidden = state.period !== 'custom';
    els.rangeLabel.hidden = state.period === 'day' || state.period === 'custom';
    els.rangeLabel.textContent = `${dateLabel(c.from)} ~ ${dateLabel(c.to)}`;
    els.daySelect.value = c.to;
    els.from.value = c.from;
    els.to.value = c.to;
    const i = state.dates.indexOf(c.to);
    els.prevDay.disabled = i < 0 || i >= state.dates.length - 1;
    els.nextDay.disabled = i <= 0;
  }

  // ---------- 필터 ----------

  const TILE_FILTERS = {
    all: { bid: 'all', rfp: 'all', deadline: 'all' },
    rfp: { bid: 'all', rfp: 'yes', deadline: 'all' },
    check: { bid: 'all', rfp: 'no', deadline: 'all' },
    bid: { bid: 'yes', rfp: 'all', deadline: 'all' },
    soon: { bid: 'all', rfp: 'all', deadline: 'soon' },
  };

  function activeTile(c) {
    return Object.keys(TILE_FILTERS).find((key) => {
      const f = TILE_FILTERS[key];
      return f.bid === c.bid && f.rfp === c.rfp && f.deadline === c.deadline;
    }) ?? null;
  }

  function budgetPresetValue(c) {
    if (c.budgetMin === null && c.budgetMax === null) return '';
    const preset = c.budgetMax === null ? `${c.budgetMin}-` : null;
    return [...els.budgetPreset.options].some((o) => o.value === preset) ? preset : 'custom';
  }

  function hasFilters(c) {
    return Boolean(c.q || c.types.length || c.budgetMin !== null || c.budgetMax !== null
      || c.bid !== 'all' || c.rfp !== 'all' || c.deadline !== 'all');
  }

  function renderFilters() {
    const c = state.criteria;
    if (document.activeElement !== els.q) els.q.value = c.q;
    for (const chip of els.typeChips) chip.setAttribute('aria-pressed', String(c.types.includes(chip.dataset.type)));

    // 프리셋(5천만원 이상 등)에 없는 범위면 직접 입력 칸을 연다.
    if (budgetPresetValue(c) === 'custom') state.customBudget = true;
    els.budgetPreset.value = state.customBudget ? 'custom' : budgetPresetValue(c);
    els.budgetCustom.hidden = !state.customBudget;
    els.budgetPreset.parentElement.classList.toggle('active', c.budgetMin !== null || c.budgetMax !== null);
    if (document.activeElement !== els.budgetMin) els.budgetMin.value = c.budgetMin ?? '';
    if (document.activeElement !== els.budgetMax) els.budgetMax.value = c.budgetMax ?? '';

    const tile = activeTile(c);
    for (const t of els.tiles) t.setAttribute('aria-pressed', String(t.dataset.tile === tile));
    els.sort.value = c.sort;
    els.reset.hidden = !hasFilters(c);
  }

  function resetFilters() {
    const { from, to, sort } = state.criteria;
    state.criteria = { ...S.emptyCriteria(to), from, to, sort };
    state.customBudget = false;
    search();
  }

  // ---------- 목록 ----------

  function ddayBadge(item, today) {
    const d = S.dDay(item.opinionDeadline, today);
    if (d === null) return null;
    let text; let cls;
    if (d < 0) { text = '의견마감 지남'; cls = 'closed'; }
    else if (d === 0) { text = '오늘 의견마감'; cls = 'today'; }
    else { text = `의견마감 D-${d}`; cls = d <= S.SOON_DAYS ? 'soon' : 'normal'; }
    return el('span', { className: `dday ${cls}`, title: `의견등록마감 ${item.opinionDeadline.slice(0, 16)}`, text });
  }

  function fileLink(file, extraClass = '') {
    return el('a', { className: `file-link ${file.isRfp ? 'rfp' : ''} ${extraClass}`.trim(), href: file.url, title: file.name },
      [icon('file'), el('span', { text: file.name })]);
  }

  function renderCard(item, today, showDate) {
    const key = itemKey(item);
    const checked = state.selected.has(key);
    const checkbox = el('input', { type: 'checkbox', 'aria-label': `${item.title} 선택` });
    checkbox.checked = checked;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(key); else state.selected.delete(key);
      card.classList.toggle('selected', checkbox.checked);
      renderSelection();
    });

    const meta = el('div', { className: 'card-meta' }, [
      el('span', { className: 'card-no', text: showDate ? `${item.listDate.slice(5).replace('-', '.')} · ${item.seqNo}번` : `${item.seqNo}번` }),
      el('span', { className: 'agency', text: item.agency }),
      el('span', { className: 'badge type', text: item.businessType }),
    ]);

    const title = el('h3', { className: 'card-title' },
      el('a', { href: item.detailUrl, target: '_blank', rel: 'noopener', title: '나라장터 사전규격 상세 보기' },
        [document.createTextNode(item.title), icon('external')]));

    const side = el('div', { className: 'card-side' }, [
      el('span', { className: 'budget', text: item.budgetText }),
      ddayBadge(item, today),
    ]);

    const foot = el('div', { className: 'card-foot' });
    for (const k of item.matchedKeywords) foot.append(el('span', { className: 'badge keyword', text: k }));
    if (item.bidNotices.length) {
      foot.append(el('a', { className: 'badge bid', href: item.bidNotices[0].url, target: '_blank', rel: 'noopener',
        text: item.bidNotices.length > 1 ? `본공고 ${item.bidNotices.length}건` : '본공고' }));
    }

    const rfpFiles = item.files.filter((f) => f.isRfp);
    const primary = rfpFiles.length ? rfpFiles : item.files.slice(0, 1);
    const others = item.files.filter((f) => !primary.includes(f));
    for (const f of primary) foot.append(fileLink(f));
    if (others.length) {
      foot.append(el('details', { className: 'more-files' }, [
        el('summary', { text: primary.length ? `첨부 +${others.length}` : `첨부 ${others.length}` }),
        el('div', { className: 'file-list' }, others.map((f) => el('a', { href: f.url, title: f.name }, [icon('file'), el('span', { text: f.name })]))),
      ]));
    }
    if (S.needsCheck(item)) {
      const text = /추가 확인/.test(item.attachmentStatus) ? '첨부 5개 · 나라장터에서 추가 확인'
        : item.files.length === 0 ? '첨부 없음' : '제안요청서 없음 · 첨부 확인';
      foot.append(el('span', { className: 'badge warn', text }));
    } else if (!item.attachmentStatus.startsWith('제안요청서 저장')) {
      foot.append(el('span', { className: 'badge warn', text: item.attachmentStatus }));
    }

    const card = el('article', { className: `card${checked ? ' selected' : ''}` }, [
      el('label', { className: 'card-check' }, checkbox), meta, title, side, foot,
    ]);
    return card;
  }

  function renderResults() {
    const c = state.criteria;
    const today = todayString();
    const multiDay = c.from !== c.to;
    const grouped = multiDay && c.sort === 'default';
    const nodes = [];
    let lastDate = null;
    for (const item of state.results) {
      if (grouped && item.listDate !== lastDate) {
        lastDate = item.listDate;
        const n = state.results.filter((i) => i.listDate === lastDate).length;
        nodes.push(el('h2', { className: 'group-title', text: `${dateLabel(lastDate)} · ${n}건` }));
      }
      nodes.push(renderCard(item, today, multiDay && !grouped));
    }
    els.results.replaceChildren(...nodes);
    els.empty.hidden = state.results.length > 0;
    els.resultCount.textContent = `${state.results.length}건`;
  }

  function renderTiles(base) {
    const today = todayString();
    const counts = {
      all: base.length,
      rfp: base.filter((i) => !S.needsCheck(i)).length,
      check: base.filter((i) => S.needsCheck(i)).length,
      bid: base.filter((i) => i.bidNotices.length > 0).length,
      soon: base.filter((i) => S.isDeadlineSoon(i, today)).length,
    };
    for (const node of document.querySelectorAll('[data-count]')) node.textContent = counts[node.dataset.count];
  }

  function chosenItems() {
    return state.selected.size ? state.results.filter((i) => state.selected.has(itemKey(i))) : state.results;
  }

  function renderSelection() {
    const n = state.selected.size;
    const total = state.results.length;
    els.actionText.replaceChildren(...(n
      ? [el('strong', { text: `${n}건` }), document.createTextNode(' 선택됨')]
      : [document.createTextNode('검색 결과 '), el('strong', { text: `${total}건` }), document.createTextNode(' 전체')]));
    els.copyLabel.textContent = n ? '선택 복사' : '전체 복사';
    els.clearSelection.hidden = n === 0;
    els.copy.disabled = total === 0;
    els.excel.disabled = total === 0;
    els.checkAll.checked = total > 0 && n === total;
    els.checkAll.indeterminate = n > 0 && n < total;
  }

  function showSkeleton() {
    els.results.replaceChildren(...[1, 2, 3].map(() => el('div', { className: 'skeleton', 'aria-hidden': 'true' })));
    els.empty.hidden = true;
  }

  async function search() {
    const c = state.criteria;
    if (c.from > c.to) [c.from, c.to] = [c.to, c.from];
    history.replaceState(null, '', S.toHash(c));
    renderPeriod();
    renderFilters();

    const token = ++searchToken;
    const dates = S.datesInRange(c, state.dates);
    if (dates.some((d) => !listCache.has(d))) showSkeleton();
    let lists;
    try {
      lists = await Promise.all(dates.map(loadDate));
    } catch (err) {
      showError(err);
      return;
    }
    if (token !== searchToken) return;

    const today = todayString();
    const all = lists.flat();
    const base = all.filter((item) => S.matches(item, { ...c, bid: 'all', rfp: 'all', deadline: 'all' }, today));
    state.results = S.sortItems(base.filter((item) => S.matches(item, c, today)), c.sort, today);
    const visible = new Set(state.results.map(itemKey));
    for (const key of [...state.selected]) if (!visible.has(key)) state.selected.delete(key);

    renderTiles(base);
    renderResults();
    renderSelection();
  }

  let typingTimer;
  function searchSoon() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(search, 220);
  }

  // ---------- 복사 · 엑셀 ----------

  async function copyItems() {
    const items = chosenItems();
    const html = items.map((i) => `<div>${i.copyHtml}</div>`).join('');
    const text = items.map((i) => i.copyText).join('\n');
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
    } catch {
      // ClipboardItem을 지원하지 않는 브라우저: 서식 있는 영역을 선택해 복사
      const holder = el('div', { contenteditable: 'true', style: 'position:fixed;left:-9999px;top:0' });
      holder.innerHTML = html;
      document.body.append(holder);
      const range = document.createRange();
      range.selectNodeContents(holder);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
      holder.remove();
    }
    showToast(`${items.length}건을 복사했습니다 · 업무시스템에 붙여넣으세요`);
  }

  function loadExcelJs() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    loadExcelJs.promise ??= new Promise((resolve, reject) => {
      const script = el('script', { src: 'assets/vendor/exceljs.min.js' });
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => { loadExcelJs.promise = null; reject(new Error('엑셀 기능을 불러오지 못했습니다')); };
      document.head.append(script);
    });
    return loadExcelJs.promise;
  }

  async function downloadExcel() {
    const items = chosenItems();
    const label = els.excel.querySelector('span');
    els.excel.disabled = true;
    label.textContent = '만드는 중…';
    try {
      const ExcelJS = await loadExcelJs();
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('사전규격');
      sheet.columns = [
        { header: '목록 날짜', key: 'listDate', width: 12 },
        { header: '번호', key: 'seqNo', width: 6 },
        { header: '수요기관명', key: 'agency', width: 28 },
        { header: '사업명', key: 'title', width: 56 },
        { header: '예산', key: 'budgetText', width: 14 },
        { header: '예산(원)', key: 'budget', width: 16, style: { numFmt: '#,##0' } },
        { header: '업무구분', key: 'businessType', width: 10 },
        { header: '사전규격등록번호', key: 'bfSpecRgstNo', width: 17 },
        { header: '등록일시', key: 'registeredAt', width: 19 },
        { header: '의견등록마감일시', key: 'opinionDeadline', width: 19 },
        { header: '본공고', key: 'bid', width: 8 },
        { header: '나라장터 링크', key: 'link', width: 14 },
        { header: '첨부 상태', key: 'attachmentStatus', width: 28 },
        { header: '걸린 키워드', key: 'keywords', width: 18 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      for (const item of items) {
        const row = sheet.addRow({
          ...item,
          bid: item.bidNotices.length > 0 ? '본공고' : '',
          link: { text: '사전규격 보기', hyperlink: item.detailUrl },
          keywords: item.matchedKeywords.join(', '),
        });
        row.getCell('link').font = { color: { argb: 'FF1D4ED8' }, underline: true };
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const c = state.criteria;
      const range = c.from === c.to ? c.from : `${c.from}~${c.to}`;
      const link = el('a', {
        href: URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
        download: `나라장터_사전규격_${range}.xlsx`,
      });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      showToast(`${items.length}건을 엑셀로 내려받았습니다`);
    } catch (err) {
      showToast(err.message);
    } finally {
      label.textContent = '엑셀';
      els.excel.disabled = state.results.length === 0;
    }
  }

  // ---------- 수집 조건 ----------

  function renderConditions(settings) {
    const chips = (words, cls) => (words.length
      ? words.map((w) => el('span', { className: `badge ${cls}`, text: w }))
      : [el('span', { className: 'muted', text: '없음' })]);
    $('cond-keywords').replaceChildren(...chips(settings.keywords, 'keyword'));
    $('cond-exclude').replaceChildren(...chips(settings.excludeWords, ''));
    $('cond-types').replaceChildren(...chips(settings.businessTypes, 'type'));
    const won = (v) => (v === null ? '' : S.formatManwon(Math.floor(v / 10000)));
    const range = settings.budgetMin === null && settings.budgetMax === null
      ? '제한 없음' : `${won(settings.budgetMin) || '제한 없음'} ~ ${won(settings.budgetMax) || '제한 없음'}`;
    $('cond-budget').replaceChildren(el('span', { text: range }),
      el('span', { className: 'muted small', text: '· 예산이 비어 있거나 0·1원인 공고는 제외' }));
  }

  // ---------- 이벤트 ----------

  function bindEvents() {
    const c = () => state.criteria;

    for (const b of els.periodButtons) b.addEventListener('click', () => applyPeriod(b.dataset.period));
    els.daySelect.addEventListener('change', () => { c().from = c().to = els.daySelect.value; search(); });
    els.prevDay.addEventListener('click', () => {
      const i = state.dates.indexOf(c().to);
      if (i < state.dates.length - 1) { c().from = c().to = state.dates[i + 1]; search(); }
    });
    els.nextDay.addEventListener('click', () => {
      const i = state.dates.indexOf(c().to);
      if (i > 0) { c().from = c().to = state.dates[i - 1]; search(); }
    });
    els.from.addEventListener('change', () => { c().from = els.from.value; search(); });
    els.to.addEventListener('change', () => { c().to = els.to.value; search(); });

    els.q.addEventListener('input', () => { c().q = els.q.value.trim(); searchSoon(); });
    for (const chip of els.typeChips) {
      chip.addEventListener('click', () => {
        const t = chip.dataset.type;
        c().types = c().types.includes(t) ? c().types.filter((x) => x !== t) : [...c().types, t];
        search();
      });
    }
    els.budgetPreset.addEventListener('change', () => {
      const v = els.budgetPreset.value;
      state.customBudget = v === 'custom';
      if (state.customBudget) {
        renderFilters();
        els.budgetMin.focus();
        return;
      }
      c().budgetMin = v ? Number(v.replace('-', '')) : null;
      c().budgetMax = null;
      search();
    });
    for (const input of [els.budgetMin, els.budgetMax]) {
      input.addEventListener('input', () => {
        c().budgetMin = S.toNumberOrNull(els.budgetMin.value);
        c().budgetMax = S.toNumberOrNull(els.budgetMax.value);
        searchSoon();
      });
    }
    els.reset.addEventListener('click', resetFilters);
    els.emptyReset.addEventListener('click', resetFilters);

    for (const tile of els.tiles) {
      tile.addEventListener('click', () => {
        const key = tile.getAttribute('aria-pressed') === 'true' && tile.dataset.tile !== 'all' ? 'all' : tile.dataset.tile;
        Object.assign(c(), TILE_FILTERS[key]);
        search();
      });
    }

    els.sort.addEventListener('change', () => { c().sort = els.sort.value; search(); });
    els.checkAll.addEventListener('change', () => {
      state.selected = els.checkAll.checked ? new Set(state.results.map(itemKey)) : new Set();
      renderResults();
      renderSelection();
    });
    els.clearSelection.addEventListener('click', () => {
      state.selected.clear();
      renderResults();
      renderSelection();
    });
    els.copy.addEventListener('click', copyItems);
    els.excel.addEventListener('click', downloadExcel);

    els.openConditions.addEventListener('click', () => els.conditions.showModal());
    els.conditions.addEventListener('click', (event) => {
      if (event.target === els.conditions || event.target.closest('[data-close]')) els.conditions.close();
    });

    // 첨부 목록 팝업은 하나만 열리게, 바깥을 누르면 닫히게
    document.addEventListener('click', (event) => {
      for (const d of document.querySelectorAll('.more-files[open]')) if (!d.contains(event.target)) d.open = false;
    });

    document.addEventListener('keydown', (event) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
      if (event.key === '/' && !typing && !els.conditions.open) {
        event.preventDefault();
        els.q.focus();
      } else if (event.key === 'Escape' && document.activeElement === els.q && els.q.value) {
        els.q.value = '';
        c().q = '';
        search();
      }
    });
  }

  function showError(err) {
    els.updated.textContent = '목록을 불러오지 못했습니다';
    els.results.replaceChildren(el('div', { className: 'empty' }, [
      el('p', { className: 'empty-title', text: '목록을 불러오지 못했습니다' }),
      el('p', { className: 'muted', text: err.message }),
    ]));
  }

  // ---------- 시작 ----------

  (async () => {
    showSkeleton();
    const [index, settings] = await Promise.all([
      getJson('data/index.json'),
      getJson('data/settings.json').catch(() => null),
    ]);
    const updated = index.updatedAt ? new Date(index.updatedAt.replace(' ', 'T')) : null;
    els.updated.textContent = updated
      ? `${updated.getMonth() + 1}월 ${updated.getDate()}일 ${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')} 갱신`
      : '';
    if (settings) renderConditions(settings); else els.openConditions.hidden = true;

    state.dates = index.dates.map((d) => d.date);
    for (const { date, count } of index.dates) state.counts.set(date, count);
    bindEvents();

    if (state.dates.length === 0) {
      els.results.replaceChildren();
      els.empty.hidden = false;
      els.empty.querySelector('.empty-title').textContent = '아직 수집된 목록이 없습니다';
      els.empty.querySelector('.muted').textContent = '매일 아침 자동으로 수집됩니다.';
      els.emptyReset.hidden = true;
      return;
    }

    for (const { date, count } of index.dates) {
      const label = `${dateLabel(date)} · ${count}건`;
      els.daySelect.append(el('option', { value: date, text: label }));
      els.from.append(el('option', { value: date, text: label }));
      els.to.append(el('option', { value: date, text: label }));
    }
    state.criteria = S.fromHash(location.hash, state.dates);
    state.period = detectPeriod(state.criteria);
    await search();
  })().catch(showError);
})();
