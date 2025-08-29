document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // ---- Tabs ----
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('show'));
      link.classList.add('active');
      const pane = document.getElementById(link.dataset.tab);
      pane.classList.add('show');

      // lazy actions on tab open
      if (link.dataset.tab === 'tab-registry') checkStatus();
      if (link.dataset.tab === 'tab-catalog') refreshCatalog();
    });
  });

  // ---- Toggle (Extract / Pull) ----
  const segs = [ $('toggle-extract'), $('toggle-pull') ];
  segs.forEach(btn => {
    btn.addEventListener('click', () => {
      segs.forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const extractMode = btn.id === 'toggle-extract';
      $('extract-block').style.display = extractMode ? 'block' : 'none';
      $('pull-block').style.display = extractMode ? 'none' : 'block';
      log('Ready.');
    });
  });

  // ---- Helpers ----
  const log = (msg) => { $('log-output').textContent = msg; };

  const api = async (endpoint, payload = null) => {
    const res = await fetch(`cockpit/xavs_images/${endpoint}`, {
      method: 'POST',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const t = await res.text();
      throw new Error(t);
    }
    return res.json();
  };

  // ---- Actions ----
  $('extract-btn').addEventListener('click', async () => {
    const path = $('file-path').value.trim();
    if (!path || !path.endsWith('.tar.gz')) return log('Please enter a valid .tar.gz path.');
    log('Extracting and loading images…');
    try {
      const data = await api('extract', { path });
      log(data.log || 'Done.');
      $('push-btn').disabled = false;
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('pull-btn').addEventListener('click', async () => {
    log('Pulling images from Xloud…');
    try {
      const data = await api('pull');
      log(data.log || 'Done.');
      $('push-btn').disabled = false;
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('run-registry-btn').addEventListener('click', async () => {
    log('Starting docker-registry (host network, port 4000)…');
    try {
      const data = await api('run_registry');
      log(data.log);
      $('restart-docker-btn').disabled = false;
      await checkStatus();
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('restart-docker-btn').addEventListener('click', async () => {
    log('Restarting Docker…');
    try {
      const data = await api('restart_docker');
      log(data.log || 'Docker restarted.');
      await checkStatus();
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('check-status-btn').addEventListener('click', checkStatus);

  $('push-btn').addEventListener('click', async () => {
    log('Tagging & pushing images to docker-registry:4000…');
    try {
      const data = await api('push');
      log(data.log);
      await refreshCatalog();
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('refresh-catalog-btn').addEventListener('click', refreshCatalog);

  // ---- Status & Catalog helpers ----
  async function checkStatus() {
    try {
      const d = await api('status');
      $('registry-status').textContent = d.running ? 'Running' : 'Not running';
      $('registry-dot').classList.toggle('ok', !!d.running);
      $('registry-dot').classList.toggle('bad', !d.running);
    } catch (e) {
      $('registry-status').textContent = 'Unknown';
      $('registry-dot').classList.remove('ok','bad');
      log(`Status error: ${e.message}`);
    }
  }

  async function refreshCatalog() {
    try {
      const d = await api('catalog');
      const ul = $('catalog');
      ul.innerHTML = '';
      (d.catalog || []).forEach(repo => {
        const li = document.createElement('li');
        li.textContent = repo;
        ul.appendChild(li);
      });
    } catch (e) {
      log(`Catalog error: ${e.message}`);
    }
  }

  // initial checks on load
  checkStatus();
});
