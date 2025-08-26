/* app.js — xavs-globals — defensive init + path-agnostic discovery + single Yes/No buttons */
(function(){
  const PATH_GLOBALS_DIR = "/etc/xavs/globals.d";
  const PATH_GLOBALS     = "/etc/xavs/globals.d/01-custom.yml";
  const PATH_NODES       = "/etc/xavs/nodes";

  const $ = (s) => document.querySelector(s);

  // -------- tiny status helper (only shown on error) --------
  function showStatus(msg){
    var el = $("#js_status");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
  }

  // -------- Toggle: single button (Yes=green) --------
  function makeToggle(btn){
    if (!btn) return { get value(){ return false; }, set value(_){} };
    return {
      get value(){ return btn.classList.contains("primary"); },
      set value(v){
        btn.classList.toggle("primary", !!v);
        btn.textContent = v ? "Yes" : "No";
      }
    };
  }
  function setToggle(t, v){ if (t) t.value = !!v; }

  // -------- YAML helpers --------
  const yesno = b => b ? '"yes"' : '"no"';
  const quote = v => `"${String(v)}"`;

  function buildYAML(state, anyQoS){
    const extFQDN = state.kolla_external_fqdn || state.kolla_internal_fqdn || "";
    const extVIP  = state.kolla_external_vip_address || state.kolla_internal_vip_address || "";

    const L = [];
    const put = (k,v) => { if (v !== undefined && v !== null && v !== "") L.push(`${k}: ${v}`); };

    // FQDNs
    put("kolla_internal_fqdn", quote(state.kolla_internal_fqdn || ""));
    put("kolla_external_fqdn", quote(extFQDN));

    // Security (TLS external)
    put("kolla_enable_tls_external", yesno(state.kolla_enable_tls_external));
    if (state.kolla_enable_tls_external) {
      put("kolla_external_fqdn_cert", quote(state.kolla_external_fqdn_cert || "/etc/kolla/certificates/xloud.pem"));
    }

    // Networking
    put("network_interface", quote(state.network_interface || ""));
    put("neutron_external_interface", quote(state.neutron_external_interface || ""));
    put("kolla_internal_vip_address", quote(state.kolla_internal_vip_address || ""));
    put("kolla_external_vip_address", quote(extVIP));
    put("enable_neutron_provider_networks", yesno(state.enable_neutron_provider_networks));

    // Observability
    put("enable_prometheus", yesno(state.enable_prometheus));
    put("enable_grafana", yesno(state.enable_grafana));
    put("enable_central_logging", yesno(state.enable_central_logging));

    // Cinder
    put("enable_cinder", yesno(state.enable_cinder));
    if (state.enable_cinder) {
      put("enable_cinder_backend_lvm", yesno(state.enable_cinder_backend_lvm));
      const iscsi = (state.enable_cinder_backend_iscsi ?? state.enable_cinder_backend_lvm);
      put("enable_cinder_backend_iscsi", yesno(!!iscsi));
      put("cinder_volume_group", quote(state.cinder_volume_group || "cloud-vg"));
    }

    // Key Management
    put("enable_barbican", yesno(state.enable_barbican));

    // From Hosts tab (silent rule)
    if (anyQoS) put("enable_neutron_qos", '"yes"');

    return L.join("\n") + "\n";
  }

  function parseSimpleYAML(text){
    const obj = {};
    (text || "").split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
      if (!m) return;
      let [, k, v] = m;
      v = v.replace(/^"(.*)"$/, "$1");
      if (v === "yes" || v === '"yes"') obj[k] = true;
      else if (v === "no" || v === '"no"') obj[k] = false;
      else obj[k] = v;
    });
    return obj;
  }

  // -------- UI <-> state --------
  var Tog = {};
  function uiToState(){
    return {
      // FQDNs
      kolla_internal_fqdn: $("#kolla_internal_fqdn").value.trim(),
      kolla_external_fqdn: $("#kolla_external_fqdn").value.trim(),

      // Security
      kolla_enable_tls_external: Tog.kolla_enable_tls_external.value,
      kolla_external_fqdn_cert: $("#kolla_external_fqdn_cert").value.trim(),

      // Networking
      network_interface: $("#network_interface").value.trim(),
      neutron_external_interface: $("#neutron_external_interface").value.trim(),
      kolla_internal_vip_address: $("#kolla_internal_vip_address").value.trim(),
      kolla_external_vip_address: $("#kolla_external_vip_address").value.trim(),
      enable_neutron_provider_networks: Tog.enable_neutron_provider_networks.value,

      // Observability
      enable_prometheus: Tog.enable_prometheus.value,
      enable_grafana: Tog.enable_grafana.value,
      enable_central_logging: Tog.enable_central_logging.value,

      // Cinder
      enable_cinder: Tog.enable_cinder.value,
      enable_cinder_backend_lvm: Tog.enable_cinder_backend_lvm.value,
      enable_cinder_backend_iscsi: Tog.enable_cinder_backend_iscsi.value,
      cinder_volume_group: $("#cinder_volume_group").value.trim(),

      // Key management
      enable_barbican: Tog.enable_barbican.value
    };
  }

  function stateToUI(s){
    $("#kolla_internal_fqdn").value = s.kolla_internal_fqdn || "";
    $("#kolla_external_fqdn").value = s.kolla_external_fqdn || "";
    $("#kolla_external_fqdn_cert").value = s.kolla_external_fqdn_cert || "/etc/kolla/certificates/xloud.pem";

    setToggle(Tog.kolla_enable_tls_external, !!s.kolla_enable_tls_external);
    setToggle(Tog.enable_neutron_provider_networks, !!s.enable_neutron_provider_networks);
    setToggle(Tog.enable_prometheus, !!s.enable_prometheus);
    setToggle(Tog.enable_grafana, !!s.enable_grafana);
    setToggle(Tog.enable_central_logging, !!s.enable_central_logging);
    setToggle(Tog.enable_cinder, !!s.enable_cinder);
    setToggle(Tog.enable_cinder_backend_lvm, (s.enable_cinder_backend_lvm ?? true));
    setToggle(Tog.enable_cinder_backend_iscsi, (s.enable_cinder_backend_iscsi ?? (s.enable_cinder_backend_lvm ?? true)));
    setToggle(Tog.enable_barbican, !!s.enable_barbican);

    var co = $("#cinder_options");
    if (co) co.hidden = !Tog.enable_cinder.value;
  }

  function validate(state){
    var errs = [];
    if (!state.network_interface) errs.push("Management Interface is required.");
    if (!state.kolla_internal_vip_address) errs.push("Internal VIP Address is required.");
    return errs;
  }

  // -------- System discovery --------
  async function loadInterfaces(){
    var selMgmt = $("#network_interface");
    var selExt  = $("#neutron_external_interface");
    var selSri  = $("#host_sriov_nic");
    if (!selMgmt || !selExt || !selSri) return;

    selMgmt.innerHTML = "";
    selExt.innerHTML  = "<option value=''>— none —</option>";
    selSri.innerHTML  = "<option value=''>— none —</option>";

    // Find ip/nmcli wherever they are
    const cmd_ip = `IP=$(command -v ip || echo /usr/sbin/ip || echo /sbin/ip || echo /usr/bin/ip || echo /bin/ip); "$IP" -o link show | awk -F': ' '{print $2}'`;
    const cmd_nm = `NM=$(command -v nmcli || echo /usr/bin/nmcli || echo /bin/nmcli); [ -x "$NM" ] && "$NM" -t -f DEVICE d || true`;

    const cmds = [
      "ls -1 /sys/class/net",
      cmd_ip + " || true",
      cmd_nm
    ];

    var found = new Set();
    for (var i=0;i<cmds.length;i++){
      try {
        var out = await cockpit.spawn(["bash","-lc", cmds[i]], { err: "message" });
        out.split("\n").map(function(x){return x.trim();}).filter(Boolean).forEach(function(n){
          found.add(n.replace(/@.*$/,""));
        });
      } catch (e) { /* ignore */ }
    }

    var list = Array.from(found).filter(function(n){ return n && n !== "lo"; });
    if (list.length === 0){
      selMgmt.innerHTML = "<option value=''>No interfaces found</option>";
      return;
    }

    list.forEach(function(n){
      selMgmt.insertAdjacentHTML("beforeend", "<option value=\""+n+"\">"+n+"</option>");
      selExt .insertAdjacentHTML("beforeend", "<option value=\""+n+"\">"+n+"</option>");
      selSri .insertAdjacentHTML("beforeend", "<option value=\""+n+"\">"+n+"</option>");
    });
  }

  async function loadPCIDevs(){
    var sel = $("#host_pci_dev");
    if (!sel) return;
    sel.innerHTML = "<option value=''>— none —</option>";

    try {
      var out = await cockpit.spawn(["bash","-lc",
        "if command -v lspci >/dev/null; then lspci -mm -nn | awk -F '\"' '{printf \"%s %s (%s)\\n\", $4,$2,$6}'; else false; fi"
      ], { err: "message" });
      if (out && out.trim()){
        out.trim().split("\n").forEach(function(l){
          sel.insertAdjacentHTML("beforeend","<option value=\""+l+"\">"+l+"</option>");
        });
        return;
      }
    } catch (e) { /* continue */ }

    try {
      var out2 = await cockpit.spawn(["bash","-lc", `
        for d in /sys/bus/pci/devices/*; do
          [ -e "$d" ] || continue
          addr=$(basename "$d")
          ven=$(cat "$d/vendor" 2>/dev/null)
          dev=$(cat "$d/device" 2>/dev/null)
          drv=$(basename "$(readlink -f "$d/driver")" 2>/dev/null)
          echo "$addr ${ven}${dev} (${drv:-no-driver})"
        done
      `], { err: "message" });
      out2.trim().split("\n").filter(Boolean).forEach(function(l){
        sel.insertAdjacentHTML("beforeend","<option value=\""+l+"\">"+l+"</option>");
      });
    } catch (e) { /* ignore */ }
  }

  function parseNodes(text){
    var wanted = {control:1, network:1, compute:1, storage:1, monitoring:1, deployment:1};
    var lines = (text || "").split(/\r?\n/);
    var section = null;
    var hosts = {};
    for (var i=0;i<lines.length;i++){
      var line = lines[i].trim();
      if (!line || line[0]==="#" || line[0]===";") continue;
      var m = line.match(/^\[(.+)]$/);
      if (m){ section = (m[1]||"").toLowerCase(); continue; }
      if (!section || !wanted[section]) continue;
      var host = line.split(/\s+/)[0];
      if (host) hosts[host] = 1;
    }
    return Object.keys(hosts);
  }

  async function loadHostsList(){
    var sel = $("#host_select");
    if (!sel) return;
    try{
      var f = cockpit.file(PATH_NODES);
      var data = await f.read();
      var list = parseNodes(data);
      sel.innerHTML = "";
      if (list.length === 0) sel.innerHTML = "<option value=''>No hosts found</option>";
      else list.forEach(function(h){ sel.insertAdjacentHTML("beforeend","<option value=\""+h+"\">"+h+"</option>"); });
    } catch(e){
      sel.innerHTML = "<option value=''>/etc/xavs/nodes not found</option>";
    }
  }

  async function ensureDir(){
    await cockpit.spawn(["bash","-lc", "install -d -m 0755 "+PATH_GLOBALS_DIR], { err: "message" });
  }

  async function saveYAML(){
    var state = uiToState();
    var errs = validate(state);
    if (errs.length){
      $("#save_status").textContent = "Validation failed: " + errs.join(" ");
      $("#save_status").style.color = "#f5c2c7";
      return;
    }

    var anyQoS = Object.values(hostChoices).some(function(v){ return v && v.qos; });
    var yaml = buildYAML(state, anyQoS);
    $("#yaml_preview").hidden = false;
    $("#yaml_preview").textContent = yaml;

    try{
      await ensureDir();
      var f = cockpit.file(PATH_GLOBALS, { superuser: "try" });
      await f.replace(yaml);
      $("#save_status").textContent = "Saved to " + PATH_GLOBALS;
      $("#save_status").style.color = "";
    } catch(e){
      $("#save_status").textContent = "Failed to save: " + (e.message || e);
      $("#save_status").style.color = "#f5c2c7";
    }
  }

  async function loadExistingYAML(){
    try {
      var f = cockpit.file(PATH_GLOBALS);
      var y = await f.read();
      var obj = parseSimpleYAML(y);
      stateToUI(obj);
      $("#yaml_preview").hidden = true;
    } catch (e) { /* not existing yet */ }
  }

  // -------- Hosts selections (ephemeral) --------
  var hostChoices = {};
  function currentHost(){ return ($("#host_select") && $("#host_select").value) || "default"; }

  function hostUIToState(){
    return {
      sriov: Tog.host_sriov.value,
      sriov_nic: ($("#host_sriov_nic") && $("#host_sriov_nic").value) || "",
      tpm: Tog.host_tpm.value,
      pci: Tog.host_pci.value,
      pci_dev: ($("#host_pci_dev") && $("#host_pci_dev").value) || "",
      luks: Tog.host_luks.value,
      qos: Tog.host_qos.value,
      cpu_mask: Tog.host_cpu_mask.value,
      huge: Tog.host_huge.value
    };
  }

  function hostsStateToUI(h){
    setToggle(Tog.host_sriov, !!h.sriov);
    if ($("#host_sriov_nic")) $("#host_sriov_nic").value = h.sriov_nic || "";
    setToggle(Tog.host_tpm, !!h.tpm);
    setToggle(Tog.host_pci, !!h.pci);
    if ($("#host_pci_dev")) $("#host_pci_dev").value = h.pci_dev || "";
    setToggle(Tog.host_luks, !!h.luks);
    setToggle(Tog.host_qos, !!h.qos);
    setToggle(Tog.host_cpu_mask, !!h.cpu_mask);
    setToggle(Tog.host_huge, !!h.huge);

    if ($("#host_sriov_nic")) $("#host_sriov_nic").disabled = !Tog.host_sriov.value;
    if ($("#host_pci_dev")) $("#host_pci_dev").disabled   = !Tog.host_pci.value;
  }

  function refreshHostsPreview(){
    var hp = $("#hosts_preview");
    if (!hp) return;
    hp.hidden = false;
    hp.textContent = JSON.stringify(hostChoices, null, 2);
  }

  // -------- Tabs & buttons --------
  function setupTabs(){
    var ts = $("#tab-services");
    var th = $("#tab-hosts");
    var ps = $("#pane-services");
    var ph = $("#pane-hosts");
    if (!ts || !th || !ps || !ph) { showStatus("Tab elements missing"); return; }

    ts.addEventListener("click", function(){
      ts.classList.add("primary");
      th.classList.remove("primary");
      ps.style.display = "";
      ph.style.display = "none";
    });
    th.addEventListener("click", function(){
      th.classList.add("primary");
      ts.classList.remove("primary");
      ph.style.display = "";
      ps.style.display = "none";
    });
  }

  function setupButtons(){
    try {
      // Services toggles
      Tog.enable_neutron_provider_networks = makeToggle($("#btn_enable_neutron_provider_networks"));  Tog.enable_neutron_provider_networks.value = false;
      Tog.kolla_enable_tls_external        = makeToggle($("#btn_kolla_enable_tls_external"));         Tog.kolla_enable_tls_external.value = false;
      Tog.enable_prometheus                = makeToggle($("#btn_enable_prometheus"));                 Tog.enable_prometheus.value = false;
      Tog.enable_grafana                   = makeToggle($("#btn_enable_grafana"));                    Tog.enable_grafana.value = false;
      Tog.enable_central_logging           = makeToggle($("#btn_enable_central_logging"));            Tog.enable_central_logging.value = false;
      Tog.enable_cinder                    = makeToggle($("#btn_enable_cinder"));                     Tog.enable_cinder.value = false;
      Tog.enable_cinder_backend_lvm        = makeToggle($("#btn_enable_cinder_backend_lvm"));         Tog.enable_cinder_backend_lvm.value = true;
      Tog.enable_cinder_backend_iscsi      = makeToggle($("#btn_enable_cinder_backend_iscsi"));       Tog.enable_cinder_backend_iscsi.value = false;
      Tog.enable_barbican                  = makeToggle($("#btn_enable_barbican"));                   Tog.enable_barbican.value = false;

      var btnC = $("#btn_enable_cinder");
      var cOpts = $("#cinder_options");
      if (btnC && cOpts) btnC.addEventListener("click", function(){ cOpts.hidden = !Tog.enable_cinder.value; });

      // Hosts toggles
      Tog.host_sriov     = makeToggle($("#btn_host_sriov"));
      Tog.host_tpm       = makeToggle($("#btn_host_tpm"));
      Tog.host_pci       = makeToggle($("#btn_host_pci"));
      Tog.host_luks      = makeToggle($("#btn_host_luks"));
      Tog.host_qos       = makeToggle($("#btn_host_qos"));
      Tog.host_cpu_mask  = makeToggle($("#btn_host_cpu_mask"));
      Tog.host_huge      = makeToggle($("#btn_host_huge"));

      var bSri = $("#btn_host_sriov");
      if (bSri && $("#host_sriov_nic")) bSri.addEventListener("click", function(){ $("#host_sriov_nic").disabled = !Tog.host_sriov.value; });
      var bPci = $("#btn_host_pci");
      if (bPci && $("#host_pci_dev")) bPci.addEventListener("click", function(){ $("#host_pci_dev").disabled = !Tog.host_pci.value; });

      // Save actions
      var save = $("#save");
      if (save) save.addEventListener("click", saveYAML);
      var sh = $("#save_hosts");
      if (sh) sh.addEventListener("click", function(){
        var host = currentHost();
        hostChoices[host] = hostUIToState();
        var hs = $("#hosts_status"); if (hs) hs.textContent = "Saved local choices for " + host + ".";
        refreshHostsPreview();
      });
      var hsSel = $("#host_select");
      if (hsSel) hsSel.addEventListener("change", function(){
        var host = currentHost();
        hostsStateToUI(hostChoices[host] || {});
      });
    } catch (e) {
      showStatus("Button setup error: " + (e.message || e));
    }
  }

  // -------- Init (after full load to avoid race with cockpit.js) --------
  window.addEventListener("load", async function(){
    try {
      setupTabs();
      setupButtons();
      await loadInterfaces();
      await loadPCIDevs();
      await loadHostsList();
      await loadExistingYAML();

      if ($("#host_sriov_nic")) $("#host_sriov_nic").disabled = !(Tog.host_sriov && Tog.host_sriov.value);
      if ($("#host_pci_dev"))   $("#host_pci_dev").disabled   = !(Tog.host_pci   && Tog.host_pci.value);
    } catch (e) {
      showStatus("Init error: " + (e.message || e));
    }
  });
})();
