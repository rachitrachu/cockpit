
(function () {
  "use strict";
  const $ = (q) => document.querySelector(q);
  const v = $("#ver"), opOut = $("#op-out"), healthOut = $("#health-out");
  const set = (id, cls, txt) => { const el = $(id); el.className = "v " + cls; el.textContent = txt; };

  // Version badge
  cockpit.spawn(["cockpit-bridge", "--version"], { superuser: "try" })
    .done(t => v.textContent = (t.split("\n")[0]||"").trim())
    .fail(() => v.textContent = "Cockpit");

  // Streaming helper
  const streamTo = (el) => (d) => { el.textContent += d; el.scrollTop = el.scrollHeight; };

  // ----- Actions with streaming -----
  let proc = null;
  function run(subcmd, args=[]) {
    if (proc) proc.close("cancel");
    opOut.textContent = "";
    $("#btn-stop").disabled = false;

    const argv = ["/usr/local/bin/xos-ops.sh", subcmd, ...args];
    proc = cockpit.spawn(argv, { superuser: "require" });
    proc.stream(streamTo(opOut));
    proc.done(() => { opOut.textContent += "\n==> Done.\n"; $("#btn-stop").disabled = true; proc=null; });
    proc.fail(ex  => { opOut.textContent += `\n[ERROR] ${ex}\n`; $("#btn-stop").disabled = true; proc=null; });
  }
  $("#btn-stop").addEventListener("click", () => { if (proc) proc.close("cancelled"); $("#btn-stop").disabled = true; });

  // Bulk actions
  $("#btn-prechecks").addEventListener("click",   () => run("prechecks"));
  $("#btn-deploy").addEventListener("click",      () => run("deploy"));
  $("#btn-upgrade").addEventListener("click",     () => run("upgrade"));
  $("#btn-reconfigure").addEventListener("click", () => run("reconfigure"));
  $("#btn-ping").addEventListener("click",        () => run("ping"));
  $("#btn-restart-bad").addEventListener("click", () => run("restart_bad"));

  // Per‑service restart handlers
  document.querySelectorAll(".svc").forEach(btn => {
    btn.addEventListener("click", () => run("svc_restart", [btn.dataset.svc]));
  });

  // Logs collection + copy scp command
  const logsPath = $("#logs-path");
  $("#btn-logs").addEventListener("click", () => {
    const mins = ($("#logs-since").value || "").trim();
    const since = mins && /^\d+$/.test(mins) ? mins : "60";
    logsPath.value = "";
    run("logs_collect", [since]);
    // Also query last path after process ends by polling helper "logs_last"
    const poll = setInterval(() => {
      cockpit.spawn(["/usr/local/bin/xos-ops.sh", "logs_last"], { superuser: "require" })
        .done(p => { if (p.trim()) { logsPath.value = p.trim(); $("#btn-copy").disabled = false; clearInterval(poll); } });
    }, 1500);
    setTimeout(() => clearInterval(poll), 15000);
  });

  $("#btn-copy").addEventListener("click", async () => {
    const p = logsPath.value.trim();
    if (!p) return;
    const ip = window.location.hostname;
    const cmd = `scp -P 22 root@${ip}:"${p}" ./`;
    try {
      await navigator.clipboard.writeText(cmd);
      opOut.textContent += `\nCopied:\n${cmd}\n`;
    } catch {
      opOut.textContent += `\nCopy this:\n${cmd}\n`;
    }
  });

  // Health functions
  function health(sub) {
    healthOut.textContent = "";
    const p = cockpit.spawn(["/usr/local/bin/xos-ops.sh", sub], { superuser: "require" });
    p.stream(streamTo(healthOut));
    p.done(() => healthOut.textContent += "\n==> Done.\n");
    p.fail(ex  => healthOut.textContent += `\n[ERROR] ${ex}\n`);
  }
  $("#btn-health").addEventListener("click",      () => health("health"));
  $("#btn-os-services").addEventListener("click", () => health("os_services"));
  $("#btn-os-agents").addEventListener("click",   () => health("os_agents"));
  $("#btn-db-rmq").addEventListener("click",      () => health("db_rmq"));

  // Cards refresh + auto-refresh every 30s
  function refreshCards() {
    cockpit.spawn(["/usr/local/bin/xos-ops.sh", "cards"], { superuser: "require" })
      .done(txt => {
        try {
          const s = JSON.parse(txt);
          set("#st-nova",     s.nova.ok ? "ok" : "bad",     s.nova.text);
          set("#st-neutron",  s.neutron.ok ? "ok" : "bad",  s.neutron.text);
          set("#st-cinder",   s.cinder.ok ? "ok" : "bad",   s.cinder.text);
          set("#st-keystone", s.keystone.ok ? "ok" : "bad", s.keystone.text);
          set("#st-glance",   s.glance.ok ? "ok" : "bad",   s.glance.text);
          set("#st-placement",s.placement.ok ? "ok" : "bad",s.placement.text);
          set("#st-horizon",  s.horizon.ok ? "ok" : "bad",  s.horizon.text);
          set("#st-heat",     s.heat.ok ? "ok" : "bad",     s.heat.text);
          set("#st-octavia",  s.octavia.ok ? "ok" : "bad",  s.octavia.text);
          set("#st-mariadb",  s.mariadb.ok ? "ok" : "bad",  s.mariadb.text);
          set("#st-rabbitmq", s.rabbitmq.ok ? "ok" : "bad", s.rabbitmq.text);
        } catch {
          healthOut.textContent += "\n[ERROR] card parse failed\n";
        }
      });
  }
  refreshCards();
  setInterval(refreshCards, 30000);
})();
