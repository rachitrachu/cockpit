/* XOS Networking - Netplan Management */
/* global XOSNetworking, cockpit */

(() => {
  'use strict';

  const { run, setStatus } = XOSNetworking.core;

  // Enhanced netplan action function
  async function netplanAction(action, config) {
    console.log('netplanAction called with:', { action, config });
    const payload = JSON.stringify({ action, config });
    console.log('JSON payload to send:', payload);
    
    try {
      console.log('About to spawn netplan script...');
      
      // Use a more direct approach - create a temporary file and execute it
      const timestamp = Date.now();
      const tempFile = `/tmp/netplan-${timestamp}.json`;
      
      // Write payload to temp file first
      await cockpit.spawn([
        'bash', '-c', `echo '${payload.replace(/'/g, "'\\''")}' > ${tempFile}`
      ], {
        superuser: 'require',
        err: 'out'
      });
      
      // Execute the python script with the temp file
      const result = await cockpit.spawn([
        'bash', '-c', `cd /usr/share/cockpit/xos-networking && cat ${tempFile} | python3 netplan_manager.py 2>&1; rm -f ${tempFile}`
      ], {
        superuser: 'require',
        err: 'out'
      });
      
      console.log('Netplan script raw output:', result);
      const cleanResult = result.trim();
      console.log('Cleaned result:', cleanResult);
      
      // Look for JSON response - it should be the last line starting with {
      const lines = cleanResult.split('\n');
      let jsonLine = null;
      
      // Find the last line that looks like JSON
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.includes('result')) {
          jsonLine = line;
          break;
        }
      }
      
      if (jsonLine) {
        try {
          const parsed = JSON.parse(jsonLine);
          console.log('Netplan script parsed output:', parsed);
          return parsed;
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          return { error: `Failed to parse response: ${jsonLine}` };
        }
      } else {
        // Look for error JSON
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.includes('error')) {
            try {
              const parsed = JSON.parse(line);
              console.log('Netplan script error output:', parsed);
              return parsed;
            } catch (parseError) {
              // Continue looking
            }
          }
        }
        return { error: 'No valid JSON response found in output', debug_output: cleanResult };
      }
    } catch (e) {
      console.error('netplanAction exception:', e);
      let errorMsg = 'Script execution failed';
      if (e.exit_status !== undefined) {
        errorMsg = `Script exited with code ${e.exit_status}`;
      }
      if (e.message && e.message.trim()) {
        errorMsg += `: ${e.message}`;
      }
      console.error('Processed error message:', errorMsg);
      return { error: errorMsg, debug_info: e.toString() };
    }
  }

  // Apply netplan configuration
  async function applyNetplan() {
    try {
      setStatus('Applying Netplan configuration...');
      await run('netplan', ['apply'], { superuser: 'require' });
      console.log('Netplan applied successfully');
      
      // Refresh interfaces and forms after applying netplan
      if (window.XOSNetworking.networkInterface?.loadInterfaces) {
        await window.XOSNetworking.networkInterface.loadInterfaces();
      }
      if (window.XOSNetworking.forms?.setupNetworkingForms) {
        await window.XOSNetworking.forms.setupNetworkingForms();
      }
      
      setStatus('? Netplan configuration applied');
      setTimeout(() => setStatus('Ready'), 3000);
      
      return { success: true };
    } catch (e) {
      const error = `Failed to apply Netplan configuration: ${e}`;
      console.error(error);
      setStatus('? Netplan apply failed');
      setTimeout(() => setStatus('Ready'), 3000);
      return { error };
    }
  }

  // Show netplan configuration
  async function showNetplanConfig() {
    try {
      setStatus('Loading netplan configuration...');
      
      // Try to get the XOS Networking specific config first
      let config = '';
      let filename = '99-cockpit.yaml';
      
      try {
        config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
      } catch (e) {
        console.warn('99-cockpit.yaml not found, trying other netplan files');
        
        // If XOS config doesn't exist, show all netplan files
        try {
          const allConfigs = await run('bash', ['-c', 'for f in /etc/netplan/*.yaml; do echo "=== $f ==="; cat "$f" 2>/dev/null; echo ""; done'], { superuser: 'try' });
          config = allConfigs;
          filename = 'All Netplan Files';
        } catch (e2) {
          config = 'No netplan configuration files found.\n\nNetplan files are typically located in /etc/netplan/ and end with .yaml';
          filename = 'No Configuration Found';
        }
      }
      
      return { config, filename };
    } catch (error) {
      console.error('Show config failed:', error);
      return { error: `Failed to show netplan configuration: ${error.message || error}` };
    } finally {
      setStatus('Ready');
    }
  }

  // Test netplan configuration
  async function testNetplan() {
    try {
      setStatus('Testing netplan write...');
      
      // Test netplan action with a simple configuration
      const testConfig = {
        name: 'eth0',
        static_ip: '192.168.1.100/24',
        gateway: '192.168.1.1',
        dns: '8.8.8.8,1.1.1.1'
      };
      
      console.log('Testing netplan action with config:', testConfig);
      const result = await netplanAction('set_ip', testConfig);
      
      console.log('Netplan test result:', result);
      
      if (result.error) {
        return { error: `Netplan test failed: ${result.error}` };
      } else {
        // Show current netplan content
        try {
          const netplanContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
          console.log('Current netplan content:', netplanContent);
          return { success: true, config: netplanContent };
        } catch (e) {
          console.warn('Could not read netplan file:', e);
          return { success: true, warning: 'Test successful but could not read config file' };
        }
      }
    } catch (error) {
      console.error('Netplan test error:', error);
      return { error: `Netplan test failed: ${error}` };
    } finally {
      setStatus('Ready');
    }
  }

  // Check netplan file status
  async function checkNetplanFile() {
    try {
      setStatus('Checking netplan file...');
      
      // Check if file exists and show its contents
      let fileExists = true;
      let fileContent = '';
      
      try {
        fileContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
      } catch (e) {
        fileExists = false;
        console.log('Netplan file does not exist:', e);
      }
      
      // Also check directory permissions
      let dirInfo = '';
      try {
        dirInfo = await run('ls', ['-la', '/etc/netplan/'], { superuser: 'try' });
        console.log('Netplan directory contents:', dirInfo);
      } catch (e) {
        console.warn('Could not list netplan directory:', e);
      }
      
      return { fileExists, fileContent, dirInfo };
    } catch (error) {
      return { error: `Failed to check netplan file: ${error}` };
    } finally {
      setStatus('Ready');
    }
  }

  // Backup netplan configuration
  async function backupNetplan() {
    try {
      setStatus('Creating netplan backup...');
      
      // Create backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = `/etc/netplan/backups`;
      const backupFile = `${backupDir}/netplan-backup-${timestamp}.tar.gz`;
      
      // Create backup directory if it doesn't exist
      try {
        await run('mkdir', ['-p', backupDir], { superuser: 'require' });
      } catch (e) {
        console.warn('Backup directory might already exist:', e);
      }
      
      // Create backup archive of entire netplan directory
      await run('tar', ['-czf', backupFile, '-C', '/etc', 'netplan/'], { superuser: 'require' });
      
      // Verify backup was created and get file info
      const backupInfo = await run('ls', ['-lh', backupFile], { superuser: 'try' });
      
      // List recent backups
      let backupList = '';
      try {
        backupList = await run('bash', ['-c', `ls -lht ${backupDir}/*.tar.gz 2>/dev/null | head -10 || echo "This is the first backup."`], { superuser: 'try' });
      } catch (e) {
        backupList = 'This is the first backup.';
      }
      
      return { backupFile, backupInfo, backupList };
    } catch (error) {
      console.error('Backup failed:', error);
      return { error: `Failed to create netplan backup: ${error.message || error}` };
    } finally {
      setStatus('Ready');
    }
  }

  // Export netplan functions
  window.XOSNetworking.netplan = {
    netplanAction,
    applyNetplan,
    showNetplanConfig,
    testNetplan,
    checkNetplanFile,
    backupNetplan
  };

})();