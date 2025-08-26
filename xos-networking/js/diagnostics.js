/* XOS Networking - Diagnostics */
/* global XOSNetworking */

(() => {
  'use strict';

  const { $, setStatus, run } = XOSNetworking.core;

  // Load diagnostic information
  async function loadDiagnostics() {
    console.log('Loading diagnostics...');
    
    // Load routes
    try {
      const routes = await run('ip', ['route']);
      const routesEl = $('#routes-out');
      if (routesEl) routesEl.textContent = routes || '(no routes)';
    } catch (e) {
      const routesEl = $('#routes-out');
      if (routesEl) routesEl.textContent = 'Error loading routes: ' + e;
    }

    // Load DNS configuration
    try {
      const dns = await run('cat', ['/etc/resolv.conf']);
      const dnsEl = $('#dns-out');
      if (dnsEl) dnsEl.textContent = dns || '(no DNS configuration)';
    } catch (e) {
      const dnsEl = $('#dns-out');
      if (dnsEl) dnsEl.textContent = 'Error loading DNS config: ' + e;
    }
  }

  // Setup diagnostic event handlers
  function setupDiagnosticHandlers() {
    console.log('Setting up diagnostic handlers...');
    
    // Setup ping functionality
    const btnPing = $('#btn-ping');
    if (btnPing) {
      btnPing.addEventListener('click', async () => {
        await runPing();
      });
    }
    
    // Setup traceroute functionality  
    const btnTraceroute = $('#btn-traceroute');
    if (btnTraceroute) {
      btnTraceroute.addEventListener('click', async () => {
        await runTraceroute();
      });
    }
  }

  // Run ping command
  async function runPing() {
    const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
    const output = $('#ping-out');
    
    try {
      setStatus(`Pinging ${host}...`);
      if (output) output.textContent = 'Pinging...';
      
      const result = await run('ping', ['-c', '4', host], { superuser: 'try' });
      if (output) output.textContent = result;
      setStatus('Ping completed');
    } catch (e) {
      if (output) output.textContent = `Ping failed: ${e}`;
      setStatus('Ping failed');
    }
  }

  // Run traceroute command
  async function runTraceroute() {
    const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
    const output = $('#ping-out'); // Reuse ping output area
    
    try {
      setStatus(`Tracing route to ${host}...`);
      if (output) output.textContent = 'Tracing route...';
      
      // Try traceroute first, then fallback to tracepath
      let result;
      try {
        result = await run('traceroute', ['-n', '-m', '15', host], { superuser: 'try' });
      } catch (e) {
        result = await run('tracepath', [host], { superuser: 'try' });
      }
      
      if (output) output.textContent = result;
      setStatus('Traceroute completed');
    } catch (e) {
      if (output) output.textContent = `Traceroute failed: ${e}`;
      setStatus('Traceroute failed');
    }
  }

  // Run network speed test (basic)
  async function runSpeedTest() {
    try {
      setStatus('Running speed test...');
      
      // Basic bandwidth test using dd and time
      const result = await run('bash', ['-c', 'timeout 10 dd if=/dev/zero bs=1M count=100 2>&1 | tail -1'], { superuser: 'try' });
      
      return { result, success: true };
    } catch (e) {
      return { error: `Speed test failed: ${e}`, success: false };
    } finally {
      setStatus('Ready');
    }
  }

  // Get network statistics
  async function getNetworkStats() {
    try {
      setStatus('Gathering network statistics...');
      
      const stats = {
        interfaces: await run('cat', ['/proc/net/dev']),
        connections: await run('ss', ['-tuln']),
        protocols: await run('cat', ['/proc/net/protocols'])
      };
      
      return { stats, success: true };
    } catch (e) {
      return { error: `Failed to gather network stats: ${e}`, success: false };
    } finally {
      setStatus('Ready');
    }
  }

  // Check connectivity to common services
  async function checkConnectivity() {
    const hosts = [
      { name: 'Google DNS', host: '8.8.8.8' },
      { name: 'Cloudflare DNS', host: '1.1.1.1' },
      { name: 'Google', host: 'google.com' },
      { name: 'Ubuntu', host: 'ubuntu.com' }
    ];
    
    const results = [];
    
    for (const service of hosts) {
      try {
        setStatus(`Testing connectivity to ${service.name}...`);
        await run('ping', ['-c', '1', '-W', '3', service.host], { superuser: 'try' });
        results.push({ ...service, status: 'Success', reachable: true });
      } catch (e) {
        results.push({ ...service, status: 'Failed', reachable: false, error: e.toString() });
      }
    }
    
    setStatus('Ready');
    return results;
  }

  // Export diagnostics functions
  window.XOSNetworking.diagnostics = {
    loadDiagnostics,
    setupDiagnosticHandlers,
    runPing,
    runTraceroute,
    runSpeedTest,
    getNetworkStats,
    checkConnectivity
  };

})();