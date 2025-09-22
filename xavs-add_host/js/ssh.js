// ssh.js — One-Click Root SSH Setup + 4-status badges (Ubuntu targets)  
// ---------------------------------------------------------------
// Complete SSH setup in ONE BUTTON: user keys + root keys + root SSH enabled + security hardening
// Primary goal: Enable direct root SSH access using keys only (no passwords) in a single operation
// Shows per-host statuses as four independent badges:
//   • Key    (SSH keys installed for both user and root)
//   • Sudo   (passwordless sudo configured for non-root users)  
//   • Reg    (docker-registry + cockpit hostname added to /etc/hosts)
//   • PwdOff (PermitRootLogin enabled + PasswordAuthentication disabled in sshd_config)
//
// Single-Button Workflow: Connect with user credentials → Install ALL keys → Enable root SSH → Configure everything
// Features: Multi-method root access (sudo, su, direct), complete SSH config, robust error handling, one-click setup

import { setStatus } from "./utils.js";
import { PAGE_SIZE, MAX_PAGE_SIZE } from "./constants.js";

// ===== Configuration Constants =====
// File path for persisting SSH status across sessions
const SSH_STATUS_PATH = "/etc/xavs/ssh_status.json";
// Timeout for SSH operations to prevent hanging
const TIMEOUT_S = 15;
// Standard SSH options for secure, non-interactive connections
const SSH_OPTS = [
  "-o", "BatchMode=yes",                    // Non-interactive mode
  "-o", "PasswordAuthentication=no",        // Use keys only (when testing)
  "-o", "StrictHostKeyChecking=no",         // Auto-accept host keys
  "-o", "UserKnownHostsFile=/dev/null",     // Don't save host keys
  "-o", "LogLevel=ERROR",                   // Reduce SSH verbosity
  "-o", "ConnectTimeout=6",                 // Quick connection timeout
  "-o", "ConnectionAttempts=1",             // Single attempt
  "-o", "ServerAliveInterval=5",            // Keep connection alive
  "-o", "ServerAliveCountMax=2",            // Connection health checks
];

// ===== Status Persistence System =====
// Maintains SSH status data across browser sessions
let persisted = {};  // In-memory cache of host statuses
let saveT = null;    // Debounce timer for file saves

// Load previously saved SSH status from disk
async function loadSSHStatus() {
  const f = cockpit.file(SSH_STATUS_PATH, { superuser: "try" });
  const txt = await f.read().catch(() => "{}");
  try { return JSON.parse(txt || "{}"); } catch { return {}; }
}

// Save SSH status to disk (called via debounced timer)
async function saveSSHStatus(obj) {
  const f = cockpit.file(SSH_STATUS_PATH, { superuser: "try" });
  await f.replace(JSON.stringify(obj, null, 2));
}

// Schedule a save operation (debounced to avoid excessive disk writes)
function schedulePersist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => saveSSHStatus(persisted).catch(console.error), 400);
}

// ===== Local Host Management (Cockpit machine) =====
// These functions manage the local Cockpit host's SSH configuration

// Clean known_hosts file to avoid SSH key conflicts when connecting to remote hosts
async function cleanKnownHosts(ip, localUser = "root") {
  // Remove any existing host key entries for this IP to avoid conflicts
  const userHome = localUser === "root" ? "/root" : `/home/${localUser}`;
  const knownHostsPath = `${userHome}/.ssh/known_hosts`;
  const cleanCmd = `ssh-keygen -f "${knownHostsPath}" -R "${ip}" 2>/dev/null || true`;
  await cockpit.spawn(["bash","-lc", cleanCmd], { superuser: "try" }).catch(() => {});
}

// Get the primary IPv4 address of the local Cockpit machine (for registry configuration)
async function getLocalPrimaryIPv4() {
  const cmd = `hostname -I | awk '{print $1}' | tr -d '\\n'`;
  const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" }).catch(() => "");
  return String(out || "").trim();
}

// Get the fully qualified domain name of the local Cockpit machine  
async function getLocalHostnameFQDN() {
  const out = await cockpit.spawn(["bash","-lc", "hostname -f"], { superuser: "try" }).catch(() => "");
  return String(out || "").trim();
}

// ===== Local SSH Key Management =====
// Functions for creating and managing SSH keys on the local Cockpit machine

// Generate file paths for SSH keys based on user and key type
function localKeyPaths(user, type) {
  const keyName = type === "rsa" ? "id_rsa" : "id_ed25519";
  const base = user === "root" ? `/root` : `/home/${user}`;
  return { private: `${base}/.ssh/${keyName}`, public: `${base}/.ssh/${keyName}.pub` };
}

// Verify that a private key file exists and has correct permissions (600)
// Auto-fixes permissions if needed
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

// Ensure sshpass utility is installed (required for password-based SSH operations)
// Ubuntu/Debian specific - installs via apt-get if missing
async function ensureSshpass() {
  const check = `command -v sshpass >/dev/null 2>&1 && echo OK || echo MISS`;
  const out = await cockpit.spawn(["bash","-lc", check], { superuser: "try" }).catch(()=> "");
  if ((out||"").includes("OK")) return true;
  
  // Install sshpass using apt-get
  const installCmd = `DEBIAN_FRONTEND=noninteractive sudo apt-get update -y && sudo apt-get install -y sshpass`;
  const out2 = await cockpit.spawn(["bash","-lc", installCmd], { superuser: "try" }).catch(()=> "ERR");
  if ((out2||"").includes("ERR")) return false;
  
  // Verify installation succeeded
  const out3 = await cockpit.spawn(["bash","-lc", check], { superuser: "try" }).catch(()=> "");
  return (out3||"").includes("OK");
}

// Generate or verify existence of local SSH key pair (RSA or Ed25519)
// Creates the key if it doesn't exist, ensures proper permissions and ownership
async function ensureLocalKey(user, type) {
  const kp = localKeyPaths(user, type);
  const userHome = user === "root" ? "/root" : `/home/${user}`;
  
  const cmd = `
    umask 077  # Ensure secure permissions for new files
    key_priv="${kp.private}"; key_pub="${kp.public}";
    
    # Ensure .ssh directory exists with proper permissions (700)
    mkdir -p "${userHome}/.ssh"
    chmod 700 "${userHome}/.ssh"
    
    # If not root, ensure ownership is correct (when running as root for another user)
    if [ "${user}" != "root" ] && [ "$(id -u)" = "0" ]; then
      chown "${user}:${user}" "${userHome}/.ssh" 2>/dev/null || true
    fi
    
    # Generate SSH key pair if public key doesn't exist
    if [ ! -f "$key_pub" ]; then
      if [ "${type}" = "rsa" ]; then
        ssh-keygen -t rsa -b 4096 -N "" -f "$key_priv" -C "xdeploy@$(hostname -f)" >/dev/null
      else
        ssh-keygen -t ed25519 -N "" -f "$key_priv" -C "xdeploy@$(hostname -f)" >/dev/null
      fi
      
      # Ensure proper ownership if running as root for non-root user
      if [ "${user}" != "root" ] && [ "$(id -u)" = "0" ]; then
        chown "${user}:${user}" "$key_priv" "$key_pub" 2>/dev/null || true
      fi
    fi
    echo "__OK__"
  `;
  const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" }).catch(e => (e && e.message) || "");
  if (!String(out).includes("__OK__")) throw new Error("Failed to create or read local key.");
  return kp;
}

// ===== Remote SSH Key Distribution =====
// Multi-strategy approach to install SSH keys on remote hosts for both user and root access

