/* global run */

async function applyPersistently(yamlStr, tryTimeoutSec = 120) {
  // 1. Write new file atomically
  await run(`cat > /etc/netplan/90-xavs.yaml.new << 'EOF'
# Managed by XAVS Networking (Cockpit). Do not edit manually.
${yamlStr}
EOF`);
  
  // 2. Set permissions and move atomically
  await run("chmod 600 /etc/netplan/90-xavs.yaml.new");
  await run("sync && mv /etc/netplan/90-xavs.yaml.new /etc/netplan/90-xavs.yaml");
  
  // 3. Validate syntax
  await run("netplan generate --debug");
  
  // 4. Trial apply with rollback window
  // Note: In production, this would need UI coordination for confirmation
  await run(`netplan try --timeout ${tryTimeoutSec}`);
  
  // 5. If confirmed (would be done via UI), finalize
  // await run("netplan apply");
}

async function validateOnly(yamlStr) {
  // Write to temp file and validate without applying
  const tempFile = `/tmp/netplan-validate-${Date.now()}.yaml`;
  await run(`cat > ${tempFile} << 'EOF'
${yamlStr}
EOF`);
  
  try {
    await run(`netplan generate --debug --root /tmp/netplan-test-${Date.now()}`);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  } finally {
    await run(`rm -f ${tempFile}`).catch(() => {}); // cleanup
  }
}

// Export to global scope
window.applyPersistently = applyPersistently;
window.validateOnly = validateOnly;
