# Am I Over?

2026 PwC 신규입사자 Pre-boarding 프로그램 조별 웹앱입니다.
내 하루 평균 스마트폰 사용시간을 또래 평균과 비교하고(자각), 줄였을 때 되찾는 시간을 보여줍니다(행동).

**배포 주소**: https://pwc-webapp.vercel.app

## 구성

```
PwC_WebAPP/
├── index.html          # 앱 전체 (HTML/CSS/JS 단일 파일)
├── vendor/ocr/         # 스크린타임 캡처 글자 인식(Tesseract.js) — 브라우저 안에서만 처리, 서버 전송 없음
│   └── lang/kor.traineddata.gz   # 한국어 인식 데이터 (.b64.txt는 Claude Artifact용 같은 데이터)
├── api/
│   ├── submit.js       # POST 참가자 익명 제출 (브라우저 id 기준 1회 집계)
│   ├── stats.js        # GET 연령대별 참가자 평균 (CDN 5초 캐시)
│   └── _store.js       # Upstash Redis 저장소 (경로로 노출되지 않음)
└── vercel.json         # 서버 함수 리전: 서울(icn1)
```

연령대 평균 기준: KISDI STAT Report 「스마트폰과 TV의 시간 점유율 경쟁」, 2023년 연령대별 하루 평균 스마트폰 이용시간(이용자 기준).

## 참가자 평균 집계 설정

`오늘 연수 ○○대 평균` 기능은 저장소가 필요합니다. Vercel 대시보드 → 프로젝트 → **Storage** → **Upstash for Redis**를 연결하면 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수가 자동으로 들어갑니다. 연결 후 재배포하면 동작합니다. 연결 전에는 화면에 "지금은 참가자 평균을 불러올 수 없어요"가 표시되고 나머지 기능은 정상 동작합니다.

수집 정보는 연령대와 사용시간뿐이며, 같은 연령대 입력자가 5명 미만이면 평균을 공개하지 않습니다.

## 배포

GitHub `main` 브랜치에 push하면 Vercel이 자동으로 재배포합니다.

## 협업

저장소 Settings → Collaborators에서 조원을 초대합니다. API 키 등 비밀값은 저장소에 올리지 않습니다.