// Install SSH key on remote host - attempts both user and root key installation
// Uses multiple strategies: direct root login, sudo, or su depending on available privileges
async function distributeOne(ip, remoteUser, remotePass, pubPath, localUser) {
  // Clean any conflicting host keys first to avoid SSH warnings
  await cleanKnownHosts(ip, localUser);
  
  const safeHost = `${remoteUser}@${ip}`;
  
  // Read the public key content from local file
  const pubKeyContent = await cockpit.file(pubPath).read().catch(() => "");
  if (!pubKeyContent.trim()) {
    console.error(`Could not read public key from ${pubPath}`);
    return false;
  }
  
  // Step 1: Install SSH key for the connecting user (always required first)
  const userKeyCmd = `
    sshpass -p '${remotePass.replace(/'/g,"'\\''")}' \
    ssh-copy-id -i '${pubPath}' \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o PreferredAuthentications=password \
      -o PubkeyAuthentication=no \
      '${safeHost}' >/dev/null 2>&1 && echo USER_KEY_OK || echo USER_KEY_FAIL
  `;
  
  const userKeyOut = await cockpit.spawn(["bash","-lc", userKeyCmd], { superuser: "try" }).catch(()=> "USER_KEY_FAIL");
  const userKeySuccess = String(userKeyOut).includes("USER_KEY_OK");
  
  if (!userKeySuccess) {
    console.error(`Failed to install SSH key for user ${remoteUser}@${ip}`);
    return false;
  }
  
  // Method 1: Try direct root access if remoteUser is root
  if (remoteUser === "root") {
    console.log(`Key installed for root user directly on ${ip}`);
    return true;
  }
  
  // Method 2: Try to add key to root via sudo (for non-root users)
  console.log(`Attempting to install SSH key for root via sudo on ${ip}...`);
  
  // First, let's try to give the user sudo privileges if they don't have them
  const setupSudoCmd = `
    sshpass -p '${remotePass.replace(/'/g,"'\\''")}' \\
    ssh -o StrictHostKeyChecking=no \\
        -o UserKnownHostsFile=/dev/null \\
        -o PreferredAuthentications=password \\
        -o PubkeyAuthentication=no \\
        '${safeHost}' \\
        "if ! command -v sudo >/dev/null 2>&1; then
          echo 'NO_SUDO_COMMAND'; exit 0;
        fi;
        if sudo -n true 2>/dev/null; then
          echo 'SUDO_ALREADY_WORKS'; exit 0;
        fi;
        echo 'Testing sudo with password...';
        if echo '${remotePass.replace(/'/g, "'\\''")}' | sudo -S -v 2>/dev/null; then
          echo 'SUDO_WITH_PASSWORD_WORKS'; exit 0;
        fi;
        echo 'Trying to use password for root access...';
        if echo '${remotePass.replace(/'/g, "'\\''")}' | su -c 'id' root 2>/dev/null | grep -q 'uid=0'; then
          echo 'ROOT_PASSWORD_WORKS'; exit 0;
        fi;
        echo 'NO_SUDO_ACCESS'" 2>&1
  `;
  
  const sudoTestOut = await cockpit.spawn(["bash","-lc", setupSudoCmd], { superuser: "try" }).catch((e)=> {
    console.error(`Sudo test failed for ${ip}:`, e);
    return "SUDO_TEST_FAILED";
  });
  
  const sudoTestResult = String(sudoTestOut);
  console.log(`Sudo test result for ${ip}: ${sudoTestResult}`);
  
  // Now try the appropriate method based on what works
  let rootKeyCmd;
  
  if (sudoTestResult.includes("ROOT_PASSWORD_WORKS")) {
    console.log(`Using root password method for ${ip}...`);
    const safePubKey = pubKeyContent.trim().replace(/'/g, "'\"'\"'");
    rootKeyCmd = `
      sshpass -p '${remotePass.replace(/'/g,"'\\''")}' \\
      ssh -o StrictHostKeyChecking=no \\
          -o UserKnownHostsFile=/dev/null \\
          -o PreferredAuthentications=password \\
          -o PubkeyAuthentication=no \\
          '${safeHost}' \\
          "echo '${remotePass.replace(/'/g, "'\\''")}' | su -c 'mkdir -p /root/.ssh && chmod 700 /root/.ssh && echo \"'\"'${safePubKey}'\"'\" >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys && chown root:root /root/.ssh/authorized_keys && echo ROOT_KEY_ADDED' root" 2>&1
    `;
  } else if (sudoTestResult.includes("SUDO_WITH_PASSWORD_WORKS") || sudoTestResult.includes("SUDO_ALREADY_WORKS")) {
    console.log(`Using sudo method for ${ip}...`);
    const safePubKey = pubKeyContent.trim().replace(/'/g, "'\"'\"'");
    rootKeyCmd = `
      sshpass -p '${remotePass.replace(/'/g,"'\\''")}' \\
      ssh -o StrictHostKeyChecking=no \\
          -o UserKnownHostsFile=/dev/null \\
          -o PreferredAuthentications=password \\
          -o PubkeyAuthentication=no \\
          '${safeHost}' \\
          "echo '${remotePass.replace(/'/g, "'\\''")}' | sudo -S sh -c 'mkdir -p /root/.ssh && chmod 700 /root/.ssh && echo \"'\"'${safePubKey}'\"'\" >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys && chown root:root /root/.ssh/authorized_keys && echo ROOT_KEY_ADDED'" 2>&1
    `;
  } else {
    console.log(`No sudo or root access available for ${ip}, trying alternative root key installation...`);
    
    // Alternative approach: Use the working user SSH connection to install root key
    // First, verify the user key works, then use it to install root key
    const userKeyCmd = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i '${pubPath.replace(".pub", "")}' '${remoteUser}@${ip}' "echo 'User SSH works'"`;
    
    try {
      const userTest = await cockpit.spawn(["bash","-lc", userKeyCmd], { superuser: "try" });
      if (String(userTest).includes("User SSH works")) {
        console.log(`User SSH verified, attempting root key installation via user connection...`);
        
        // Use the working user SSH to install root key via sudo
        const safePubKey = pubKeyContent.trim().replace(/'/g, "'\"'\"'");
        const installRootKeyCmd = `
          ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \\
              -i '${pubPath.replace(".pub", "")}' '${remoteUser}@${ip}' \\
              "echo '${remotePass.replace(/'/g, "'\\''")}' | sudo -S sh -c 'mkdir -p /root/.ssh && chmod 700 /root/.ssh && echo \"'\"'${safePubKey}'\"'\" >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys && chown root:root /root/.ssh/authorized_keys && echo ROOT_KEY_ADDED_VIA_USER'" 2>&1
        `;
        
        const rootViaUserOut = await cockpit.spawn(["bash","-lc", installRootKeyCmd], { superuser: "try" }).catch((e)=> {
          console.error(`Root key via user failed for ${ip}:`, e);
          return "ROOT_VIA_USER_FAILED";
        });
        
        if (String(rootViaUserOut).includes("ROOT_KEY_ADDED_VIA_USER")) {
          console.log(`✓ SSH key installed for both ${remoteUser} and root on ${ip} (via user connection)`);
          return true;
        }
      }
    } catch (e) {
      console.log(`User SSH connection failed, cannot install root key for ${ip}`);
    }
    
    console.warn(`⚠️ SSH key installed for ${remoteUser} on ${ip}, but no way to install for root (no sudo access)`);
    return true; // User key still works
  }
  
  const rootKeyOut = await cockpit.spawn(["bash","-lc", rootKeyCmd], { superuser: "try" }).catch((e)=> {
    console.error(`Root key command failed for ${ip}:`, e);
    return "ROOT_FAILED";
  });
  const rootKeyResult = String(rootKeyOut);
  
  console.log(`Root key installation command for ${ip}:`);
  console.log(rootKeyCmd);
  console.log(`Root key installation result for ${ip}:`, rootKeyResult);
  
  if (rootKeyResult.includes("ROOT_KEY_ADDED")) {
    console.log(`✓ SSH key installed for both ${remoteUser} and root on ${ip}`);
    
    // Immediate verification: Check if root key was actually added
    const verifyCmd = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i '${pubPath.replace(".pub", "")}' '${remoteUser}@${ip}' "sudo cat /root/.ssh/authorized_keys | wc -l" 2>&1`;
    try {
      const verifyOut = await cockpit.spawn(["bash","-lc", verifyCmd], { superuser: "try" });
      const keyCount = String(verifyOut).trim();
      console.log(`Verification: /root/.ssh/authorized_keys has ${keyCount} entries`);
    } catch (e) {
      console.warn(`Could not verify root key installation: ${e}`);
    }
    
    return true;
  } else {
    console.warn(`⚠️ Root key installation failed on ${ip}. Full command output:`, rootKeyResult);
    console.warn(`Trying alternative method...`);
    
    // Alternative method: Use the user SSH connection to install root key
    const safePubKeyForAlt = pubKeyContent.trim().replace(/'/g, "'\"'\"'");
    const alternativeCmd = `
      ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \\
          -i '${pubPath.replace(".pub", "")}' '${remoteUser}@${ip}' "
        # Try with sudo first
        if sudo -n true 2>/dev/null; then
          echo 'Using sudo method...'
          sudo mkdir -p /root/.ssh
          sudo chmod 700 /root/.ssh
          echo '${safePubKeyForAlt}' | sudo tee -a /root/.ssh/authorized_keys >/dev/null
          sudo chmod 600 /root/.ssh/authorized_keys
          sudo chown root:root /root/.ssh/authorized_keys
          echo ROOT_KEY_ADDED_ALT
        else
          echo 'No sudo access available'
          echo ROOT_KEY_FAILED_ALT
        fi
      " 2>&1
    `;
    
    const altOut = await cockpit.spawn(["bash","-lc", alternativeCmd], { superuser: "try" }).catch((e)=> {
      console.error(`Alternative root key command failed for ${ip}:`, e);
      return "ALT_FAILED";
    });
    const altResult = String(altOut);
    
    console.log(`Alternative root key installation result for ${ip}: ${altResult}`);
    
    if (altResult.includes("ROOT_KEY_ADDED_ALT")) {
      console.log(`✓ SSH key installed for both ${remoteUser} and root on ${ip} (alternative method)`);
      return true;
    } else {
      console.warn(`⚠️ SSH key installed for ${remoteUser} on ${ip}, but failed to add to root. Output: ${altResult}`);
      return true; // Still consider this success since user key works
    }
  }
}

// ===== SSH Key Verification =====
// Test that SSH key-based authentication works for both user and root access

