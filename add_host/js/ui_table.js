// ui_table.js
import { PAGE_SIZE, MAX_PAGE_SIZE } from "./constants.js";

function pingBtnMarkup(state) {
  const base = "xd-ping";
  if (state === "ok")   return { cls: `${base} ok`,      text: "Ping ✓" };
  if (state === "err")  return { cls: `${base} err`,     text: "Ping ✗" };
  if (state === "load") return { cls: `${base} loading`, text: "Pinging…" };
  return { cls: `${base} neutral`, text: "Ping" };
}
function sshBtnMarkup(state) {
  const base = "xd-ping";
  if (state === "ok")   return { cls: `${base} ok`,      text: "SSH ✓" };
  if (state === "err")  return { cls: `${base} err`,     text: "SSH ✗" };
  if (state === "load") return { cls: `${base} loading`, text: "Checking…" };
  return { cls: `${base} neutral`, text: "SSH" };
}

async function pingOne(ip, btn) {
  if (!ip) return;
  const m = pingBtnMarkup("load"); btn.className = m.cls; btn.textContent = m.text; btn.disabled = true;
  try {
    const cmd = `ping -c1 -W2 ${ip} >/dev/null 2>&1 && echo OK || echo FAIL`;
    const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" });
    const ok = (out||"").includes("OK");
    const m2 = pingBtnMarkup(ok ? "ok" : "err"); btn.className = m2.cls; btn.textContent = m2.text;
  } catch {
    const m2 = pingBtnMarkup("err"); btn.className = m2.cls; btn.textContent = m2.text;
  } finally { btn.disabled = false; }
}

async function sshCheckOne(ip, user, btn) {
  if (!ip) return;
  const m = sshBtnMarkup("load"); btn.className = m.cls; btn.textContent = m.text; btn.disabled = true;
  try {
    const cmd = `ssh -o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=no ${user}@${ip} 'echo OK' 2>/dev/null || true`;
    const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" }).catch(()=> "");
    const ok = String(out).includes("OK");
    const m2 = sshBtnMarkup(ok ? "ok" : "err"); btn.className = m2.cls; btn.textContent = m2.text;
  } catch {
    const m2 = sshBtnMarkup("err"); btn.className = m2.cls; btn.textContent = m2.text;
  } finally { btn.disabled = false; }
}

