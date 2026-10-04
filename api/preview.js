// 링크 미리보기: 주소를 받아 그 페이지의 제목·썸네일·설명·사이트 이름을 돌려준다.
// GET /api/preview?url=https://...  →  { url, title, image, desc, site }
// 공개된 페이지만 읽는다. 로그인이 필요한 페이지는 대개 빈 값이 온다.
const dns = require("node:dns").promises;
const net = require("node:net");

const UA = "Mozilla/5.0 (compatible; naemoeum-preview/1.0; +https://naemoeum.vercel.app)";
const MAX_BYTES = 600 * 1024, TIMEOUT = 7000, MAX_HOPS = 4;

function isPrivateIp(ip){
  if (net.isIPv4(ip)){
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}
async function assertPublic(u){
  if (!/^https?:$/.test(u.protocol)) throw new Error("http/https 주소만 됩니다");
  if (process.env.NM_ALLOW_PRIVATE === "1") return; // 로컬 시험용
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error("내부 주소는 읽지 않습니다");
}

async function fetchPublic(url){
  let u = new URL(url);
  for (let hop = 0; hop <= MAX_HOPS; hop++){
    await assertPublic(u);
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const r = await fetch(u, { redirect: "manual", signal: ctl.signal, headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "ko,en;q=0.8" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")){ u = new URL(r.headers.get("location"), u); continue; }
      const type = r.headers.get("content-type") || "";
      if (/^image\//.test(type)) return { finalUrl: u.href, imageOnly: true };
      if (!r.ok || !/html|xml/.test(type)) return { finalUrl: u.href, html: "" };
      const chunks = []; let size = 0; const reader = r.body.getReader();
      while (size < MAX_BYTES){ const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
      reader.cancel().catch(() => {});
      const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
      return { finalUrl: u.href, html: decode(buf, type) };
    } finally { clearTimeout(t); }
  }
  throw new Error("이동이 너무 많습니다");
}
function decode(buf, type){
  let cs = (type.match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!cs){ const head = buf.subarray(0, 4096).toString("latin1"); cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]; }
  try { return new TextDecoder(cs || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const unescape = s => String(s || "").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
}).replace(/\s+/g, " ").trim();
function attrs(tag){ const o = {}; for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) o[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? ""; return o; }

// HTML에서 미리보기 정보를 뽑는다 (og → twitter → 일반 meta → <title> 순)
function parsePreview(html, baseUrl){
  const head = html.slice(0, 300000), meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)){
    const a = attrs(m[0]); const k = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (k && a.content != null && !(k in meta)) meta[k] = a.content;
  }
  let image = meta["og:image:secure_url"] || meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"] || meta["image"] || "";
  if (!image){ const l = [...head.matchAll(/<link\b[^>]*>/gi)].map(x => attrs(x[0])).find(a => /image_src/i.test(a.rel || "")); if (l) image = l.href || ""; }
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const abs = v => { if (!v) return ""; try { const x = new URL(unescape(v), baseUrl); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
  return {
    title: unescape(meta["og:title"] || meta["twitter:title"] || titleTag || "").slice(0, 200),
    image: abs(image),
    desc: unescape(meta["og:description"] || meta["twitter:description"] || meta["description"] || "").slice(0, 400),
    site: unescape(meta["og:site_name"] || meta["application-name"] || "").slice(0, 60),
  };
}

function ytId(u){
  try { const x = new URL(u); const h = x.hostname.replace(/^www\.|^m\.|^music\./, "");
    if (h === "youtu.be") return x.pathname.slice(1, 12) || null;
    if (h === "youtube.com"){ if (x.searchParams.get("v")) return x.searchParams.get("v"); const m = x.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/); if (m) return m[2]; }
  } catch {} return null;
}

async function preview(url){
  const id = ytId(url);
  if (id){
    // 유튜브는 공식 oEmbed로 제목·채널을, 썸네일은 고정 주소로 가져온다
    const out = { url, title: "", image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, desc: "", site: "YouTube" };
    try {
      const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
      if (r.ok){ const j = await r.json(); out.title = j.title || ""; out.desc = j.author_name ? `채널: ${j.author_name}` : ""; }
    } catch {}
    return out;
  }
  const got = await fetchPublic(url);
  if (got.imageOnly) return { url: got.finalUrl, title: "", image: got.finalUrl, desc: "", site: "" };
  return { url: got.finalUrl, ...parsePreview(got.html || "", got.finalUrl) };
}

module.exports = async (req, res) => {
  const raw = (req.query && req.query.url) || new URL(req.url, "http://x").searchParams.get("url") || "";
  res.setHeader("content-type", "application/json; charset=utf-8");
  let u; try { u = new URL(String(raw)); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: "주소가 올바르지 않습니다" })); }
  try {
    const out = await preview(u.href);
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.end(JSON.stringify(out));
  } catch (e){
    res.statusCode = 200; // 미리보기가 없을 뿐 오류로 다루지 않는다
    res.setHeader("cache-control", "public, s-maxage=3600");
    res.end(JSON.stringify({ url: u.href, title: "", image: "", desc: "", site: "", error: String(e && e.message || e) }));
  }
};
module.exports.parsePreview = parsePreview;
module.exports.isPrivateIp = isPrivateIp;
