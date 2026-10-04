// 하루 한 번(vercel.json crons) Supabase에 작은 요청을 보내 무료 프로젝트가 잠들지 않게 한다.
const cfg = require("../supabase-config.json");

function send(res, body){ res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); }

module.exports = async (req, res) => {
  if (!cfg.url || !cfg.key) return send(res, { ok: false, reason: "supabase-config.json 비어 있음" });
  try {
    const r = await fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/notes?select=id&limit=1", { headers: { apikey: cfg.key } });
    send(res, { ok: r.ok, status: r.status });
  } catch (e) {
    send(res, { ok: false, reason: String(e && e.message || e) });
  }
};
