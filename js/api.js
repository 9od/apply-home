/**
 * api.js — 청약홈 ApplyhomeInfoDetailSvc
 * Base: https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1
 *
 * ✅ Swagger 확인된 cond 형식:
 *    cond[HSSPLY_ADRES::LIKE]=수지
 *    cond[RCRIT_PBLANC_DE::GTE]=2025-01-01
 *    (JSON 객체가 아닌 개별 쿼리 파라미터 방식)
 */

const BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';

/**
 * 날짜 문자열 YYYY-MM-DD 반환
 */
function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * 공통 API 호출 함수
 * @param {string} endpoint
 * @param {URLSearchParams} qs  — serviceKey, page, perPage, cond[] 포함
 * @returns {Promise<{data: object[], totalCount: number}>}
 */
async function call(endpoint, qs) {
  const url = `${BASE}${endpoint}?${qs.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }

  const json = await res.json();

  // 에러 응답 처리
  if (json.result?.code && json.result.code !== 'OK') {
    throw new Error(`API 오류 [${json.result.code}]: ${json.result.message}`);
  }
  if (json.resultCode && json.resultCode !== '00') {
    throw new Error(`API 오류 [${json.resultCode}]: ${json.resultMessage}`);
  }

  return {
    data: json.data ?? [],
    totalCount: json.totalCount ?? 0,
    matchCount: json.matchCount ?? 0,
  };
}

/**
 * 여러 페이지를 자동으로 순회하며 전체 데이터 수집
 */
async function fetchAll(endpoint, baseConds, apiKey, maxPages = 10) {
  const results = [];

  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({
      page,
      perPage: 100,
      serviceKey: apiKey,
      ...baseConds,
    });

    const { data, totalCount } = await call(endpoint, qs);
    results.push(...data);

    // 더 이상 데이터 없으면 종료
    if (data.length < 100 || results.length >= totalCount) break;
  }

  return results;
}

/**
 * 지역별 APT 분양정보 조회
 * - cond[HSSPLY_ADRES::LIKE] = 지역명
 * - cond[RCRIT_PBLANC_DE::GTE] = 시작일
 * - cond[RCRIT_PBLANC_DE::LTE] = 종료일
 *
 * 반환 주요 필드:
 *   HOUSE_NM, HSSPLY_ADRES, SUBSCRPT_AREA_CODE_NM
 *   RCRIT_PBLANC_DE (모집공고일)
 *   RCEPT_BGNDE (청약접수 시작), RCEPT_ENDDE (청약접수 종료)
 *   PRZWIN_BGNDE (당첨자 발표)
 *   TOT_SUPLY_HSHLDCO (총 공급세대수)
 *   HMPG_ADRES (홈페이지)
 *   BSNS_MBY_NM (사업주체명)
 *   MVMN_PREARNGE_YM (입주예정월 YYYYMM)
 */
export async function fetchAPTByRegion(apiKey, region, monthsBack = 1, monthsFwd = 4) {
  const from = isoDate(addMonths(new Date(), -monthsBack));
  const to   = isoDate(addMonths(new Date(), monthsFwd));

  return fetchAll('/getAPTLttotPblancDetail', {
    'cond[HSSPLY_ADRES::LIKE]': region,
    'cond[RCRIT_PBLANC_DE::GTE]': from,
    'cond[RCRIT_PBLANC_DE::LTE]': to,
  }, apiKey);
}

/**
 * 서울 전체 APT 분양정보 조회
 * - 공급지역명으로 필터: cond[SUBSCRPT_AREA_CODE_NM::EQ]=서울
 */
export async function fetchAPTSeoul(apiKey, monthsBack = 1, monthsFwd = 4) {
  const from = isoDate(addMonths(new Date(), -monthsBack));
  const to   = isoDate(addMonths(new Date(), monthsFwd));

  return fetchAll('/getAPTLttotPblancDetail', {
    'cond[SUBSCRPT_AREA_CODE_NM::EQ]': '서울',
    'cond[RCRIT_PBLANC_DE::GTE]': from,
    'cond[RCRIT_PBLANC_DE::LTE]': to,
  }, apiKey);
}

/**
 * 지역별 APT 잔여세대·무순위 분양정보 조회
 * - HOUSE_SECD: 04=무순위, 06=불법행위재공급
 *
 * 반환 주요 필드:
 *   HOUSE_NM, HSSPLY_ADRES
 *   RCRIT_PBLANC_DE (모집공고일)
 *   RCEPT_BGNDE, RCEPT_ENDDE
 *   HOUSE_SECD_NM (주택구분명)
 *   TOT_SUPLY_HSHLDCO
 */
export async function fetchRemndrByRegion(apiKey, region, monthsBack = 1, monthsFwd = 4) {
  const from = isoDate(addMonths(new Date(), -monthsBack));
  const to   = isoDate(addMonths(new Date(), monthsFwd));

  return fetchAll('/getRemndrLttotPblancDetail', {
    'cond[HSSPLY_ADRES::LIKE]': region,
    'cond[RCRIT_PBLANC_DE::GTE]': from,
    'cond[RCRIT_PBLANC_DE::LTE]': to,
  }, apiKey);
}

export async function fetchRemndrSeoul(apiKey, monthsBack = 1, monthsFwd = 4) {
  const from = isoDate(addMonths(new Date(), -monthsBack));
  const to   = isoDate(addMonths(new Date(), monthsFwd));

  return fetchAll('/getRemndrLttotPblancDetail', {
    'cond[SUBSCRPT_AREA_CODE_NM::EQ]': '서울',
    'cond[RCRIT_PBLANC_DE::GTE]': from,
    'cond[RCRIT_PBLANC_DE::LTE]': to,
  }, apiKey);
}

/**
 * APT 분양 주택형별 상세 (84㎡ 정보 포함)
 * - cond[PBLANC_NO::EQ] 로 특정 공고 조회
 *
 * 반환 주요 필드:
 *   PBLANC_NO, HOUSE_MANAGE_NO
 *   HOUSE_TY (주택형: "84A", "84B" 등)
 *   SUPLY_AR (공급면적)
 *   LTTOT_TOP_AMOUNT (분양가상한 만원)
 *   SUPLY_HSHLDCO (공급세대수)
 *   GNRL_SUPLY_HSHLDCO (일반공급세대수)
 */
export async function fetchAPTTypes(apiKey, pblancNo) {
  const qs = new URLSearchParams({
    page: 1,
    perPage: 50,
    serviceKey: apiKey,
    'cond[PBLANC_NO::EQ]': pblancNo,
  });
  const { data } = await call('/getAPTLttotPblancMdl', qs);
  return data;
}

export async function fetchRemndrTypes(apiKey, pblancNo) {
  const qs = new URLSearchParams({
    page: 1,
    perPage: 50,
    serviceKey: apiKey,
    'cond[PBLANC_NO::EQ]': pblancNo,
  });
  const { data } = await call('/getRemndrLttotPblancMdl', qs);
  return data;
}
