# Commands to run after copying files with WinSCP
# SSH to root@192.168.0.25 and run these commands

# 1. Set proper permissions for XAVS modules
chmod -R 644 /usr/share/cockpit/xavs-common/
chmod -R 644 /usr/share/cockpit/xavs-main/
chmod -R 644 /usr/share/cockpit/xavs-welcome/

# Make JavaScript files executable
find /usr/share/cockpit/xavs-* -name "*.js" -exec chmod 755 {} \;

# 2. Create XAVS system directories
mkdir -p /etc/xavs
mkdir -p /var/log/xavs
mkdir -p /etc/xavs/inventory
mkdir -p /etc/xavs/backups

# 3. Create audit log file
touch /var/log/xavs/audit.log
chmod 644 /var/log/xavs/audit.log

# 4. Set directory permissions
chmod 755 /etc/xavs /var/log/xavs /etc/xavs/inventory /etc/xavs/backups

# 5. Restart Cockpit to load new modules
systemctl restart cockpit

# 6. Check if modules are loaded
systemctl status cockpit

# 7. Verify XAVS directories
ls -la /usr/share/cockpit/xavs-*
ls -la /etc/xavs/
ls -la /var/log/xavs/

echo "✅ XAVS Platform deployment completed!"
echo "🌐 Access at: https://192.168.0.25:9090"