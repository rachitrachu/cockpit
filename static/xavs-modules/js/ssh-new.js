// Enhanced SSH Key Management System for XAVS Hosts
// Implements the specification requirements for SSH key generation, distribution, and management

import { SSH_KEY_PATH, SSH_PUB_PATH } from "./constants.js";

// ===== Console Logging =====
export function logCommand(command, output = "", isError = false) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = {
    timestamp,
    command: `$ ${command}`,
    output: output.trim(),
    isError
  };
  
  // Dispatch custom event for UI to handle
  window.dispatchEvent(new CustomEvent('ssh-command-log', { detail: logEntry }));
  return logEntry;
}

// ===== Tool Detection =====
export async function checkRequiredTools() {
  const tools = ['ssh-keygen', 'ssh-copy-id', 'sshpass', 'ssh'];
  const missing = [];
  
  for (const tool of tools) {
    try {
      const cmd = `which ${tool}`;
      await cockpit.spawn(["bash", "-c", cmd], { superuser: "try" });
      logCommand(cmd, `${tool} found`);
    } catch (error) {
      missing.push(tool);
      logCommand(`which ${tool}`, `${tool} not found`, true);
    }
  }
  
  return { available: tools.filter(t => !missing.includes(t)), missing };
}

// ===== SSH Key Management =====
export async function generateSSHKey() {
  try {
    // Check if key already exists
    const checkCmd = `test -f ${SSH_KEY_PATH} && test -f ${SSH_PUB_PATH}`;
    try {
      await cockpit.spawn(["bash", "-c", checkCmd], { superuser: "try" });
      logCommand(checkCmd, "SSH key pair already exists");
      return await getKeyFingerprint();
    } catch {
      // Key doesn't exist, generate new one
    }
    
    const genCmd = `ssh-keygen -t ed25519 -f ${SSH_KEY_PATH} -N '' -C 'xavs-generated'`;
    const output = await cockpit.spawn(["bash", "-c", genCmd], { superuser: "try" });
    logCommand(genCmd, output);
    
    // Set proper permissions
    const chmodCmd = `chmod 600 ${SSH_KEY_PATH} && chmod 644 ${SSH_PUB_PATH}`;
    await cockpit.spawn(["bash", "-c", chmodCmd], { superuser: "try" });
    logCommand(chmodCmd, "Permissions set");
    
    return await getKeyFingerprint();
  } catch (error) {
    logCommand("ssh-keygen", error.message, true);
    throw error;
  }
}

export async function getKeyFingerprint() {
  try {
    const cmd = `ssh-keygen -lf ${SSH_PUB_PATH}`;
    const output = await cockpit.spawn(["bash", "-c", cmd], { superuser: "try" });
    logCommand(cmd, output);
    return output.trim();
  } catch (error) {
    logCommand("ssh-keygen -lf", error.message, true);
    return null;
  }
}

export async function getPublicKey() {
  try {
    const cmd = `cat ${SSH_PUB_PATH}`;
    const output = await cockpit.spawn(["bash", "-c", cmd], { superuser: "try" });
    return output.trim();
  } catch (error) {
    logCommand("cat public key", error.message, true);
    return null;
  }
}

// ===== SSH Configuration Management =====
export async function ensureSSHConfig() {
  const sshConfigPath = "/root/.ssh/config";
  const configContent = `
# XAVS SSH Configuration
Host *
    IdentityFile ${SSH_KEY_PATH}
    StrictHostKeyChecking accept-new
    UserKnownHostsFile /root/.ssh/known_hosts
    PasswordAuthentication no
`;

  try {
    // Ensure .ssh directory exists
    const mkdirCmd = "mkdir -p /root/.ssh && chmod 700 /root/.ssh";
    await cockpit.spawn(["bash", "-c", mkdirCmd], { superuser: "try" });
    logCommand(mkdirCmd, ".ssh directory ensured");
    
    // Check if our config is already present
    const checkCmd = `grep -q "# XAVS SSH Configuration" ${sshConfigPath} 2>/dev/null || echo "not found"`;
    const result = await cockpit.spawn(["bash", "-c", checkCmd], { superuser: "try" });
    
    if (result.includes("not found")) {
      // Append our configuration
      const appendCmd = `echo '${configContent}' >> ${sshConfigPath}`;
      await cockpit.spawn(["bash", "-c", appendCmd], { superuser: "try" });
      logCommand("append ssh config", "XAVS SSH configuration added");
    } else {
      logCommand("check ssh config", "XAVS SSH configuration already present");
    }
    
    // Set proper permissions
    const chmodCmd = `chmod 600 ${sshConfigPath}`;
    await cockpit.spawn(["bash", "-c", chmodCmd], { superuser: "try" });
    
  } catch (error) {
    logCommand("ensure ssh config", error.message, true);
    throw error;
  }
}

