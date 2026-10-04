// 내모음 페이지와 확장 사이의 다리. 페이지가 보낸 요청만 받고, 결과를 페이지에 돌려준다.
(() => {
  const ORIGIN = location.origin;
  const post = (data) => window.postMessage({ source: "naemoeum-ext", ...data }, ORIGIN);
  const status = async () => { const s = await chrome.runtime.sendMessage({ type: "status" }); post({ type: "ready", version: chrome.runtime.getManifest().version, runs: s.runs || {}, opts: s.opts || {} }); };
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== ORIGIN || !e.data || e.data.source !== "naemoeum-page") return;
    const d = e.data;
    if (d.type === "hello") return status();
    if (d.type === "saveOpts"){ await chrome.runtime.sendMessage({ type: "saveOpts", opts: d.opts }); return status(); }
    if (d.type === "run"){
      post({ type: "progress", whats: d.whats });
      const r = await chrome.runtime.sendMessage({ type: "run", whats: d.whats, opts: d.opts || {} });
      post({ type: "results", results: (r && r.results) || [], error: r && r.error });
      status();
    }
  });
  // 팝업에서 미리 가져온 것이 있으면 넘긴다
  chrome.runtime.sendMessage({ type: "takePending" }).then(r => { if (r && r.pending && r.pending.length) post({ type: "results", results: r.pending, fromPopup: true }); });
  status();
})();
