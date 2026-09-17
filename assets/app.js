(() => {
  const $ = (id) => document.getElementById(id);
  const els = {
    updated: $('updated'),
    select: $('date-select'),
    summary: $('summary'),
    copy: $('copy-button'),
    excel: $('excel-link'),
    checkAll: $('check-all'),
    body: $('list-body'),
    table: $('list'),
    empty: $('empty'),
    toast: $('toast'),
  };
  let items = [];

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

  function renderRow(item, index) {
    const checkbox = el('input', { type: 'checkbox', 'data-index': index, 'aria-label': `${item.seqNo}번 선택` });
    checkbox.checked = true;

    const keywords = el('div', { className: 'keywords' },
      item.matchedKeywords.map((k) => el('span', { className: 'badge', text: k })));
    const title = el('td', {}, [
      el('a', { className: 'title-link', href: item.detailUrl, target: '_blank', rel: 'noopener', text: item.title }),
      keywords,
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
      .map((c) => items[Number(c.dataset.index)]);
  }

  function updateSummary() {
    const count = selectedItems().length;
    els.summary.textContent = `${items.length}건 중 ${count}건 선택`;
    els.copy.disabled = count === 0;
    els.checkAll.checked = count === items.length && items.length > 0;
    els.checkAll.indeterminate = count > 0 && count < items.length;
  }

  async function loadList(date) {
    els.body.replaceChildren();
    const data = await getJson(`data/lists/${date}.json`);
    items = data.items;
    els.body.append(...items.map(renderRow));
    els.table.hidden = items.length === 0;
    els.empty.hidden = items.length > 0;
    els.excel.href = `excel/${encodeURIComponent(`나라장터_사전규격_${date}.xlsx`)}`;
    els.excel.setAttribute('download', `나라장터_사전규격_${date}.xlsx`);
    els.excel.setAttribute('aria-disabled', 'false');
    updateSummary();
    history.replaceState(null, '', `#${date}`);
  }

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

  els.body.addEventListener('change', updateSummary);
  els.checkAll.addEventListener('change', () => {
    for (const c of els.body.querySelectorAll('input[type=checkbox]')) c.checked = els.checkAll.checked;
    updateSummary();
  });
  els.copy.addEventListener('click', copySelected);
  els.select.addEventListener('change', () => loadList(els.select.value).catch(showError));

  function showError(err) {
    els.updated.textContent = `목록을 불러오지 못했습니다: ${err.message}`;
  }

  (async () => {
    const index = await getJson('data/index.json');
    els.updated.textContent = `마지막 갱신 ${index.updatedAt}`;
    if (index.dates.length === 0) {
      els.table.hidden = true;
      els.empty.hidden = false;
      els.empty.textContent = '아직 수집된 목록이 없습니다.';
      return;
    }
    for (const { date, count } of index.dates) {
      const day = '일월화수목금토'[new Date(`${date}T00:00:00`).getDay()];
      els.select.append(el('option', { value: date, text: `${date} (${day}) · ${count}건` }));
    }
    const wanted = decodeURIComponent(location.hash.slice(1));
    if (index.dates.some((d) => d.date === wanted)) els.select.value = wanted;
    els.select.disabled = false;
    await loadList(els.select.value);
  })().catch(showError);
})();