// Comprehensive verification of SSH setup - tests all components independently
// Returns detailed status object with individual verification results
async function verifySSHSetupComprehensive(ip, remoteUser, privPath, localUser, registryIP = null) {
  const results = {
    userKeyAuth: false,
    rootKeyAuth: false,
    permitRootLogin: false,
    passwordAuthDisabled: false,
    sudoConfigured: false,
    registryAliases: false,
    overall: false,
    details: {},
    errors: []
  };

  try {
    // Clean any conflicting host keys first
    await cleanKnownHosts(ip, localUser);
    
    // Test 0: Basic connectivity test
    console.log(`[VERIFY] Testing basic connectivity to ${ip}...`);
    try {
      const pingResult = await cockpit.spawn(["ping", "-c", "1", "-W", "3", ip], { superuser: "try" });
      console.log(`[VERIFY] Host ${ip} is reachable`);
    } catch (e) {
      results.errors.push(`Host ${ip} is not reachable (ping failed)`);
      console.log(`[VERIFY] Host ${ip} ping failed: ${e.message || e}`);
      // Continue anyway - ping might be blocked but SSH could work
    }
    
    // Test 1: User SSH key authentication
    try {
      const userArgs = ["ssh", "-i", privPath, ...SSH_OPTS, `${remoteUser}@${ip}`, "echo USER_SSH_OK", "2>/dev/null || echo USER_SSH_FAIL"];
      const userCmd = userArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
      const userOut = await cockpit.spawn(["bash","-lc", userCmd], { superuser: "try" });
      results.userKeyAuth = String(userOut).includes("USER_SSH_OK");
      results.details.userKeyAuth = String(userOut).trim();
      if (!results.userKeyAuth) results.errors.push(`User SSH key authentication failed`);
    } catch (e) {
      results.errors.push(`User SSH key test error: ${e.message || e}`);
    }

    // Test 2: Root SSH key authentication
    try {
      const rootArgs = ["ssh", "-i", privPath, ...SSH_OPTS, `root@${ip}`, "echo ROOT_SSH_OK", "2>/dev/null || echo ROOT_SSH_FAIL"];
      const rootCmd = rootArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
      const rootOut = await cockpit.spawn(["bash","-lc", rootCmd], { superuser: "try" });
      results.rootKeyAuth = String(rootOut).includes("ROOT_SSH_OK");
      results.details.rootKeyAuth = String(rootOut).trim();
      if (!results.rootKeyAuth) results.errors.push(`Root SSH key authentication failed`);
    } catch (e) {
      results.errors.push(`Root SSH key test error: ${e.message || e}`);
    }

    // Test 3: SSH configuration verification (only if we have SSH access)
    if (results.userKeyAuth || results.rootKeyAuth) {
      try {
        const sshUser = results.rootKeyAuth ? "root" : remoteUser;
        const sshConfigScript = `
          CFG="/etc/ssh/sshd_config"
          if [ ! -f "$CFG" ]; then echo "CONFIG_NOT_FOUND"; exit 0; fi
          
          # Check PermitRootLogin
          permit_root=$(grep -E "^[[:space:]]*PermitRootLogin[[:space:]]" "$CFG" | tail -1 | awk '{print $2}')
          if [ "$permit_root" = "yes" ]; then echo "PERMIT_ROOT_YES"; else echo "PERMIT_ROOT_NO:$permit_root"; fi
          
          # Check PasswordAuthentication
          pass_auth=$(grep -E "^[[:space:]]*PasswordAuthentication[[:space:]]" "$CFG" | tail -1 | awk '{print $2}')
          if [ "$pass_auth" = "no" ]; then echo "PASSWORD_AUTH_NO"; else echo "PASSWORD_AUTH_YES:$pass_auth"; fi
        `;
        
        const configArgs = ["ssh", "-i", privPath, ...SSH_OPTS, `${sshUser}@${ip}`, sshConfigScript];
        const configCmd = configArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
        const configOut = await cockpit.spawn(["bash","-lc", configCmd], { superuser: "try" });
        const configResult = String(configOut);
        
        results.permitRootLogin = configResult.includes("PERMIT_ROOT_YES");
        results.passwordAuthDisabled = configResult.includes("PASSWORD_AUTH_NO");
        results.details.sshConfig = configResult.trim();
        
        if (!results.permitRootLogin) results.errors.push(`PermitRootLogin not set to 'yes'`);
        if (!results.passwordAuthDisabled) results.errors.push(`PasswordAuthentication not set to 'no'`);
      } catch (e) {
        results.errors.push(`SSH config verification error: ${e.message || e}`);
      }
    }

    // Test 4: Sudo configuration (only if user access works and user is not root)
    if (results.userKeyAuth && remoteUser !== "root") {
      try {
        const sudoScript = `
          if ! command -v sudo >/dev/null 2>&1; then echo "SUDO_NOT_INSTALLED"; exit 0; fi
          if sudo -n true 2>/dev/null; then echo "SUDO_NOPASSWD_OK"; else echo "SUDO_NEEDS_PASSWORD"; fi
        `;
        
        const sudoArgs = ["ssh", "-i", privPath, ...SSH_OPTS, `${remoteUser}@${ip}`, sudoScript];
        const sudoCmd = sudoArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
        const sudoOut = await cockpit.spawn(["bash","-lc", sudoCmd], { superuser: "try" });
        results.sudoConfigured = String(sudoOut).includes("SUDO_NOPASSWD_OK");
        results.details.sudo = String(sudoOut).trim();
        
        if (!results.sudoConfigured) results.errors.push(`Sudo not configured for passwordless access`);
      } catch (e) {
        results.errors.push(`Sudo verification error: ${e.message || e}`);
      }
    } else if (remoteUser === "root") {
      results.sudoConfigured = true; // Not needed for root
      results.details.sudo = "Not needed (root user)";
    }

    // Test 5: Registry aliases in /etc/hosts (only if registry IP provided and SSH access works)
    if (registryIP && (results.userKeyAuth || results.rootKeyAuth)) {
      try {
        const sshUser = results.rootKeyAuth ? "root" : remoteUser;
        const hostsScript = `
          CFG="/etc/hosts"
          if [ ! -f "$CFG" ]; then echo "HOSTS_NOT_FOUND"; exit 0; fi
          
          # Check for docker-registry alias
          if grep -q "^[[:space:]]*${registryIP}[[:space:]]\\+docker-registry" "$CFG"; then 
            echo "REGISTRY_ALIAS_OK"
          else 
            echo "REGISTRY_ALIAS_MISSING"
          fi
          
          # Optional: Show current registry-related entries
          grep "${registryIP}" "$CFG" | head -5 | while read line; do echo "HOSTS_ENTRY:$line"; done
        `;
        
        const hostsArgs = ["ssh", "-i", privPath, ...SSH_OPTS, `${sshUser}@${ip}`, hostsScript];
        const hostsCmd = hostsArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
        const hostsOut = await cockpit.spawn(["bash","-lc", hostsCmd], { superuser: "try" });
        results.registryAliases = String(hostsOut).includes("REGISTRY_ALIAS_OK");
        results.details.hosts = String(hostsOut).trim();
        
        if (!results.registryAliases) results.errors.push(`Registry aliases not found in /etc/hosts`);
      } catch (e) {
        results.errors.push(`Registry aliases verification error: ${e.message || e}`);
      }
    } else if (!registryIP) {
      results.registryAliases = true; // Not needed if no registry IP
      results.details.hosts = "Not checked (no registry IP provided)";
    }

    // Overall assessment
    const criticalChecks = [results.userKeyAuth || results.rootKeyAuth]; // At least one SSH method must work
    const preferredChecks = [results.rootKeyAuth, results.permitRootLogin, results.passwordAuthDisabled];
    const optionalChecks = [results.sudoConfigured, results.registryAliases];
    
    results.overall = criticalChecks.every(c => c) && preferredChecks.every(c => c);
    
    // Concise logging - only show failures or summary
    if (results.overall) {
      console.log(`✓ ${ip} - All SSH components verified`);
    } else if (results.errors.length > 0) {
      console.log(`⚠️ ${ip} - Issues: ${results.errors.slice(0,2).join('; ')}`);
    }
    
  } catch (e) {
    results.errors.push(`Verification system error: ${e.message || e}`);
    console.error(`[VERIFY] System error during verification of ${ip}:`, e);
  }

  return results;
}

// Retry verification with exponential backoff for services that may need time to restart
async function verifyWithRetry(ip, remoteUser, privPath, localUser, registryIP = null, maxRetries = 3) {
  let lastResult = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[RETRY] Verification attempt ${attempt}/${maxRetries} for ${ip}`);
    
    const result = await verifySSHSetupComprehensive(ip, remoteUser, privPath, localUser, registryIP);
    lastResult = result;
    
    if (result.overall) {
      console.log(`[RETRY] Verification successful on attempt ${attempt} for ${ip}`);
      return result;
    }
    
    if (attempt < maxRetries) {
      const delay = Math.min(2000 * Math.pow(1.5, attempt - 1), 8000); // 2s, 3s, 4.5s, max 8s
      console.log(`[RETRY] Verification failed, waiting ${delay}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log(`[RETRY] All ${maxRetries} verification attempts failed for ${ip}`);
  return lastResult;
}