export function createTableUI({ getHosts, setHosts, onChange, onDelete }) {
  const tbody    = document.getElementById("hosts-tbody");
  const pagerEl  = document.getElementById("pager");
  const btnFirst = document.getElementById("page-first");
  const btnPrev  = document.getElementById("page-prev");
  const btnNext  = document.getElementById("page-next");
  const btnLast  = document.getElementById("page-last");
  const pageInfo = document.getElementById("page-info");

  const pingAllBtn   = document.getElementById("hosts-ping-all");
  const sshAllBtn    = document.getElementById("hosts-ssh-all");
  const searchInput  = document.getElementById("hosts-search");
  const pageSizeSel  = document.getElementById("page-size");
  const loadMoreBtn  = document.getElementById("hosts-load-more");

  let currentPage = 1;
  let pageSize = PAGE_SIZE;
  if (pageSizeSel) pageSizeSel.value = String(PAGE_SIZE);

  function normalizedFilter(h, q) {
    if (!q) return true;
    const hay = `${h.hostname||""} ${h.ip||""} ${(h.roles||[]).join(" ")}`.toLowerCase();
    return hay.includes(q);
  }
  function getFiltered() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    return getHosts().filter(h => normalizedFilter(h, q));
  }

  function totalPagesOf(len) {
    return Math.max(1, Math.ceil(len / Math.max(1, pageSize)));
  }
  function clampPage(len) {
    const t = totalPagesOf(len);
    if (currentPage > t) currentPage = t;
    if (currentPage < 1) currentPage = 1;
  }

  function renderPager(filteredLen) {
    clampPage(filteredLen);
    const showPager = filteredLen > pageSize;            // ← hide when everything fits
    if (pagerEl) pagerEl.hidden = !showPager;
    if (!showPager || !pageInfo) return;
    pageInfo.textContent = `Page ${currentPage} / ${totalPagesOf(filteredLen)}`;

    if (btnFirst) btnFirst.disabled = currentPage === 1;
    if (btnPrev)  btnPrev.disabled  = currentPage === 1;
    if (btnNext)  btnNext.disabled  = currentPage === totalPagesOf(filteredLen);
    if (btnLast)  btnLast.disabled  = currentPage === totalPagesOf(filteredLen);

    if (loadMoreBtn) {
      const canGrow = pageSize < MAX_PAGE_SIZE && pageSize < filteredLen;
      loadMoreBtn.disabled = !canGrow;
      const nextSize = Math.min(pageSize + 10, MAX_PAGE_SIZE, filteredLen);
      loadMoreBtn.textContent = canGrow ? `Load more (show ${nextSize}/page)` : `Max ${Math.min(MAX_PAGE_SIZE, filteredLen)}/page`;
    }
  }

  function rowTemplate(item) {
    const tr = document.createElement("tr");

    const tdHost = document.createElement("td"); tdHost.textContent = item.hostname || ""; tr.appendChild(tdHost);
    const tdIP   = document.createElement("td"); tdIP.textContent   = item.ip || "";       tr.appendChild(tdIP);
    const tdR    = document.createElement("td"); tdR.textContent    = Array.isArray(item.roles) ? item.roles.join(", ") : ""; tr.appendChild(tdR);

    const tdPing = document.createElement("td");
    const pingBtn = document.createElement("button");
    const pm = pingBtnMarkup("neutral");
    pingBtn.type = "button"; pingBtn.className = pm.cls; pingBtn.textContent = pm.text;
    pingBtn.addEventListener("click", () => pingOne(item.ip, pingBtn));
    tdPing.appendChild(pingBtn); tr.appendChild(tdPing);

    const tdSSH = document.createElement("td");
    const sshBtn = document.createElement("button");
    const sm = sshBtnMarkup("neutral");
    sshBtn.type = "button"; sshBtn.className = sm.cls; sshBtn.textContent = sm.text;
    const userInput = document.getElementById("ssh-remote-user");
    sshBtn.addEventListener("click", () => sshCheckOne(item.ip, (userInput?.value || "root"), sshBtn));
    tdSSH.appendChild(sshBtn); tr.appendChild(tdSSH);

    const tdDel = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete"; delBtn.className = "xd-del";
    delBtn.addEventListener("click", async () => {
      const h = getHosts();
      const idx = h.findIndex(x => x.hostname === item.hostname && x.ip === item.ip);
      if (idx >= 0) { h.splice(idx, 1); setHosts(h); }
      const filteredLen = getFiltered().length;
      clampPage(filteredLen);
      renderTable(); onChange && onChange(); await onDelete?.();
    });
    tdDel.appendChild(delBtn); tr.appendChild(tdDel);

    return tr;
  }

  function renderTable() {
    if (!tbody) return;
    const filtered = getFiltered();
    clampPage(filtered.length);
    tbody.innerHTML = "";

    const start = (currentPage - 1) * pageSize;
    const end   = Math.min(start + pageSize, filtered.length);
    for (let i = start; i < end; i++) tbody.appendChild(rowTemplate(filtered[i]));

    renderPager(filtered.length);
  }

  // Pager bindings
  btnFirst && (btnFirst.onclick = () => { currentPage = 1; renderTable(); });
  btnPrev  && (btnPrev.onclick  = () => { currentPage--;  renderTable(); });
  btnNext  && (btnNext.onclick  = () => { currentPage++;  renderTable(); });
  btnLast  && (btnLast.onclick  = () => { currentPage = Number.MAX_SAFE_INTEGER; renderTable(); });

  // Search
  if (searchInput) searchInput.addEventListener("input", () => { currentPage = 1; renderTable(); });

  // Page size select (reset to page 1 and clamp)
  if (pageSizeSel) {
    pageSizeSel.addEventListener("change", () => {
      const v = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(pageSizeSel.value || "10", 10)));
      pageSize = v; currentPage = 1; renderTable();
    });
  }

  // Load more = bump by +10 up to MAX or filtered length
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      const filteredLen = getFiltered().length;
      if (pageSize < MAX_PAGE_SIZE && pageSize < filteredLen) {
        pageSize = Math.min(MAX_PAGE_SIZE, pageSize + 10, filteredLen);
        currentPage = 1;                // ← reset page so pager recomputes cleanly
        if (pageSizeSel) pageSizeSel.value = String(pageSize);
        renderTable();
      }
    });
  }

  // Bulk actions operate on the currently visible page
  pingAllBtn && pingAllBtn.addEventListener("click", async () => {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    for (const r of rows) {
      const btn = r.querySelector("td:nth-child(4) .xd-ping");
      const ip  = r.children[1]?.textContent?.trim();
      if (btn && ip) await pingOne(ip, btn);
    }
  });
  sshAllBtn && sshAllBtn.addEventListener("click", async () => {
    const userInput = document.getElementById("ssh-remote-user"); const user = userInput?.value || "root";
    const rows = Array.from(tbody.querySelectorAll("tr"));
    for (const r of rows) {
      const btn = r.querySelector("td:nth-child(5) .xd-ping");
      const ip  = r.children[1]?.textContent?.trim();
      if (btn && ip) await sshCheckOne(ip, user, btn);
    }
  });

  return {
    renderTable,
    goLastPage: () => { renderTable(); btnLast && btnLast.click(); }
  };
}
