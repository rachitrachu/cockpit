import { ETC_HOSTS_PATH, ETC_BEGIN_MARK, ETC_END_MARK } from "./constants.js";

/** Build unique "IP hostname" lines from current hosts; skip blanks */
function buildHostLines(hosts) {
  const seen = new Set();
  const lines = [];
  for (const h of hosts) {
    const ip = (h.ip || "").trim();
    const hn = (h.hostname || "").trim();
    if (!ip || !hn) continue;
    const key = `${ip} ${hn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${ip} ${hn}`);
  }
  return lines;
}

/** Replace or append our managed block while preserving everything else */
export function patchEtcHosts(existingText, hosts) {
  const src = String(existingText || "");
  const nl = "\n";
  const lines = buildHostLines(hosts);

  const block = [
    ETC_BEGIN_MARK,
    ...(lines.length ? lines : ["# (no hosts yet)"]),
    ETC_END_MARK,
    "" // trailing newline
  ].join(nl);

  const re = new RegExp(
    `${ETC_BEGIN_MARK.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&")}[\\s\\S]*?${ETC_END_MARK.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&")}\\n?`,
    "m"
  );

  if (re.test(src)) {
    return src.replace(re, block + nl);
  }

  // No block yet → append at end with two newlines
  const trimmed = src.replace(/[ \t]+$/gm,"").replace(/\n{3,}$/,"\n\n");
  const needsNL = trimmed.endsWith("\n\n") ? "" : trimmed.endsWith("\n") ? "" : "\n\n";
  return trimmed + needsNL + block + nl;
}

/** Write /etc/hosts via Cockpit, with superuser */
export async function saveEtcHosts(hosts) {
  const f = cockpit.file(ETC_HOSTS_PATH, { superuser: "try" });
  const current = await f.read().catch(() => "");
  const patched = patchEtcHosts(current, hosts);
  await f.replace(patched);
  return patched;
}