// Verify that SSH key authentication works - tests both user and root access
// Returns true if at least user access works (root access is preferred but optional)
// This is the legacy simple verification function - use verifySSHSetupComprehensive for detailed checks
async function verifyKeyOne(ip, remoteUser, privPath, localUser) {
  // Clean any conflicting host keys first to avoid SSH warnings
  await cleanKnownHosts(ip, localUser);
  
  // Test 1: Verify the connecting user can authenticate with the SSH key
  const userArgs = ["ssh", "-i", privPath, ...SSH_OPTS, `${remoteUser}@${ip}`, "echo USER_OK", "2>/dev/null || echo USER_FAIL"];
  const userCmd  = userArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
  const userOut = await cockpit.spawn(["bash","-lc", userCmd], { superuser: "try" }).catch((e)=> {
    console.error(`User SSH verification failed for ${ip}:`, e);
    return "USER_FAIL";
  });
  
  // Test 2: Verify root access works (if connecting as a different user)
  let rootOut = "ROOT_SKIP";
  if (remoteUser !== "root") {
    const rootArgs = ["ssh", "-i", privPath, ...SSH_OPTS, `root@${ip}`, "echo ROOT_OK", "2>/dev/null || echo ROOT_FAIL"];
    const rootCmd  = rootArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ");
    console.log(`Testing root SSH access to ${ip} with command: ${rootCmd}`);
    rootOut = await cockpit.spawn(["bash","-lc", rootCmd], { superuser: "try" }).catch((e)=> {
      console.error(`Root SSH verification failed for ${ip}:`, e);
      return "ROOT_FAIL";
    });
    console.log(`Root SSH test result for ${ip}:`, String(rootOut));
  }
  
  // Analyze results and provide appropriate feedback
  const userWorks = String(userOut).includes("USER_OK");
  const rootWorks = String(rootOut).includes("ROOT_OK");
  const rootSkipped = remoteUser === "root";
  
  console.log(`SSH verification results for ${ip}: user=${userWorks}, root=${rootWorks}, rootSkipped=${rootSkipped}`);
  
  if (rootSkipped && userWorks) {
    console.log(`✓ Root SSH access verified for ${ip} (connected as root)`);
    return true;
  } else if (rootWorks) {
    console.log(`✓ Root SSH access verified for ${ip}`);
    return true;
  } else if (userWorks && !rootWorks) {
    console.log(`✓ User SSH access verified for ${ip} (root access not yet available)`);
    return true;
  } else if (userWorks) {
    console.log(`✓ User SSH access verified for ${ip}`);
    return true;
  } else {
    console.log(`✗ SSH access failed for ${ip} - neither user nor root access working`);
    console.log(`User test output: ${String(userOut)}`);
    console.log(`Root test output: ${String(rootOut)}`);
    return false;
  }
}

// ===== SSH Hardening =====
// Disable password authentication in SSH configuration to enforce key-only access

// Disable password-based SSH authentication on remote host
// Tries root access first (more reliable), falls back to sudo if needed
// ===== SSH Configuration Management =====
// Disable password authentication and enable root SSH access on remote hosts
// This ensures that only key-based authentication works and root login is permitted

