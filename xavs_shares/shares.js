/* global cockpit */
(function () {
  "use strict";
  // ===== UI LOGGING (shows logs even if browser console hides them) =====
  const ui = {
    pane: null, body: null,
    ensure() {
      if (!this.pane) this.pane = document.getElementById("debug-panel");
      if (!this.body) this.body = document.getElementById("debug-log");
    },
    show() { this.ensure(); this.pane?.classList.remove("hidden"); },
    hide() { this.ensure(); this.pane?.classList.add("hidden"); },
    line(level, msg) {
      this.ensure();
      if (!this.body) return;
      const ts = new Date().toISOString().replace('T',' ').replace('Z','');
      this.body.textContent += `[${ts}] ${level.toUpperCase()}: ${msg}\n`;
      this.body.scrollTop = this.body.scrollHeight;
    }
  };

  // hook up debug buttons immediately
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-debug")?.addEventListener("click", () => ui.show());
    document.getElementById("btn-debug-close")?.addEventListener("click", () => ui.hide());
    document.getElementById("btn-debug-clear")?.addEventListener("click", () => { ui.ensure(); if (ui.body) ui.body.textContent = ""; });
    document.getElementById("btn-debug-copy")?.addEventListener("click", async () => {
      ui.ensure(); try { await navigator.clipboard.writeText(ui.body?.textContent || ""); } catch {}
    });
  });

  // Mirror console logs into UI
  const _log = console.log.bind(console);
  const _warn = console.warn.bind(console);
  const _err = console.error.bind(console);
  console.log = (...a) => { _log(...a); ui.line("log", a.map(String).join(" ")); };
  console.warn = (...a) => { _warn(...a); ui.line("warn", a.map(String).join(" ")); };
  console.error = (...a) => { _err(...a); ui.line("error", a.map(String).join(" ")); };

  console.log("[Shares] script loaded");

  // ===== Global error banners =====
  window.onerror = (m,s,l,c,e) => {
    console.error("[Shares] onerror:", m, s, l, c, e);
    const g = document.getElementById("global-error");
    if (g) { g.classList.remove("d-none"); g.innerHTML = "<strong>JS error:</strong> " + String(m); }
  };
  window.onunhandledrejection = (ev) => {
    console.error("[Shares] unhandled:", ev?.reason || ev);
    const g = document.getElementById("global-error");
    if (g) { g.classList.remove("d-none"); g.innerHTML = "<strong>Async error:</strong> " + String(ev?.reason || ev); }
  };

  // ===== Helpers =====
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  function shq(v){ const s=String(v??""); return s===""?"''":"'" + s.replace(/'/g, `'\"'\"'`) + "'"; }

  function run(cmd, timeoutMs = 8000) {
    console.log("[run] start:", cmd);
    const p = cockpit.spawn(["bash","-lc",cmd], { superuser:"require", err:"out" });
    const t = new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout "+timeoutMs+"ms")), timeoutMs));
    return Promise.race([p,t])
      .then(out => { console.log("[run] ok:", cmd, "\n", out.trim()); return out; })
      .catch(e  => { console.error("[run] err:", cmd, e); throw e; });
  }

  // ===== Tabs (only one pane active) =====
  function setActive(tabId){
    $$(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.tab === tabId));
    $$(".tab-pane").forEach(p => p.classList.toggle("active", p.id === tabId));
  }
  function initTabs(){
    $$(".nav-link").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); setActive(a.dataset.tab); }));
    setActive("tab-overview"); // default
  }

  // ===== OS + prereqs =====
  let os = { id:"linux", like:"" };
  async function detectOS(){
    try {
      const txt = await cockpit.file("/etc/os-release").read();
      const m={}; txt.split("\n").forEach(l=>{ const k=l.match(/^([A-Z_]+)=(.*)$/); if(k) m[k[1]]=k[2].replace(/^"/,"").replace(/"$/,""); });
      os.id=(m.ID||"linux").toLowerCase(); os.like=(m.ID_LIKE||"").toLowerCase();
      console.log("[os]", JSON.stringify(os));
    } catch (e) { console.warn("[os] read failed", e); }
  }
  async function have(bin){ try { await run(`command -v ${bin}`,3000); return true; } catch { return false; } }
  async function showInstallHints(){
    const need = {
      nfs_srv:    !(await have("exportfs")),
      nfs_client: !(await have("mount.nfs")),
      iscsi_init: !(await have("iscsiadm")),
      targetcli:  !(await have("targetcli")) && !(await have("targetcli-fb"))
    };
    console.log("[prereq]", JSON.stringify(need));
    const isDeb  = /debian|ubuntu/.test(os.id) || /debian|ubuntu/.test(os.like);
    const isRhel = /rhel|centos|rocky|alma|fedora/.test(os.id) || /rhel|fedora/.test(os.like);
    const hints = [];
    if (isDeb) {
      if (need.iscsi_init) hints.push(`<code>apt install -y open-iscsi</code>`);
      if (need.targetcli)  hints.push(`<code>apt install -y targetcli-fb python3-rtslib-fb</code>`);
      if (hints.length)    hints.push(`<code>systemctl enable --now nfs-kernel-server iscsid rtslib-fb-targetctl</code>`);
    } else if (isRhel) {
      if (need.iscsi_init) hints.push(`<code>dnf install -y iscsi-initiator-utils</code>`);
      if (need.targetcli)  hints.push(`<code>dnf install -y targetcli</code>`);
      if (hints.length)    hints.push(`<code>systemctl enable --now nfs-server iscsid target</code>`);
    }
    const box = $("#global-error");
    if (hints.length) { box.classList.remove("d-none"); box.innerHTML = `<strong>Missing components detected.</strong><br>${hints.map(h=>`<div>${h}</div>`).join("")}`; }
    else if (!box.innerText.startsWith("JS error") && !box.innerText.startsWith("Async error")) { box.classList.add("d-none"); box.innerHTML=""; }
  }

  // ===== Overview: NFS mounts (findmnt first; strict types) =====
  async function loadNfsMounts(){
    const ul = $("#nfs-mounts-list"); if (!ul) return;
    ul.innerHTML = `<li class="muted">Loading…</li>`;
    try {
      let out = "";
      if (await have("findmnt")) {
        out = await run(`findmnt -rn -t nfs,nfs4 -o SOURCE,TARGET,FSTYPE,OPTIONS || true`, 6000);
        const lines = out.trim() ? out.trim().split("\n") : [];
        ul.innerHTML = "";
        if (!lines.length) { ul.innerHTML = `<li class="muted">No NFS mounts</li>`; return; }
        lines.forEach(l => {
          const p = l.trim().split(/\s+/);
          const src = p[0], tgt = p[1], fstype = p[2] || "nfs", opts = p[3] || "";
          const li = document.createElement("li");
          li.innerHTML = `<i class="fa fa-server"></i> ${src} -> ${tgt} [${fstype} ${opts}]
            <span style="margin-left:auto"></span>
            <button class="btn btn-outline btn-sm" data-umount="${tgt}"><i class="fa fa-eject"></i> Umount</button>`;
          ul.appendChild(li);
        });
      } else {
        out = await run(`awk '$3=="nfs" || $3=="nfs4" {print $1" -> "$2" ["$3" " $4"]"}' /proc/mounts || true`, 6000);
        ul.innerHTML = "";
        if (!out.trim()) { ul.innerHTML = `<li class="muted">No NFS mounts</li>`; return; }
        out.trim().split("\n").forEach(line => {
          const tgt = (line.split(" -> ")[1] || "").split(" [")[0];
          const li = document.createElement("li");
          li.innerHTML = `<i class="fa fa-server"></i> ${line}
            <span style="margin-left:auto"></span>
            <button class="btn btn-outline btn-sm" data-umount="${tgt}"><i class="fa fa-eject"></i> Umount</button>`;
          ul.appendChild(li);
        });
      }
      ul.querySelectorAll("[data-umount]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const mnt = btn.getAttribute("data-umount"); btn.disabled = true;
          try { await run(`umount -f ${shq(mnt)}`, 8000); } catch(e) { alert(`umount failed: ${e.message||e}`); }
          finally { btn.disabled=false; loadNfsMounts(); }
        });
      });
    } catch (e) {
      ul.innerHTML = `<li class="err"><i class="fa fa-exclamation-triangle"></i> NFS check failed: ${String(e.message||e)}</li>`;
    }
  }

  // ===== Overview: iSCSI sessions =====
  async function loadIscsiSessions(){
    const ul = $("#iscsi-sessions-list"); if (!ul) return;
    ul.innerHTML = `<li class="muted">Loading…</li>`;
    try {
      const out = await run(`iscsiadm -m session 2>/dev/null || true`, 6000);
      ul.innerHTML = "";
      if (!out.trim()) { ul.innerHTML = `<li class="muted">No iSCSI sessions</li>`; return; }
      out.trim().split("\n").forEach(line => {
        const m = line.match(/\s*\w+:\s*\[\d+\]\s*([0-9\.\-:]+),\d+\s+(iqn\.[^\s]+)/);
        const portal = m ? m[1] : "-";
        const iqn    = m ? m[2] : line;
        const li = document.createElement("li");
        li.innerHTML = `<i class="fa fa-link"></i> <strong>${iqn}</strong> @ ${portal}
          <span style="margin-left:auto"></span>
          <button class="btn btn-outline btn-sm" data-logout="${iqn}|${portal}"><i class="fa fa-sign-out"></i> Logout</button>`;
        ul.appendChild(li);
      });
      ul.querySelectorAll("[data-logout]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const [iqn, portal] = btn.getAttribute("data-logout").split("|"); btn.disabled = true;
          try { await run(`iscsiadm -m node -T ${shq(iqn)} -p ${shq(portal)} --logout || true`, 8000); }
          catch(e){ alert(`logout failed: ${e.message||e}`); }
          finally { btn.disabled=false; loadIscsiSessions(); }
        });
      });
    } catch (e) {
      ul.innerHTML = `<li class="err"><i class="fa fa-exclamation-triangle"></i> iSCSI check failed: ${String(e.message||e)}</li>`;
    }
  }

  // ===== NFS tab =====
  function parseExports(text){
    return text.split("\n").map(l=>l.trim()).filter(l=>l && !l.startsWith("#")).map(l=>{
      let m = l.match(/^(\S+)\s+(\S+)\(([^)]*)\)$/);
      if (m) return { path:m[1], scope:m[2], opts:m[3] };
      m = l.match(/^(\S+)\s+\(([^)]*)\)$/);
      if (m) return { path:m[1], scope:"*", opts:m[2] };
      return null;
    }).filter(Boolean);
  }
  async function loadExports(){
    const ul = $("#nfs-exports-list"); if (!ul) return;
    ul.innerHTML = `<li class="muted">Loading…</li>`;
    try {
      let text=""; try { text = await cockpit.file("/etc/exports").read(); } catch { text = ""; }
      const entries = text ? parseExports(text) : [];
      ul.innerHTML = "";
      if (!entries.length) { ul.innerHTML = `<li class="muted">No exports</li>`; return; }
      entries.forEach(e => {
        const li = document.createElement("li");
        li.innerHTML = `<i class="fa fa-folder"></i> <strong>${e.path}</strong> ${e.scope} (${e.opts})
          <span style="margin-left:auto"></span>
          <button class="btn btn-outline btn-sm" data-del="${e.path}|${e.scope}"><i class="fa fa-trash"></i> Delete</button>`;
        ul.appendChild(li);
      });
      ul.querySelectorAll("[data-del]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const [path, scope] = btn.getAttribute("data-del").split("|"); btn.disabled = true;
          try {
            const ep = path.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
            const es = scope.replace(/\*/g,"\\*");
            const sed = `sed -i '\\#^${ep}\\s\\+${es}\\(#\\|(\\)#d' /etc/exports`;
            await run(`[ -f /etc/exports ] || install -m 0644 /dev/null /etc/exports`, 4000);
            await run(sed, 5000);
            await run(`exportfs -u ${shq(path)} || true`, 4000);
            await run(`exportfs -ra || true`, 6000);
          } catch(e) { alert(`Delete failed: ${e.message||e}`); }
          finally { btn.disabled=false; loadExports(); }
        });
      });
    } catch (e) {
      ul.innerHTML = `<li class="err"><i class="fa fa-exclamation-triangle"></i> Exports read failed: ${String(e.message||e)}</li>`;
    }
  }
  function buildNfsOpts(perm,noRoot){ const a=[perm,"sync","no_subtree_check"]; if(noRoot)a.push("no_root_squash"); return a.join(","); }
  async function submitCreateExport(e){
    e.preventDefault();
    const name  = $("#nfs-name").value.trim();
    const base  = $("#nfs-base").value.trim() || "/srv/nfs";
    const perm  = $("#nfs-perm").value;
    const scope = $("#nfs-scope").value.trim() || "*";
    const noRoot = $("#nfs-no-root-squash").checked;
    const msg   = $("#nfs-create-msg");
    if (!name) { msg.textContent=""; setTimeout(()=>{ msg.className="msg error"; msg.textContent="Share name is required."; },0); return; }
    const path  = `${base.replace(/\/+$/,"")}/${name}`;
    const opts  = buildNfsOpts(perm,noRoot);
    const entry = `${path} ${scope}(${opts})`;
    try{
      await run(`install -d -m 0775 ${shq(path)}`, 4000);
      await run(`[ -f /etc/exports ] || install -m 0644 /dev/null /etc/exports`, 4000);
      await run(`grep -qxF ${shq(entry)} /etc/exports || echo ${shq(entry)} >> /etc/exports`, 4000);
      await run(`exportfs -ra`, 6000);
      await run(`(systemctl enable --now nfs-server || systemctl enable --now nfs-kernel-server) 2>/dev/null || true`, 6000);
      msg.className="msg success"; msg.textContent=`Created export: ${entry}`;
      loadExports();
    }catch(err){ msg.className="msg error"; msg.textContent=`Failed: ${err.message||err}`; }
  }

  // ===== iSCSI tab =====
  async function targetcli(lines){
    const runner = (await have("targetcli")) ? "targetcli" : "targetcli-fb";
    const script = (Array.isArray(lines)?lines:[String(lines)]).join("\n");
    return run(`${runner} <<'EOF'\n${script}\nEOF`, 12000);
  }
  async function listTargets(){
    try{
      const out = await run(`(targetcli /iscsi ls || targetcli-fb /iscsi ls) 2>/dev/null || true`, 8000);
      const arr=[]; let cur=null;
      out.split("\n").forEach(line=>{
        const t=line.match(/\s*o-\s+(iqn\.[^\s]+)/);
        if(t){ if(cur)arr.push(cur); cur={iqn:t[1],luns:[]}; return; }
        const l=line.match(/\s*o-\s+lun(\d+)\s+\[(\S+)\]\s+(\S+)/);
        if(l && cur) cur.luns.push({lun:l[1], backstore:l[2], path:l[3]});
      });
      if(cur) arr.push(cur);
      return arr;
    }catch{ return []; }
  }
  async function loadTargets(){
    const ul=$("#iscsi-targets-list"); if(!ul) return;
    ul.innerHTML=`<li class="muted">Loading…</li>`;
    const data = await listTargets();
    ul.innerHTML="";
    if(!data.length){ ul.innerHTML=`<li class="muted">No iSCSI targets</li>`; return; }
    data.forEach(t=>{
      if(!t.luns.length){
        const li=document.createElement("li");
        li.innerHTML=`<i class="fa fa-hdd-o"></i> <strong>${t.iqn}</strong>
          <span style="margin-left:auto"></span>
          <button class="btn btn-outline btn-sm" data-del-target="${t.iqn}"><i class="fa fa-trash"></i> Delete</button>`;
        ul.appendChild(li);
      } else {
        t.luns.forEach(l=>{
          const li=document.createElement("li");
          li.innerHTML=`<i class="fa fa-hdd-o"></i> <strong>${t.iqn}</strong> | LUN ${l.lun} &nbsp;<code>${l.backstore} ${l.path}</code>
            <span style="margin-left:auto"></span>
            <button class="btn btn-outline btn-sm" data-del-lun="${t.iqn}|${l.lun}"><i class="fa fa-trash"></i> Delete LUN</button>`;
          ul.appendChild(li);
        });
      }
    });
    ul.querySelectorAll("[data-del-lun]").forEach(b=>b.addEventListener("click",async()=>{
      const [iqn,lun]=b.getAttribute("data-del-lun").split("|"); b.disabled=true;
      try{ await targetcli([`/iscsi/${iqn}/tpg1/luns delete lun${lun}`, `saveconfig`]); }catch(e){ alert(`delete LUN failed: ${e.message||e}`); }
      finally{ b.disabled=false; loadTargets(); }
    }));
    ul.querySelectorAll("[data-del-target]").forEach(b=>b.addEventListener("click",async()=>{
      const iqn=b.getAttribute("data-del-target"); b.disabled=true;
      try{ await targetcli([`/iscsi delete ${iqn}`, `saveconfig`]); }catch(e){ alert(`delete target failed: ${e.message||e}`); }
      finally{ b.disabled=false; loadTargets(); }
    }));
  }
  function makeIQN(name){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const host=(cockpit&&cockpit.transport&&cockpit.transport.host)||"xloud"; return `iqn.${y}-${m}.in.${host}:shares-${name}`; }
  async function submitCreateIscsi(e){
    e.preventDefault();
    const name=$("#iscsi-name").value.trim();
    const size=parseInt($("#iscsi-size").value,10);
    const portal=$("#iscsi-portal").value.trim()||"0.0.0.0";
    const openAcl=$("#iscsi-open-acl").checked;
    const msg=$("#iscsi-create-msg");
    if(!name || !size) return (msg.className="msg error", msg.textContent="Name and size are required.");
    const imgDir="/var/lib/iscsi-disks"; const imgPath=`${imgDir}/${name}.img`; const iqn=makeIQN(name);
    try{
      await run(`install -d -m 0755 ${shq(imgDir)} && [ -f ${shq(imgPath)} ] || fallocate -l ${size}G ${shq(imgPath)}`, 12000);
      const s=[ `/backstores/fileio create name=${name} file_or_dev=${imgPath}`, `/iscsi create ${iqn}`, `/iscsi/${iqn}/tpg1/luns create /backstores/fileio/${name}` ];
      if(portal!=="0.0.0.0"){ s.push(`/iscsi/${iqn}/tpg1/portals delete 0.0.0.0 3260 || true`); s.push(`/iscsi/${iqn}/tpg1/portals create ${portal} 3260`); }
      if(openAcl) s.push(`/iscsi/${iqn}/tpg1 set attribute generate_node_acls=1 cache_dynamic_acls=1 demo_mode_write_protect=0`);
      s.push(`saveconfig`);
      await targetcli(s);
      await run(`(systemctl enable --now rtslib-fb-targetctl || systemctl enable --now target) 2>/dev/null || true`, 8000);
      msg.className="msg success"; msg.textContent=`Created target ${iqn} with fileio ${imgPath}`;
      loadTargets();
    }catch(err){ msg.className="msg error"; msg.textContent=`Failed: ${err.message||err}`; }
  }
  async function submitMountIscsi(e){
    e.preventDefault();
    const portal=$("#im-portal").value.trim();
    const iqn   =$("#im-iqn").value.trim();
    const fstype=$("#im-fstype").value;
    const mkfs =$("#im-mkfs").checked;
    const mnt  =$("#im-mountpoint").value.trim();
    const msg  =$("#iscsi-mount-msg");
    if(!portal || !iqn || !mnt) return (msg.className="msg error", msg.textContent="Portal, IQN and mountpoint are required.");
    try{
      await run(`systemctl enable --now iscsid || true`, 6000);
      await run(`iscsiadm -m discovery -t sendtargets -p ${shq(portal)}`, 8000);
      await run(`iscsiadm -m node -T ${shq(iqn)} -p ${shq(portal)} --login`, 12000);
      await run(`iscsiadm -m node -T ${shq(iqn)} -p ${shq(portal)} --op update -n node.startup -v automatic || true`, 6000);
      const dev=(await run(`for i in $(seq 1 30); do P=$(ls -1 /dev/disk/by-path/*-iscsi-${shq(iqn)}-lun-0 2>/dev/null | head -n1); if [ -n "$P" ]; then readlink -f "$P"; break; fi; sleep 1; done`, 31000)).trim();
      if(!dev) throw new Error("Could not detect iSCSI device (lun0)");
      if(mkfs) await run(`blkid ${shq(dev)} || mkfs.${shq(fstype)} -F ${shq(dev)}`, 20000);
      await run(`install -d -m 0755 ${shq(mnt)}`, 4000);
      const uuid=(await run(`blkid -s UUID -o value ${shq(dev)}`, 4000)).trim();
      if(!uuid) throw new Error("No UUID on device (format or check partitions)");
      const fstabLine=`UUID=${uuid} ${mnt} ${fstype} _netdev,defaults 0 0`;
      await run(`grep -qxF ${shq(fstabLine)} /etc/fstab || echo ${shq(fstabLine)} >> /etc/fstab`, 4000);
      await run(`mount ${shq(mnt)}`, 8000);
      msg.className="msg success"; msg.textContent=`Logged in & mounted ${dev} at ${mnt} (persisted in /etc/fstab).`;
      loadIscsiSessions(); loadNfsMounts();
    }catch(err){ msg.className="msg error"; msg.textContent=`Failed: ${err.message||err}`; }
  }

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[Shares] DOM ready");
    initTabs();

    // Buttons
    $("#btn-refresh-nfs-mounts")?.addEventListener("click", loadNfsMounts);
    $("#btn-refresh-iscsi-sessions")?.addEventListener("click", loadIscsiSessions);
    $("#btn-exports-reload")?.addEventListener("click", loadExports);
    $("#btn-exportfs-apply")?.addEventListener("click", async () => {
      try { await run(`exportfs -ra`, 8000); } catch(e){ alert(`exportfs -ra failed: ${e.message||e}`); }
      loadExports();
    });
    $("#nfs-create-form")?.addEventListener("submit", submitCreateExport);
    $("#btn-nfs-clear")?.addEventListener("click", ()=>{ $("#nfs-create-form")?.reset(); $("#nfs-create-msg").textContent=""; });
    $("#btn-targets-refresh")?.addEventListener("click", loadTargets);
    $("#iscsi-create-form")?.addEventListener("submit", submitCreateIscsi);
    $("#btn-iscsi-clear")?.addEventListener("click", ()=>{ $("#iscsi-create-form")?.reset(); $("#iscsi-create-msg").textContent=""; });
    $("#iscsi-mount-form")?.addEventListener("submit", submitMountIscsi);
    $("#btn-im-logout")?.addEventListener("click", async ()=>{
      const portal=$("#im-portal")?.value?.trim(); const iqn=$("#im-iqn")?.value?.trim();
      if(portal && iqn){ try{ await run(`iscsiadm -m node -T ${shq(iqn)} -p ${shq(portal)} --logout || true`, 8000); }catch{} }
      loadIscsiSessions();
    });

    // Bootstrap background
    (async ()=>{
      await detectOS();
      await showInstallHints();
      await loadNfsMounts();
      await loadIscsiSessions();
      await loadExports();
      await loadTargets();
    })();
  });
})();
