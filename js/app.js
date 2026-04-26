/**
 * app.js — 청약 모니터 메인 앱
 *
 * API 필드명 (Swagger 확인):
 *   HOUSE_NM          주택명
 *   HSSPLY_ADRES      공급위치(주소)
 *   SUBSCRPT_AREA_CODE_NM  공급지역명 (예: 경기, 서울)
 *   RCRIT_PBLANC_DE   모집공고일 YYYY-MM-DD
 *   RCEPT_BGNDE       청약접수 시작일 YYYY-MM-DD
 *   RCEPT_ENDDE       청약접수 종료일 YYYY-MM-DD
 *   PRZWIN_BGNDE      당첨자발표 시작일
 *   TOT_SUPLY_HSHLDCO 총 공급세대수
 *   BSNS_MBY_NM       사업주체명(시공사)
 *   MVMN_PREARNGE_YM  입주예정 YYYYMM
 *   HMPG_ADRES        청약홈 공고 URL
 *   PBLANC_NO         공고번호 (형별 상세 조회용)
 *   HOUSE_SECD_NM     주택구분명 (잔여세대용)
 */

import {
  fetchAPTByRegion,
  fetchAPTSeoul,
  fetchRemndrByRegion,
  fetchRemndrSeoul,
  fetchAPTTypes,
  fetchRemndrTypes,
} from './api.js';

// ── 상태 ──────────────────────────────────────────────────────────────
let CFG       = {};
let aptItems  = [];
let remItems  = [];
let activeTab = 'apt';
let fRegion   = 'all';
let fStatus   = 'all';

// 84㎡ 타입 캐시: pblancNo → [{HOUSE_TY, SUPLY_AR, LTTOT_TOP_AMOUNT}]
const typeCache = new Map();
// 잔여세대 타입 캐시: pblancNo → [{HOUSE_TY, SUPLY_AR, REMN_HSHLDCO, ...}]
const remndrTypeCache = new Map();

// ── 초기화 ────────────────────────────────────────────────────────────
async function init() {
  try {
    const r = await fetch('./config.json');
    if (!r.ok) throw new Error('config.json not found');
    CFG = await r.json();
  } catch (e) {
    showError('⚠ config.json 로드 실패. 파일이 프로젝트 루트에 있는지 확인하세요.');
    return;
  }

  if (!CFG.API_KEY || CFG.API_KEY.includes('여기에')) {
    showError('⚠ config.json 에 API_KEY를 입력해주세요. README 참고.');
    return;
  }

  bindUI();
  setDateLabel();
  await loadAll();
}

// ── 데이터 로드 ───────────────────────────────────────────────────────
async function loadAll() {
  setLoading(true);
  clearError();

  const btn = q('#btnRefresh');
  btn.disabled = true;
  btn.textContent = '조회 중…';

  const mb = CFG.SEARCH_MONTHS_BACK    ?? 1;
  const mf = CFG.SEARCH_MONTHS_FORWARD ?? 4;
  const regions = CFG.REGIONS ?? [];
  const withSeoul = CFG.SEOUL ?? false;

  try {
    // 모든 지역 병렬 조회
    const aptPromises  = regions.map(r => fetchAPTByRegion(CFG.API_KEY, r, mb, mf));
    const remPromises  = regions.map(r => fetchRemndrByRegion(CFG.API_KEY, r, mb, mf));
    if (withSeoul) {
      aptPromises.push(fetchAPTSeoul(CFG.API_KEY, mb, mf));
      remPromises.push(fetchRemndrSeoul(CFG.API_KEY, mb, mf));
    }

    const [aptResults, remResults] = await Promise.all([
      Promise.all(aptPromises),
      Promise.all(remPromises),
    ]);

    // 중복 제거 (PBLANC_NO 기준)
    aptItems = dedup(aptResults.flat(), 'PBLANC_NO');
    remItems = dedup(remResults.flat(), 'PBLANC_NO');

    // 84㎡ 타입 정보 로드
    await loadTypeInfo(aptItems);
    await loadRemndrTypeInfo(remItems);

    updateStats();
    updateTabCounts();
    renderActive();

    q('#lastUpdated').textContent =
      new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 업데이트';

  } catch (e) {
    console.error(e);
    showError(`데이터 조회 실패: ${e.message}`);
  }

  btn.disabled = false;
  btn.textContent = '↻ 새로고침';
  setLoading(false);
}