async function disablePasswordSsh(ip, remoteUser, privPath, localUser) {
  // Clean any conflicting host keys first to avoid SSH warnings
  await cleanKnownHosts(ip, localUser);
  
  const OK  = "__OK__";        // Success marker
  const ERR = "__ERR__:";      // Error prefix

  // Method 1: Script for direct root access (preferred - no sudo complexity)
  // This script configures SSH to:
  // 1. Enable root login via SSH keys
  // 2. Disable password authentication completely
  // 3. Restart SSH service to apply changes
  const rootScript = `
    set -e  # Exit on any error
    CFG="/etc/ssh/sshd_config"

    # Enable root login via SSH keys (required for our workflow)
    sed -i -E "s/^#?PermitRootLogin\\s+.*/PermitRootLogin yes/" "$CFG" || true
    grep -q "^PermitRootLogin" "$CFG" || echo "PermitRootLogin yes" >> "$CFG"
    
    # Disable password authentication (force key-only access)
    sed -i -E "s/^#?PasswordAuthentication\\s+.*/PasswordAuthentication no/" "$CFG" || true
    grep -q "^PasswordAuthentication" "$CFG" || echo "PasswordAuthentication no" >> "$CFG"
    
    # Apply configuration by restarting SSH service
    systemctl reload sshd 2>/dev/null || systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || service ssh restart 2>/dev/null || true
    echo "${OK}"
  `;

  // Script for non-root user (requires sudo) - same configuration via sudo
  const userScript = `
    set -e
    CFG="/etc/ssh/sshd_config"

    if ! command -v sudo >/dev/null 2>&1; then echo "${ERR}no_sudo"; exit 0; fi
    if ! sudo -n true 2>/dev/null; then echo "${ERR}sudopw_required"; exit 0; fi

    # Enable root login via SSH keys (with sudo)
    sudo sed -i -E "s/^#?PermitRootLogin\\s+.*/PermitRootLogin yes/" "$CFG" || true
    sudo grep -q "^PermitRootLogin" "$CFG" || echo "PermitRootLogin yes" | sudo tee -a "$CFG" >/dev/null
    
    # Disable password authentication (with sudo)
    sudo sed -i -E "s/^#?PasswordAuthentication\\s+.*/PasswordAuthentication no/" "$CFG" || true
    sudo grep -q "^PasswordAuthentication" "$CFG" || echo "PasswordAuthentication no" | sudo tee -a "$CFG" >/dev/null
    
    # Apply configuration by restarting SSH service (with sudo)
    sudo systemctl reload sshd 2>/dev/null || sudo systemctl restart sshd 2>/dev/null || sudo systemctl restart ssh 2>/dev/null || sudo service ssh restart 2>/dev/null || true
    echo "${OK}"
  `;

  // Try root access first (preferred method)
  const rootArgs = ["timeout", `${TIMEOUT_S}s`, "ssh", "-i", privPath, ...SSH_OPTS, `root@${ip}`, rootScript];
  const rootCmd  = rootArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ") + " 2>&1";
  
  try {
    const rootOut = await cockpit.spawn(["bash","-lc", rootCmd], { superuser: "try" });
    if (String(rootOut).includes(OK)) {
      console.log(`✓ SSH configured for root access (PermitRootLogin yes, PasswordAuthentication no) on ${ip}`);
      return true;
    }
  } catch (e) {
    console.log(`Root access not available on ${ip}, trying user access with sudo...`);
  }

  // Fallback to user access with sudo
  const userArgs = ["timeout", `${TIMEOUT_S}s`, "ssh", "-i", privPath, ...SSH_OPTS, `${remoteUser}@${ip}`, userScript];
  const userCmd  = userArgs.map(a => (a.includes(" ") ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ") + " 2>&1";
  
  try {
    const out = await cockpit.spawn(["bash","-lc", userCmd], { superuser: "try" });
    const s = String(out);
    if (s.includes(OK)) {
      console.log(`✓ SSH configured for root access (PermitRootLogin yes, PasswordAuthentication no) via sudo on ${ip}`);
      return true;
    }
    if (s.includes("__ERR__:no_sudo")) {
      console.warn(`SSH configuration failed (${ip}): sudo not installed - cannot enable root SSH access`);
      return false;
    }
    if (s.includes("__ERR__:sudopw_required")) {
      console.warn(`SSH configuration failed (${ip}): sudo requires password. Run 'sudo visudo' on remote host and add: ${remoteUser} ALL=(ALL) NOPASSWD: ALL`);
      return false;
    }
    console.warn(`SSH configuration unexpected output (${ip}):`, out);
    return false;
  } catch (e) {
    console.error(`SSH configuration error (${ip}):`, e);
    return false;
  }
}

// ===== Registry aliases on remote =====
// Adds TWO SEPARATE lines to /etc/hosts via awk:
//   <IP> docker-registry
//   <IP> <hostFQDN>
// Prefers root access when available, falls back to sudo
async function ensureRemoteRegistryAliases(ip, remoteUser, privPath, registryIP, registryHost, localUser) {
  // Clean any conflicting host keys first
  await cleanKnownHosts(ip, localUser);
  
  const OK  = "__OK__";
  const ERR = "__ERR__:";

  // Script for root user (no sudo needed)
  const rootScript = `
    set -e
    CFG="/etc/hosts"
    REG_IP="${registryIP}"
    REG_ALIAS="docker-registry"
    REG_HOST="${registryHost}"

    if command -v lsattr >/dev/null 2>&1; then
      if lsattr -a "$CFG" 2>/dev/null | grep -q " i "; then echo "${ERR}hosts_immutable"; exit 0; fi
    fi

    ensure_line() {
      ip="$1"; name="$2"
      awk -v want_ip="$ip" -v host="$name" '
        BEGIN { found=0 }
        $0 ~ "^[[:space:]]*[0-9.]+[[:space:]]+"host"([[:space:]]|$)" {
          if (!found) { print want_ip " " host; found=1 }
          next
        }
        { print }
        END { if (!found) print want_ip " " host }
      ' "$CFG" > "$CFG.tmp" && mv "$CFG.tmp" "$CFG"
    }

    ensure_line "$REG_IP" "$REG_ALIAS"
    if [ -n "$REG_HOST" ]; then ensure_line "$REG_IP" "$REG_HOST"; fi
    echo "${OK}"
  `;

  // Script for non-root user (requires sudo)
  const userScript = `
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

  // Try root access first
  const rootArgs = [
    "timeout", `${TIMEOUT_S}s`, "ssh", "-i", privPath,
    ...SSH_OPTS,
    `root@${ip}`, rootScript
  ];
  const rootCmd = rootArgs.map(a => (/\s/.test(a) ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ") + " 2>&1";

  try {
    const rootOut = await cockpit.spawn(["bash","-lc", rootCmd], { superuser: "try" });
    const s = String(rootOut);
    if (s.includes(OK)) {
      console.log(`✓ Registry aliases configured via root access on ${ip}`);
      return { ok:true, msg:"configured via root access" };
    }
    if (s.includes("__ERR__:hosts_immutable")) return { ok:false, msg:"/etc/hosts immutable (chattr -i /etc/hosts)" };
  } catch (e) {
    console.log(`Root access not available on ${ip}, trying user access...`);
  }

  // Fallback to user access with sudo
  const userArgs = [
    "timeout", `${TIMEOUT_S}s`, "ssh", "-i", privPath,
    ...SSH_OPTS,
    `${remoteUser}@${ip}`, userScript
  ];
  const userCmd = userArgs.map(a => (/\s/.test(a) ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ") + " 2>&1";

  try {
    const out = await cockpit.spawn(["bash","-lc", userCmd], { superuser: "try" });
    const s = String(out);
    if (s.includes(OK)) return { ok:true, msg:"configured via sudo" };
    if (s.includes("__ERR__:no_sudo"))         return { ok:false, msg:"sudo not installed" };
    if (s.includes("__ERR__:sudopw_required")) return { ok:false, msg:"sudo requires password. Run 'sudo visudo' on remote host and add: ${remoteUser} ALL=(ALL) NOPASSWD: ALL" };
    if (s.includes("__ERR__:hosts_immutable")) return { ok:false, msg:"/etc/hosts immutable (chattr -i /etc/hosts)" };
    console.warn(`alias output (${ip}):`, out);
    return { ok:false, msg:"unknown error (see console)" };
  } catch (e) {
    console.error(`alias fail (${ip}):`, e);
    return { ok:false, msg: e.message || "spawn failed" };
  }
}

// Configure passwordless sudo on remote host
async function configureSudoNopasswd(ip, remoteUser, remotePass, localUser, keyType = "ed25519") {
  // Clean any conflicting host keys first
  await cleanKnownHosts(ip, localUser);
  
  const OK  = "__OK__";
  const ERR = "__ERR__:";

  const remoteScript = `
    set -e
    
    # Check if we have sudo access with password
    if ! command -v sudo >/dev/null 2>&1; then echo "${ERR}no_sudo"; exit 0; fi
    
    # Test if sudo already works without password
    if sudo -n true 2>/dev/null; then echo "${OK}already_configured"; exit 0; fi
    
    # Create sudoers.d file for passwordless access
    SUDOERS_FILE="/etc/sudoers.d/99-${remoteUser}-nopasswd"
    SUDOERS_CONTENT="${remoteUser} ALL=(ALL) NOPASSWD: ALL"
    
    # Try different methods to gain root access and configure sudo
    
    # Method 1: Try sudo with password (if user is already in sudoers)
    if echo '${remotePass.replace(/'/g,"'\\''")}' | sudo -S -v 2>/dev/null; then
      echo '${remotePass.replace(/'/g,"'\\''")}' | sudo -S sh -c "
        echo '$SUDOERS_CONTENT' > '$SUDOERS_FILE' && 
        chmod 440 '$SUDOERS_FILE' && 
        visudo -c -f '$SUDOERS_FILE'
      " 2>/dev/null || echo "${ERR}sudo_failed"
    else
      # Method 2: Try su to root (assuming password is root password)
      echo '${remotePass.replace(/'/g,"'\\''")}' | su -c "
        echo '$SUDOERS_CONTENT' > '$SUDOERS_FILE' && 
        chmod 440 '$SUDOERS_FILE' && 
        visudo -c -f '$SUDOERS_FILE'
      " root 2>/dev/null || echo "${ERR}su_failed"
    fi
    
    # Test if sudo now works without password
    if sudo -n true 2>/dev/null; then
      echo "${OK}"
    else
      echo "${ERR}still_requires_password"
    fi
  `;

  // First try: check if we can use key-based SSH (if key is already installed)
  let useKeyAuth = false;
  const localUser_kp = localKeyPaths(localUser, keyType);
  if (await ensurePrivateKeyUsable(localUser_kp.private).then(r => r.ok)) {
    const keyTest = await verifyKeyOne(ip, remoteUser, localUser_kp.private, localUser);
    if (keyTest) {
      useKeyAuth = true;
    }
  }

  let args, cmd;
  
  if (useKeyAuth) {
    // Use key-based SSH
    args = [
      "timeout", `${TIMEOUT_S}s`, "ssh", "-i", localUser_kp.private,
      ...SSH_OPTS, `${remoteUser}@${ip}`, remoteScript
    ];
  } else {
    // Use password-based SSH  
    args = [
      "timeout", `${TIMEOUT_S}s`, "sshpass", "-p", remotePass, 
      "ssh", ...SSH_OPTS, "-o", "PreferredAuthentications=password", 
      "-o", "PubkeyAuthentication=no", `${remoteUser}@${ip}`, remoteScript
    ];
  }
  
  cmd = args.map(a => (/\s/.test(a) ? `'${a.replace(/'/g,"'\\''")}'` : a)).join(" ") + " 2>&1";

  try {
    const out = await cockpit.spawn(["bash","-lc", cmd], { superuser: "try" });
    const s = String(out);
    if (s.includes(OK + "already_configured")) return { ok: true, msg: "passwordless sudo already configured" };
    if (s.includes(OK)) return { ok: true, msg: "passwordless sudo configured" };
    if (s.includes("__ERR__:no_sudo")) return { ok: false, msg: "sudo not installed on remote host" };
    if (s.includes("__ERR__:sudo_failed")) return { ok: false, msg: "failed to configure sudo via sudo method" };
    if (s.includes("__ERR__:su_failed")) return { ok: false, msg: "failed to configure sudo via su method (incorrect password?)" };
    if (s.includes("__ERR__:still_requires_password")) return { ok: false, msg: "sudo configuration failed - still requires password" };
    console.warn(`sudo config output (${ip}):`, out);
    return { ok: false, msg: "unknown error (see console)" };
  } catch (e) {
    console.error(`sudo config error (${ip}):`, e);
    return { ok: false, msg: `connection failed: ${e.message || "spawn failed"}` };
  }
}

// ===== SSH Management UI Module =====
// Main UI controller that manages the SSH configuration interface
// Handles host selection, key distribution, status tracking, and user interactions

