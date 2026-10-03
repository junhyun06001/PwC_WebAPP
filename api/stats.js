const { configured, readGroups } = require("./_store");

module.exports = async function handler(req, res) {
  if (!configured()) return res.status(503).json({ error: "store not configured" });

  try {
    const groups = await readGroups();
    // 동시 접속자가 많아도 저장소 조회는 CDN에서 5초에 한 번만 일어나도록
    res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=10");
    return res.status(200).json({ groups });
  } catch (err) {
    return res.status(502).json({ error: "store error" });
  }
};
