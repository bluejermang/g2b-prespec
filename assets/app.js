(() => {
  const S = window.G2bSearch;
  const $ = (id) => document.getElementById(id);
  const els = {
    updated: $('updated'),
    from: $('from'),
    to: $('to'),
    q: $('q'),
    types: $('types'),
    budgetMin: $('budget-min'),
    budgetMax: $('budget-max'),
    budgetHint: $('budget-hint'),
    bid: $('bid'),
    rfp: $('rfp'),
    reset: $('reset'),
    summary: $('summary'),
    copy: $('copy-button'),
    excel: $('excel-button'),
    checkAll: $('check-all'),
    body: $('list-body'),
    table: $('list'),
    empty: $('empty'),
    toast: $('toast'),
  };

  let dates = [];
  const listCache = new Map();
  let results = [];
  let renderToken = 0;

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} (${res.status})`);
    return res.json();
  }

  async function loadDate(date) {
    if (!listCache.has(date)) {
      listCache.set(date, getJson(`data/lists/${date}.json`).then((data) => data.items.map((item) => ({ ...item, listDate: date }))));
    }
    return listCache.get(date);
  }

  // ---------- 검색조건 <-> 화면 ----------

  function readForm() {
    return {
      from: els.from.value,
      to: els.to.value,
      q: els.q.value.trim(),
      types: [...els.types.querySelectorAll('input:checked')].map((c) => c.value),
      budgetMin: S.toNumberOrNull(els.budgetMin.value),
      budgetMax: S.toNumberOrNull(els.budgetMax.value),
      bid: els.bid.value,
      rfp: els.rfp.value,
    };
  }

  function writeForm(c) {
    els.from.value = c.from;
    els.to.value = c.to;
    els.q.value = c.q;
    for (const box of els.types.querySelectorAll('input')) box.checked = c.types.includes(box.value);
    els.budgetMin.value = c.budgetMin ?? '';
    els.budgetMax.value = c.budgetMax ?? '';
    els.bid.value = c.bid;
    els.rfp.value = c.rfp;
    updateBudgetHint(c);
  }

  function updateBudgetHint(c) {
    const min = S.formatManwon(c.budgetMin);
    const max = S.formatManwon(c.budgetMax);
    els.budgetHint.textContent = min || max ? `${min || '제한 없음'} ~ ${max || '제한 없음'}` : '';
  }

  // ---------- 목록 ----------

  function renderRow(item, index) {
    const checkbox = el('input', { type: 'checkbox', 'data-index': index, 'aria-label': `${item.listDate} ${item.seqNo}번 선택` });
    checkbox.checked = true;

    const title = el('td', {}, [
      el('a', { className: 'title-link', href: item.detailUrl, target: '_blank', rel: 'noopener', text: item.title }),
      el('div', { className: 'keywords' }, item.matchedKeywords.map((k) => el('span', { className: 'badge', text: k }))),
    ]);

    const bid = el('td', { className: 'nowrap' }, item.bidNotices.map((b) =>
      el('div', {}, el('a', { className: 'title-link', href: b.url, target: '_blank', rel: 'noopener', text: '본공고' }))));

    const warn = !item.attachmentStatus.startsWith('제안요청서 저장');
    const files = el('td', {}, [
      el('div', { className: 'files' }, item.files.map((f) => el('a', {
        href: f.url, className: f.isRfp ? 'rfp' : '', title: f.name, text: f.name,
      }))),
      el('div', { className: 'file-status' },
        el('span', { className: warn ? 'badge warn' : 'badge', text: item.attachmentStatus })),
    ]);

    return el('tr', {}, [
      el('td', {}, checkbox),
      el('td', { className: 'nowrap muted', text: item.listDate.slice(5) }),
      el('td', { className: 'nowrap', text: String(item.seqNo) }),
      el('td', { text: item.agency }),
      title,
      el('td', { className: 'col-num', text: item.budgetText }),
      el('td', { className: 'nowrap', text: item.businessType }),
      el('td', { className: 'nowrap', text: (item.opinionDeadline || '').slice(0, 16) }),
      bid,
      files,
    ]);
  }

  function selectedItems() {
    return [...els.body.querySelectorAll('input[type=checkbox]')]
      .filter((c) => c.checked)
      .map((c) => results[Number(c.dataset.index)]);
  }

  function updateSummary(total) {
    const count = selectedItems().length;
    const range = els.from.value === els.to.value ? els.from.value : `${els.from.value} ~ ${els.to.value}`;
    els.summary.textContent = `${range} · 검색 결과 ${results.length}건${total !== undefined && total !== results.length ? ` (전체 ${total}건)` : ''} · ${count}건 선택`;
    els.copy.disabled = count === 0;
    els.excel.disabled = count === 0;
    els.checkAll.checked = count === results.length && results.length > 0;
    els.checkAll.indeterminate = count > 0 && count < results.length;
  }

  async function search() {
    const c = readForm();
    if (c.from > c.to) {
      [c.from, c.to] = [c.to, c.from];
      writeForm(c);
    }
    updateBudgetHint(c);
    history.replaceState(null, '', S.toHash(c));

    const token = ++renderToken;
    const lists = await Promise.all(S.datesInRange(c, dates).map(loadDate));
    if (token !== renderToken) return; // 더 최근 검색이 시작됨
    const all = lists.flat();
    results = all.filter((item) => S.matches(item, c));

    els.body.replaceChildren(...results.map(renderRow));
    els.table.hidden = results.length === 0;
    els.empty.hidden = results.length > 0;
    updateSummary(all.length);
  }

  let searchTimer;
  function searchSoon() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => search().catch(showError), 250);
  }

  // ---------- 복사 · 엑셀 ----------

  async function copySelected() {
    const chosen = selectedItems();
    const html = chosen.map((i) => `<div>${i.copyHtml}</div>`).join('');
    const text = chosen.map((i) => i.copyText).join('\n');
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
    showToast(`${chosen.length}건을 복사했습니다`);
  }

  function loadExcelJs() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    loadExcelJs.promise ??= new Promise((resolve, reject) => {
      const script = el('script', { src: 'assets/vendor/exceljs.min.js' });
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => reject(new Error('엑셀 라이브러리를 불러오지 못했습니다'));
      document.head.append(script);
    });
    return loadExcelJs.promise;
  }

  async function downloadExcel() {
    const chosen = selectedItems();
    els.excel.disabled = true;
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
      for (const item of chosen) {
        const row = sheet.addRow({
          ...item,
          bid: item.bidNotices.length > 0 ? '본공고' : '',
          link: { text: '사전규격 보기', hyperlink: item.detailUrl },
          keywords: item.matchedKeywords.join(', '),
        });
        row.getCell('link').font = { color: { argb: 'FF1D4ED8' }, underline: true };
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const range = els.from.value === els.to.value ? els.from.value : `${els.from.value}~${els.to.value}`;
      const link = el('a', {
        href: URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
        download: `나라장터_사전규격_${range}.xlsx`,
      });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      showToast(`${chosen.length}건을 엑셀로 내려받았습니다`);
    } catch (err) {
      showToast(err.message);
    } finally {
      els.excel.disabled = selectedItems().length === 0;
    }
  }

  // ---------- 현재 수집 조건 (보기 전용) ----------

  function renderSettings(settings) {
    const chips = (words) => (words.length
      ? words.map((w) => el('span', { className: 'badge', text: w }))
      : [el('span', { className: 'muted', text: '없음' })]);
    $('settings-keywords').replaceChildren(...chips(settings.keywords));
    $('settings-exclude').replaceChildren(...chips(settings.excludeWords));
    const won = (v) => (v === null ? '' : S.formatManwon(Math.floor(v / 10000)));
    $('settings-budget').textContent = settings.budgetMin === null && settings.budgetMax === null
      ? '제한 없음 (예산이 비어 있거나 0·1원인 공고는 제외)'
      : `${won(settings.budgetMin) || '제한 없음'} ~ ${won(settings.budgetMax) || '제한 없음'} (예산이 비어 있거나 0·1원인 공고는 제외)`;
    $('settings-types').replaceChildren(...chips(settings.businessTypes));
    $('settings-summary').textContent = `· 키워드 ${settings.keywords.length}개, 제외어 ${settings.excludeWords.length}개`;
  }

  // ---------- 이벤트 ----------

  function setPreset(preset) {
    const c = readForm();
    c.to = dates[0];
    if (preset === 'latest') c.from = dates[0];
    else if (preset === 'all') c.from = dates[dates.length - 1];
    else {
      const start = new Date(`${dates[0]}T00:00:00`);
      start.setDate(start.getDate() - (Number(preset) - 1));
      const pad = (n) => String(n).padStart(2, '0');
      const startText = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      c.from = [...dates].reverse().find((d) => d >= startText) ?? dates[0];
    }
    writeForm(c);
    search().catch(showError);
  }

  document.getElementById('search-form').addEventListener('submit', (event) => event.preventDefault());
  for (const input of [els.from, els.to, els.bid, els.rfp]) input.addEventListener('change', () => search().catch(showError));
  els.types.addEventListener('change', () => search().catch(showError));
  for (const input of [els.q, els.budgetMin, els.budgetMax]) input.addEventListener('input', searchSoon);
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => setPreset(b.dataset.preset)));
  els.reset.addEventListener('click', () => {
    writeForm(S.emptyCriteria(dates[0]));
    search().catch(showError);
  });
  els.body.addEventListener('change', () => updateSummary());
  els.checkAll.addEventListener('change', () => {
    for (const c of els.body.querySelectorAll('input[type=checkbox]')) c.checked = els.checkAll.checked;
    updateSummary();
  });
  els.copy.addEventListener('click', copySelected);
  els.excel.addEventListener('click', downloadExcel);

  function showError(err) {
    els.updated.textContent = `목록을 불러오지 못했습니다: ${err.message}`;
  }

  (async () => {
    const [index, settings] = await Promise.all([
      getJson('data/index.json'),
      getJson('data/settings.json').catch(() => null),
    ]);
    els.updated.textContent = `마지막 갱신 ${index.updatedAt}`;
    if (settings) renderSettings(settings);
    else $('settings-panel').hidden = true;

    dates = index.dates.map((d) => d.date);
    if (dates.length === 0) {
      els.table.hidden = true;
      els.empty.hidden = false;
      els.empty.textContent = '아직 수집된 목록이 없습니다.';
      return;
    }
    for (const { date, count } of index.dates) {
      const day = '일월화수목금토'[new Date(`${date}T00:00:00`).getDay()];
      const label = `${date} (${day}) · ${count}건`;
      els.from.append(el('option', { value: date, text: label }));
      els.to.append(el('option', { value: date, text: label }));
    }
    els.from.disabled = false;
    els.to.disabled = false;
    writeForm(S.fromHash(location.hash, dates));
    await search();
  })().catch(showError);
})();