// Create and initialize the SSH management UI
// Returns an object with refresh method for external updates
export function createSSHUI({ getHosts }) {
  // ===== DOM Element References =====
  // Cache all UI elements for efficient access
  const el = {
    // Input fields for SSH configuration
    localUser:   document.getElementById("ssh-local-user"),    // Local SSH user (usually root)
    keyType:     document.getElementById("ssh-key-type"),      // RSA or Ed25519 key type
    remoteUser:  document.getElementById("ssh-remote-user"),   // Remote username for connection  
    remotePass:  document.getElementById("ssh-remote-pass"),   // Remote password for initial setup
    registryIP:  document.getElementById("ssh-registry-ip"),   // Custom registry IP (optional)
    
    // Action buttons
    genBtn:      document.getElementById("ssh-gen"),           // Generate/verify local keys
    distBtn:     document.getElementById("ssh-dist"),          // Distribute keys to selected hosts
    verifyAllBtn: document.getElementById("ssh-verify-all"),     // Verify all SSH status button
    disablePasswordAuthBtn: document.getElementById("ssh-disable-password-auth"), // New: Disable password authentication
    configureRegistryBtn: document.getElementById("ssh-configure-registry"),      // New: Configure registry aliases
    
    // Status and display elements
    status:      document.getElementById("ssh-status"),        // Main status message area
    additionalStatus: document.getElementById("ssh-additional-status"), // New: Status for additional operations
    tbody:       document.getElementById("ssh-tbody"),         // Host list table body
    
    // Selection controls
    selectAll:   document.getElementById("ssh-select-all"),    // Master checkbox for all hosts
    qAll:        document.getElementById("ssh-sel-all"),       // Quick select all button
    qNone:       document.getElementById("ssh-sel-none"),      // Quick select none button
    
    // Pagination controls
    pager:       document.getElementById("ssh-pager"),         // Pagination container
    pageFirst:   document.getElementById("ssh-page-first"),    // First page button
    pagePrev:    document.getElementById("ssh-page-prev"),     // Previous page button
    pageNext:    document.getElementById("ssh-page-next"),     // Next page button
    pageLast:    document.getElementById("ssh-page-last"),     // Last page button
    pageInfo:    document.getElementById("ssh-page-info"),     // Page info display
    pageSizeSel: document.getElementById("ssh-page-size"),     // Page size selector
    loadMore:    document.getElementById("ssh-load-more"),     // Load more hosts button
    count:       document.getElementById("ssh-count"),         // Selection counter
  };

  // ===== State Management =====
  // Track pagination, selection, and UI state using legacy variables for compatibility
  
  // Per-host state tracking: selected status, IP, roles, key status, registry status, etc.
  // Map structure: { selected, ip, roles, hasKey, hasReg, pwdOff, lastMsg, lastClass }
  const rowState = new Map();
  
  // Pagination state
  let currentPage = 1;                                          // Current page number (1-based)
  let pageSize = parseInt(el.pageSizeSel?.value || PAGE_SIZE, 10); // Items per page
  if (Number.isNaN(pageSize)) pageSize = PAGE_SIZE;

  // ===== Data Access Functions =====
  // Get current host list from external source
  const targets = () => getHosts() || [];
  
  // Calculate total pages needed for given number of items
  const totalPagesOf = len => Math.max(1, Math.ceil(len / Math.max(1, pageSize)));
  
  // Ensure current page is within valid range
  const clampPage = (len) => { 
    const t = totalPagesOf(len); 
    if (currentPage > t) currentPage = t; 
    if (currentPage < 1) currentPage = 1; 
  };

  // ===== Pagination UI Management =====
  // Update pagination controls based on current state
  function renderPager(total) {
    // Show pager only if results exceed current page size
    const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
    const show  = total > pageSize;

    // Toggle pager visibility
    if (el.pager)     el.pager.hidden = !show;
    if (show && el.pageInfo) el.pageInfo.textContent = `Page ${currentPage} / ${pages}`;

    // Update navigation button states
    if (el.pageFirst) el.pageFirst.disabled = currentPage === 1;
    if (el.pagePrev)  el.pagePrev.disabled  = currentPage === 1;
    if (el.pageNext)  el.pageNext.disabled  = currentPage === pages;
    if (el.pageLast)  el.pageLast.disabled  = currentPage === pages;
  }

  // ===== Host State Persistence =====
  // Save and restore host state across sessions for better UX
  
  // Persist host state to storage (called after status changes)
  function persistHost(hn, st) {
    persisted[hn] = {
      hasKey: !!st.hasKey,        // SSH key installed successfully
      hasSudo: !!st.hasSudo,      // Sudo configured for passwordless access
      hasReg: !!st.hasReg,        // Registry aliases configured
      pwdOff: !!st.pwdOff,        // Password SSH disabled
      lastMsg: st.lastMsg || "",  // Last status message
      lastClass: st.lastClass || "", // Last status CSS class
      ts: Date.now()              // Timestamp for cache invalidation
    };
    schedulePersist();
  }
  
  // Set status message and CSS class for a specific host row
  function setRowMsg(hn, text, cls) {
    const st = rowState.get(hn) || {};
    st.lastMsg = text || "";
    st.lastClass = cls || "";
    rowState.set(hn, st);
    persistHost(hn, st);
  }
  
  // Shorthand functions to mark various host capabilities as configured
  function markKey(hn, v=true){ const st=rowState.get(hn)||{}; st.hasKey=!!v; rowState.set(hn,st); persistHost(hn,st); }
  function markSudo(hn, v=true){ const st=rowState.get(hn)||{}; st.hasSudo=!!v; rowState.set(hn,st); persistHost(hn,st); }
  function markReg(hn, v=true){ const st=rowState.get(hn)||{}; st.hasReg=!!v; rowState.set(hn,st); persistHost(hn,st); }
  function markPwd(hn, v=true){ const st=rowState.get(hn)||{}; st.pwdOff=!!v; rowState.set(hn,st); persistHost(hn,st); }

  // ===== HTML Utilities =====
  // Simple HTML escaper for safe text display in status messages
  function escapeHtml(s){ 
    return String(s||"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;"); 
  }

  // ===== Status Badge Rendering =====
  // Generate HTML for host status badges (Key, Sudo, Registry, Password SSH)
  function renderBadges(st){
    // Define all trackable host capabilities
    const items = [
      { label: "Key",    ok: !!st.hasKey },   // SSH key installed
      { label: "Sudo",   ok: !!st.hasSudo },  // Passwordless sudo configured
      { label: "Reg",    ok: !!st.hasReg },   // Registry aliases set up
      { label: "PwdOff", ok: !!st.pwdOff }    // Password SSH disabled
    ];

    // Generate badge HTML with status indicators
    const badges = items.map(it => `
      <span class="xd-badge ${it.ok ? "ok" : "off"}" title="${it.label}${it.ok ? ' is set' : ' not set'}">
        <span class="dot"></span><span>${it.label}</span>${it.ok ? '<span aria-hidden="true">✓</span>' : ''}
      </span>
    `).join("");

    // Determine status note styling based on last operation result
    const noteClass =
      st.lastClass === "ok"  ? "ok"  :   // Success styling
      st.lastClass === "err" ? "err" :   // Error styling
      "";                                // Default/neutral styling

    // Generate status note if message exists
    const note = st.lastMsg
      ? `<div class="xd-status-note ${noteClass}">${escapeHtml(st.lastMsg)}</div>`
      : "";

    // Combine badges and status note for complete status display
    return `<div class="xd-badges">${badges}</div>${note}`;
  }

  // ===== Selection Management =====
  // Handle master checkbox state based on individual row selections
  function updateMaster() {
    if (!el.selectAll) return;
    const list = Array.from(rowState.values());
    const total = list.length;
    const selected = list.filter(s => s.selected).length;
    
    // Set master checkbox: checked if all selected, indeterminate if some selected
    el.selectAll.checked = selected === total && total > 0;
    el.selectAll.indeterminate = selected > 0 && selected < total;
  }

  // Count currently selected hosts across all pages
  function selectedCount() {
    let n = 0; 
    for (const st of rowState.values()) if (st.selected) n++; 
    return n;
  }
  
  // Enable/disable action buttons based on selection state
  function updateActionsEnabled() {
    const total = (getHosts() || []).length;
    const sel   = selectedCount();
    const haveSel = total > 0 && sel > 0;
    
    // Disable buttons if no hosts selected
    el.distBtn.disabled    = !haveSel;
    el.disablePasswordAuthBtn.disabled = !haveSel;
    el.configureRegistryBtn.disabled = !haveSel;
    
    // Update selection counter display
    if (el.count) el.count.textContent = total ? `${sel}/${total} selected` : `0 selected`;
  }

  // ===== Table Rendering =====
  // Main function to render the host list table with pagination
  function renderTable() {
    // Keep pageSize synced with the dropdown every render
    if (el.pageSizeSel) {
      const selVal = parseInt(el.pageSizeSel.value || pageSize, 10);
      if (!Number.isNaN(selVal)) pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, selVal));
    }

    const list = targets();
    const total = list.length;
    clampPage(total);

    // Ensure rowState entries exist and refresh IP/roles from current data
    list.forEach(h => {
      if (!rowState.has(h.hostname)) {
        // Initialize new host with default selected state and preserve any existing status
        rowState.set(h.hostname, {
          selected: true,                                                        // Default to selected
          ip: h.ip, 
          roles: h.roles || [],
          // Preserve existing status badges or initialize to false
          hasKey: !!rowState.get(h.hostname)?.hasKey,                           // SSH key installed
          hasSudo: !!rowState.get(h.hostname)?.hasSudo,                         // Passwordless sudo configured  
          hasReg: !!rowState.get(h.hostname)?.hasReg,                           // Registry aliases set up
          pwdOff: !!rowState.get(h.hostname)?.pwdOff,                           // Password SSH disabled
          // Preserve existing status messages (support legacy statusText field)
          lastMsg: rowState.get(h.hostname)?.lastMsg || rowState.get(h.hostname)?.statusText || "",
          lastClass: rowState.get(h.hostname)?.lastClass || rowState.get(h.hostname)?.statusClass || ""
        });
      } else {
        // Update existing host with current IP and roles
        const st = rowState.get(h.hostname);
        st.ip = h.ip; 
        st.roles = h.roles || [];
      }
    });

    // ===== Table Row Generation =====
    // Clear existing table and render current page of hosts
    el.tbody.innerHTML = "";
    const start = (currentPage - 1) * pageSize;  // Start index for current page
    const end   = Math.min(start + pageSize, total); // End index for current page

    // Generate table rows for visible hosts
    for (let i = start; i < end; i++) {
      const h  = list[i];
      const st = rowState.get(h.hostname) || {};

      const tr = document.createElement("tr");

      // Checkbox column for host selection
      const tdCk = document.createElement("td");
      const cb   = document.createElement("input");
      cb.type    = "checkbox";
      cb.checked = !!st.selected;
      // Update selection state when checkbox changes
      cb.addEventListener("change", () => { 
        st.selected = cb.checked; 
        updateMaster(); 
        updateActionsEnabled(); 
      });
      tdCk.appendChild(cb); 
      tr.appendChild(tdCk);

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

  // Password field updates button states
  el.remotePass?.addEventListener("input", updateActionsEnabled);

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
    const remoteUser = (el.remoteUser.value.trim() || "xloud").toLowerCase(); // Default to "xloud", convert to lowercase for Linux compatibility
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

    let done = 0, skipped = 0;

    for (const t of tList) {
      // verify key; install if needed and password provided
      setRowMsg(t.hostname, "Verifying SSH key…", ""); renderTable();
      console.log(`Checking SSH access to ${remoteUser}@${t.ip}...`);
      let hasKey = await verifyKeyOne(t.ip, remoteUser, kp.private, localUser);

      if (!hasKey && !remotePass) {
        setRowMsg(t.hostname, "no SSH key · password required for installation", "err"); renderTable(); skipped++; continue;
      }
      
      // Always run key distribution if password is available (to ensure root key is installed)
      if (remotePass) {
        setRowMsg(t.hostname, `Installing/updating SSH keys for ${remoteUser} and root…`, ""); renderTable();
        console.log(`Installing SSH keys to ${remoteUser}@${t.ip} (including root)...`);
        const okCopy = await distributeOne(t.ip, remoteUser, remotePass, kp.public, localUser);
        if (!okCopy) { setRowMsg(t.hostname, "SSH key installation failed", "err"); renderTable(); continue; }
        setRowMsg(t.hostname, "Verifying SSH access…", ""); renderTable();
        hasKey = await verifyKeyOne(t.ip, remoteUser, kp.private, localUser);
        if (!hasKey) { setRowMsg(t.hostname, "SSH key verification failed", "err"); renderTable(); continue; }
      } else if (!hasKey) {
        setRowMsg(t.hostname, "SSH key required but no password provided", "err"); renderTable(); skipped++; continue;
      }

      // mark key badge
      markKey(t.hostname, true);
      
      // Pre-configure sudo if needed (before attempting root SSH setup)
      if (remotePass) {
        setRowMsg(t.hostname, "checking/configuring sudo access…", ""); renderTable();
        const sudoResult = await configureSudoNopasswd(t.ip, remoteUser, remotePass, localUser, keyType);
        if (sudoResult.ok) {
          markSudo(t.hostname, true);
          console.log(`✓ Sudo configured for ${remoteUser} on ${t.hostname}`);
        } else {
          console.warn(`⚠️ Could not configure sudo for ${remoteUser} on ${t.hostname}: ${sudoResult.msg}`);
        }
      }
      
      // Enable root SSH access immediately after key installation
      setRowMsg(t.hostname, "enabling root SSH access…", ""); renderTable();
      const rootSSHEnabled = await disablePasswordSsh(t.ip, remoteUser, kp.private, localUser);
      if (rootSSHEnabled) {
        console.log(`✓ Root SSH configuration applied on ${t.hostname}, running comprehensive verification...`);
        
        // COMPREHENSIVE VERIFICATION WITH RETRY
        setRowMsg(t.hostname, "running comprehensive verification (with retry)…", ""); renderTable();
        
        const registryIP = el.registryIP?.value?.trim() || await getLocalPrimaryIPv4().catch(() => null);
        const verificationResult = await verifyWithRetry(t.ip, remoteUser, kp.private, localUser, registryIP, 3);
        
        // Update badges based on ACTUAL verification results
        markKey(t.hostname, verificationResult.userKeyAuth || verificationResult.rootKeyAuth);
        markSudo(t.hostname, verificationResult.sudoConfigured);
        markPwd(t.hostname, verificationResult.permitRootLogin && verificationResult.passwordAuthDisabled);
        markReg(t.hostname, verificationResult.registryAliases);
        
        if (verificationResult.overall) {
          console.log(`✓ Comprehensive verification PASSED for ${t.hostname} - All components verified!`);
          setRowMsg(t.hostname, `✓ Verified: SSH keys + root access + config all working! Try: ssh root@${t.ip}`, "ok");
          done++;
        } else {
          console.warn(`⚠️ Comprehensive verification FAILED for ${t.hostname}. Issues found:`, verificationResult.errors);
          
          // Generate detailed error report
          const errorReport = generateDetailedErrorReport(t.hostname, verificationResult);
          console.log(`[ERROR REPORT] ${errorReport.summary}`);
          console.log("[ERROR DETAILS]", errorReport.errors);
          console.log("[SUGGESTIONS]", errorReport.suggestions);
          console.log("[VERIFICATION DETAILS]", errorReport.details);
          
          const errorSummary = verificationResult.errors.slice(0, 2).join('; '); // Show first 2 errors
          const moreErrors = verificationResult.errors.length > 2 ? ` (+${verificationResult.errors.length - 2} more)` : '';
          setRowMsg(t.hostname, `⚠️ Verification failed: ${errorSummary}${moreErrors}`, "err");
          
          // Log detailed verification results for debugging
          console.log(`[DEBUG] Detailed verification results for ${t.hostname}:`, {
            userKeyAuth: verificationResult.userKeyAuth,
            rootKeyAuth: verificationResult.rootKeyAuth,
            permitRootLogin: verificationResult.permitRootLogin,
            passwordAuthDisabled: verificationResult.passwordAuthDisabled,
            sudoConfigured: verificationResult.sudoConfigured,
            registryAliases: verificationResult.registryAliases,
            details: verificationResult.details
          });
        }
      } else {
        console.warn(`⚠️ Failed to enable root SSH access on ${t.hostname}`);
        setRowMsg(t.hostname, "Failed to enable root SSH access", "err");
        continue;
      }
      
      renderTable();
    }

    setStatus(el.status,
      skipped ? `Verified ${done}, ${skipped} host(s) need a password to install keys.` : 
      done > 0 ? `Verified ${done} host(s) with comprehensive checks! Try: ssh root@${tList[0]?.ip || 'TARGET_IP'}` :
      `No hosts processed successfully. Check logs for details.`,
      skipped > 0 || done === 0 ? "err" : "ok"
    );
  });

  // Verify All: Comprehensive verification of all hosts with SSH status
  el.verifyAllBtn?.addEventListener("click", async () => {
    try {
      await refreshWithVerification();
    } catch (e) {
      console.error("Verify all failed:", e);
      setStatus(el.additionalStatus, "Verification failed - check console for details", "err");
    }
  });

  // New: Disable Password Authentication button
  el.disablePasswordAuthBtn.addEventListener("click", async () => {
    const localUser  = el.localUser.value.trim() || "root";
    const keyType    = el.keyType.value;
    const remoteUser = (el.remoteUser.value.trim() || "xloud").toLowerCase();
    
    let kp;
    try { kp = await ensureLocalKey(localUser, keyType); }
    catch { return setStatus(el.additionalStatus, "Failed to read local key.", "err"); }

    const keyOk = await ensurePrivateKeyUsable(kp.private);
    if (!keyOk.ok) return setStatus(el.additionalStatus, `Local key not usable (${keyOk.reason})`, "err");

    const tList = Array.from(rowState.entries()).filter(([,st]) => st.selected).map(([hostname, st]) => ({ hostname, ip: st.ip }));
    if (!tList.length) return setStatus(el.additionalStatus, "No hosts selected.", "err");

    setStatus(el.additionalStatus, "Disabling password authentication on selected hosts...", "");

    let success = 0, failed = 0;

    for (const t of tList) {
      setRowMsg(t.hostname, "disabling password authentication…", ""); renderTable();
      const ok = await disablePasswordSsh(t.ip, remoteUser, kp.private, localUser);
      if (ok) {
        // Verify the configuration was actually applied
        setRowMsg(t.hostname, "verifying password auth disabled…", ""); renderTable();
        const verification = await verifySSHSetupComprehensive(t.ip, remoteUser, kp.private, localUser);
        
        if (verification.passwordAuthDisabled && verification.permitRootLogin) {
          markPwd(t.hostname, true);
          setRowMsg(t.hostname, "password authentication disabled & verified", "ok");
          success++;
        } else {
          setRowMsg(t.hostname, "verification failed: password auth may still be enabled", "err");
          failed++;
        }
      } else {
        setRowMsg(t.hostname, "password auth disable failed", "err");
        failed++;
      }
      renderTable();
    }
    
    if (failed > 0) {
      setStatus(el.additionalStatus, `${success} succeeded, ${failed} failed. Check SSH key access and sudo permissions.`, "err");
    } else {
      setStatus(el.additionalStatus, `Password authentication disabled on ${success} host(s).`, "ok");
    }
  });

  // New: Configure Registry Aliases button
  el.configureRegistryBtn.addEventListener("click", async () => {
    const localUser  = el.localUser.value.trim() || "root";
    const keyType    = el.keyType.value;
    const remoteUser = (el.remoteUser.value.trim() || "xloud").toLowerCase();
    
    let kp;
    try { kp = await ensureLocalKey(localUser, keyType); }
    catch { return setStatus(el.additionalStatus, "Failed to read local key.", "err"); }

    const keyOk = await ensurePrivateKeyUsable(kp.private);
    if (!keyOk.ok) return setStatus(el.additionalStatus, `Local key not usable (${keyOk.reason})`, "err");

    const tList = Array.from(rowState.entries()).filter(([,st]) => st.selected).map(([hostname, st]) => ({ hostname, ip: st.ip }));
    if (!tList.length) return setStatus(el.additionalStatus, "No hosts selected.", "err");

    // Use custom registry IP if provided, otherwise auto-detect
    const customRegistryIP = (el.registryIP?.value || "").trim();
    const registryIP   = customRegistryIP || await getLocalPrimaryIPv4();
    const registryHost = await getLocalHostnameFQDN();

    setStatus(el.additionalStatus, "Configuring registry aliases on selected hosts...", "");

    let success = 0, failed = 0;

    for (const t of tList) {
      setRowMsg(t.hostname, "configuring registry aliases…", ""); renderTable();
      const reg = await ensureRemoteRegistryAliases(t.ip, remoteUser, kp.private, registryIP, registryHost, localUser);
      if (reg.ok) {
        // Verify the configuration was actually applied
        setRowMsg(t.hostname, "verifying registry aliases…", ""); renderTable();
        const verification = await verifySSHSetupComprehensive(t.ip, remoteUser, kp.private, localUser, registryIP);
        
        if (verification.registryAliases) {
          markReg(t.hostname, true);
          setRowMsg(t.hostname, "registry aliases configured & verified", "ok");
          success++;
        } else {
          setRowMsg(t.hostname, "verification failed: registry aliases not found", "err");
          failed++;
        }
      } else {
        setRowMsg(t.hostname, `registry config failed: ${reg.msg}`, "err");
        failed++;
      }
      renderTable();
    }
    
    if (failed > 0) {
      setStatus(el.additionalStatus, `${success} succeeded, ${failed} failed. Check SSH access and sudo permissions.`, "err");
    } else {
      setStatus(el.additionalStatus, `Registry aliases configured on ${success} host(s) (IP: ${registryIP}).`, "ok");
    }
  });

  // Rehydrate statuses from disk
  (async () => {
    persisted = await loadSSHStatus();
    setTimeout(() => { renderTable(); }, 0);
  })();