// ===== Host Connectivity Testing =====
export async function pingHost(ip) {
  try {
    const cmd = `ping -c1 -W1 ${ip}`;
    const output = await cockpit.spawn(["bash", "-c", cmd], { superuser: "try" });
    logCommand(cmd, "Ping successful");
    return { success: true, output };
  } catch (error) {
    logCommand(`ping ${ip}`, error.message, true);
    return { success: false, error: error.message };
  }
}

export async function testSSHConnection(ip, user = "root") {
  try {
    const cmd = `ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new ${user}@${ip} "echo OK"`;
    const output = await cockpit.spawn(["bash", "-c", cmd], { superuser: "try" });
    logCommand(cmd, "SSH connection successful");
    return { success: true, output };
  } catch (error) {
    logCommand(`ssh test ${user}@${ip}`, error.message, true);
    return { success: false, error: error.message };
  }
}

// ===== SSH Key Distribution =====
export async function distributeKeyWithPassword(ip, user = "root", password) {
  try {
    // First try ssh-copy-id with sshpass
    const copyIdCmd = `sshpass -p '${password}' ssh-copy-id -i ${SSH_PUB_PATH} -o StrictHostKeyChecking=accept-new ${user}@${ip}`;
    const output = await cockpit.spawn(["bash", "-c", copyIdCmd], { superuser: "try" });
    logCommand("ssh-copy-id (password)", "Key distribution successful");
    return { success: true, method: "ssh-copy-id", output };
  } catch (error) {
    // Fallback: manual append method
    try {
      const pubKey = await getPublicKey();
      if (!pubKey) throw new Error("No public key available");
      
      const manualCmd = `sshpass -p '${password}' ssh -o StrictHostKeyChecking=accept-new ${user}@${ip} "mkdir -p ~/.ssh && echo '${pubKey}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"`;
      const output = await cockpit.spawn(["bash", "-c", manualCmd], { superuser: "try" });
      logCommand("manual key append", "Key distribution successful (fallback method)");
      return { success: true, method: "manual", output };
    } catch (fallbackError) {
      logCommand(`distribute key to ${user}@${ip}`, fallbackError.message, true);
      return { success: false, error: fallbackError.message };
    }
  }
}

export async function distributeKeyWithKey(ip, user = "root") {
  try {
    const cmd = `ssh-copy-id -i ${SSH_PUB_PATH} ${user}@${ip}`;
    const output = await cockpit.spawn(["bash", "-c", cmd], { superuser: "try" });
    logCommand(cmd, "Key distribution successful");
    return { success: true, method: "ssh-copy-id", output };
  } catch (error) {
    logCommand(`ssh-copy-id ${user}@${ip}`, error.message, true);
    return { success: false, error: error.message };
  }
}

// ===== Remote SSH Configuration =====
export async function disablePasswordAuth(ip, user = "root") {
  try {
    const cmd = `ssh ${user}@${ip} "sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd"`;
    const output = await cockpit.spawn(["bash", "-c", cmd], { superuser: "try" });
    logCommand("disable password auth", "Password authentication disabled");
    return { success: true, output };
  } catch (error) {
    logCommand(`disable password auth ${user}@${ip}`, error.message, true);
    return { success: false, error: error.message };
  }
}

// ===== Host Status Management =====
export class HostStatusManager {
  constructor() {
    this.statuses = new Map();
  }
  
  setStatus(hostname, type, status, details = "") {
    if (!this.statuses.has(hostname)) {
      this.statuses.set(hostname, {});
    }
    this.statuses.get(hostname)[type] = { status, details, timestamp: Date.now() };
  }
  
  getStatus(hostname, type) {
    return this.statuses.get(hostname)?.[type] || { status: "unknown", details: "", timestamp: 0 };
  }
  
  getAllStatuses(hostname) {
    return this.statuses.get(hostname) || {};
  }
  
  async checkHostStatus(host) {
    const { hostname, ip } = host;
    
    // Ping test
    this.setStatus(hostname, "ping", "checking");
    const pingResult = await pingHost(ip);
    this.setStatus(hostname, "ping", pingResult.success ? "ok" : "error", 
                  pingResult.success ? "Reachable" : pingResult.error);
    
    if (!pingResult.success) return;
    
    // SSH test
    this.setStatus(hostname, "ssh", "checking");
    const sshResult = await testSSHConnection(ip);
    this.setStatus(hostname, "ssh", sshResult.success ? "ok" : "error",
                  sshResult.success ? "Connected" : sshResult.error);
  }
}

export const hostStatusManager = new HostStatusManager();