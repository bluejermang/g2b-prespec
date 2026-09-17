// 목록 검색조건·정렬·D-day: 브라우저(app.js)와 테스트에서 함께 쓴다.
(function (root) {
  const BID = ['all', 'yes', 'no'];
  const RFP = ['all', 'yes', 'no'];
  const SORTS = ['default', 'budget', 'deadline'];
  /** 마감 임박: 오늘 포함 이 일수 안에 의견등록이 마감되는 공고 */
  const SOON_DAYS = 3;

  /** 빈 검색조건. 기간(from/to)은 목록 날짜 문자열, 예산은 만원 단위. */
  function emptyCriteria(latestDate) {
    return {
      from: latestDate || '', to: latestDate || '', q: '', types: [], budgetMin: null, budgetMax: null,
      bid: 'all', rfp: 'all', deadline: 'all', sort: 'default',
    };
  }

  function toNumberOrNull(value) {
    const cleaned = String(value ?? '').replace(/[,\s]/g, '');
    return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
  }

  /** 검색조건을 주소(#…)에 담는다. 링크를 공유하면 같은 화면이 열린다. */
  function toHash(c) {
    const params = new URLSearchParams();
    params.set('from', c.from);
    params.set('to', c.to);
    if (c.q) params.set('q', c.q);
    if (c.types.length) params.set('types', c.types.join(','));
    if (c.budgetMin !== null) params.set('min', String(c.budgetMin));
    if (c.budgetMax !== null) params.set('max', String(c.budgetMax));
    if (c.bid !== 'all') params.set('bid', c.bid);
    if (c.rfp !== 'all') params.set('rfp', c.rfp);
    if (c.deadline !== 'all') params.set('dl', c.deadline);
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
    if (RFP.includes(params.get('rfp'))) c.rfp = params.get('rfp');
    if (params.get('dl') === 'soon') c.deadline = 'soon';
    if (SORTS.includes(params.get('sort'))) c.sort = params.get('sort');
    return c;
  }

  /** 기간 안의 목록 날짜 (최근 순) */
  function datesInRange(c, availableDates) {
    return availableDates.filter((d) => d >= c.from && d <= c.to);
  }

  /**
   * 의견등록 마감까지 남은 일수. 오늘 마감이면 0, 지났으면 음수, 마감일이 없으면 null.
   * @param {string} deadline 'YYYY-MM-DD HH:MM:SS'
   * @param {string} today 'YYYY-MM-DD'
   */
  function dDay(deadline, today) {
    const m = String(deadline || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const t = String(today || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m || !t) return null;
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+t[1], +t[2] - 1, +t[3])) / 86400000);
  }

  function isDeadlineSoon(item, today) {
    const d = dDay(item.opinionDeadline, today);
    return d !== null && d >= 0 && d <= SOON_DAYS;
  }

  /** 제안요청서를 못 찾았거나 첨부가 5개 꽉 차 직접 확인해야 하는 공고 */
  function needsCheck(item) {
    return !item.rfpFound || /추가 확인/.test(item.attachmentStatus || '');
  }

  /**
   * 한 건이 검색조건에 맞는지.
   * 검색어는 띄어쓰기로 나눈 단어가 모두 사업명 또는 수요기관명에 들어 있어야 한다. (영문 대소문자 무시)
   */
  function matches(item, c, today) {
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
    if (c.rfp === 'yes' && needsCheck(item)) return false;
    if (c.rfp === 'no' && !needsCheck(item)) return false;
    if (c.deadline === 'soon' && !isDeadlineSoon(item, today)) return false;
    return true;
  }

  /** 정렬: default = 목록 날짜 최신 → 번호순, budget = 예산 높은 순, deadline = 의견마감 임박 순(지난 건은 뒤로) */
  function sortItems(items, sort, today) {
    const byDefault = (a, b) => b.listDate.localeCompare(a.listDate) || a.seqNo - b.seqNo;
    const copy = [...items];
    if (sort === 'budget') return copy.sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1) || byDefault(a, b));
    if (sort === 'deadline') {
      const key = (item) => {
        const d = dDay(item.opinionDeadline, today);
        return d === null ? 1e9 : d < 0 ? 1e8 - d : d;
      };
      return copy.sort((a, b) => key(a) - key(b) || byDefault(a, b));
    }
    return copy.sort(byDefault);
  }

  /** 만원 단위 숫자 → "1억3,200만원" */
  function formatManwon(man) {
    if (man === null || man === undefined) return '';
    const eok = Math.floor(man / 10000);
    const rest = man % 10000;
    if (eok === 0) return `${rest.toLocaleString('ko-KR')}만원`;
    return rest === 0 ? `${eok.toLocaleString('ko-KR')}억원` : `${eok.toLocaleString('ko-KR')}억${rest.toLocaleString('ko-KR')}만원`;
  }

  root.G2bSearch = {
    SOON_DAYS, emptyCriteria, toHash, fromHash, datesInRange, dDay, isDeadlineSoon, needsCheck, matches, sortItems,
    formatManwon, toNumberOrNull,
  };
})(typeof window !== 'undefined' ? window : globalThis);
