// 참가자 익명 집계 저장소 (Upstash Redis REST API, 추가 패키지 없이 fetch로 호출)
// Vercel 대시보드 Storage 탭에서 Upstash Redis를 연결하면 아래 환경변수가 자동 주입된다.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const KEY = "amio:entries"; // hash: 브라우저 id -> "연령대:분"
const AGES = ["20", "30", "40", "50"];
const MIN_SHOW = 5; // 프론트(index.html)의 MIN_SHOW와 같은 값

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

async function readGroups() {
  const flat = (await redis(["HGETALL", KEY])) || [];
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

module.exports = { configured, redis, readGroups, KEY, AGES };