/** 84㎡ 근방 주택형 정보 병렬 로드 */
async function loadTypeInfo(items) {
  const targets = items
    .filter(i => i.PBLANC_NO && !typeCache.has(i.PBLANC_NO))
    .slice(0, 50);

  await Promise.allSettled(
    targets.map(async item => {
      try {
        const types = await fetchAPTTypes(CFG.API_KEY, item.PBLANC_NO);
        typeCache.set(item.PBLANC_NO, types);
      } catch (_) {
        typeCache.set(item.PBLANC_NO, []);
      }
    })
  );
}

/** 잔여세대 주택형별 정보 로드 */
async function loadRemndrTypeInfo(items) {
  const targets = items
    .filter(i => i.PBLANC_NO && !remndrTypeCache.has(i.PBLANC_NO))
    .slice(0, 50);

  await Promise.allSettled(
    targets.map(async item => {
      try {
        const types = await fetchRemndrTypes(CFG.API_KEY, item.PBLANC_NO);
        remndrTypeCache.set(item.PBLANC_NO, types);
      } catch (_) {
        remndrTypeCache.set(item.PBLANC_NO, []);
      }
    })
  );
}

/** 잔여세대 84㎡ 이상 세대수 합산 */
function getRemndr84Units(pblancNo) {
  const types = remndrTypeCache.get(pblancNo) ?? [];
  // 84㎡ 이상 타입 필터 후 잔여세대수 합산
  // 필드: SUPLY_AR(공급면적), REMN_HSHLDCO(잔여세대수), SPSPLY_HSHLDCO(특별공급세대수)
  return types
    .filter(t => parseFloat(t.SUPLY_AR ?? '0') >= 84)
    .reduce((sum, t) => {
      const remn = parseInt(t.REMN_HSHLDCO ?? t.SUPLY_HSHLDCO ?? '0');
      return sum + remn;
    }, 0);
}

/** 84㎡ 주택형 필터링 */
function get84Types(pblancNo) {
  const types = typeCache.get(pblancNo) ?? [];
  return types.filter(t => {
    const ar = parseFloat(t.SUPLY_AR ?? '0');
    return ar >= 80 && ar <= 90; // 84㎡ 전후
  });
}

