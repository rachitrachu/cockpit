// ssh.js — SSH Keys + 3-status badges (Ubuntu targets)
// ----------------------------------------------------
// Shows per-host statuses as three independent badges:
//   • Key    (installed via ssh-copy-id or already present)
//   • Reg    (docker-registry + cockpit hostname added to /etc/hosts)
//   • PwdOff (PasswordAuthentication no in sshd_config)
//
// Safe + non-hanging: apt-only, sudo fast-fail, coreutils timeout, clear UI messages.

import { setStatus } from "./utils.js";
import { PAGE_SIZE, MAX_PAGE_SIZE } from "./constants.js";

// ===== Config =====
const SSH_STATUS_PATH = "/root/xdeploy/ssh_status.json";
const TIMEOUT_S = 15;
const SSH_OPTS = [
  "-o", "BatchMode=yes",
  "-o", "PasswordAuthentication=no",
  "-o", "StrictHostKeyChecking=no",
  "-o", "ConnectTimeout=6",
  "-o", "ConnectionAttempts=1",
  "-o", "ServerAliveInterval=5",
  "-o", "ServerAliveCountMax=2",
];

// ===== Persistence =====
let persisted = {};
let saveT = null;
async function loadSSHStatus() {
  const f = cockpit.file(SSH_STATUS_PATH, { superuser: "try" });
  const txt = await f.read().catch(() => "{}");
  try { return JSON.parse(txt || "{}"); } catch { return {}; }
}
async function saveSSHStatus(obj) {
  const f = cockpit.file(SSH_STATUS_PATH, { superuser: "try" });
  await f.replace(JSON.stringify(obj, null, 2));
}
function schedulePersist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => saveSSHStatus(persisted).catch(console.error), 400);
}

// ===== Local host info (Cockpit machine) =====
async function getLocalPrimaryIPv4() {
  const cmd = `hostname -I | awk '{print $1}' | tr -d '\\n'`;
  const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" }).catch(() => "");
  return String(out || "").trim();
}
async function getLocalHostnameFQDN() {
  const out = await cockpit.spawn(["bash","-lc", "hostname -f"], { superuser: "try" }).catch(() => "");
  return String(out || "").trim();
}

// ===== Local key management (Ubuntu) =====
function localKeyPaths(user, type) {
  const keyName = type === "rsa" ? "id_rsa" : "id_ed25519";
  const base = user === "root" ? `/root` : `/home/${user}`;
  return { private: `${base}/.ssh/${keyName}`, public: `${base}/.ssh/${keyName}.pub` };
}

// Ensure local private key exists and has 0600 perms; auto-fix if needed
async function ensurePrivateKeyUsable(privPath) {
  const checkCmd = `
    if [ ! -f '${privPath}' ]; then echo '__ERR__:no_private_key'; exit 0; fi
    perms="$(stat -c %a '${privPath}' 2>/dev/null || echo '')"
    if [ -z "$perms" ]; then echo '__ERR__:stat_failed'; exit 0; fi
    if [ "$perms" != "600" ]; then
      chmod 600 '${privPath}' 2>/dev/null || true
      perms2="$(stat -c %a '${privPath}' 2>/dev/null || echo '')"
      if [ "$perms2" != "600" ]; then echo "__ERR__:bad_perms_$perms2"; exit 0; fi
    fi
    echo '__OK__'
  `;
  const out = await cockpit.spawn(["bash","-lc", checkCmd], { superuser: "try" }).catch(()=> "");
  return String(out).includes("__OK__") ? { ok:true } : { ok:false, reason:String(out).trim() };
}

// Ubuntu-only: install sshpass if missing
async function ensureSshpass() {
  const check = `command -v sshpass >/dev/null 2>&1 && echo OK || echo MISS`;
  const out = await cockpit.spawn(["bash","-lc", check], { superuser: "try" }).catch(()=> "");
  if ((out||"").includes("OK")) return true;
  const installCmd = `DEBIAN_FRONTEND=noninteractive sudo apt-get update -y && sudo apt-get install -y sshpass`;
  const out2 = await cockpit.spawn(["bash","-lc", installCmd], { superuser: "try" }).catch(()=> "ERR");
  if ((out2||"").includes("ERR")) return false;
  const out3 = await cockpit.spawn(["bash","-lc", check], { superuser: "try" }).catch(()=> "");
  return (out3||"").includes("OK");
}

