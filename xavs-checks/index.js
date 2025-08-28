/* global cockpit */
(function () {
  // ——— helpers ———
  const $  = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const setBadge = (id, cls, text) => { const el=$(id); if(!el) return; el.className = "badge " + (cls||""); el.textContent = text || "—"; };
  const setText  = (id, text) => { const el=$(id); if(el) el.textContent = text; };
  const pb = (id, v) => { const el=$(id); if(el) el.style.width = Math.max(0, Math.min(100, v)) + "%"; };
  const logEl = $("log");
  const log = (t="") => { if (!logEl) return; logEl.textContent += t + "\n"; logEl.scrollTop = logEl.scrollHeight; };

  // ——— tabs (anchors) ———
  (function wireTabs(){
    const links = $$('#tabs .nav-link');
    function show(panelId){
      $$('.panel').forEach(p => p.classList.remove('active'));
      $$('.nav-link').forEach(a => a.classList.remove('active'));
      const panel = $('#'+panelId);
      const link  = links.find(a => a.dataset.target===panelId);
      if (panel) panel.classList.add('active');
      if (link)  link.classList.add('active');
    }
    links.forEach(a => a.addEventListener('click', (e)=>{
      e.preventDefault();
      show(a.dataset.target);
      if (a.dataset.target === 'panel-hw')   runHW().catch(()=>{});
      if (a.dataset.target === 'panel-deps') checkDeps().catch(()=>{});
    }));
    show('panel-overview');
  })();

  // ——— state ———
  let os = { name:"Unknown", id:"", like:"", ver:"", kernel:"", isXOS:false, branch:"unknown" };

  // ——— OS detection ———
  async function detectOS(){
    try{
      setText("os-name","Detecting…");
      const out = await cockpit.spawn(["bash","-lc","source /etc/os-release 2>/dev/null; echo \"$NAME|$ID|$ID_LIKE|$VERSION_ID\""]);
      const ker = await cockpit.spawn(["uname","-r"]);
      const [name,id,like,ver] = (out.trim() || "Unknown|||").split("|");
      os.name=name||"Unknown"; os.id=id||""; os.like=like||""; os.ver=ver||""; os.kernel=ker.trim();
      os.isXOS = /xos/i.test(os.name) || /xos/i.test(os.id);
      const isDeb  = /debian|ubuntu/i.test(os.id) || /debian|ubuntu/i.test(os.like);
      const isRhel = /rhel|rocky|centos|almalinux/i.test(os.id) || /rhel|rocky|centos|almalinux/i.test(os.like);
      os.branch = isDeb ? "debian" : (isRhel ? "rhel" : "unknown");

      setText("os-name", os.name + (os.ver ? " " + os.ver : ""));
      setText("os-kernel", os.kernel);
      setText("os-branch", os.branch==="debian" ? "Debian/Ubuntu" : os.branch==="rhel" ? "RHEL/Rocky/CentOS" : "Unknown");
      setText("os-mode", os.isXOS ? "XOS: hardware-only checks" : "Standard: HW + packages");

      // XOS banner visible only for non-XOS
      const reco = $("xos-reco");
      if (reco) reco.style.display = os.isXOS ? "none" : "";

      // Dependencies tab state
      setText("dep-branch", os.isXOS ? "XOS (skips packages)" : (os.branch==="debian"?"Debian/Ubuntu":os.branch==="rhel"?"RHEL/Rocky/CentOS":"Unknown"));
      if (os.isXOS) {
        $("dep-grid").style.opacity = "0.5";
        $("btn-install-all").disabled = true;
        $("btn-check-deps").disabled = true;
        setText("dep-status","Skipped on XOS");
      } else {
        $("dep-grid").style.opacity = "1";
        $("btn-install-all").disabled = false;
        $("btn-check-deps").disabled = false;
        setText("dep-status","Ready");
      }
      log(`[OS] ${os.name} (id=${os.id}, like=${os.like}) kernel=${os.kernel} branch=${os.branch} XOS=${os.isXOS}`);
    } catch(e){
      setText("os-name","Unknown"); setText("os-kernel","—"); setText("os-branch","—"); setText("os-mode","—");
      log("[OS] Detection failed: " + e);
    }
  }

  // ——— Hardware checks ———
  async function runHW(){
    setBadge("chk-root","","…"); setBadge("chk-nics","","…"); setBadge("chk-extra","","…"); setBadge("chk-cores","","…"); setBadge("chk-ram","","…");
    setText("hw-summary","");
    try{
      const df = await cockpit.spawn(["bash","-lc","df -BG / | awk 'NR==2{gsub(\"G\",\"\",$4); print $4}'"]);
      const free = parseInt(df.trim(),10) || 0;
      setBadge("chk-root", free>=100 ? "ok" : "err", `${free} GB`);

      const nc = await cockpit.spawn(["bash","-lc","ls -1 /sys/class/net | grep -v '^lo$' | wc -l"]);
      const nics = parseInt(nc.trim(),10) || 0;
      setBadge("chk-nics", nics>=2 ? "ok" : "err", String(nics));

      const extraScript =
        "rootdev=$(findmnt -n -o SOURCE / | sed 's/[0-9]*$//');" +
        "disks=$(lsblk -dn -o NAME,TYPE | awk '$2==\"disk\"{print \"/dev/\"$1}');" +
        "extra=0; for d in $disks; do if [ \"$d\" != \"$rootdev\" ]; then parts=$(lsblk -no NAME,MOUNTPOINT \"$d\" | tail -n +2 | awk 'NF'); [ -z \"$parts\" ] && extra=1 && break; fi; done;" +
        "if [ $extra -eq 0 ]; then if command -v vgs >/dev/null 2>&1; then vgs --noheadings -o vg_name,lv_count,vg_free | awk '($2==0)||($3!~/0B/){found=1} END{exit !(found)}' && echo YES || echo NO; else echo NO; fi; else echo YES; fi";
      const extra = (await cockpit.spawn(["bash","-lc",extraScript])).trim()==="YES";
      setBadge("chk-extra", extra ? "ok" : "warn", extra ? "Available" : "Not found");

      const cores = parseInt((await cockpit.spawn(["nproc"])).trim(),10) || 0;
      setBadge("chk-cores", cores>=4 ? "ok" : "err", String(cores));

      const memK = parseInt((await cockpit.spawn(["bash","-lc","awk '/MemTotal/ {print $2}' /proc/meminfo"])).trim(),10) || 0;
      const memGB = Math.floor(memK/1024/1024);
      setBadge("chk-ram", memGB>=8 ? "ok" : "err", `${memGB} GB`);

      const errs = ["chk-root","chk-nics","chk-cores","chk-ram"].filter(i => $(i).className.includes("err"));
      const warn = ["chk-extra"].filter(i => $(i).className.includes("warn"));
      let msg = "";
      if (errs.length) msg += "❌ Fix red items before proceeding. ";
      if (warn.length) msg += "⚠️ Additional disk/VG not found — block storage won’t be used; ephemeral only.";
      setText("hw-summary", msg);

      log(`[HW] root=${free}G nics=${nics} extra=${extra} cores=${cores} mem=${memGB}G`);
    } catch(e){
      setText("hw-summary","Check failed. See logs.");
      log("[HW] Failed: " + e);
    }
  }

  // ——— Dependencies: CHECK ———
  async function checkDeps(){
    if (os.isXOS){ setText("dep-status","Skipped on XOS"); return; }

    if (os.branch==="debian"){
      const cmd =
        "set -e; " +
        "pkgs='git python3-dev libffi-dev gcc libssl-dev python3-venv python3-docker'; " +
        "missing=$(dpkg-query -W -f='${Status} ${Package}\\n' $pkgs 2>/dev/null | awk '$3!=\"installed\"{print $5}'); " +
        "[ -z \"$missing\" ] && echo PY_OK || echo PY_MISS; " +
        "[ -d /opt/xenv ] && echo ENV_OK || echo ENV_MISS; " +
        "if [ -x /opt/xenv/bin/python ]; then /opt/xenv/bin/python - <<'PY'\n" +
        "import pkgutil, packaging.version as pv\n" +
        "try:\n" +
        "  import ansible\n" +
        "  ok1 = pv.parse(ansible.__version__).release[:2]==(2,15)\n" +
        "except Exception:\n" +
        "  ok1 = False\n" +
        "ok2 = pkgutil.find_loader('kolla_ansible') is not None\n" +
        "print('XDEP_OK' if (ok1 and ok2) else 'XDEP_MISS')\n" +
        "PY\n" +
        "else echo XDEP_MISS; fi; " +
        "[ -d /etc/xavs ] && echo CFG_OK || echo CFG_MISS; " +
        "[ -f /etc/xavs/passwords.yml ] || [ -f /etc/kolla/passwords.yml ] && echo PWD_OK || echo PWD_MISS";
      try{
        const out = await cockpit.spawn(["bash","-lc",cmd], { superuser:"try" });
        const L = out.trim().split("\n");
        setBadge("dep-py",   L.includes("PY_OK")   ? "ok"  : "err",  L.includes("PY_OK")   ? "ok"      : "missing");
        setBadge("dep-env",  L.includes("ENV_OK")  ? "ok"  : "err",  L.includes("ENV_OK")  ? "present" : "missing");
        setBadge("dep-xdep", L.includes("XDEP_OK") ? "ok"  : "err",  L.includes("XDEP_OK") ? "ok"      : "missing");
        setBadge("dep-cfg",  L.includes("CFG_OK")  ? "ok"  : "err",  L.includes("CFG_OK")  ? "ready"   : "missing");
        setBadge("dep-pwd",  L.includes("PWD_OK")  ? "ok"  : "warn", L.includes("PWD_OK")  ? "ready"   : "generate");
        setText("dep-status","Checked");
        log("[Deps:Debian] Check\n"+out.trim());
      }catch(e){ log("[Deps:Debian] Check failed: " + e); }
      return;
    }

    if (os.branch==="rhel"){
      const cmd =
        "set -e; " +
        "missing=$(rpm -q git python3-devel libffi-devel gcc openssl-devel python3-libselinux 2>/dev/null | awk '/is not installed/{print $1}'); " +
        "[ -z \"$missing\" ] && echo PY_OK || echo PY_MISS; " +
        "echo ENV_NA; " +
        "python3 - <<'PY'\n" +
        "import pkgutil, packaging.version as pv\n" +
        "try:\n" +
        "  import ansible\n" +
        "  ok1 = pv.parse(ansible.__version__).release[:2]==(2,15)\n" +
        "except Exception:\n" +
        "  ok1 = False\n" +
        "ok2 = pkgutil.find_loader('kolla_ansible') is not None\n" +
        "print('XDEP_OK' if (ok1 and ok2) else 'XDEP_MISS')\n" +
        "PY\n" +
        "[ -d /etc/xavs ] && echo CFG_OK || echo CFG_MISS; " +
        "[ -f /etc/xavs/passwords.yml ] || [ -f /etc/kolla/passwords.yml ] && echo PWD_OK || echo PWD_MISS";
      try{
        const out = await cockpit.spawn(["bash","-lc",cmd], { superuser:"try" });
        const L = out.trim().split("\n");
        setBadge("dep-py",   L.includes("PY_OK")   ? "ok"  : "err",  L.includes("PY_OK")   ? "ok":"missing");
        setBadge("dep-env",  "warn", "N/A");
        setBadge("dep-xdep", L.includes("XDEP_OK") ? "ok"  : "err",  L.includes("XDEP_OK") ? "ok":"missing");
        setBadge("dep-cfg",  L.includes("CFG_OK")  ? "ok"  : "err",  L.includes("CFG_OK")  ? "ready":"missing");
        setBadge("dep-pwd",  L.includes("PWD_OK")  ? "ok"  : "warn", L.includes("PWD_OK")  ? "ready":"generate");
        setText("dep-status","Checked");
        log("[Deps:RHEL] Check\n"+out.trim());
      }catch(e){ log("[Deps:RHEL] Check failed: " + e); }
      return;
    }

    setText("dep-status","Unknown OS");
  }

  // ——— Dependencies: INSTALL ALL ———
  async function installAll(){
    if (os.isXOS) return;
    $("btn-install-all").disabled = true; pb("dep-progress",0); setText("dep-note","Installing…");

    if (os.branch==="debian"){
      const script =
        "set -e; step(){ echo \"[STEP] $1\"; }; " +
        "step 'Install Python dependencies'; sudo apt-get update -y; sudo apt-get install -y git python3-dev libffi-dev gcc libssl-dev python3-venv python3-docker; " +
        "step 'Create environment'; sudo mkdir -p /opt/xenv; sudo python3 -m venv /opt/xenv; source /opt/xenv/bin/activate; " +
        "step 'Install xDeploy dependencies'; pip install -U pip; pip install 'ansible-core>=2.15,<2.16.99'; pip install git+https://opendev.org/openstack/kolla-ansible@stable/2024.1; " +
        "step 'Prepare config'; sudo mkdir -p /etc/xavs; sudo chown root:root /etc/xavs; cp -r /opt/xenv/share/kolla-ansible/etc_examples/kolla/* /tmp/xavs-copy-$$; sudo cp -r /tmp/xavs-copy-$$/* /etc/xavs/; rm -rf /tmp/xavs-copy-$$; " +
        "step 'Copy inventories'; cp -n /opt/xenv/share/kolla-ansible/ansible/inventory/* . || true; " +
        "step 'Install system deps'; kolla-ansible install-deps || true; " +
        "step 'Generate passwords'; source /opt/xenv/bin/activate && kolla-genpwd; echo '[DONE] debian-all'";
      const ch = cockpit.spawn(["bash","-lc",script], { superuser:"try" });
      ch.stream(d=>{
        log((d||"").trimEnd());
        if(/\[STEP\] Install Python dependencies/.test(d)) pb("dep-progress",20);
        if(/\[STEP\] Create environment/.test(d))          pb("dep-progress",35);
        if(/\[STEP\] Install xDeploy dependencies/.test(d)) pb("dep-progress",65);
        if(/\[STEP\] Prepare config/.test(d))              pb("dep-progress",75);
        if(/\[STEP\] Copy inventories/.test(d))            pb("dep-progress",82);
        if(/\[STEP\] Install system deps/.test(d))         pb("dep-progress",90);
        if(/\[STEP\] Generate passwords/.test(d))          pb("dep-progress",98);
        if(/\[DONE] debian-all/.test(d))                   pb("dep-progress",100);
      });
      try{ await ch; }catch(e){ log("[InstallAll:Debian] failed: " + e); }
    } else if (os.branch==="rhel"){
      const script =
        "set -e; step(){ echo \"[STEP] $1\"; }; " +
        "step 'Install Python dependencies'; sudo dnf install -y git python3-devel libffi-devel gcc openssl-devel python3-libselinux; " +
        "step 'Install xDeploy dependencies'; pybin=$(command -v python3 || echo python3); $pybin -m ensurepip --upgrade || true; $pybin -m pip install -U pip; $pybin -m pip install 'ansible-core>=2.15,<2.16.99'; $pybin -m pip install git+https://opendev.org/openstack/kolla-ansible@stable/2024.1; " +
        "step 'Prepare config'; sudo mkdir -p /etc/xavs; sudo chown root:root /etc/xavs; if [ -d /usr/local/share/kolla-ansible/etc_examples/kolla ]; then cp -r /usr/local/share/kolla-ansible/etc_examples/kolla/* /tmp/xavs-copy-$$; sudo cp -r /tmp/xavs-copy-$$/* /etc/xavs/ || true; rm -rf /tmp/xavs-copy-$$; fi; " +
        "step 'Copy inventories'; if [ -d /usr/local/share/kolla-ansible/ansible/inventory ]; then cp -n /usr/local/share/kolla-ansible/ansible/inventory/* . || true; fi; " +
        "step 'Install system deps'; kolla-ansible install-deps || true; " +
        "step 'Generate passwords'; kolla-genpwd || true; echo '[DONE] rhel-all'";
      const ch = cockpit.spawn(["bash","-lc",script], { superuser:"try" });
      ch.stream(d=>{
        log((d||"").trimEnd());
        if(/\[STEP\] Install Python dependencies/.test(d)) pb("dep-progress",25);
        if(/\[STEP\] Install xDeploy dependencies/.test(d)) pb("dep-progress",60);
        if(/\[STEP\] Prepare config/.test(d))              pb("dep-progress",75);
        if(/\[STEP\] Copy inventories/.test(d))            pb("dep-progress",82);
        if(/\[STEP\] Install system deps/.test(d))         pb("dep-progress",90);
        if(/\[STEP\] Generate passwords/.test(d))          pb("dep-progress",98);
        if(/\[DONE] rhel-all/.test(d))                     pb("dep-progress",100);
      });
      try{ await ch; }catch(e){ log("[InstallAll:RHEL] failed: " + e); }
    } else {
      setText("dep-status","Unknown OS branch");
    }

    await checkDeps();
    setText("dep-note","Done.");
    $("btn-install-all").disabled = false;
  }

  // ——— wire ———
  $("btn-detect-os").addEventListener("click", detectOS);
  $("btn-run-hw-top").addEventListener("click", () => {
    document.querySelector('#tabs .nav-link[data-target="panel-hw"]').click();
  });
  $("btn-run-hw").addEventListener("click", runHW);
  $("btn-check-deps").addEventListener("click", checkDeps);
  $("btn-install-all").addEventListener("click", installAll);
  $("btn-refresh").addEventListener("click", async () => { await detectOS(); await runHW(); await checkDeps(); });
  $("btn-clear-log").addEventListener("click", () => { if (logEl) logEl.textContent = ""; });

  // ——— init ———
  (async () => { await detectOS(); })();
})();
