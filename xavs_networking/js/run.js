'use strict';
/* global cockpit, setStatus */

async function run(cmd, args = [], opts = {}) {
  try {
    console.log('Running command:', cmd, args);
    setStatus(`Running ${cmd}...`);

    if (typeof cockpit === 'undefined') {
      throw new Error('Cockpit API not available');
    }

    const proc = cockpit.spawn([cmd, ...args], {
      superuser: 'try',
      err: 'out',
      ...opts
    });

    let out = '';
    proc.stream(d => out += d);
    await proc;

    console.log(`Command ${cmd} completed, output length:`, out.length);
    return out.trim();

  } catch (e) {
    console.error(`Command failed: ${cmd}`, e);
    setStatus('');
    throw e.toString();
  }
}

async function netplanAction(action, config = {}) {
  console.log('netplanAction called with:', { action, config });
  
  setStatus(`Running ${action}...`);
  
  try {
    // Use the new JavaScript-based netplan manager
    if (typeof window.netplanJsAction === 'function') {
      console.log('Using JavaScript netplan manager...');
      const result = await window.netplanJsAction(action, config);
      console.log('JavaScript netplan manager result:', result);
      
      if (result.error) {
        console.error('JavaScript netplan manager error:', result.error);
        return { error: result.error };
      }
      
      setStatus('');
      return result;
    } else {
      console.warn('JavaScript netplan manager not available, falling back to Python script...');
      // Fallback to Python script approach
      return await netplanActionPython(action, config);
    }
  } catch (error) {
    console.error('netplanAction error:', error);
    setStatus('');
    return { error: error.message };
  }
}

async function netplanActionPython(action, config = {}) {
  const payload = JSON.stringify({ action, config });
  console.log('JSON payload to send:', payload);

  try {
    console.log('About to spawn netplan script...');

    const timestamp = Date.now();
    const tempFile = `/tmp/netplan-${timestamp}.json`;

    await cockpit.spawn([
      'bash', '-c', `echo '${payload.replace(/'/g, "'\\''")}' > ${tempFile}`
    ], {
      superuser: 'require',
      err: 'out'
    });

    // Try to find netplan_manager.py in both development and production locations
    const result = await cockpit.spawn([
      'bash', '-c', `
        # Find the directory containing netplan_manager.py
        if [ -f js/netplan_manager.py ]; then
          SCRIPT_DIR="js"
        elif [ -f netplan_manager.py ]; then
          SCRIPT_DIR="."
        elif [ -f /usr/share/cockpit/xavs_networking/netplan_manager.py ]; then
          cd /usr/share/cockpit/xavs_networking
          SCRIPT_DIR="."
        else
          echo "Error: netplan_manager.py not found in any expected location"
          exit 1
        fi
        
        cat ${tempFile} | python3 $SCRIPT_DIR/netplan_manager.py 2>&1
        rm -f ${tempFile}
      `
    ], {
      superuser: 'require',
      err: 'out'
    });

    console.log('Netplan script raw output:', result);
    const cleanResult = result.trim();
    console.log('Cleaned result:', cleanResult);

    const lines = cleanResult.split('\n');
    let jsonLine = null;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && (line.includes('result') || line.includes('success'))) {
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
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.includes('error')) {
          try {
            const parsed = JSON.parse(line);
            console.log('Netplan script error output:', parsed);
            return parsed;
          } catch (parseError) {
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

// expose
window.run = run;
window.netplanAction = netplanAction;