// Create local key if missing (rsa or ed25519)
async function ensureLocalKey(user, type) {
  const kp = localKeyPaths(user, type);
  const cmd = `
    umask 077
    key_priv="${kp.private}"; key_pub="${kp.public}";
    if [ ! -f "$key_pub" ]; then
      mkdir -p "$(dirname "$key_priv")"
      if [ "${type}" = "rsa" ]; then
        ssh-keygen -t rsa -b 4096 -N "" -f "$key_priv" -C "xdeploy@$(hostname -f)" >/dev/null
      else
        ssh-keygen -t ed25519 -N "" -f "$key_priv" -C "xdeploy@$(hostname -f)" >/dev/null
      fi
    fi
    echo "__OK__"
  `;
  const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" }).catch(e => (e && e.message) || "");
  if (!String(out).includes("__OK__")) throw new Error("Failed to create or read local key.");
  return kp;
}

// Copy public key to remote (first-time install)
async function distributeOne(ip, remoteUser, remotePass, pubPath) {
  const safeHost = `${remoteUser}@${ip}`;
  const copyCmd = `
    sshpass -p '${remotePass.replace(/'/g,"'\\''")}' \
    ssh-copy-id -i '${pubPath}' \
      -o StrictHostKeyChecking=no \
      -o PreferredAuthentications=password \
      -o PubkeyAuthentication=no \
      '${safeHost}' >/dev/null 2>&1 && echo OK || echo FAIL
  `;
  const out = await cockpit.spawn(["bash","-lc", copyCmd], { superuser: "try" }).catch(()=> "FAIL");
  return String(out).includes("OK");
}

// Verify key-only SSH works
async function verifyKeyOne(ip, remoteUser, privPath) {
  const args = ["ssh", "-i", privPath, ...SSH_OPTS, `${remoteUser}@${ip}`, "echo OK", "2>/dev/null || true"];
  const cmd  = args.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
  const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" }).catch(()=> "");
  return String(out).includes("OK");
}

// Disable password SSH on remote
async function disablePasswordSsh(ip, remoteUser, privPath) {
  const remoteScript = `
    set -e
    CFG="/etc/ssh/sshd_config"
    sudo sed -i -E "s/^#?PasswordAuthentication\\s+.*/PasswordAuthentication no/" "$CFG" || true
    sudo grep -q "^PasswordAuthentication" "$CFG" || echo "PasswordAuthentication no" | sudo tee -a "$CFG" >/dev/null
    sudo systemctl reload sshd 2>/dev/null || sudo systemctl restart sshd 2>/dev/null || sudo systemctl restart ssh 2>/dev/null || true
    echo OK
  `;
  const args = ["timeout", `${TIMEOUT_S}s`, "ssh", "-i", privPath, ...SSH_OPTS, `${remoteUser}@${ip}`, remoteScript];
  const cmd  = args.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ") + " 2>&1";
  const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" }).catch(()=> "");
  return String(out).includes("OK");
}

