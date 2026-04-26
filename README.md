# 청약 모니터 🏠

> **수지·분당·광교·판교·위례·하남·서울** APT 청약 정보 실시간 대시보드  
> 청약홈 공식 API (한국부동산원 `ApplyhomeInfoDetailSvc`) 사용  
> GitHub Pages 정적 배포 — 서버 불필요

---

## 📁 폴더 구조

```
sub-monitor/
├── index.html                   ← 메인 페이지
├── config.json                  ← API 키 설정 (방법 A용)
├── .gitignore
├── css/
│   └── style.css
├── js/
│   ├── api.js                   ← 청약홈 API 호출 모듈
│   └── app.js                   ← 필터·렌더링 로직
├── .github/
│   └── workflows/
│       └── deploy.yml           ← 자동 배포 (방법 B용)
└── README.md
```

---

## 🔑 API 키 설정 — 두 가지 방법

### ✅ 방법 A — config.json 직접 입력 (빠르고 간단)

`config.json` 파일이 이미 API 키와 함께 준비되어 있습니다.  
파일을 그대로 GitHub에 올리면 바로 작동합니다.

```json
{
  "API_KEY": "여기에_Decoding_키_입력",
  "REGIONS": ["수지", "분당", "광교", "판교", "위례", "하남"],
  "SEOUL": true,
  "SEARCH_MONTHS_BACK": 1,
  "SEARCH_MONTHS_FORWARD": 4
}
```

> ⚠️ Public 저장소에 올리면 API 키가 공개됩니다.  
> 개인 모니터링 용도라면 문제없으나 키 노출이 신경 쓰이면 방법 B 사용.

---

### 🔒 방법 B — GitHub Secret 사용 (키 보안 유지)

**1단계: Secret 등록**
```
저장소 → Settings → Secrets and variables → Actions
→ New repository secret
  Name:  APPLYHOME_API_KEY
  Value: (Decoding 키 붙여넣기)
→ Add secret
```

**2단계: .gitignore에서 config.json 제외 (선택)**  
`.gitignore` 파일에서 `# config.json` 앞의 `#` 을 삭제하면  
config.json 이 git에서 제외됩니다.

**3단계: GitHub Pages 소스를 `gh-pages` 브랜치로 설정**
```
저장소 → Settings → Pages
→ Source: Deploy from a branch
→ Branch: gh-pages / (root)
→ Save
```

**4단계: main 브랜치에 push**  
→ Actions가 자동 실행되어 config.json 생성 후 gh-pages에 배포

이후 **매일 오전 7시(KST)** 자동 재배포됩니다.

---

## 🚀 GitHub Pages 배포 (방법 A 기준)

```
1. GitHub → New repository (Public)
2. 이 폴더 전체 파일 업로드 (Add file → Upload)
3. Settings → Pages → Branch: main / (root) → Save
4. 1~2분 후:
   https://[내아이디].github.io/[저장소명]/
```

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| **APT 분양 탭** | 청약 일정, 84㎡ 분양가, 공급세대, 당첨발표, 입주예정 |
| **무순위·잔여세대 탭** | 무순위/잔여세대 별도 탭으로 표시 |
| **84㎡ 분양가** | 주택형별 API 연동, 80~90㎡ 타입 자동 필터 |
| **지역 필터** | 수지/분당/광교/판교/위례/하남/서울 |
| **상태 필터** | 진행 중 / 임박(14일) / 예정 / 종료 |
| **공고 링크** | 청약홈 공고 페이지 직접 연결 |
| **지도 보기** | 카카오맵에서 단지 위치 즉시 확인 |
| **자동 정렬** | 진행 중 → 임박 → 예정 → 종료 순 |

---

## 📡 사용 API

- **Base URL:** `https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1`
- `GET /getAPTLttotPblancDetail` — APT 분양정보 상세
- `GET /getAPTLttotPblancMdl` — APT 분양 주택형별 상세 (84㎡ 분양가)
- `GET /getRemndrLttotPblancDetail` — 무순위·잔여세대 상세
- **출처:** 한국부동산원 청약홈 / 공공데이터포털

---

## ⚙️ config.json 옵션

| 키 | 설명 | 예시 |
|----|------|------|
| `API_KEY` | 공공데이터포털 Decoding 인증키 | (필수) |
| `REGIONS` | 조회할 주소 키워드 배열 | `["수지", "분당"]` |
| `SEOUL` | 서울 전체 포함 여부 | `true` / `false` |
| `SEARCH_MONTHS_BACK` | 오늘 기준 몇 개월 전까지 | `1` |
| `SEARCH_MONTHS_FORWARD` | 오늘 기준 몇 개월 후까지 | `4` |
