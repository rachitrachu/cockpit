export function run(cmd, opts = {}) {
  return cockpit.spawn(["bash","-lc", cmd], { superuser: "try", ...opts })
    .then(out => String(out))
    .catch(e => { throw new Error(e.message || String(e)); });
}
