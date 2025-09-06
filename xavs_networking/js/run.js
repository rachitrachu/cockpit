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
    // Use the JavaScript-based netplan manager exclusively
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
      console.error('JavaScript netplan manager not available!');
      setStatus('');
      return { error: 'JavaScript netplan manager not available. Please ensure netplan-js-manager.js is loaded.' };
    }
  } catch (error) {
    console.error('netplanAction error:', error);
    setStatus('');
    return { error: error.message };
  }
}

// expose
window.run = run;
window.netplanAction = netplanAction;