// Enhanced error reporting for SSH verification failures
function generateDetailedErrorReport(hostname, verificationResult) {
  const errors = [];
  const suggestions = [];
  
  if (!verificationResult.userKeyAuth && !verificationResult.rootKeyAuth) {
    errors.push("❌ SSH key authentication failed for both user and root");
    suggestions.push(`• Check SSH connectivity: ssh -i <keyfile> ${hostname} 'echo test'`);
    suggestions.push("• Verify the SSH key was properly installed");
    suggestions.push("• Check if SSH service is running on the target host");
  }
  
  if (!verificationResult.rootKeyAuth && verificationResult.userKeyAuth) {
    errors.push("❌ Root SSH key authentication failed (user works)");
    suggestions.push("• SSH key may not be installed for root user");
    suggestions.push(`• Try manual root key installation: ssh-copy-id -i <keyfile> root@${hostname}`);
  }
  
  if (!verificationResult.permitRootLogin) {
    errors.push("❌ Root SSH login not enabled");
    suggestions.push("• Add 'PermitRootLogin yes' to /etc/ssh/sshd_config");
    suggestions.push("• Restart SSH service: systemctl restart sshd");
  }
  
  if (!verificationResult.passwordAuthDisabled) {
    errors.push("❌ Password authentication not disabled");
    suggestions.push("• Add 'PasswordAuthentication no' to /etc/ssh/sshd_config");
    suggestions.push("• Restart SSH service: systemctl restart sshd");
  }
  
  if (!verificationResult.sudoConfigured && verificationResult.userKeyAuth) {
    errors.push("❌ Passwordless sudo not configured");
    suggestions.push(`• Add to /etc/sudoers: <username> ALL=(ALL) NOPASSWD: ALL`);
    suggestions.push("• Or run: echo '<username> ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/<username>");
  }
  
  if (!verificationResult.registryAliases) {
    errors.push("❌ Registry aliases not found in /etc/hosts");
    suggestions.push("• Add registry IP and hostname to /etc/hosts");
    suggestions.push("• Example: echo '<IP> docker-registry' >> /etc/hosts");
  }
  
  return {
    summary: `${errors.length} verification issue(s) found for ${hostname}`,
    errors: errors,
    suggestions: suggestions,
    details: verificationResult.details
  };
}

