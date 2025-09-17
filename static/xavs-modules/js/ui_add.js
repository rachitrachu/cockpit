import { ROLES, DEPLOYMENT_ROLE } from "./constants.js";
import { setStatus, isValidIPv4, attachPingBehavior, normalizeRoles } from "./utils.js"

/* Build Add Host (Single / Bulk / Upload) */
export function createAddUI({ getHosts, setHosts, anyHasDeployment, onHostsChanged }) {
  // Tabs
  const tabBtns = {
    single: document.getElementById("tabbtn-single"),
    bulk:   document.getElementById("tabbtn-bulk"),
    upload: document.getElementById("tabbtn-upload"),
  };
  const tabPanels = {
    single: document.getElementById("tab-single"),
    bulk:   document.getElementById("tab-bulk"),
    upload: document.getElementById("tab-upload"),
  };
  function setActiveTab(name) {
    for (const key of Object.keys(tabBtns)) {
      const btn = tabBtns[key], panel = tabPanels[key];
      const active = key === name;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      panel.classList.toggle("hidden", !active);
    }
  }
    // --- Sample downloads ---
  const uploadSampleCsvBtn  = document.getElementById("upload-sample-csv");
  const uploadSampleJsonBtn = document.getElementById("upload-sample-json");

  function downloadBlob(filename, text, mime="text/plain") {
    const blob = new Blob([text], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function sampleCsv() {
    // roles can be separated by "|" or ";" — we show "|" here
    return [
      "hostname,ip,roles",
      "xd1,10.0.0.11,control|compute",
      "xd2,10.0.0.12,network",
      "xd3,10.0.0.13,storage|monitoring",
      "xd-deploy,10.0.0.14,deployment"
    ].join("\n") + "\n";
  }

  function sampleJson() {
    // JSON uses roles as an array
    const data = [
      { "hostname": "xd1",       "ip": "10.0.0.11", "roles": ["control","compute"] },
      { "hostname": "xd2",       "ip": "10.0.0.12", "roles": ["network"] },
      { "hostname": "xd3",       "ip": "10.0.0.13", "roles": ["storage","monitoring"] },
      { "hostname": "xd-deploy", "ip": "10.0.0.14", "roles": ["deployment"] }
    ];
    return JSON.stringify(data, null, 2) + "\n";
  }

  uploadSampleCsvBtn.addEventListener("click", () => {
    downloadBlob("xdeploy-hosts-sample.csv", sampleCsv(), "text/csv");
  });
  uploadSampleJsonBtn.addEventListener("click", () => {
    downloadBlob("xdeploy-hosts-sample.json", sampleJson(), "application/json");
  });

  tabBtns.single.addEventListener("click", ()=>setActiveTab("single"));
  tabBtns.bulk.addEventListener("click",   ()=>setActiveTab("bulk"));
  tabBtns.upload.addEventListener("click", ()=>setActiveTab("upload"));
  setActiveTab("single");

  /* -------- Single -------- */
/* -------- Single -------- */
const addForm       = document.getElementById("add-form");
const addHostnameEl = document.getElementById("add-hostname");
const addIPEl       = document.getElementById("add-ip");
const addPingBtn    = document.getElementById("add-ping");
const addRolesWrap  = document.getElementById("add-roles-wrap");
const addRoleSelect = document.getElementById("add-role-select");
const addStatus     = document.getElementById("add-status");

let addRoles = [];

/* Local helpers (no external utils for role UI) */
function renderChips() {
  addRolesWrap.innerHTML = "";
  addRoles.forEach(role => {
    const chip = document.createElement("span");
    chip.className = "xd-chip";
    chip.innerHTML = `${role} <span class="x" title="Remove">×</span>`;
    chip.querySelector(".x").addEventListener("click", () => {
      addRoles = addRoles.filter(r => r !== role);
      renderChips(); refreshSelect();
    });
    addRolesWrap.appendChild(chip);
  });
}
function refreshSelect() {
  const preserve = addRoleSelect.value;
  addRoleSelect.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = ""; ph.disabled = true; ph.selected = true; ph.textContent = "Select role…";
  addRoleSelect.appendChild(ph);

  const roles = ["control","network","compute","storage","monitoring","deployment"];
  roles.forEach(r => {
    // Hide 'deployment' if another host already has it and it's not selected here
    if (r === "deployment" && !addRoles.includes("deployment") && anyHasDeployment()) return;
    const opt = document.createElement("option");
    opt.value = opt.textContent = r;
    addRoleSelect.appendChild(opt);
  });

  if (preserve && roles.includes(preserve)) addRoleSelect.value = preserve;
}

/* Init */
renderChips();
refreshSelect();

/* Toggle roles on select (re‑select removes). Enforce single 'deployment'. */
addRoleSelect.addEventListener("change", () => {
  const v = addRoleSelect.value;
  if (!v) return;

  if (addRoles.includes(v)) {
    // deselect by re‑selecting
    addRoles = addRoles.filter(r => r !== v);
  } else {
    if (v === "deployment" && anyHasDeployment()) {
      // some other host already has 'deployment'
      setStatus(addStatus, "Only one 'deployment' host allowed.", "err");
      return;
    }
    addRoles.push(v);
  }
  renderChips();
  refreshSelect();
});

/* Ping button wiring */
const addPingCtl = attachPingBehavior(addPingBtn, () => addIPEl.value);
addIPEl.addEventListener("input", () => addPingCtl.refreshEnabled());

/* Submit */
addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const hostname = (addHostnameEl.value || "").trim();
  const ip = (addIPEl.value || "").trim();

  if (!hostname) { setStatus(addStatus,"Hostname is required","err"); return; }
  if (!ip)       { setStatus(addStatus,"IP is required","err"); return; }
  if (!isValidIPv4(ip)) { setStatus(addStatus,"Invalid IP format","err"); return; }

  const newHost = { hostname, ip, roles:[...addRoles] };
  const list = getHosts();

  if (list.some(h => h.hostname === hostname || h.ip === ip)) {
    setStatus(addStatus,"Duplicate hostname or IP in list.","err");
    return;
  }
  if (newHost.roles.includes("deployment") && anyHasDeployment()) {
    setStatus(addStatus,"Only one 'deployment' host allowed.","err");
    return;
  }

  setHosts([...list, newHost]);
  setStatus(addStatus,"Added.","ok");

  // reset form
  addHostnameEl.value = "";
  addIPEl.value = "";
  addRoles = [];
  renderChips();
  refreshSelect();
  onHostsChanged();
});


  /* -------- Bulk -------- */
  /* -------- Bulk -------- */
  const bulkInput    = document.getElementById("bulk-input");
  const bulkParse    = document.getElementById("bulk-parse");
  const bulkPingAll  = document.getElementById("bulk-ping-all");
  const bulkCommit   = document.getElementById("bulk-commit");
  const bulkStatus   = document.getElementById("bulk-status");
  const bulkPreview  = document.getElementById("bulk-preview");

  let bulkCandidates = []; // {hostname, ip, roles, note?, _ping?:'neutral'|'loading'|'ok'|'err'}

  function parseBulkLines(text) {
    const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      let hostname = "", ip = "", roles = [];
      if (line.includes(",")) {
        const cells = line.split(",").map(c => c.trim());
        hostname = cells[0] || ""; ip = cells[1] || ""; roles = normalizeRoles(cells.slice(2).join(","));
      } else {
        const cells = line.split(/\s+/);
        hostname = cells[0] || ""; ip = cells[1] || ""; roles = normalizeRoles(cells.slice(2).join(" "));
      }
      out.push({ hostname, ip, roles });
    }
    return out;
  }

  function annotate(list) {
    const haveHost = new Set(getHosts().map(h => h.hostname));
    const haveIP   = new Set(getHosts().map(h => h.ip));
    let deployTaken = anyHasDeployment();
    return list.map(c => {
      const notes = [];
      if (!c.hostname) notes.push("missing hostname");
      if (!c.ip) notes.push("missing ip");
      if (c.ip && !isValidIPv4(c.ip)) notes.push("invalid ip");
      if (haveHost.has(c.hostname)) notes.push("hostname exists");
      if (haveIP.has(c.ip)) notes.push("ip exists");
      if ((c.roles||[]).includes(DEPLOYMENT_ROLE)) {
        if (deployTaken) { c.roles = c.roles.filter(r => r !== DEPLOYMENT_ROLE); notes.push("deployment removed"); }
        else deployTaken = true;
      }
      return { ...c, note: notes.join(", "), _ping: "neutral" };
    });
  }

  // ping one IP (button state updates)
  async function pingOne(item, btnEl) {
    // only ping if the IP looks valid
    if (!isValidIPv4(item.ip)) { item._ping = "err"; btnEl && (btnEl.className = "xd-ping err", btnEl.textContent = "Ping ✗"); return; }
    item._ping = "loading";
    if (btnEl) { btnEl.className = "xd-ping loading"; btnEl.textContent = "Pinging…"; btnEl.disabled = true; }
    try {
      const cmd = `ping -c1 -W2 ${item.ip} >/dev/null 2>&1 && echo OK || echo FAIL`;
      const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" });
      const ok = (out||"").includes("OK");
      item._ping = ok ? "ok" : "err";
    } catch {
      item._ping = "err";
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        if (item._ping === "ok") { btnEl.className = "xd-ping ok";  btnEl.textContent = "Ping ✓"; }
        else if (item._ping === "err") { btnEl.className = "xd-ping err"; btnEl.textContent = "Ping ✗"; }
        else { btnEl.className = "xd-ping neutral"; btnEl.textContent = "Ping"; }
      }
    }
  }

  function renderBulkPreview(list) {
    bulkPreview.innerHTML = "";
    list.forEach((item, idx) => {
      const tr = document.createElement("tr");

      const tdH = document.createElement("td"); tdH.textContent = item.hostname || ""; tr.appendChild(tdH);
      const tdI = document.createElement("td"); tdI.textContent = item.ip || ""; tr.appendChild(tdI);
      const tdR = document.createElement("td"); tdR.textContent = (item.roles||[]).join(", "); tr.appendChild(tdR);

      // Ping cell
      const tdP = document.createElement("td");
      const pingBtn = document.createElement("button");
      pingBtn.type = "button";
      pingBtn.className = "xd-ping " + (item._ping || "neutral");
      pingBtn.textContent =
        item._ping === "ok" ? "Ping ✓" :
        item._ping === "err" ? "Ping ✗" :
        item._ping === "loading" ? "Pinging…" : "Ping";
      pingBtn.disabled = item._ping === "loading" || !isValidIPv4(item.ip);
      pingBtn.addEventListener("click", async () => { await pingOne(item, pingBtn); });
      tdP.appendChild(pingBtn);
      tr.appendChild(tdP);

      const tdN = document.createElement("td"); tdN.textContent = item.note || ""; tr.appendChild(tdN);

      bulkPreview.appendChild(tr);
    });
  }

  bulkParse.addEventListener("click", (e) => {
    e.preventDefault();
    const parsed = parseBulkLines(bulkInput.value);
    const annotated = annotate(parsed);
    bulkCandidates = annotated;
    const validCount = annotated.filter(x => !x.note).length;

    renderBulkPreview(annotated);
    bulkPingAll.disabled = annotated.length === 0;
    bulkCommit.disabled  = annotated.length === 0;
    bulkCommit.textContent = validCount ? `Add ${validCount} host${validCount>1?"s":""}` : "Add N hosts";
    setStatus(bulkStatus, validCount ? `Ready to add ${validCount}; rows with notes will be skipped.` : "No valid hosts found.", validCount?"ok":null);
  });

  // Ping All — runs pings sequentially to avoid flooding, updates buttons in place
  bulkPingAll.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!bulkCandidates.length) return;
    bulkPingAll.disabled = true;
    setStatus(bulkStatus, "Pinging all…");
    // walk the table rows to get the correct buttons to update
    const rows = Array.from(bulkPreview.querySelectorAll("tr"));
    for (let i = 0; i < bulkCandidates.length; i++) {
      const item = bulkCandidates[i];
      const btn = rows[i]?.querySelector(".xd-ping");
      await pingOne(item, btn);
    }
    setStatus(bulkStatus, "Ping sweep complete.", "ok");
    bulkPingAll.disabled = false;
  });

  bulkCommit.addEventListener("click", (e) => {
    e.preventDefault();
    if (!bulkCandidates.length) return;
    const toAdd = bulkCandidates
      .filter(x => !x.note) // same rule as before: skip rows with notes
      .map(x => ({ hostname:x.hostname, ip:x.ip, roles:[...(x.roles||[])] }));
    if (!toAdd.length) { setStatus(bulkStatus,"Nothing to add."); return; }
    setHosts([...getHosts(), ...toAdd]);
    setStatus(bulkStatus,`Added ${toAdd.length} host${toAdd.length>1?"s":""}.`,"ok");
    bulkCommit.disabled = true; bulkPreview.innerHTML = ""; bulkInput.value = "";
    onHostsChanged(true);
  });


  /* -------- Upload -------- */
  const uploadInput   = document.getElementById("upload-input");
  const uploadParse   = document.getElementById("upload-parse");
  const uploadCommit  = document.getElementById("upload-commit");
  const uploadStatus  = document.getElementById("upload-status");
  const uploadPreview = document.getElementById("upload-preview");

  let uploadCandidates = [];
  function readFileAsText(file) {
    return new Promise((resolve,reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result||""));
      fr.onerror = () => reject(fr.error||new Error("read failed"));
      fr.readAsText(file);
    });
  }
  async function parseUpload(files) {
    const results = [];
    for (const f of files) {
      const text = await readFileAsText(f);
      const name = f.name || "file";
      if (/\.(json)$/i.test(name)) {
        try {
          const arr = JSON.parse(text);
          if (Array.isArray(arr)) {
            for (const o of arr) {
              results.push({ _src:name, hostname:(o.hostname||"").trim(), ip:(o.ip||"").trim(), roles:normalizeRoles(Array.isArray(o.roles) ? o.roles.join("|") : String(o.roles||"")) });
            }
          }
        } catch { results.push({ _src:name, hostname:"", ip:"", roles:[], note:"invalid json" }); }
      } else {
        const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
        let start = 0;
        if (/^hostname\s*,/i.test(lines[0])) start = 1; // skip header
        for (let i=start;i<lines.length;i++){
          const cells = lines[i].split(",").map(c => c.trim());
          results.push({ _src:name, hostname:cells[0]||"", ip:cells[1]||"", roles:normalizeRoles(cells.slice(2).join(",")) });
        }
      }
    }
    return results;
  }
  uploadParse.addEventListener("click", async (e) => {
    e.preventDefault();
    const files = Array.from(uploadInput.files||[]);
    if (!files.length) { setStatus(uploadStatus,"Choose one or more files first."); return; }
    try {
      const parsed = await parseUpload(files);
      const have = new Set(getHosts().map(h => h.hostname));
      const haveIP = new Set(getHosts().map(h => h.ip));
      let deployTaken = anyHasDeployment();
      const annotated = parsed.map(c => {
        const notes = [];
        if (!c.hostname) notes.push("missing hostname");
        if (!c.ip) notes.push("missing ip");
        if (c.ip && !isValidIPv4(c.ip)) notes.push("invalid ip");
        if (have.has(c.hostname)) notes.push("hostname exists");
        if (haveIP.has(c.ip)) notes.push("ip exists");
        if ((c.roles||[]).includes(DEPLOYMENT_ROLE)) {
          if (deployTaken) { c.roles = c.roles.filter(r => r !== DEPLOYMENT_ROLE); notes.push("deployment removed"); }
          else deployTaken = true;
        }
        return { ...c, note: notes.join(", ") };
      });
      uploadCandidates = annotated;
      const validCount = annotated.filter(x => !x.note).length;
      uploadPreview.innerHTML = "";
      annotated.forEach(item => {
        const tr = document.createElement("tr");
        const tdS = document.createElement("td"); tdS.textContent = item._src || "-"; tr.appendChild(tdS);
        const tdH = document.createElement("td"); tdH.textContent = item.hostname || ""; tr.appendChild(tdH);
        const tdI = document.createElement("td"); tdI.textContent = item.ip || ""; tr.appendChild(tdI);
        const tdR = document.createElement("td"); tdR.textContent = (item.roles||[]).join(", "); tr.appendChild(tdR);
        const tdN = document.createElement("td"); tdN.textContent = item.note || ""; tr.appendChild(tdN);
        uploadPreview.appendChild(tr);
      });
      uploadCommit.disabled = annotated.length === 0;
      uploadCommit.textContent = validCount ? `Add ${validCount} host${validCount>1?"s":""}` : "Add N hosts";
      setStatus(uploadStatus, validCount ? `Ready to add ${validCount}; rows with notes will be skipped.` : "No valid hosts found.", validCount?"ok":null);
    } catch (err) {
      console.error(err);
      setStatus(uploadStatus,"Parse failed. Ensure CSV/JSON format.","err");
    }
  });
  uploadCommit.addEventListener("click", (e) => {
    e.preventDefault();
    if (!uploadCandidates.length) return;
    const toAdd = uploadCandidates.filter(x => !x.note).map(x => ({ hostname:x.hostname, ip:x.ip, roles:[...(x.roles||[])] }));
    if (!toAdd.length) { setStatus(uploadStatus,"Nothing to add."); return; }
    setHosts([...getHosts(), ...toAdd]);
    setStatus(uploadStatus,`Added ${toAdd.length} host${toAdd.length>1?"s":""}.`,"ok");
    uploadCommit.disabled = true; uploadPreview.innerHTML = ""; uploadInput.value = "";
    onHostsChanged(true);
  });

  return { setActiveTab };
}
