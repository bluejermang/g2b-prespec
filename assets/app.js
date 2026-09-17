(() => {
  const S = window.G2bSearch;
  const $ = (id) => document.getElementById(id);
  const WEEKDAYS = '일월화수목금토';
  const CURRENT_YEAR = new Date().getFullYear();

  const els = {
    updated: $('updated'), adminBadge: $('admin-badge'), settingsLink: $('settings-link'),
    viewTabs: [...document.querySelectorAll('[data-view]')], viewAll: $('view-all'), viewStaff: $('view-staff'),
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
    staffPicker: $('staff-picker'), staffHint: $('staff-hint'), staffCheckAll: $('staff-check-all'), staffCount: $('staff-count'),
    deliveries: $('deliveries'), staffEmpty: $('staff-empty'), staffEmptyTitle: $('staff-empty-title'), staffEmptyDesc: $('staff-empty-desc'),
    actionText: $('action-text'), clearSelection: $('clear-selection'), copy: $('copy-button'), copyLabel: $('copy-label'),
    excel: $('excel-button'), assign: $('assign-button'),
    conditions: $('conditions'), openConditions: $('open-conditions'),
    assignDialog: $('assign-dialog'), assignForm: $('assign-form'), assignDesc: $('assign-desc'), assignItems: $('assign-items'),
    staffOptions: $('staff-options'), staffOptionsEmpty: $('staff-options-empty'), assignMessage: $('assign-message'),
    assignError: $('assign-error'), assignSubmit: $('assign-submit'),
    confirmDialog: $('confirm-dialog'), confirmTitle: $('confirm-title'), confirmDesc: $('confirm-desc'), confirmOk: $('confirm-ok'),
    toast: $('toast'),
  };

  const state = {
    admin: false,
    adminStaff: [],     // 관리 모드: 배정할 수 있는 담당자
    index: null,        // data/index.json
    dates: [],
    criteria: null,
    period: 'day',
    view: 'all',        // all | staff
    staffId: null,
    results: [],        // 전체 목록 화면에 보이는 공고
    staffItems: [],     // 담당자별 화면에 보이는 공고
    selected: new Set(), // 사전규격등록번호
    customBudget: false,
  };
  const cache = { lists: new Map(), deliveries: null };
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
    for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) node.append(child);
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

  function dateLabel(date) {
    const d = new Date(`${date}T00:00:00`);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} (${res.status})`);
    return res.json();
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
    return data;
  }

  function loadDate(date) {
    if (!cache.lists.has(date)) {
      cache.lists.set(date, getJson(`data/lists/${date}.json`).then((data) => data.items));
    }
    return cache.lists.get(date);
  }

  function loadDeliveries() {
    cache.deliveries ??= getJson('data/deliveries.json').catch(() => []);
    return cache.deliveries;
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
    if (c.from === c.to) return 'day';
    if (c.to === latest && c.from === startDateFor(7)) return '7';
    if (c.to === latest && c.from === startDateFor(30)) return '30';
    if (c.to === latest && c.from === state.dates[state.dates.length - 1]) return 'all';
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
    all: { bid: 'all', doc: 'all' },
    rfp: { bid: 'all', doc: 'rfp' },
    sow: { bid: 'all', doc: 'sow' },
    none: { bid: 'all', doc: 'none' },
    bid: { bid: 'yes', doc: 'all' },
  };

  const activeTile = (c) => Object.keys(TILE_FILTERS)
    .find((key) => TILE_FILTERS[key].bid === c.bid && TILE_FILTERS[key].doc === c.doc) ?? null;

  function budgetPresetValue(c) {
    if (c.budgetMin === null && c.budgetMax === null) return '';
    const preset = c.budgetMax === null ? `${c.budgetMin}-` : null;
    return [...els.budgetPreset.options].some((o) => o.value === preset) ? preset : 'custom';
  }

  const hasFilters = (c) => Boolean(c.q || c.types.length || c.budgetMin !== null || c.budgetMax !== null
    || c.bid !== 'all' || c.doc !== 'all');

  function renderFilters() {
    const c = state.criteria;
    if (document.activeElement !== els.q) els.q.value = c.q;
    for (const chip of els.typeChips) chip.setAttribute('aria-pressed', String(c.types.includes(chip.dataset.type)));
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

  // ---------- 카드 ----------

  function docSection(item) {
    const nodes = [];
    if (item.docKind === 'rfp' || item.docKind === 'sow') {
      nodes.push(el('span', { className: `badge doc ${item.docKind}`, text: item.docLabel }));
      for (const f of item.docFiles) {
        nodes.push(el('a', { className: `file-link ${item.docKind}`, href: f.url, title: `${f.name} 내려받기` },
          [icon('file'), el('span', { text: f.name })]));
      }
    } else if (item.docKind === 'none') {
      nodes.push(el('span', { className: 'doc-none' }, [icon('info'), el('span', { text: item.docLabel })]));
    } else {
      nodes.push(el('span', { className: 'badge warn', text: item.docLabel }));
    }
    if (item.attachmentsFull) nodes.push(el('span', { className: 'badge warn', text: '첨부 5개 · 나라장터에서 추가 확인' }));
    return nodes;
  }

  /**
   * @param {object} item
   * @param {number} number 카드 왼쪽 번호
   * @param {{ showDate?: boolean }} options
   */
  function renderCard(item, number, { showDate = false } = {}) {
    const key = item.bfSpecRgstNo;
    const checked = state.selected.has(key);
    const checkbox = el('input', { type: 'checkbox', 'aria-label': `${number}. ${item.title} 선택` });
    checkbox.checked = checked;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(key); else state.selected.delete(key);
      for (const card of document.querySelectorAll(`.card[data-no="${key}"]`)) {
        card.classList.toggle('selected', checkbox.checked);
        card.querySelector('.card-lead input').checked = checkbox.checked;
      }
      renderSelection();
    });

    const meta = el('div', { className: 'card-meta' }, [
      el('span', { className: 'agency', text: item.agency }),
      el('span', { className: 'badge type', text: item.businessType }),
      showDate ? el('span', { className: 'muted', text: `${dateLabel(item.listDate)} 목록` }) : null,
      ...item.assignees.map((a) => el('span', { className: 'badge assignee', title: '배정된 담당자' }, [icon('user'), el('span', { text: a.name })])),
    ]);

    const side = el('div', { className: 'card-side' }, [
      el('span', { className: 'budget', text: item.budgetText }),
      el('span', { className: 'published', title: '사전규격 공개일시', text: `공개 ${S.formatDateTime(item.publishedAt, CURRENT_YEAR)}` }),
    ]);

    const title = el('h3', { className: 'card-title' },
      el('a', { href: item.detailUrl, target: '_blank', rel: 'noopener', title: '나라장터 사전규격 상세 보기' },
        [document.createTextNode(item.title), icon('external')]));

    const foot = el('div', { className: 'card-foot' });
    if (item.matchedKeywords.length) {
      foot.append(el('span', {
        className: 'badge keyword',
        title: item.matchedKeywords.length > 1 ? `키워드 ${item.matchedKeywords.length}개가 함께 걸렸습니다` : '걸린 키워드',
        text: item.matchedKeywords.join(' · '),
      }));
    }
    if (item.bidNotices.length) {
      foot.append(el('a', { className: 'badge bid', href: item.bidNotices[0].url, target: '_blank', rel: 'noopener',
        text: item.bidNotices.length > 1 ? `본공고 ${item.bidNotices.length}건` : '본공고' }));
    }
    foot.append(...docSection(item));

    const body = el('div', { className: 'card-body' }, [
      el('div', { className: 'card-top' }, [meta, side]),
      title,
      foot,
    ]);

    const card = el('article', { className: `card${checked ? ' selected' : ''}`, 'data-no': key }, [
      el('label', { className: 'card-lead' }, [el('span', { className: 'card-index', text: String(number) }), checkbox]),
      body,
    ]);

    if (state.admin) {
      const del = el('button', { type: 'button', className: 'icon-btn card-delete', 'aria-label': `${item.title} 삭제`, title: '목록에서 삭제' },
        icon('trash'));
      del.addEventListener('click', () => confirmDelete(item));
      card.append(del);
    }
    return card;
  }

  // ---------- 전체 목록 ----------

  function renderResults() {
    const c = state.criteria;
    const multiDay = c.from !== c.to;
    const grouped = multiDay && c.sort === 'default';
    const total = state.results.length;
    const nodes = [];
    let lastDate = null;
    state.results.forEach((item, i) => {
      if (grouped && item.listDate !== lastDate) {
        lastDate = item.listDate;
        const n = state.results.filter((x) => x.listDate === lastDate).length;
        nodes.push(el('h2', { className: 'group-title', text: `${dateLabel(lastDate)} · ${n}건` }));
      }
      nodes.push(renderCard(item, total - i, { showDate: multiDay && !grouped }));
    });
    els.results.replaceChildren(...nodes);
    els.empty.hidden = total > 0;
    els.resultCount.textContent = `${total}건`;
  }

  function renderTiles(base) {
    const counts = {
      all: base.length,
      rfp: base.filter((i) => i.docKind === 'rfp').length,
      sow: base.filter((i) => i.docKind === 'sow').length,
      none: base.filter((i) => i.docKind === 'none').length,
      bid: base.filter((i) => i.bidNotices.length > 0).length,
    };
    for (const node of document.querySelectorAll('[data-count]')) node.textContent = counts[node.dataset.count];
  }

  function showSkeleton(target) {
    target.replaceChildren(...[1, 2, 3].map(() => el('div', { className: 'skeleton', 'aria-hidden': 'true' })));
  }

  async function search() {
    const c = state.criteria;
    if (c.from > c.to) [c.from, c.to] = [c.to, c.from];
    history.replaceState(null, '', S.toHash(c));
    renderPeriod();
    renderFilters();

    const token = ++searchToken;
    const dates = S.datesInRange(c, state.dates);
    if (dates.some((d) => !cache.lists.has(d))) { showSkeleton(els.results); els.empty.hidden = true; }
    let lists;
    try {
      lists = await Promise.all(dates.map(loadDate));
    } catch (err) {
      showError(err);
      return;
    }
    if (token !== searchToken || state.view !== 'all') return;

    const all = lists.flat();
    const base = all.filter((item) => S.matches(item, { ...c, bid: 'all', doc: 'all' }));
    state.results = S.sortItems(base.filter((item) => S.matches(item, c)), c.sort);
    const visible = new Set(state.results.map((i) => i.bfSpecRgstNo));
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

  // ---------- 담당자별 ----------

  function staffList() {
    const byId = new Map((state.index?.staff ?? []).map((s) => [s.id, { ...s }]));
    for (const s of state.adminStaff) if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name, count: 0 });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  async function renderStaffView() {
    const staff = staffList();
    // 처음 열면 배정된 공고가 있는 담당자부터 보여준다.
    if (!staff.some((s) => s.id === state.staffId)) state.staffId = (staff.find((s) => s.count > 0) ?? staff[0])?.id ?? null;
    history.replaceState(null, '', state.staffId ? `#view=staff&staff=${state.staffId}` : '#view=staff');

    els.staffPicker.replaceChildren(...staff.map((s) => {
      const chip = el('button', { type: 'button', className: 'chip staff-chip', 'aria-pressed': String(s.id === state.staffId) },
        [icon('user'), el('span', { text: s.name }), el('span', { className: 'chip-count', text: String(s.count) })]);
      chip.addEventListener('click', () => { state.staffId = s.id; state.selected.clear(); renderStaffView(); });
      return chip;
    }));
    els.staffHint.textContent = staff.length ? '담당자를 누르면 그 사람에게 배정된 공고와 전달 내용을 볼 수 있습니다.' : '';

    if (!staff.length) {
      state.staffItems = [];
      els.deliveries.replaceChildren();
      els.staffEmpty.hidden = false;
      els.staffEmptyTitle.textContent = '등록된 담당자가 없습니다';
      els.staffEmptyDesc.textContent = state.admin ? '조건 설정 화면에서 담당자를 먼저 추가하세요.' : '관리자가 담당자를 등록하고 공고를 배정하면 여기에 표시됩니다.';
      els.staffCount.textContent = '0건';
      renderSelection();
      return;
    }

    if (!cache.deliveries) showSkeleton(els.deliveries);
    const deliveries = (await loadDeliveries()).filter((d) => d.staff.some((s) => s.id === state.staffId));
    if (state.view !== 'staff') return;

    state.staffItems = deliveries.flatMap((d) => d.items);
    const total = state.staffItems.length;
    const visible = new Set(state.staffItems.map((i) => i.bfSpecRgstNo));
    for (const key of [...state.selected]) if (!visible.has(key)) state.selected.delete(key);

    let index = 0;
    els.deliveries.replaceChildren(...deliveries.map((d) => {
      const head = el('header', { className: 'delivery-head' }, [
        el('div', { className: 'delivery-info' }, [
          el('strong', { text: `${S.formatDateTime(d.createdAt, CURRENT_YEAR)} 전달` }),
          el('span', { className: 'muted', text: ` · 담당 ${d.staff.map((s) => s.name).join(', ')} · ${d.items.length}건` }),
        ]),
      ]);
      if (state.admin) {
        const cancel = el('button', { type: 'button', className: 'link-btn danger-text', text: '전달 취소' });
        cancel.addEventListener('click', () => confirmCancelDelivery(d));
        head.append(cancel);
      }
      const cards = d.items.map((item) => renderCard(item, total - index++, { showDate: true }));
      return el('section', { className: 'delivery' }, [
        head,
        d.message ? el('blockquote', { className: 'delivery-message' }, [icon('message'), el('p', { text: d.message })]) : null,
        el('div', { className: 'results' }, cards),
      ]);
    }));
    const name = staff.find((s) => s.id === state.staffId)?.name ?? '';
    els.staffEmpty.hidden = total > 0;
    els.staffEmptyTitle.textContent = `${name}님에게 배정된 공고가 없습니다`;
    els.staffEmptyDesc.textContent = state.admin ? '전체 목록에서 공고를 고른 뒤 "담당자 배정"을 누르세요.' : '관리자가 공고를 배정하면 여기에 표시됩니다.';
    els.staffCount.textContent = `${name} · ${total}건`;
    renderSelection();
  }

  function setView(view) {
    if (state.view === view) return;
    state.view = view;
    state.selected.clear();
    for (const tab of els.viewTabs) {
      if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    }
    els.viewAll.hidden = view !== 'all';
    els.viewStaff.hidden = view !== 'staff';
    window.scrollTo({ top: 0 });
    if (view === 'all') search(); else renderStaffView();
  }

  // ---------- 선택 · 작업 바 ----------

  const visibleItems = () => (state.view === 'all' ? state.results : state.staffItems);

  function chosenItems() {
    const items = visibleItems();
    if (!state.selected.size) return items;
    const seen = new Set();
    return items.filter((i) => state.selected.has(i.bfSpecRgstNo) && !seen.has(i.bfSpecRgstNo) && seen.add(i.bfSpecRgstNo));
  }

  function renderSelection() {
    const n = state.selected.size;
    const unique = new Set(visibleItems().map((i) => i.bfSpecRgstNo)).size;
    els.actionText.replaceChildren(...(n
      ? [el('strong', { text: `${n}건` }), document.createTextNode(' 선택됨')]
      : [document.createTextNode(state.view === 'all' ? '검색 결과 ' : '배정된 공고 '), el('strong', { text: `${unique}건` }), document.createTextNode(' 전체')]));
    els.copyLabel.textContent = n ? '선택 복사' : '전체 복사';
    els.clearSelection.hidden = n === 0;
    els.copy.disabled = unique === 0;
    els.excel.disabled = unique === 0;
    els.assign.hidden = !state.admin || state.view !== 'all';
    els.assign.disabled = n === 0;
    els.assign.title = n === 0 ? '배정할 공고를 먼저 체크하세요' : '';
    const checkAll = state.view === 'all' ? els.checkAll : els.staffCheckAll;
    checkAll.checked = unique > 0 && n === unique;
    checkAll.indeterminate = n > 0 && n < unique;
  }

  function rerender() {
    if (state.view === 'all') renderResults(); else renderStaffView();
    renderSelection();
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
        { header: '번호', key: 'no', width: 6 },
        { header: '목록 날짜', key: 'listDate', width: 12 },
        { header: '수요기관명', key: 'agency', width: 28 },
        { header: '사업명', key: 'title', width: 56 },
        { header: '예산', key: 'budgetText', width: 14 },
        { header: '예산(원)', key: 'budget', width: 16, style: { numFmt: '#,##0' } },
        { header: '업무구분', key: 'businessType', width: 10 },
        { header: '사전규격 공개일시', key: 'publishedAt', width: 19 },
        { header: '사전규격등록번호', key: 'bfSpecRgstNo', width: 17 },
        { header: '본공고', key: 'bid', width: 8 },
        { header: '나라장터 링크', key: 'link', width: 14 },
        { header: '첨부 문서', key: 'attachmentStatus', width: 28 },
        { header: '담당자', key: 'assigneeNames', width: 16 },
        { header: '걸린 키워드', key: 'keywords', width: 18 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      items.forEach((item, i) => {
        const row = sheet.addRow({
          ...item,
          no: items.length - i,
          bid: item.bidNotices.length > 0 ? '본공고' : '',
          link: { text: '사전규격 보기', hyperlink: item.detailUrl },
          assigneeNames: item.assignees.map((a) => a.name).join(', '),
          keywords: item.matchedKeywords.join(', '),
        });
        row.getCell('link').font = { color: { argb: 'FF1D4ED8' }, underline: true };
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const c = state.criteria;
      const suffix = state.view === 'staff'
        ? `담당_${staffList().find((s) => s.id === state.staffId)?.name ?? ''}`
        : c.from === c.to ? c.from : `${c.from}~${c.to}`;
      const link = el('a', {
        href: URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
        download: `나라장터_사전규격_${suffix}.xlsx`,
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
      els.excel.disabled = visibleItems().length === 0;
    }
  }

  // ---------- 관리 모드: 삭제 · 배정 ----------

  /** 확인 창을 띄우고 확인을 누르면 action을 실행한다. */
  function confirmAction({ title, desc, okText, action }) {
    els.confirmTitle.textContent = title;
    els.confirmDesc.replaceChildren(...[].concat(desc));
    els.confirmOk.textContent = okText;
    els.confirmOk.disabled = false;
    els.confirmOk.onclick = async () => {
      els.confirmOk.disabled = true;
      try {
        await action();
        els.confirmDialog.close();
      } catch (err) {
        showToast(err.message);
        els.confirmOk.disabled = false;
      }
    };
    els.confirmDialog.showModal();
  }

  function confirmDelete(item) {
    confirmAction({
      title: '공고를 삭제할까요?',
      desc: [
        el('strong', { className: 'confirm-target', text: `${item.agency} - ${item.title}` }),
        el('span', { text: '목록과 공유 사이트에서 사라지고, 다음 수집 때도 다시 올라오지 않습니다. 배정된 담당자 화면에서도 빠집니다.' }),
        el('span', { className: 'muted small', text: '잘못 삭제했다면 조건 설정 화면의 "삭제한 공고"에서 되살릴 수 있습니다.' }),
      ],
      okText: '삭제',
      action: async () => {
        await postJson(`api/items/${encodeURIComponent(item.bfSpecRgstNo)}/delete`);
        state.selected.delete(item.bfSpecRgstNo);
        showToast('삭제했습니다 · 잠시 후 공유 사이트에 반영됩니다');
        await reloadData();
      },
    });
  }

  function confirmCancelDelivery(delivery) {
    confirmAction({
      title: '전달을 취소할까요?',
      desc: [
        el('strong', { className: 'confirm-target', text: `${S.formatDateTime(delivery.createdAt, CURRENT_YEAR)} · ${delivery.staff.map((s) => s.name).join(', ')} · ${delivery.items.length}건` }),
        el('span', { text: '이 전달로 배정된 공고와 전달한 말이 담당자 화면에서 사라집니다. 공고 자체는 목록에 남습니다.' }),
      ],
      okText: '전달 취소',
      action: async () => {
        await postJson(`api/deliveries/${delivery.id}/delete`);
        showToast('전달을 취소했습니다 · 잠시 후 공유 사이트에 반영됩니다');
        await reloadData();
      },
    });
  }

  function openAssign() {
    const items = chosenItems();
    if (!state.selected.size || !items.length) return;
    els.assignDesc.textContent = `선택한 공고 ${items.length}건을 담당자에게 배정하고 전달합니다.`;
    const shown = items.slice(0, 5).map((i) => el('li', {}, [el('span', { className: 'muted', text: `${i.agency} · ` }), el('span', { text: i.title })]));
    if (items.length > 5) shown.push(el('li', { className: 'muted', text: `외 ${items.length - 5}건` }));
    els.assignItems.replaceChildren(...shown);
    els.staffOptions.replaceChildren(...state.adminStaff.map((s) =>
      el('label', { className: 'staff-option' }, [el('input', { type: 'checkbox', value: String(s.id) }), el('span', { text: s.name })])));
    els.staffOptionsEmpty.hidden = state.adminStaff.length > 0;
    els.assignMessage.value = '';
    els.assignError.hidden = true;
    els.assignSubmit.disabled = state.adminStaff.length === 0;
    els.assignDialog.showModal();
  }

  async function submitAssign(event) {
    event.preventDefault();
    const staffIds = [...els.staffOptions.querySelectorAll('input:checked')].map((c) => Number(c.value));
    const items = chosenItems();
    if (!staffIds.length) {
      els.assignError.textContent = '담당자를 한 명 이상 고르세요.';
      els.assignError.hidden = false;
      return;
    }
    els.assignSubmit.disabled = true;
    try {
      await postJson('api/deliveries', { staffIds, numbers: items.map((i) => i.bfSpecRgstNo), message: els.assignMessage.value });
      const names = state.adminStaff.filter((s) => staffIds.includes(s.id)).map((s) => s.name).join(', ');
      els.assignDialog.close();
      state.selected.clear();
      showToast(`${names}님에게 ${items.length}건을 전달했습니다 · 잠시 후 공유 사이트에 반영됩니다`);
      await reloadData();
    } catch (err) {
      els.assignError.textContent = err.message;
      els.assignError.hidden = false;
    } finally {
      els.assignSubmit.disabled = false;
    }
  }

  /** 배정·삭제 뒤 데이터를 다시 읽는다. */
  async function reloadData() {
    cache.lists.clear();
    cache.deliveries = null;
    const [index, admin] = await Promise.all([getJson('data/index.json'), getJson('data/admin.json')]);
    state.index = index;
    state.adminStaff = admin.staff ?? [];
    fillDates(index);
    if (state.view === 'all') await search(); else await renderStaffView();
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

    for (const tab of els.viewTabs) tab.addEventListener('click', () => setView(tab.dataset.view));

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
    for (const box of [els.checkAll, els.staffCheckAll]) {
      box.addEventListener('change', () => {
        state.selected = box.checked ? new Set(visibleItems().map((i) => i.bfSpecRgstNo)) : new Set();
        rerender();
      });
    }
    els.clearSelection.addEventListener('click', () => { state.selected.clear(); rerender(); });
    els.copy.addEventListener('click', copyItems);
    els.excel.addEventListener('click', downloadExcel);
    els.assign.addEventListener('click', openAssign);
    els.assignForm.addEventListener('submit', submitAssign);

    els.openConditions.addEventListener('click', () => els.conditions.showModal());
    for (const dialog of [els.conditions, els.assignDialog, els.confirmDialog]) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
      });
    }

    document.addEventListener('keydown', (event) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
      const dialogOpen = document.querySelector('dialog[open]');
      if (event.key === '/' && !typing && !dialogOpen && state.view === 'all') {
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

  function fillDates(index) {
    state.dates = index.dates.map((d) => d.date);
    for (const select of [els.daySelect, els.from, els.to]) {
      select.replaceChildren(...index.dates.map(({ date, count }) => el('option', { value: date, text: `${dateLabel(date)} · ${count}건` })));
    }
    if (state.criteria) {
      if (!state.dates.includes(state.criteria.to)) state.criteria.to = state.dates[0];
      if (!state.dates.includes(state.criteria.from)) state.criteria.from = state.criteria.to;
    }
  }

  // ---------- 시작 ----------

  (async () => {
    showSkeleton(els.results);
    const [index, settings, admin] = await Promise.all([
      getJson('data/index.json'),
      getJson('data/settings.json').catch(() => null),
      getJson('data/admin.json').catch(() => null),
    ]);
    state.index = index;
    state.admin = Boolean(admin?.admin);
    state.adminStaff = admin?.staff ?? [];
    els.adminBadge.hidden = !state.admin;
    els.settingsLink.hidden = !state.admin;
    document.body.classList.toggle('is-admin', state.admin);

    const updated = index.updatedAt ? new Date(index.updatedAt.replace(' ', 'T')) : null;
    els.updated.textContent = state.admin
      ? '배정·삭제한 내용은 잠시 후 공유 사이트에 자동으로 게시됩니다'
      : updated ? `${updated.getMonth() + 1}월 ${updated.getDate()}일 ${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')} 갱신` : '';
    if (settings) renderConditions(settings); else els.openConditions.hidden = true;

    fillDates(index);
    bindEvents();

    const route = S.viewFromHash(location.hash);
    if (state.dates.length === 0 && route.view === 'all') {
      els.results.replaceChildren();
      els.empty.hidden = false;
      els.empty.querySelector('.empty-title').textContent = '아직 수집된 목록이 없습니다';
      els.empty.querySelector('.muted').textContent = '매일 아침 자동으로 수집됩니다.';
      els.emptyReset.hidden = true;
    }
    state.criteria = S.fromHash(route.view === 'all' ? location.hash : '', state.dates);
    state.period = state.dates.length ? detectPeriod(state.criteria) : 'day';

    if (route.view === 'staff') {
      state.staffId = route.staffId ?? null;
      state.view = 'all';
      setView('staff');
    } else if (state.dates.length) {
      await search();
    } else {
      renderSelection();
    }
  })().catch(showError);
})();
