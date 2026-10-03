// Am I Over? 시연 영상 자동 녹화
//   npm install  →  npm run record            (저장소 파일을 로컬에서 띄워 녹화)
//   npm run record -- --url https://pwc-webapp.vercel.app   (배포본으로 녹화)
// 결과: output/am_i_over_demo.mp4 (링크·PPT용), output/am_i_over_demo.mkv (파일 업로드용, 30MB 이하)
// 참가자 평균은 data/ 샘플 데이터로 대신 보여주고, 실제 집계 저장소에는 아무것도 보내지 않는다.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const ffmpeg = require("ffmpeg-static");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(__dirname, "output");
const VIEW = { width: 390, height: 844 };  // 휴대폰 화면 크기 (CSS px)
const ZOOM = 2;                             // 녹화는 2배 해상도(780x1688)로: 녹화기가 CSS px 해상도로만 찍어서 페이지를 확대해 녹화
const MAX_MB = 30;

const argUrl = (() => { const i = process.argv.indexOf("--url"); return i > 0 ? process.argv[i + 1] : null; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 저장소를 그대로 띄우는 정적 서버 (vercel 없이)
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".gz": "application/gzip", ".wasm": "application/wasm" };
function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// ── 참가자 평균: 샘플 데이터 기대값 (20대 5명, 평균 3시간 45분)
function sampleGroups() {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data/am_i_over_sample_data_30.json"), "utf8"));
  const groups = {};
  for (const [label, g] of Object.entries(d.expected_participant_group_results)) {
    const key = label.startsWith("70") ? "70" : label.slice(0, 2);
    groups[key] = { n: g.participant_count, avg: g.participant_average_minutes };
  }
  return groups;
}

// ── 업로드용 가짜 스크린타임 캡처 (실제 기기 화면 아님)
async function makeScreenshot(browser, file) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;background:#fff;color:#111;padding:56px 22px}
    h1{font-size:30px;margin:0 0 22px} .seg{display:flex;background:#eee;border-radius:9px;padding:3px;margin-bottom:26px}
    .seg b{flex:1;text-align:center;padding:7px;border-radius:7px;font-size:15px} .seg b.on{background:#fff}
    .k{font-size:17px;color:#666;margin:0} .v{font-size:40px;font-weight:700;margin:4px 0 26px}
    .bars{display:flex;align-items:flex-end;gap:12px;height:150px;border-bottom:1px solid #ccc;margin-bottom:28px}
    .bars i{flex:1;background:#3a82f7;border-radius:4px 4px 0 0}
    .row{display:flex;justify-content:space-between;font-size:17px;padding:14px 0;border-top:1px solid #eee}
  </style>
  <h1>스크린 타임</h1>
  <div class="seg"><b class="on">주</b><b>일</b></div>
  <p class="k">일일 평균</p><p class="v">6시간 10분</p>
  <div class="bars"><i style="height:62%"></i><i style="height:80%"></i><i style="height:55%"></i><i style="height:90%"></i><i style="height:70%"></i><i style="height:96%"></i><i style="height:75%"></i></div>
  <div class="row"><span>소셜 미디어</span><span>2시간 41분</span></div>
  <div class="row"><span>엔터테인먼트</span><span>1시간 52분</span></div>`);
  await page.screenshot({ path: file });
  await page.close();
}

// ── 화면 위 자막 · 터치 표시
async function installOverlay(page) {
  await page.evaluate((zoom) => {
    // 휴대폰 화면을 2배로 확대. 넓은 화면용(min-width:480px) 휴대폰 테두리 스타일은 모바일 값으로 되돌림
    const st = document.createElement("style");
    st.textContent = `html{zoom:${zoom}} .phone{border-radius:28px!important;box-shadow:0 0 0 1px #E4E6E9!important;padding:26px 18px 22px!important;margin-block:0!important}`;
    document.head.appendChild(st);
    const cap = document.createElement("div");
    cap.id = "__cap";
    cap.style.cssText = "position:fixed;left:12px;right:12px;bottom:16px;z-index:99999;background:rgba(35,38,43,.9);color:#fff;" +
      "font:700 15px/1.45 'Noto Sans KR','Malgun Gothic',sans-serif;padding:12px 16px;border-radius:14px;white-space:pre-line;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.25);transition:opacity .25s;opacity:0;pointer-events:none;text-align:center";
    document.body.appendChild(cap);
    window.__caption = (t) => { cap.style.opacity = t ? "1" : "0"; if (t) cap.textContent = t; };
    window.__tap = (x, y) => {  // x, y: 화면(녹화) 좌표
      x /= zoom; y /= zoom;
      const d = document.createElement("div");
      d.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;z-index:99998;` +
        "background:rgba(253,81,8,.35);border:2px solid rgba(253,81,8,.8);pointer-events:none;transition:transform .45s,opacity .45s";
      document.body.appendChild(d);
      requestAnimationFrame(() => { d.style.transform = "scale(1.6)"; d.style.opacity = "0"; });
      setTimeout(() => d.remove(), 600);
    };
  }, ZOOM);
}
const caption = (page, t) => page.evaluate((t) => window.__caption(t), t);
async function tap(page, sel) {
  const el = page.locator(sel);
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.evaluate(([x, y]) => window.__tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
  await sleep(350);
  await el.click();
}
const scrollTo = (page, y) => page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);
const scrollToEl = (page, sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: "smooth", block: "center" }), sel);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = argUrl ? null : await serve();
  const url = argUrl || `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  const shot = path.join(OUT, "sample_screentime.png");
  await makeScreenshot(browser, shot);

  const raw = path.join(OUT, "raw");
  fs.rmSync(raw, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: { width: VIEW.width * ZOOM, height: VIEW.height * ZOOM }, locale: "ko-KR",
    recordVideo: { dir: raw, size: { width: VIEW.width * ZOOM, height: VIEW.height * ZOOM } },
  });
  const groups = sampleGroups();
  await ctx.route("**/api/stats", (r) => r.fulfill({ json: { groups } }));
  await ctx.route("**/api/submit", (r) => r.fulfill({ json: { ok: true, groups } }));

  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await installOverlay(page);
  await sleep(600);

  // 인트로
  await caption(page, "Am I Over?\n내 스마트폰 사용시간, 또래보다 많을까?");
  await sleep(3500);

  // STEP 1. 입력
  await caption(page, "① 만 나이만 입력하면\n또래 그룹을 자동으로 찾아요");
  await tap(page, "#age");
  await page.locator("#age").pressSequentially("29", { delay: 300 });
  await sleep(2200);

  await caption(page, "② 스크린타임 캡처를 올리면\n사용시간을 자동으로 읽어요 (서버 전송 없음)");
  const sb = await page.locator("#shootBtn").boundingBox();
  await page.evaluate(([x, y]) => window.__tap(x, y), [sb.x + sb.width / 2, sb.y + sb.height / 2]);
  await page.setInputFiles("#shot", shot);
  try {
    await page.waitForFunction(() => /찾았어요/.test(document.getElementById("scanMsg").textContent), null, { timeout: 90000 });
  } catch {
    console.warn("자동 인식이 시간 안에 끝나지 않아 직접 입력으로 이어갑니다.");
    await caption(page, "② 직접 입력도 가능해요");
    await page.fill("#hh", "6"); await page.fill("#mm", "10");
  }
  await sleep(3000);

  await caption(page, "③ 로그인 없이 바로 결과 확인");
  await tap(page, "#go");
  await sleep(800);

  // STEP 2. 자각
  await caption(page, "또래 평균과 비교해\n차이 · 비율 · 사용수준을 한눈에");
  await sleep(3500);
  await scrollToEl(page, "#emoji");
  await sleep(3500);

  // STEP 3. 행동
  await tap(page, "#toS3");
  await caption(page, "평균까지 줄이면 되찾는 시간을\n하루 · 1년 단위로 보여줘요");
  await sleep(4000);
  await scrollToEl(page, "#crowdBox");
  await caption(page, "오늘 연수 참가자 또래 평균과도 비교\n(5명 이상일 때 공개 · 시연용 샘플 데이터)");
  await sleep(4500);

  // 두 번째 사용자: 직접 입력 · 평균보다 적은 경우
  await caption(page, "다른 예: 직접 입력도 OK");
  await tap(page, "#restart");
  await sleep(1200);
  await tap(page, "#age");
  await page.locator("#age").pressSequentially("45", { delay: 250 });
  await tap(page, "#hh");
  await page.locator("#hh").pressSequentially("1", { delay: 250 });
  await tap(page, "#mm");
  await page.locator("#mm").pressSequentially("50", { delay: 250 });
  await sleep(1200);
  await tap(page, "#go");
  await caption(page, "40대 평균보다 적으면 😄\n지금 습관을 칭찬해 줘요");
  await sleep(2500);
  await scrollToEl(page, "#emoji");
  await sleep(3500);
  await tap(page, "#toS3");
  await caption(page, "이미 평균보다 적어도\n하루 30분만 더 줄여보자고 제안해요");
  await sleep(4500);

  // 마무리
  await scrollTo(page, 0);
  await caption(page, "설치 · 로그인 없이 링크로 바로\npwc-webapp.vercel.app");
  await sleep(3500);

  const video = page.video();
  await ctx.close();
  await browser.close();
  if (server) server.close();

  // webm → mp4(H.264) / mkv. 30MB를 넘으면 화질을 낮춰 다시 인코딩
  const webm = await video.path();
  const mp4 = path.join(OUT, "am_i_over_demo.mp4");
  const mkv = path.join(OUT, "am_i_over_demo.mkv");
  for (const crf of [23, 28, 32]) {
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4]);
    if (fs.statSync(mp4).size / 1048576 <= MAX_MB) break;
  }
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", mp4, "-c", "copy", mkv]);
  fs.rmSync(raw, { recursive: true, force: true });

  for (const f of [mp4, mkv]) console.log(`${path.relative(ROOT, f)}  ${(fs.statSync(f).size / 1048576).toFixed(1)}MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
