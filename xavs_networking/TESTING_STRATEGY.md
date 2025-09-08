# Windows ↔ Linux VLAN Testing & Debugging Strategy

## 🎯 **Best Practices for Windows Development → Linux Testing**

### **Method 1: SSH-Based Testing (RECOMMENDED)**

**Advantages:**
- ✅ Real-time system state monitoring
- ✅ Direct access to `ifconfig`, `ip`, and netplan commands
- ✅ Can catch system-level issues browser console misses
- ✅ Backup/restore capabilities
- ✅ Script automation

**Setup:**
```powershell
# From Windows PowerShell
.\vlan-test.ps1 -ServerIP 192.168.1.100 -Command deploy
.\vlan-test.ps1 -ServerIP 192.168.1.100 -Command test-edit
```

**SSH Commands for Manual Testing:**
```bash
# Check current VLAN state
ssh user@server "./ssh-vlan-test.sh check"

# Monitor changes in real-time
ssh user@server "./ssh-vlan-test.sh monitor"

# Backup before testing
ssh user@server "./ssh-vlan-test.sh backup"
```

### **Method 2: Browser Console + SSH Hybrid (COMPREHENSIVE)**

**Best for:** Correlating browser events with system changes

1. **Load hybrid debug script** in browser console:
```javascript
// Load the test suite
// (vlan-test-hybrid.js is loaded automatically)

// Enable debug mode
startVlanDebug();

// Test specific VLAN
testVlan("vlan10", "192.168.10.50");
```

2. **Simultaneously run SSH monitoring**:
```bash
ssh user@server "./ssh-vlan-test.sh monitor"
```

### **Method 3: PowerShell Automation (EFFICIENT)**

**Best for:** Rapid testing cycles during development

```powershell
# Deploy latest changes
.\vlan-test.ps1 -ServerIP 192.168.1.100 -Command deploy

# Run automated test
.\vlan-test.ps1 -ServerIP 192.168.1.100 -Command test-edit

# Check system state
.\vlan-test.ps1 -ServerIP 192.168.1.100 -Command check
```

## 🔍 **Debugging Workflow**

### **Step 1: Pre-Test Setup**
```bash
# SSH to server
ssh user@linux-server

# Create backup
./ssh-vlan-test.sh backup

# Check initial state
./ssh-vlan-test.sh check
```

### **Step 2: Browser Console Setup**
```javascript
// In cockpit browser console
startVlanDebug();
VlanTestSuite.generateSSHCommands();
```

### **Step 3: Perform VLAN Edit**
1. Edit VLAN IP in cockpit interface
2. Watch browser console for debug output
3. Check SSH terminal for real-time system changes

### **Step 4: Post-Edit Validation**
```bash
# Check what actually happened on system
./ssh-vlan-test.sh check

# Compare with expectations
ip addr show | grep -E "inet.*192\.168"
```

### **Step 5: Restore if Needed**
```bash
# If something went wrong
./ssh-vlan-test.sh restore
```

## 🔧 **Key Debug Commands**

### **System-Level (SSH)**
```bash
# Show all VLANs
ip link show | grep -E "\."

# Show VLAN IPs
ip addr show | grep -A2 "inet.*\."

# Check netplan files
find /etc/netplan -name "*.yaml" -exec cat {} \;

# Monitor netplan changes
watch -n 1 'find /etc/netplan -name "*.yaml" -exec stat {} \;'

# Check system logs
journalctl -f | grep -i vlan
```

### **Browser Console**
```javascript
// Check current config from browser perspective
loadNetplanConfig().then(config => console.log(config.network?.vlans));

// Monitor config changes
setInterval(() => {
    loadNetplanConfig().then(config => {
        const vlans = Object.keys(config.network?.vlans || {});
        console.log(`VLANs: ${vlans.length} - ${vlans.join(', ')}`);
    });
}, 5000);
```

## 🚨 **Common Issues & Solutions**

### **Issue: SSH Connection Problems**
```powershell
# Alternative using WSL
wsl ssh user@server "command"

# Or use PuTTY with saved sessions
# Or setup SSH key authentication
```

### **Issue: Permission Denied on Scripts**
```bash
chmod +x /tmp/ssh-vlan-test.sh
chmod +x /tmp/validate-vlan-fixes.sh
```

### **Issue: Browser Console Cleared**
```javascript
// Reload debug utilities
// Copy-paste vlan-test-hybrid.js content again
```

### **Issue: VLANs Not Showing in ifconfig**
```bash
# Use ip command instead (more reliable)
ip link show
ip addr show

# Check if netplan applied
netplan apply
systemctl status systemd-networkd
```

## 📊 **Testing Checklist**

**Before Each Test:**
- [ ] SSH connection working
- [ ] Backup created
- [ ] Initial VLAN count noted
- [ ] Browser debug mode enabled

**During VLAN Edit:**
- [ ] Browser console shows debug output
- [ ] SSH monitoring shows real-time changes
- [ ] No error messages in console

**After VLAN Edit:**
- [ ] Target VLAN has new IP
- [ ] All other VLANs preserved
- [ ] System `ip addr` matches expectation
- [ ] Netplan files are consistent

**Best Results:** Use SSH monitoring + browser console + PowerShell automation together for comprehensive coverage!
