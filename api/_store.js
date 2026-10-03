// 참가자 익명 집계 저장소 (Upstash Redis REST API, 추가 패키지 없이 fetch로 호출)
// Vercel 대시보드 Storage 탭에서 Upstash Redis를 연결하면 아래 환경변수가 자동 주입된다.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const AGES = ["20", "30", "40", "50"];
const MIN_SHOW = 5; // 프론트(index.html)의 MIN_SHOW와 같은 값
const TTL_SECONDS = 3 * 24 * 60 * 60; // 지난 날짜 집계는 3일 뒤 자동 삭제

// "오늘 연수 평균"이므로 한국 시간 날짜별로 따로 집계 (자정에 새로 시작)
// hash: 브라우저 id -> "연령대:분"
function todayKey() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `amio:entries:${kst}`;
}

function configured() {
  return Boolean(URL_ && TOKEN);
}

async function redis(command) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).result;
}

// 여러 명령을 한 번의 왕복으로 보냄 (Upstash /pipeline). 결과 배열을 순서대로 반환
async function pipeline(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

function aggregate(flat) {
  flat = flat || [];
  const acc = {};
  for (let i = 1; i < flat.length; i += 2) {
    const [age, minutes] = String(flat[i]).split(":");
    const m = Number(minutes);
    if (!AGES.includes(age) || !(m > 0 && m <= 1440)) continue;
    acc[age] = acc[age] || { n: 0, sum: 0 };
    acc[age].n += 1;
    acc[age].sum += m;
  }
  // 5명 미만 연령대는 평균을 공개하지 않음 (인원수만)
  const groups = {};
  for (const age of Object.keys(acc)) {
    const { n, sum } = acc[age];
    groups[age] = { n, avg: n >= MIN_SHOW ? sum / n : null };
  }
  return groups;
}

async function readGroups(key = todayKey()) {
  return aggregate(await redis(["HGETALL", key]));
}

// 제출 + 만료 설정 + 집계 조회를 한 번의 왕복으로 처리
async function submitEntry(id, age, minutes) {
  const key = todayKey();
  const [, , flat] = await pipeline([
    ["HSET", key, id, `${age}:${Math.round(minutes)}`],
    ["EXPIRE", key, TTL_SECONDS],
    ["HGETALL", key],
  ]);
  return aggregate(flat);
}

module.exports = { configured, readGroups, submitEntry, AGES };
