const SOURCES = [["bookmarks", "크롬 즐겨찾기"], ["keep", "네이버 Keep"], ["navermap", "네이버 지도"], ["googlemap", "구글 지도"], ["instagram", "인스타그램 저장됨"]];
const fmt = iso => { if (!iso) return "아직 안 가져옴"; const d = new Date(iso), p = n => String(n).padStart(2, "0"); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
(async () => {
  const s = await chrome.runtime.sendMessage({ type: "status" });
  const runs = s.runs || {}, opts = s.opts || {}, chosen = opts.chosen || SOURCES.map(x => x[0]);
  document.getElementById("ig").value = opts.igUser || "";
  const list = document.getElementById("list");
  for (const [k, l] of SOURCES){
    const lab = document.createElement("label");
    lab.innerHTML = `<input type="checkbox" value="${k}"> <span></span><span class="when"></span>`;
    lab.querySelector("input").checked = chosen.includes(k);
    lab.querySelector("span").textContent = l;
    lab.querySelector(".when").textContent = runs[k] ? `${fmt(runs[k].at)} · ${runs[k].count}개` : "아직 안 가져옴";
    list.appendChild(lab);
  }
  document.getElementById("go").addEventListener("click", async () => {
    const whats = [...list.querySelectorAll("input:checked")].map(i => i.value);
    const o = { igUser: document.getElementById("ig").value.trim().replace(/^@/, ""), chosen: whats };
    await chrome.runtime.sendMessage({ type: "saveOpts", opts: o });
    const btn = document.getElementById("go"); btn.disabled = true; btn.textContent = "가져오는 중… (창이 잠깐 열렸다 닫혀요)";
    const r = await chrome.runtime.sendMessage({ type: "runFromPopup", whats, opts: o });
    document.getElementById("out").textContent = (r.results || []).map(x => `${SOURCES.find(s => s[0] === x.what)[1]}: ${x.count}개${x.note ? " · " + x.note : ""}`).join("\n");
    btn.disabled = false; btn.textContent = "지금 가져오기";
  });
})();