// Auto-convert remote username to lowercase for Linux compatibility
  if (el.remoteUser) {
    el.remoteUser.addEventListener("input", function() {
      const cursorPos = this.selectionStart;
      const oldValue = this.value;
      const newValue = oldValue.toLowerCase();
      if (oldValue !== newValue) {
        this.value = newValue;
        this.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }

  renderTable();
  
  // Enhanced refresh function that includes comprehensive verification
  async function refreshWithVerification() {
    const localUser = el.localUser?.value?.trim() || "root";
    const keyType = el.keyType?.value || "ed25519";
    const registryIP = el.registryIP?.value?.trim() || await getLocalPrimaryIPv4().catch(() => null);
    
    // Get current hosts and update table
    renderTable();
    
    // Check if we have a usable SSH key
    let kp;
    try {
      kp = await ensureLocalKey(localUser, keyType);
      const keyOk = await ensurePrivateKeyUsable(kp.private);
      if (!keyOk.ok) {
        console.warn("Local SSH key not usable, skipping verification");
        setStatus(el.status, `SSH key not usable (${keyOk.reason}). Generate key first.`, "err");
        return;
      }
    } catch (e) {
      console.warn("No SSH key available for verification:", e);
      setStatus(el.status, "No SSH key available. Generate key first using 'Generate / Use existing key' button.", "err");
      return;
    }
    
    // Get all hosts that have any SSH status
    const hostsToVerify = Array.from(rowState.entries())
      .filter(([hostname, st]) => st.ip) // Only need valid IP
      .map(([hostname, st]) => ({ hostname, ip: st.ip }));
    
    if (hostsToVerify.length === 0) {
      console.log("No hosts available to verify - add some hosts first");
      setStatus(el.status, "No hosts available to verify. Add hosts first.", "err");
      return;
    }
    
    console.log(`[REFRESH] Starting verification of ${hostsToVerify.length} hosts...`);
    setStatus(el.status, `Verifying SSH status on ${hostsToVerify.length} hosts...`, "");
    
    let verified = 0, failed = 0, skipped = 0;
    
    for (const host of hostsToVerify) {
      try {
        setRowMsg(host.hostname, "checking SSH status…", ""); 
        renderTable();
        
        // Try to get the remote user from the form, default to common usernames
        const remoteUser = (el.remoteUser?.value?.trim() || "xloud").toLowerCase();
        
        // Run comprehensive verification
        const result = await verifySSHSetupComprehensive(host.ip, remoteUser, kp.private, localUser, registryIP);
        
        // Update badges based on actual verification results  
        markKey(host.hostname, result.userKeyAuth || result.rootKeyAuth);
        markSudo(host.hostname, result.sudoConfigured);
        markPwd(host.hostname, result.permitRootLogin && result.passwordAuthDisabled);
        markReg(host.hostname, result.registryAliases);
        
        if (result.overall) {
          setRowMsg(host.hostname, "✓ verified: all SSH components working", "ok");
          verified++;
        } else if (result.userKeyAuth || result.rootKeyAuth) {
          // Partial success - some SSH access works
          const workingComponents = [];
          const missingComponents = [];
          
          if (result.userKeyAuth || result.rootKeyAuth) workingComponents.push("SSH keys");
          else missingComponents.push("SSH keys");
          
          if (result.sudoConfigured) workingComponents.push("sudo");
          else missingComponents.push("sudo");
          
          if (result.permitRootLogin && result.passwordAuthDisabled) workingComponents.push("root access");
          else missingComponents.push("root access");
          
          if (result.registryAliases) workingComponents.push("registry");
          else missingComponents.push("registry");
          
          const statusMsg = missingComponents.length > 0 ? 
            `⚠️ partial: missing ${missingComponents.slice(0,2).join(', ')}` :
            "✓ verified: all components working";
          
          setRowMsg(host.hostname, statusMsg, missingComponents.length > 0 ? "err" : "ok");
          if (missingComponents.length > 0) failed++; else verified++;
        } else {
          // No SSH access at all
          setRowMsg(host.hostname, "❌ no SSH access - setup required", "err");
          failed++;
        }
        
        renderTable();
        
      } catch (e) {
        console.error(`Verification failed for ${host.hostname}:`, e);
        setRowMsg(host.hostname, "verification error", "err");
        failed++;
        renderTable();
      }
    }
    
    setStatus(el.status, 
      failed === 0 && skipped === 0 ? `✓ Verification complete: ${verified} hosts fully verified` :
      skipped > 0 ? `Verification complete: ${verified} verified, ${failed} with issues, ${skipped} skipped (no SSH key)` :
      `Verification complete: ${verified} verified, ${failed} with issues`,
      failed === 0 && skipped === 0 ? "ok" : "err"
    );
    
    console.log(`[REFRESH] Verification complete: ${verified} verified, ${failed} failed, ${skipped} skipped`);
  }
  
  return { refresh: renderTable, refreshWithVerification };
}
