(function () {
  "use strict";

  const $ = (q) => document.querySelector(q);
  const v = $("#ver"); const opOut = $("#op-out"); const healthOut = $("#health-out");
  const set = (id, cls, txt) => { const el = $(id); el.className = "v " + cls; el.textContent = txt; };

  // Cockpit version
  cockpit.spawn(["cockpit-bridge", "--version"], { superuser: "try" })
    .done(t => v.textContent = (t.split("\n")[0]||"").trim())
    .fail(() => v.textContent = "Cockpit");

  // Stream helper
  const streamTo = (el) => (d) => { el.textContent += d; el.scrollTop = el.scrollHeight; };

  let proc = null;
  function run(subcmd) {
    if (proc) proc.close("cancel");
    opOut.textContent = "";
    $("#btn-stop").disabled = false;

    proc = cockpit.spawn(["/usr/local/bin/xos-ops.sh", subcmd], { superuser: "require" });
    proc.stream(streamTo(opOut));
    proc.done(() => { opOut.textContent += "\n==> Done.\n"; $("#btn-stop").disabled = true; proc=null; });
    proc.fail(ex  => { opOut.textContent += `\n[ERROR] ${ex}\n`; $("#btn-stop").disabled = true; proc=null; });
  }

  $("#btn-stop").addEventListener("click", () => { if (proc) proc.close("cancelled"); $("#btn-stop").disabled = true; });

  // Action buttons
  $("#btn-prechecks").addEventListener("click",   () => run("prechecks"));
  $("#btn-deploy").addEventListener("click",      () => run("deploy"));
  $("#btn-upgrade").addEventListener("click",     () => run("upgrade"));
  $("#btn-reconfigure").addEventListener("click", () => run("reconfigure"));
  $("#btn-ping").addEventListener("click",        () => run("ping"));
  $("#btn-restart-bad").addEventListener("click", () => run("restart_bad"));

  // Health
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

  // Live status mini‑cards (poll once on load)
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
          set("#st-mariadb",  s.mariadb.ok ? "ok" : "bad",  s.mariadb.text);
          set("#st-rabbitmq", s.rabbitmq.ok ? "ok" : "bad", s.rabbitmq.text);
        } catch (e) {
          healthOut.textContent += "\n[ERROR] card parse failed\n";
        }
      })
      .fail(() => {});
  }
  refreshCards();
})();
