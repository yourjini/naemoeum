// 내모음 가져오기: 읽기 전용. 즐겨찾기는 chrome.bookmarks로, 사이트 저장 목록은
// 사용자가 이미 로그인한 페이지를 백그라운드 탭으로 열어 화면에 보이는 링크를 모은 뒤 탭을 닫는다.

const APP_URL = "https://naemoeum.vercel.app/";

const SITES = {
  keep: { label: "네이버 Keep", from: "네이버 Keep", url: () => "https://keep.naver.com/" },
  navermap: { label: "네이버 지도", from: "네이버 지도", url: () => "https://map.naver.com/p/favorite/myPlace" },
  googlemap: { label: "구글 지도", from: "구글 지도", url: () => "https://www.google.com/maps/@37.5665,126.978,12z/data=!4m2!10m1!1e1" },
  instagram: { label: "인스타그램", from: "인스타그램", url: (o) => o.igUser ? `https://www.instagram.com/${encodeURIComponent(o.igUser)}/saved/all-posts/` : null }
};
const ROOT_FOLDERS = /^(북마크바|북마크 바|기타 북마크|모바일 북마크|Bookmarks bar|Bookmarks Bar|Other bookmarks|Other Bookmarks|Mobile bookmarks|Mobile Bookmarks)$/;

async function readBookmarks(){
  const tree = await chrome.bookmarks.getTree();
  const out = [];
  const walk = (node, path) => {
    if (node.url){
      if (/^https?:/i.test(node.url)) out.push({ url: node.url, title: node.title || "", tags: path.filter(p => p && !ROOT_FOLDERS.test(p)).slice(-2), savedAt: node.dateAdded ? new Date(node.dateAdded).toISOString() : "" });
      return;
    }
    const next = node.title ? path.concat(node.title) : path;
    (node.children || []).forEach(c => walk(c, next));
  };
  tree.forEach(n => walk(n, []));
  return { items: out, savedFrom: "크롬 즐겨찾기" };
}

