const { configured, redis, readGroups, KEY, AGES } = require("./_store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!configured()) return res.status(503).json({ error: "store not configured" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const id = body && String(body.id || "");
  const age = body && String(body.age || "");
  const minutes = body && Number(body.minutes);

  if (!/^[a-z0-9]{6,40}$/.test(id) || !AGES.includes(age) || !(minutes > 0 && minutes <= 1440)) {
    return res.status(400).json({ error: "invalid input" });
  }

  try {
    // 같은 브라우저 id로 다시 보내면 덮어써서 중복 집계되지 않음
    await redis(["HSET", KEY, id, `${age}:${Math.round(minutes)}`]);
    const groups = await readGroups();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, groups });
  } catch (err) {
    return res.status(502).json({ error: "store error" });
  }
};
