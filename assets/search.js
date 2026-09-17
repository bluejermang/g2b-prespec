// 목록 검색조건·정렬: 브라우저(app.js)와 테스트에서 함께 쓴다.
(function (root) {
  const BID = ['all', 'yes', 'no'];
  const DOC = ['all', 'rfp', 'sow', 'spec', 'none'];
  const SORTS = ['default', 'published', 'budget'];

  /** 빈 검색조건. 기간(from/to)은 목록 날짜 문자열, 예산은 만원 단위. */
  function emptyCriteria(latestDate) {
    return {
      from: latestDate || '', to: latestDate || '', q: '', types: [], budgetMin: null, budgetMax: null,
      bid: 'all', doc: 'all', sort: 'default',
    };
  }

  function toNumberOrNull(value) {
    const cleaned = String(value ?? '').replace(/[,\s]/g, '');
    return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
  }

  /** 검색조건을 주소(#…)에 담는다. 링크를 공유하면 같은 화면이 열린다. */
  function toHash(c, extra = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extra)) if (value !== undefined && value !== null) params.set(key, String(value));
    params.set('from', c.from);
    params.set('to', c.to);
    if (c.q) params.set('q', c.q);
    if (c.types.length) params.set('types', c.types.join(','));
    if (c.budgetMin !== null) params.set('min', String(c.budgetMin));
    if (c.budgetMax !== null) params.set('max', String(c.budgetMax));
    if (c.bid !== 'all') params.set('bid', c.bid);
    if (c.doc !== 'all') params.set('doc', c.doc);
    if (c.sort !== 'default') params.set('sort', c.sort);
    return `#${params.toString()}`;
  }

  /** 주소(#…)에서 검색조건을 읽는다. 예전 주소 형식 #2026-09-17 도 받는다. */
  function fromHash(hash, availableDates) {
    const latest = availableDates[0] || '';
    const c = emptyCriteria(latest);
    const raw = String(hash || '').replace(/^#/, '');
    const known = (d) => availableDates.includes(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(decodeURIComponent(raw))) {
      const d = decodeURIComponent(raw);
      if (known(d)) { c.from = d; c.to = d; }
      return c;
    }
    const params = new URLSearchParams(raw);
    if (known(params.get('from'))) c.from = params.get('from');
    if (known(params.get('to'))) c.to = params.get('to');
    if (c.from > c.to) [c.from, c.to] = [c.to, c.from];
    c.q = (params.get('q') || '').trim();
    c.types = (params.get('types') || '').split(',').map((t) => t.trim()).filter(Boolean);
    c.budgetMin = toNumberOrNull(params.get('min'));
    c.budgetMax = toNumberOrNull(params.get('max'));
    if (BID.includes(params.get('bid'))) c.bid = params.get('bid');
    if (DOC.includes(params.get('doc'))) c.doc = params.get('doc');
    if (SORTS.includes(params.get('sort'))) c.sort = params.get('sort');
    return c;
  }

  /** 주소에서 화면(전체 목록 / 담당자별)을 읽는다. 담당자가 없거나 잘못되면 staffId는 null. */
  function viewFromHash(hash) {
    const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    if (params.get('view') !== 'staff') return { view: 'all' };
    const staff = Number(params.get('staff'));
    return { view: 'staff', staffId: Number.isInteger(staff) && staff > 0 ? staff : null };
  }

  /** 기간 안의 목록 날짜 (최근 순) */
  function datesInRange(c, availableDates) {
    return availableDates.filter((d) => d >= c.from && d <= c.to);
  }

  /**
   * 한 건이 검색조건에 맞는지.
   * 검색어는 띄어쓰기로 나눈 단어가 모두 사업명 또는 수요기관명에 들어 있어야 한다. (영문 대소문자 무시)
   */
  function matches(item, c) {
    if (c.q) {
      const haystack = `${item.title} ${item.agency}`.toLowerCase();
      if (!c.q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))) return false;
    }
    if (c.types.length && !c.types.includes(item.businessType)) return false;
    const budgetMan = item.budget === null || item.budget === undefined ? null : Math.floor(item.budget / 10000);
    if (c.budgetMin !== null && (budgetMan === null || budgetMan < c.budgetMin)) return false;
    if (c.budgetMax !== null && (budgetMan === null || budgetMan > c.budgetMax)) return false;
    const hasBid = item.bidNotices.length > 0;
    if (c.bid === 'yes' && !hasBid) return false;
    if (c.bid === 'no' && hasBid) return false;
    if (c.doc !== 'all' && item.docKind !== c.doc) return false;
    return true;
  }

  /** 정렬: default = 목록 날짜 최신 → 번호순, published = 공개일시 최신 순, budget = 예산 높은 순 */
  function sortItems(items, sort) {
    const byDefault = (a, b) => b.listDate.localeCompare(a.listDate) || a.seqNo - b.seqNo;
    const copy = [...items];
    if (sort === 'budget') return copy.sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1) || byDefault(a, b));
    if (sort === 'published') return copy.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || byDefault(a, b));
    return copy.sort(byDefault);
  }

  /**
   * 검색창 자동완성 추천.
   * 입력한 단어가 모두 들어 있는 수요기관·사업명을 고르고, 입력 전체로 시작하는 것 → 입력 전체를 포함하는 것 → 나머지 순으로 보여준다.
   * 수요기관은 건수가 많은 순, 사업명은 최근 목록 순. 같은 사업명·수요기관이 여러 날짜에 있으면 최근 한 건만.
   * @param {{ agencies: {name:string,count:number}[], titles: {title:string,agency:string,date:string}[] }} data
   */
  function suggest(data, query, { agencyLimit = 5, titleLimit = 8 } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.length || !data) return { agencies: [], titles: [] };
    const score = (text) => {
      const t = String(text).toLowerCase();
      if (!words.every((w) => t.includes(w))) return -1;
      return t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2;
    };

    const agencies = data.agencies
      .map((a) => ({ a, s: score(a.name) }))
      .filter((x) => x.s >= 0)
      .sort((x, y) => x.s - y.s || y.a.count - x.a.count)
      .slice(0, agencyLimit)
      .map((x) => x.a);

    const seen = new Set();
    const titles = data.titles
      .map((t) => ({ t, s: score(t.title) }))
      .filter((x) => x.s >= 0)
      .sort((x, y) => x.s - y.s || y.t.date.localeCompare(x.t.date))
      .filter((x) => {
        const key = `${x.t.title}${x.t.agency}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, titleLimit)
      .map((x) => x.t);
    return { agencies, titles };
  }

  /** 추천 항목에서 입력한 단어 부분을 표시하기 위해 [{ text, match }] 조각으로 나눈다. */
  function highlight(text, query) {
    const source = String(text ?? '');
    const lower = source.toLowerCase();
    const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const marks = new Array(source.length).fill(false);
    for (const word of words) {
      for (let i = lower.indexOf(word); i >= 0; i = lower.indexOf(word, i + word.length)) {
        for (let j = i; j < i + word.length; j += 1) marks[j] = true;
      }
    }
    const parts = [];
    for (let i = 0; i < source.length; i += 1) {
      const last = parts[parts.length - 1];
      if (last && last.match === marks[i]) last.text += source[i];
      else parts.push({ text: source[i], match: marks[i] });
    }
    return parts;
  }

  /** 'YYYY-MM-DD HH:MM:SS' → 'YY-MM-DD HH:MM' (예: 26-09-16 11:01) */
  function formatDateTime(text) {
    const m = String(text || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : '';
  }

  /** 만원 단위 숫자 → "1억 3,200만원" (억과 만 단위 사이 한 칸) */
  function formatManwon(man) {
    if (man === null || man === undefined) return '';
    const eok = Math.floor(man / 10000);
    const rest = man % 10000;
    if (eok === 0) return `${rest.toLocaleString('ko-KR')}만원`;
    return rest === 0 ? `${eok.toLocaleString('ko-KR')}억원` : `${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만원`;
  }

  root.G2bSearch = {
    emptyCriteria, toHash, fromHash, viewFromHash, datesInRange, matches, sortItems, suggest, highlight,
    formatDateTime, formatManwon, toNumberOrNull,
  };
})(typeof window !== 'undefined' ? window : globalThis);