// ===== Registry aliases on remote =====
// Adds TWO SEPARATE lines to /etc/hosts via awk:
//   <IP> docker-registry
//   <IP> <hostFQDN>
// Fast-fails on sudo password / immutable hosts file / missing sudo.
async function ensureRemoteRegistryAliases(ip, remoteUser, privPath, registryIP, registryHost) {
  const OK  = "__OK__";
  const ERR = "__ERR__:";

  const remoteScript = `
    set -e
    CFG="/etc/hosts"
    REG_IP="${registryIP}"
    REG_ALIAS="docker-registry"
    REG_HOST="${registryHost}"

    if ! command -v sudo >/dev/null 2>&1; then echo "${ERR}no_sudo"; exit 0; fi
    if ! sudo -n true 2>/dev/null; then echo "${ERR}sudopw_required"; exit 0; fi

    if command -v lsattr >/dev/null 2>&1; then
      if lsattr -a "$CFG" 2>/dev/null | grep -q " i "; then echo "${ERR}hosts_immutable"; exit 0; fi
    fi

    ensure_line() {
      ip="$1"; name="$2"
      sudo awk -v want_ip="$ip" -v host="$name" '
        BEGIN { found=0 }
        $0 ~ "^[[:space:]]*[0-9.]+[[:space:]]+"host"([[:space:]]|$)" {
          if (!found) { print want_ip " " host; found=1 }
          next
        }
        { print }
        END { if (!found) print want_ip " " host }
      ' "$CFG" | sudo tee "$CFG.tmp" >/dev/null && sudo mv "$CFG.tmp" "$CFG"
    }

    ensure_line "$REG_IP" "$REG_ALIAS"
    if [ -n "$REG_HOST" ]; then ensure_line "$REG_IP" "$REG_HOST"; fi
    echo "${OK}"
  `;

  const args = [
    "timeout", `${TIMEOUT_S}s`, "ssh", "-i", privPath,
    ...SSH_OPTS,
    `${remoteUser}@${ip}`, remoteScript
  ];
  const cmd = args.map(a => (/\s/.test(a) ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ") + " 2>&1";

  try {
    const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" });
    const s = String(out);
    if (s.includes(OK)) return { ok:true, msg:"ok" };
    if (s.includes("__ERR__:no_sudo"))         return { ok:false, msg:"sudo not installed" };
    if (s.includes("__ERR__:sudopw_required")) return { ok:false, msg:"sudo requires password (configure NOPASSWD)" };
    if (s.includes("__ERR__:hosts_immutable")) return { ok:false, msg:"/etc/hosts immutable (chattr -i /etc/hosts)" };
    console.warn(`alias output (${ip}):`, out);
    return { ok:false, msg:"unknown error (see console)" };
  } catch (e) {
    console.error(`alias fail (${ip}):`, e);
    return { ok:false, msg: e.message || "spawn failed" };
  }
}

// ===== UI module =====
export function createSSHUI({ getHosts }) {
  const el = {
    localUser:   document.getElementById("ssh-local-user"),
    keyType:     document.getElementById("ssh-key-type"),
    remoteUser:  document.getElementById("ssh-remote-user"),
    remotePass:  document.getElementById("ssh-remote-pass"),
    genBtn:      document.getElementById("ssh-gen"),
    distBtn:     document.getElementById("ssh-dist"),
    disableBtn:  document.getElementById("ssh-disable-pass"),
    status:      document.getElementById("ssh-status"),
    tbody:       document.getElementById("ssh-tbody"),
    selectAll:   document.getElementById("ssh-select-all"),
    qAll:        document.getElementById("ssh-sel-all"),
    qNone:       document.getElementById("ssh-sel-none"),
    pager:       document.getElementById("ssh-pager"),
    pageFirst:   document.getElementById("ssh-page-first"),
    pagePrev:    document.getElementById("ssh-page-prev"),
    pageNext:    document.getElementById("ssh-page-next"),
    pageLast:    document.getElementById("ssh-page-last"),
    pageInfo:    document.getElementById("ssh-page-info"),
    pageSizeSel: document.getElementById("ssh-page-size"),
    loadMore:    document.getElementById("ssh-load-more"),
    count:       document.getElementById("ssh-count"),
  };

  // Row state per host:
  // { selected, ip, roles, hasKey, hasReg, pwdOff, lastMsg, lastClass }
  const rowState = new Map();
  let currentPage = 1;
  let pageSize = parseInt(el.pageSizeSel?.value || PAGE_SIZE, 10);
  if (Number.isNaN(pageSize)) pageSize = PAGE_SIZE;

  const targets = () => getHosts() || [];
  const totalPagesOf = len => Math.max(1, Math.ceil(len / Math.max(1, pageSize)));
  const clampPage = (len) => { const t = totalPagesOf(len); if (currentPage > t) currentPage = t; if (currentPage < 1) currentPage = 1; };


  function renderPager(total) {
  // Show pager only if results exceed current page size
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const show  = total > pageSize;

  if (el.pager)     el.pager.hidden = !show;
  if (show && el.pageInfo) el.pageInfo.textContent = `Page ${currentPage} / ${pages}`;

  if (el.pageFirst) el.pageFirst.disabled = currentPage === 1;
  if (el.pagePrev)  el.pagePrev.disabled  = currentPage === 1;
  if (el.pageNext)  el.pageNext.disabled  = currentPage === pages;
  if (el.pageLast)  el.pageLast.disabled  = currentPage === pages;
}

  // ===== helpers: status & badges =====
  function persistHost(hn, st) {
    persisted[hn] = {
      hasKey: !!st.hasKey,
      hasReg: !!st.hasReg,
      pwdOff: !!st.pwdOff,
      lastMsg: st.lastMsg || "",
      lastClass: st.lastClass || "",
      ts: Date.now()
    };
    schedulePersist();
  }
  function setRowMsg(hn, text, cls) {
    const st = rowState.get(hn) || {};
    st.lastMsg = text || "";
    st.lastClass = cls || "";
    rowState.set(hn, st);
    persistHost(hn, st);
  }
  function markKey(hn, v=true){ const st=rowState.get(hn)||{}; st.hasKey=!!v; rowState.set(hn,st); persistHost(hn,st); }
  function markReg(hn, v=true){ const st=rowState.get(hn)||{}; st.hasReg=!!v; rowState.set(hn,st); persistHost(hn,st); }
  function markPwd(hn, v=true){ const st=rowState.get(hn)||{}; st.pwdOff=!!v; rowState.set(hn,st); persistHost(hn,st); }

  // Tiny badge factory (inline styles to avoid extra CSS)
  function badge(label, ok) {
    const bg = ok ? "rgba(33,208,122,.15)" : "rgba(255,255,255,.06)";
    const bd = ok ? "#21d07a" : "#293042";
    const fg = ok ? "#21d07a" : "#a9b4c0";
    return `<span style="
      display:inline-block; padding:2px 8px; margin-right:6px;
      border-radius:9999px; border:1px solid ${bd}; background:${bg};
      color:${fg}; font:12px/1.6 system-ui; vertical-align:middle;"
    >${label}${ok?" ✓":""}</span>`;
  }


  // simple HTML escaper for the note line
function escapeHtml(s){ return String(s||"")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }



function renderBadges(st){
  const items = [
    { label: "Key",    ok: !!st.hasKey },
    { label: "Reg",    ok: !!st.hasReg },
    { label: "PwdOff", ok: !!st.pwdOff }
  ];

  const badges = items.map(it => `
    <span class="xd-badge ${it.ok ? "ok" : "off"}" title="${it.label}${it.ok ? ' is set' : ' not set'}">
      <span class="dot"></span><span>${it.label}</span>${it.ok ? '<span aria-hidden="true">✓</span>' : ''}
    </span>
  `).join("");

  const noteClass =
    st.lastClass === "ok"  ? "ok"  :
    st.lastClass === "err" ? "err" : "";

  const note = st.lastMsg
    ? `<div class="xd-status-note ${noteClass}">${escapeHtml(st.lastMsg)}</div>`
    : "";

  return `<div class="xd-badges">${badges}</div>${note}`;
}


  function updateMaster() {
    if (!el.selectAll) return;
    const list = Array.from(rowState.values());
    const total = list.length;
    const selected = list.filter(s => s.selected).length;
    el.selectAll.checked = selected === total && total > 0;
    el.selectAll.indeterminate = selected > 0 && selected < total;
  }

  function selectedCount() {
    let n = 0; for (const st of rowState.values()) if (st.selected) n++; return n;
  }
  function updateActionsEnabled() {
    const total = (getHosts() || []).length;
    const sel   = selectedCount();
    const haveSel = total > 0 && sel > 0;
    el.distBtn.disabled    = !haveSel;
    el.disableBtn.disabled = !haveSel;
    if (el.count) el.count.textContent = total ? `${sel}/${total} selected` : `0 selected`;
  }

function renderTable() {
  // Keep pageSize synced with the dropdown every render
  if (el.pageSizeSel) {
    const selVal = parseInt(el.pageSizeSel.value || pageSize, 10);
    if (!Number.isNaN(selVal)) pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, selVal));
  }

  const list = targets();
  const total = list.length;
  clampPage(total);

  // Ensure rowState entries exist / refresh IP/roles
  list.forEach(h => {
    if (!rowState.has(h.hostname)) {
      rowState.set(h.hostname, {
        selected: true, ip: h.ip, roles: h.roles || [],
        // support either model: 3-badge or single-text
        hasKey: !!rowState.get(h.hostname)?.hasKey,
        hasReg: !!rowState.get(h.hostname)?.hasReg,
        pwdOff: !!rowState.get(h.hostname)?.pwdOff,
        lastMsg: rowState.get(h.hostname)?.lastMsg || rowState.get(h.hostname)?.statusText || "",
        lastClass: rowState.get(h.hostname)?.lastClass || rowState.get(h.hostname)?.statusClass || ""
      });
    } else {
      const st = rowState.get(h.hostname);
      st.ip = h.ip; st.roles = h.roles || [];
    }
  });

  // Visible slice
  el.tbody.innerHTML = "";
  const start = (currentPage - 1) * pageSize;
  const end   = Math.min(start + pageSize, total);

  for (let i = start; i < end; i++) {
    const h  = list[i];
    const st = rowState.get(h.hostname) || {};

    const tr = document.createElement("tr");

    // checkbox
    const tdCk = document.createElement("td");
    const cb   = document.createElement("input");
    cb.type    = "checkbox";
    cb.checked = !!st.selected;
    cb.addEventListener("change", () => { st.selected = cb.checked; updateMaster(); updateActionsEnabled(); });
    tdCk.appendChild(cb); tr.appendChild(tdCk);

    // hostname, ip, roles
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: h.hostname || "" }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: h.ip || "" }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: Array.isArray(h.roles) ? h.roles.join(", ") : "" }));

    // status cell (supports both the new badge view and the legacy text view)
    const tdS = document.createElement("td");
    if (typeof renderBadges === "function") {
      tdS.innerHTML = renderBadges(st);
    } else {
      tdS.textContent = st.statusText || st.lastMsg || "";
      tdS.style.color = (st.statusClass || st.lastClass) === "ok" ? "#27ae60"
                   : (st.statusClass || st.lastClass) === "err" ? "#d9534f" : "";
    }
    tr.appendChild(tdS);

    el.tbody.appendChild(tr);
  }

  // Footer: “X–Y of N” and pager
  if (el.count) el.count.textContent = total ? `${start + 1}-${end} of ${total}` : `0-0 of 0`;
  renderPager(total);

  updateMaster();
  updateActionsEnabled();
}


  // Master checkbox
  el.selectAll?.addEventListener("change", () => {
    const checked = el.selectAll.checked;
    for (const st of rowState.values()) st.selected = checked;
    el.tbody.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = checked);
    updateMaster(); updateActionsEnabled();
  });

  // Quick-selects
  el.qAll?.addEventListener("click",  () => { for (const st of rowState.values()) st.selected = true;  renderTable(); });
  el.qNone?.addEventListener("click", () => { for (const st of rowState.values()) st.selected = false; renderTable(); });

  // Pager
  el.pageFirst && (el.pageFirst.onclick = () => { currentPage = 1; renderTable(); });
  el.pagePrev  && (el.pagePrev.onclick  = () => { currentPage--;  renderTable(); });
  el.pageNext  && (el.pageNext.onclick  = () => { currentPage++;  renderTable(); });
  el.pageLast  && (el.pageLast.onclick  = () => { currentPage = Number.MAX_SAFE_INTEGER; renderTable(); });
  el.pageSizeSel && el.pageSizeSel.addEventListener("change", () => {
    const v = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(el.pageSizeSel.value || "10", 10)));
    pageSize = v; currentPage = 1; renderTable();
  });

  el.loadMore && el.loadMore.addEventListener("click", () => {
    const total = targets().length;
    if (pageSize < MAX_PAGE_SIZE && pageSize < total) {
      pageSize = Math.min(MAX_PAGE_SIZE, pageSize + 10, total);
      if (el.pageSizeSel) el.pageSizeSel.value = String(pageSize);
      currentPage = 1; renderTable();
    }
  });

  // Buttons
  el.genBtn.addEventListener("click", async () => {
    try {
      setStatus(el.status, "Checking/creating local key…");
      const kp = await ensureLocalKey(el.localUser.value.trim() || "root", el.keyType.value);
      setStatus(el.status, `Key ready: ${kp.public}`, "ok");
    } catch (e) {
      console.error(e);
      setStatus(el.status, "Failed to create key.", "err");
    }
  });

  // Distribute: verify-or-install key, then add aliases; update badges
  el.distBtn.addEventListener("click", async () => {
    const localUser  = el.localUser.value.trim() || "root";
    const keyType    = el.keyType.value;
    const remoteUser = el.remoteUser.value.trim() || "root";
    const remotePass = (el.remotePass?.value || "").trim();

    if (remotePass) {
      const okPass = await ensureSshpass();
      if (!okPass) return setStatus(el.status, "sshpass not installed", "err");
    }

    let kp;
    try { kp = await ensureLocalKey(localUser, keyType); }
    catch { return setStatus(el.status, "Failed to create/read local key.", "err"); }

    const keyOk = await ensurePrivateKeyUsable(kp.private);
    if (!keyOk.ok) return setStatus(el.status, `Local key not usable (${keyOk.reason})`, "err");

    const tList = Array.from(rowState.entries()).filter(([,st]) => st.selected).map(([hostname, st]) => ({ hostname, ip: st.ip }));
    if (!tList.length) return setStatus(el.status, "No hosts selected.", "err");

    const registryIP   = await getLocalPrimaryIPv4();
    const registryHost = await getLocalHostnameFQDN();

    let done = 0, skipped = 0;

    for (const t of tList) {
      // verify key; install if needed and password provided
      setRowMsg(t.hostname, "Verifying key…", ""); renderTable();
      let hasKey = await verifyKeyOne(t.ip, remoteUser, kp.private);

      if (!hasKey && !remotePass) {
        setRowMsg(t.hostname, "no key · password required", "err"); renderTable(); skipped++; continue;
      }
      if (!hasKey && remotePass) {
        setRowMsg(t.hostname, "Copying key…", ""); renderTable();
        const okCopy = await distributeOne(t.ip, remoteUser, remotePass, kp.public);
        if (!okCopy) { setRowMsg(t.hostname, "copy failed", "err"); renderTable(); continue; }
        setRowMsg(t.hostname, "Verifying…", ""); renderTable();
        hasKey = await verifyKeyOne(t.ip, remoteUser, kp.private);
        if (!hasKey) { setRowMsg(t.hostname, "verify failed", "err"); renderTable(); continue; }
      }

      // mark key badge
      markKey(t.hostname, true);
      setRowMsg(t.hostname, "adding registry aliases…", ""); renderTable();

      const reg = await ensureRemoteRegistryAliases(t.ip, remoteUser, kp.private, registryIP, registryHost);
      if (reg.ok) {
        markReg(t.hostname, true);
        setRowMsg(t.hostname, `key installed ✓ · registry=${registryIP}`, "ok");
        done++;
      } else {
        setRowMsg(t.hostname, `key ok · registry failed: ${reg.msg}`, "err");
      }
      renderTable();
    }

    setStatus(el.status,
      skipped ? `Done ${done}, ${skipped} host(s) need a password to install keys.` : "Distribution complete.",
      skipped ? "err" : "ok"
    );
  });

  // Disable password SSH; update pwdOff badge
  el.disableBtn.addEventListener("click", async () => {
    const localUser  = el.localUser.value.trim() || "root";
    const keyType    = el.keyType.value;
    const remoteUser = el.remoteUser.value.trim() || "root";
    let kp;
    try { kp = await ensureLocalKey(localUser, keyType); }
    catch { return setStatus(el.status, "Failed to read local key.", "err"); }

    const keyOk = await ensurePrivateKeyUsable(kp.private);
    if (!keyOk.ok) return setStatus(el.status, `Local key not usable (${keyOk.reason})`, "err");

    const tList = Array.from(rowState.entries()).filter(([,st]) => st.selected).map(([hostname, st]) => ({ hostname, ip: st.ip }));
    if (!tList.length) return setStatus(el.status, "No hosts selected.", "err");

    for (const t of tList) {
      setRowMsg(t.hostname, "Disabling password SSH…", ""); renderTable();
      const ok = await disablePasswordSsh(t.ip, remoteUser, kp.private);
      if (ok) {
        markPwd(t.hostname, true);
        setRowMsg(t.hostname, "password SSH disabled", "ok");
      } else {
        setRowMsg(t.hostname, "disable failed", "err");
      }
      renderTable();
    }
    setStatus(el.status, "Hardening complete.", "ok");
  });

  // Rehydrate statuses from disk
  (async () => {
    persisted = await loadSSHStatus();
    setTimeout(() => { renderTable(); }, 0);
  })();

  renderTable();
  return { refresh: renderTable };
}
