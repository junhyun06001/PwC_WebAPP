# 시연 영상 자동 녹화

앱 시연 과정을 휴대폰 화면(780×1688, 세로)으로 자동 녹화한다. 자막·터치 표시 포함, 약 54초.

## 실행

Chrome이 설치된 PC에서 이 폴더로 이동한 뒤:

```bash
npm install
npm approve-scripts ffmpeg-static
npm rebuild ffmpeg-static
npx playwright install ffmpeg
npm run record
```

배포본으로 녹화하려면 `npm run record -- --url https://pwc-webapp.vercel.app`

## 결과 (`output/`, 저장소에는 올라가지 않음)

| 파일 | 용도 |
| --- | --- |
| `am_i_over_demo.mp4` | 유튜브 등 링크 제출, PPT 삽입 |
| `am_i_over_demo.mkv` | 파일 업로드 제출 (허용 형식에 MP4가 없어 MKV로 함께 만듦, 30MB 이하로 자동 조정) |
| `sample_screentime.png` | 영상에서 올린 가짜 스크린타임 캡처 |

## 영상 흐름

1. 만 나이 입력 → 또래 그룹 자동 분류 (29세 → 20대)
2. 스크린타임 캡처 업로드 → 6시간 10분 자동 인식
3. STEP 2 결과: 20대 평균 대비 2시간 53분 초과, 188%, 😫
4. STEP 3: 하루 2시간 53분 · 1년 1,052시간, 오늘 연수 20대 평균
5. 두 번째 예: 45세 · 1시간 50분 직접 입력 → 😄, 30분 더 줄이기 제안
6. 배포 주소 안내

- 캡처 이미지는 실제 기기 화면이 아닌 가짜 샘플이다.
- 참가자 평균은 `data/` 샘플 데이터 값(20대 5명 평균 3시간 45분)으로 보여주며, 실제 집계 저장소에는 아무것도 보내지 않는다.
- 문구·속도는 `record.js`의 `caption()`·`sleep()`에서 바꾼다.