// 페이지 안에서 실행되는 함수: 끝까지 내리면서 링크를 모은다.
async function scrapeInPage(site){
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const found = new Map();
  const abs = h => { try { return new URL(h, location.href).href; } catch { return ""; } };
  const pick = () => {
    for (const a of document.querySelectorAll("a[href]")){
      const href = abs(a.getAttribute("href"));
      if (!/^https?:/.test(href)) continue;
      let ok = false, title = (a.innerText || a.getAttribute("aria-label") || a.title || "").replace(/\s+/g, " ").trim();
      let text = "";
      if (site === "instagram"){ ok = /instagram\.com\/(p|reel|reels|tv)\/[\w-]+/.test(href); const img = a.querySelector("img[alt]"); if (img && !title) title = img.alt.slice(0, 120); }
      else if (site === "navermap"){ ok = /(place\.naver\.com|map\.naver\.com)\/.*(place|restaurant|hairshop|hospital|accommodation)\/\d+|naver\.me\//.test(href); }
      else if (site === "googlemap"){ ok = /google\.[a-z.]+\/maps\/place\//.test(href); }
      else if (site === "keep"){ const h = new URL(href).hostname; ok = !/(^|\.)keep\.naver\.com$|(^|\.)nid\.naver\.com$|help\.naver\.com$|policy\.naver\.com$/.test(h) && !/^https:\/\/(www\.)?naver\.com\/?$/.test(href); const card = a.closest("li,article,[class*=item],[class*=memo],[class*=card]"); if (card) text = card.innerText.replace(/\s+\n/g, "\n").trim().slice(0, 600); }
      if (!ok) continue;
      const key = href.split("?")[0];
      const cur = found.get(key);
      if (!cur || (title && title.length > (cur.title || "").length)) found.set(key, { url: href, title: title.slice(0, 160), text });
    }
  };
  // 스크롤할 영역: 페이지 전체와, 안에서 따로 스크롤되는 목록들
  const scrollers = () => [document.scrollingElement, ...[...document.querySelectorAll("div,section,ul")].filter(e => e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))].filter(Boolean);
  let last = -1, still = 0;
  for (let i = 0; i < 60 && still < 4; i++){
    pick();
    if (found.size === last) still++; else { still = 0; last = found.size; }
    for (const s of scrollers()) s.scrollTop = s.scrollHeight;
    await sleep(900);
  }
  pick();
  const loggedOut = /login|signin|accounts\/login|nidlogin/i.test(location.href);
  return { items: [...found.values()], loggedOut, href: location.href };
}

async function readSite(site, opts){
  const s = SITES[site]; if (!s) throw new Error("모르는 출처: " + site);
  const url = s.url(opts || {});
  if (!url) return { items: [], savedFrom: s.from, note: "인스타그램 아이디를 먼저 적어 주세요." };
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await new Promise((resolve) => {
      const done = (id, info) => { if (id === tab.id && info.status === "complete"){ chrome.tabs.onUpdated.removeListener(done); resolve(); } };
      chrome.tabs.onUpdated.addListener(done);
      setTimeout(resolve, 20000);
    });
    await new Promise(r => setTimeout(r, 2500));
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: scrapeInPage, args: [site] });
    const items = [], seen = new Set(); let loggedOut = false;
    for (const r of results){ const v = r.result || {}; if (v.loggedOut) loggedOut = true; for (const it of v.items || []){ const k = it.url.split("?")[0]; if (!seen.has(k)){ seen.add(k); items.push(it); } } }
    return { items, savedFrom: s.from, note: loggedOut ? `${s.label}에 로그인되어 있지 않아요. 크롬에서 로그인한 뒤 다시 눌러 주세요.` : (items.length ? "" : `${s.label} 화면에서 저장 항목을 찾지 못했어요.`) };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function run(what, opts){
  const r = what === "bookmarks" ? await readBookmarks() : await readSite(what, opts);
  const runs = (await chrome.storage.local.get("runs")).runs || {};
  runs[what] = { at: new Date().toISOString(), count: r.items.length, note: r.note || "" };
  await chrome.storage.local.set({ runs });
  return { what, ...r, runs };
}

// 팝업에서 누르면: 결과를 보관해 두고 내모음 탭을 열어 넘긴다.
async function runFromPopup(whats, opts){
  const out = [];
  for (const w of whats){ try { out.push(await run(w, opts)); } catch (e){ out.push({ what: w, items: [], note: String(e.message || e) }); } }
  const pending = (await chrome.storage.local.get("pending")).pending || [];
  await chrome.storage.local.set({ pending: pending.concat(out.filter(o => o.items.length)) });
  const tabs = await chrome.tabs.query({ url: ["https://naemoeum.vercel.app/*"] });
  if (tabs[0]){ await chrome.tabs.update(tabs[0].id, { active: true }); await chrome.tabs.reload(tabs[0].id); }
  else await chrome.tabs.create({ url: APP_URL });
  return out.map(o => ({ what: o.what, count: o.items.length, note: o.note || "" }));
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    try {
      if (msg.type === "run"){
        const res = [];
        for (const w of msg.whats){ try { res.push(await run(w, msg.opts)); } catch (e){ res.push({ what: w, items: [], note: String(e.message || e) }); } }
        reply({ ok: true, results: res });
      }
      else if (msg.type === "runFromPopup") reply({ ok: true, results: await runFromPopup(msg.whats, msg.opts) });
      else if (msg.type === "status") reply({ ok: true, ...(await chrome.storage.local.get(["runs", "opts"])) });
      else if (msg.type === "saveOpts") { await chrome.storage.local.set({ opts: msg.opts }); reply({ ok: true }); }
      else if (msg.type === "takePending") { const p = (await chrome.storage.local.get("pending")).pending || []; await chrome.storage.local.set({ pending: [] }); reply({ ok: true, pending: p }); }
      else reply({ ok: false });
    } catch (e){ reply({ ok: false, error: String(e.message || e) }); }
  })();
  return true;
});