// ── 중복 제거 ─────────────────────────────────────────────────────────
function dedup(arr, key) {
  const seen = new Set();
  return arr.filter(item => {
    const k = item[key];
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── 상태 판별 ─────────────────────────────────────────────────────────
/**
 * open     : 청약 접수 중
 * soon     : 14일 이내 청약 시작
 * announce : 공고됨 (청약 시작 14일 이상 남음)
 * end      : 종료
 */
function getStatus(item) {
  const today = todayNum();
  const start = dateNum(item.RCEPT_BGNDE);
  const end   = dateNum(item.RCEPT_ENDDE);
  const notc  = dateNum(item.RCRIT_PBLANC_DE);

  if (start && end) {
    if (today >= start && today <= end) return 'open';
    if (today < start) {
      const diff = Math.ceil((new Date(item.RCEPT_BGNDE) - new Date()) / 86400000);
      return diff <= 14 ? 'soon' : 'announce';
    }
    return 'end';
  }
  // 접수일 미정인 경우 공고일 기준
  if (notc) return today <= notc ? 'announce' : 'end';
  return 'end';
}

function todayNum() {
  return parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
}
function dateNum(str) {
  if (!str) return 0;
  return parseInt(str.replace(/-/g, ''));
}
function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}
function fmtYM(ym) {
  // YYYYMM → YYYY년 MM월
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(0,4)}년 ${parseInt(ym.slice(4,6))}월`;
}

/** 만원 단위 → 0.0억 표시 (예: 75000 → 7.5억, 80000 → 8.0억) */
function fmtEok(manwon) {
  const n = parseInt(manwon || '0');
  if (n <= 0) return null;
  const eok = n / 10000;
  return `${eok.toFixed(1)}억`;
}

// ── 통계 ──────────────────────────────────────────────────────────────
function updateStats() {
  const aptOpen  = aptItems.filter(i => getStatus(i) === 'open').length;
  const aptSoon  = aptItems.filter(i => getStatus(i) === 'soon').length;
  const remOpen  = remItems.filter(i => getStatus(i) === 'open').length;
  const remSoon  = remItems.filter(i => getStatus(i) === 'soon').length;

  setTxt('statOpen',   aptOpen);
  setTxt('statSoon',   aptSoon);
  setTxt('statRem',    remOpen + remSoon);
  setTxt('statTotal',  aptItems.length + remItems.length);
}

function updateTabCounts() {
  setTxt('cntApt', aptItems.length);
  setTxt('cntRem', remItems.length);
}

// ── 렌더링 ────────────────────────────────────────────────────────────
function renderActive() {
  activeTab === 'apt' ? renderList(aptItems) : renderList(remItems);
}

function applyFilters(items) {
  let out = [...items];

  if (fRegion !== 'all') {
    out = out.filter(item => {
      const addr = (item.HSSPLY_ADRES ?? '') + (item.SUBSCRPT_AREA_CODE_NM ?? '');
      if (fRegion === '서울') {
        return (item.SUBSCRPT_AREA_CODE_NM ?? '').includes('서울') || addr.includes('서울');
      }
      return addr.includes(fRegion);
    });
  }

  if (fStatus !== 'all') {
    out = out.filter(i => getStatus(i) === fStatus);
  }

  return out;
}

function sortList(items) {
  const order = { open: 0, soon: 1, announce: 2, end: 3 };
  return [...items].sort((a, b) => {
    const da = order[getStatus(a)];
    const db = order[getStatus(b)];
    if (da !== db) return da - db;
    return (a.RCEPT_BGNDE ?? '').localeCompare(b.RCEPT_BGNDE ?? '');
  });
}

function renderList(rawItems) {
  const items = sortList(applyFilters(rawItems));
  const list  = q('#cardList');

  setTxt('cntBadge', `총 ${items.length}건`);

  if (items.length === 0) {
    list.innerHTML = `<div class="empty">해당 조건의 청약 정보가 없습니다.<br><small>필터를 변경하거나 새로고침해 보세요.</small></div>`;
    return;
  }

  list.innerHTML = items.map(item => buildCard(item)).join('');
}

function buildCard(item) {
  const status = getStatus(item);
  const isRem  = activeTab === 'remndr';

  const STATUS_LABEL = { open: '청약 진행 중', soon: '곧 시작', announce: '공고', end: '종료' };
  const STATUS_CLS   = { open: 'b-open',       soon: 'b-soon',  announce: 'b-announce', end: 'b-end' };
  const CARD_CLS     = { open: 'is-open',       soon: 'is-soon', announce: '', end: '' };

  const cardCls = isRem ? 'is-rem' : (CARD_CLS[status] ?? '');

  // 84㎡ 타입 정보
  const types84 = get84Types(item.PBLANC_NO ?? '');
  let type84Html = '';
  if (types84.length > 0) {
    // 가격 있는 타입만 추출, 없으면 타입명만
    const prices = types84
      .map(t => parseInt(t.LTTOT_TOP_AMOUNT ?? '0'))
      .filter(p => p > 0);

    let priceStr;
    if (prices.length > 0) {
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const minEok = fmtEok(minP);
      const maxEok = fmtEok(maxP);
      // 최소=최대면 단일 표시, 다르면 범위 표시
      priceStr = minP === maxP ? minEok : `${minEok} ~ ${maxEok}`;
    } else {
      priceStr = types84.map(t => t.HOUSE_TY).join(', ');
    }
    type84Html = `<span class="meta price">84㎡ <b>${esc(priceStr)}</b></span>`;
  }

  // 청약 일정
  const dateHtml = item.RCEPT_BGNDE
    ? `<span class="meta">청약 <b>${fmtDate(item.RCEPT_BGNDE)} ~ ${fmtDate(item.RCEPT_ENDDE)}</b></span>`
    : item.RCRIT_PBLANC_DE
      ? `<span class="meta">공고 <b>${fmtDate(item.RCRIT_PBLANC_DE)}</b></span>`
      : '';

  // 당첨자 발표
  const przHtml = item.PRZWIN_BGNDE
    ? `<span class="meta">당첨발표 <b>${fmtDate(item.PRZWIN_BGNDE)}</b></span>` : '';

  // 공급세대
  const units = parseInt(item.TOT_SUPLY_HSHLDCO ?? '0');
  const unitsHtml = units > 0
    ? `<span class="meta">공급 <b>${units.toLocaleString()}세대</b></span>` : '';

  // 입주예정
  const mvnHtml = item.MVMN_PREARNGE_YM
    ? `<span class="meta">입주 <b>${fmtYM(item.MVMN_PREARNGE_YM)}</b></span>` : '';

  // 사업주체
  const bldHtml = item.BSNS_MBY_NM
    ? `<span class="meta">시공 <b>${esc(item.BSNS_MBY_NM)}</b></span>` : '';

  // 잔여세대 84㎡ 이상 남은 세대수
  let remndr84Html = '';
  if (isRem) {
    const units84 = getRemndr84Units(item.PBLANC_NO ?? '');
    if (units84 > 0) {
      remndr84Html = `<span class="meta remn84">84㎡↑ 잔여 <b style="color:var(--pur)">${units84}세대</b></span>`;
    } else if (remndrTypeCache.has(item.PBLANC_NO)) {
      // 조회는 됐는데 84㎡ 이상 없음
      remndr84Html = `<span class="meta" style="color:var(--tx3)">84㎡↑ 잔여 없음</span>`;
    }
  }

  // 잔여세대 구분
  const remTypHtml = isRem && item.HOUSE_SECD_NM
    ? `<span class="badge b-rem" style="margin-right:4px;">${esc(item.HOUSE_SECD_NM)}</span>` : '';

  // 지역 뱃지
  const areaHtml = item.SUBSCRPT_AREA_CODE_NM
    ? `<span class="meta area"><b>${esc(item.SUBSCRPT_AREA_CODE_NM)}</b></span>` : '';

  // 카카오맵
  const mapQ = encodeURIComponent(item.HSSPLY_ADRES || item.HOUSE_NM || '');
  const kakaoUrl = `https://map.kakao.com/?q=${mapQ}`;

  // 청약홈 공고 링크
  const hmpg = item.HMPG_ADRES || 'https://www.applyhome.co.kr';
  const linkHtml = `<a href="${esc(hmpg)}" target="_blank" rel="noopener" class="map-btn" style="margin-bottom:4px;">
    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 2H10V.5a.5.5 0 00-1 0V2H7V.5a.5.5 0 00-1 0V2H2.5A1.5 1.5 0 001 3.5v10A1.5 1.5 0 002.5 15h11a1.5 1.5 0 001.5-1.5v-10A1.5 1.5 0 0013.5 2zM14 13.5a.5.5 0 01-.5.5h-11a.5.5 0 01-.5-.5v-8h12v8z"/></svg>
    공고
  </a>`;

  return `
<div class="apt-card ${cardCls}">
  <div class="card-body">
    <div class="card-name">${esc(item.HOUSE_NM || item.BSNS_MBY_NM || '단지명 없음')}</div>
    <div class="card-addr">${esc(item.HSSPLY_ADRES || '주소 정보 없음')}</div>
    <div class="card-meta">
      ${areaHtml}
      ${dateHtml}
      ${przHtml}
      ${type84Html}
      ${remndr84Html}
      ${unitsHtml}
      ${mvnHtml}
      ${bldHtml}
    </div>
  </div>
  <div class="card-right">
    ${remTypHtml}
    <span class="badge ${STATUS_CLS[status]}">${STATUS_LABEL[status]}</span>
    ${linkHtml}
    <a href="${kakaoUrl}" target="_blank" rel="noopener" class="map-btn">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1C5.24 1 3 3.18 3 5.87 3 9.85 8 15 8 15s5-5.15 5-9.13C13 3.18 10.76 1 8 1zm0 6.5a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z"/></svg>
      지도
    </a>
  </div>
</div>`;
}

// ── UI 바인딩 ─────────────────────────────────────────────────────────
function bindUI() {
  // 탭
  qAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderActive();
    });
  });

  // 지역 필터
  q('#chipsRegion').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    qAll('#chipsRegion .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    fRegion = chip.dataset.v;
    renderActive();
  });

  // 상태 필터
  q('#chipsStatus').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    qAll('#chipsStatus .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    fStatus = chip.dataset.v;
    renderActive();
  });

  // 새로고침
  q('#btnRefresh').addEventListener('click', loadAll);
}

// ── 유틸 ──────────────────────────────────────────────────────────────
const q    = s => document.querySelector(s);
const qAll = s => document.querySelectorAll(s);

function setTxt(id, val) {
  const el = q(`#${id}`);
  if (el) el.textContent = val;
}

function esc(str) {
  return (str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setDateLabel() {
  q('#lastUpdated').textContent = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
}

function showError(msg) {
  const el = q('#errBanner');
  el.textContent = msg;
  el.classList.add('show');
}

function clearError() {
  q('#errBanner').classList.remove('show');
}

function setLoading(on) {
  q('#skeleton').style.display = on ? 'flex' : 'none';
  q('#cardList').style.display  = on ? 'none'  : 'flex';
}

// ── 진입 ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
