document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // ---- Helpers ----
  const log = (msg) => { $('log-output').textContent = msg; };

  // Cockpit API helper for running commands with superuser privileges
  async function runCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      const process = cockpit.spawn(args, { 
        superuser: "require",
        err: "message",
        ...options
      });
      
      let stdout = "";
      let stderr = "";
      
      process.stream((data) => {
        stdout += data;
        // Show real-time output for docker pull commands
        if (args[0] === 'docker' && args[1] === 'pull') {
          // Extract meaningful progress info from docker output
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.trim() && (line.includes('Pulling') || line.includes('Download') || line.includes('Pull complete') || line.includes('Status'))) {
              log(line.trim() + '\n');
            }
          }
        }
      });
      
      process.then(() => {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }).catch((error) => {
        reject(new Error(`Command failed: ${error.message}`));
      });
    });
  }

  // Cockpit file API helper
  async function readFile(path) {
    try {
      const file = cockpit.file(path);
      const content = await file.read();
      
      // Cockpit file.read() can return null for non-existent files
      if (content === null || content === undefined) {
        throw new Error(`File does not exist or is empty: ${path}`);
      }
      
      return content;
    } catch (error) {
      throw new Error(`Cannot read ${path}: ${error.message}`);
    }
  }

  async function writeFile(path, content) {
    try {
      const file = cockpit.file(path);
      await file.replace(content);
    } catch (error) {
      throw new Error(`Cannot write ${path}: ${error.message}`);
    }
  }

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
      if (link.dataset.tab === 'tab-overview') refreshOverview();
      if (link.dataset.tab === 'tab-registry') {
        checkStatus();
        checkDockerConfig();
      }
      if (link.dataset.tab === 'tab-catalog') refreshCatalog();
      if (link.dataset.tab === 'tab-config') checkDockerConfig();
    });
  });

  // ---- Toggle (Extract / Pull) ----
  const segs = [ $('toggle-extract'), $('toggle-pull') ];
  segs.forEach(btn => {
    btn.addEventListener('click', () => {
      segs.forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const extractMode = btn.id === 'toggle-extract';
      
      // Use CSS classes instead of inline styles
      if (extractMode) {
        $('extract-block').classList.remove('pull-block-hidden');
        $('pull-block').classList.add('pull-block-hidden');
      } else {
        $('extract-block').classList.add('pull-block-hidden');
        $('pull-block').classList.remove('pull-block-hidden');
      }
      log('Ready.');
    });
  });

  // ---- Constants ----
  const IMAGE_LIST_PATH = '/etc/xavs/images.list';
  const MODULE_IMAGES_LIST = '/usr/share/cockpit/xavs-images/images-list.txt';
  const DOCKER_DAEMON_JSON = '/etc/docker/daemon.json';
  const PUBLIC_REG = 'quay.io';
  const LOCAL_REG_HOST = 'docker-registry:4000';
  const REGISTRY_CONTAINER_NAME = 'docker-registry';

  // Global variable to track current pull process
  let currentPullProcess = null;
  let isPulling = false;

  // Function to load images from module file
  async function loadModuleImagesList() {
    // Try multiple paths: installed path first, then relative path for development
    const paths = [
      '/usr/share/cockpit/xavs-images/images-list.txt',  // Production path
      './images-list.txt',                                // Development relative path
      'images-list.txt'                                   // Fallback
    ];
    
    for (const path of paths) {
      try {
        console.log(`Trying to read images list from: ${path}`);
        const content = await readFile(path);
        if (content && content.trim()) {
          console.log(`Successfully loaded ${content.trim().split('\n').length} lines from ${path}`);
          return content.trim().split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        }
      } catch (error) {
        console.log(`Failed to read images list from ${path}:`, error.message);
        continue; // Try next path
      }
    }
    
    console.warn('Failed to load module images list from any path, using fallback');
    // Fallback comprehensive list
    return [
      'keystone',
      'keystone-fernet',
      'nova-api',
      'nova-conductor',
      'nova-scheduler',
      'nova-compute',
      'neutron-server',
      'neutron-dhcp-agent',
      'neutron-l3-agent',
      'cinder-api',
      'cinder-scheduler',
      'cinder-volume',
      'glance-api',
      'horizon',
      'mariadb-server',
      'memcached',
      'rabbitmq',
      'heat-api',
      'heat-engine',
      'placement-api'
    ];
  }

  // Generate default images list content
  async function generateDefaultImagesList() {
    const images = await loadModuleImagesList();
    console.log(`loadModuleImagesList returned ${images.length} images:`, images.slice(0, 5));
    
    // Add the correct tag format if not already present
    const imagesWithTags = images.map(image => {
      if (image.includes(':')) {
        return image; // Already has a tag
      } else {
        return `${image}:2024.1-ubuntu-jammy`; // Add the correct tag
      }
    });
    
    const content = `# xAVS Container Images List
# One image per line - these will be pulled from quay.io/xavs.images/
${imagesWithTags.join('\n')}`;
    console.log(`Generated content length: ${content.length}`);
    return content;
  }

  const DOCKER_CONFIG_TEMPLATE = {
    "bridge": "none",
    "insecure-registries": [LOCAL_REG_HOST],
    "ip-forward": false,
    "iptables": false,
    "log-opts": {
      "max-file": "5",
      "max-size": "50m"
    }
  };
  // ---- Actions ----
  $('extract-btn').addEventListener('click', async () => {
    const path = $('file-path').value.trim();
    if (!path || !path.endsWith('.tar.gz')) {
      return log('Please enter a valid .tar.gz path.');
    }
    
    log('Extracting and loading images…');
    try {
      // Create xdeploy directory
      await runCommand(['mkdir', '-p', '/root/xdeploy/xdeploy-images']);
      log('Created directory: /root/xdeploy/xdeploy-images\n');
      
      // Extract tar.gz
      await runCommand(['tar', '-xzf', path, '-C', '/root/xdeploy/xdeploy-images']);
      log(`Extracted archive: ${path}\n`);
      
      // Find and load all .tar files
      const { stdout: files } = await runCommand(['find', '/root/xdeploy/xdeploy-images', '-name', '*.tar']);
      const tarFiles = files && files.trim() ? files.split('\n').filter(f => f.trim()) : [];
      
      if (tarFiles.length === 0) {
        log('No .tar files found in the extracted archive\n');
      } else {
        for (const tarFile of tarFiles) {
          log(`Loading ${tarFile}…\n`);
          await runCommand(['docker', 'load', '-i', tarFile]);
          await runCommand(['rm', tarFile]);
          log(`Removed ${tarFile}\n`);
        }
      }
      
      log('Extract and load completed successfully!');
      $('push-btn').disabled = false;
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  // Test connectivity button
  $('test-connectivity-btn').addEventListener('click', async () => {
    log('🔍 Testing system connectivity and prerequisites...\n\n');
    
    // Test 1: Docker daemon
    log('1️⃣ Testing Docker daemon...\n');
    try {
      const result = await runCommand(['docker', 'version']);
      log('✅ Docker daemon is running\n');
      log(`Docker version info: ${result.stdout.split('\n')[0]}\n\n`);
    } catch (e) {
      log('❌ Docker daemon is not running or not accessible\n');
      log(`Error: ${e.message}\n`);
      log('💡 Solution: Start Docker Desktop or Docker service\n\n');
      return;
    }

    // Test 2: Network connectivity
    log('2️⃣ Testing network connectivity...\n');
    try {
      await runCommand(['ping', '-c', '1', 'quay.io'], { timeout: 10000 });
      log('✅ Can reach quay.io registry\n\n');
    } catch (e) {
      log('❌ Cannot reach quay.io registry\n');
      log('💡 Check your internet connection\n\n');
    }

    // Test 3: Try a small test pull
    log('3️⃣ Testing Docker registry access...\n');
    try {
      log('Attempting to pull a small test image...\n');
      await runCommand(['docker', 'pull', 'hello-world:latest']);
      log('✅ Docker pull functionality works\n');
      // Clean up test image
      try {
        await runCommand(['docker', 'rmi', 'hello-world:latest']);
        log('Cleaned up test image\n\n');
      } catch (e) {
        log('Test image cleanup skipped\n\n');
      }
    } catch (e) {
      log('❌ Docker pull test failed\n');
      log(`Error: ${e.message}\n`);
      log('💡 This may indicate registry access issues\n\n');
    }

    // Test 4: Check specific xAVS registry access
    log('4️⃣ Testing xAVS registry access...\n');
    try {
      // Try to get metadata for one of our images without pulling
      await runCommand(['docker', 'manifest', 'inspect', 'quay.io/xavs.images/keystone:2024.1-ubuntu-jammy']);
      log('✅ xAVS registry is accessible and image manifests are available\n\n');
    } catch (e) {
      log('⚠️ Could not access xAVS image manifests\n');
      log(`Error: ${e.message}\n`);
      if (e.message.includes('manifest unknown') || e.message.includes('not found')) {
        log('💡 The image may not exist in the registry\n');
        log('💡 Check: https://quay.io/repository/xavs.images/keystone\n');
      } else if (e.message.includes('unauthorized')) {
        log('💡 You may need to authenticate: docker login quay.io\n');
      }
      log('\n');
    }

    log('🎯 Connectivity test completed!\n');
    log('If all tests pass, the Pull Images operation should work.\n');
  });

  $('pull-btn').addEventListener('click', async () => {
    if (isPulling) {
      // Cancel current operation
      log('Stopping pull operation...\n');
      isPulling = false;
      $('pull-btn').textContent = 'Pull Images';
      $('pull-btn').className = 'btn btn-primary';
      log('Pull operation stopped. You may need to wait for the current image pull to complete.\n');
      return;
    }

    log('🔍 Checking prerequisites...\n');
    isPulling = true;
    $('pull-btn').textContent = 'Stop Pull';
    $('pull-btn').className = 'btn btn-danger';
    
    try {
      // Check if Docker is running
      log('Checking Docker daemon...\n');
      try {
        await runCommand(['docker', 'version']);
        log('✅ Docker daemon is running\n');
      } catch (e) {
        throw new Error('Docker daemon is not running. Please start Docker first.');
      }

      // Check registry connectivity
      log('Testing registry connectivity...\n');
      try {
        await runCommand(['docker', 'pull', '--help'], { timeout: 5000 });
        log('✅ Docker pull command is available\n');
      } catch (e) {
        log('⚠️ Docker pull command test failed, but continuing...\n');
      }

    log('📋 Reading images list...\n');
      // Read images list
      let imagesList;
      try {
        imagesList = await readFile(IMAGE_LIST_PATH);
        // Check if the file read returned null or empty content
        if (!imagesList || imagesList.trim() === '') {
          throw new Error('File is empty or returned null');
        }
      } catch (error) {
        // If file doesn't exist or is empty, create it with default content from module
        log(`Images list file not found or empty: ${error.message}\n`);
        await runCommand(['mkdir', '-p', '/etc/xavs']);
        const defaultContent = await generateDefaultImagesList();
        await writeFile(IMAGE_LIST_PATH, defaultContent);
        imagesList = defaultContent;
        log('Created default images list\n');
      }
      
      // Parse and pull images
      const images = imagesList && imagesList.trim() ? 
        imagesList.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')) : [];
      
      if (images.length === 0) {
        log('No images found in the images list. Check /etc/xavs/images.list file.\n');
        log(`imagesList content: "${imagesList}"\n`);
        return;
      }
      
      log(`Found ${images.length} images to pull\n\n`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < images.length; i++) {
        if (!isPulling) {
          log('\n🛑 Pull operation was stopped by user.\n');
          break;
        }
        
        const image = images[i];
        const ref = `${PUBLIC_REG}/xavs.images/${image}`;
        log(`📦 [${i + 1}/${images.length}] Pulling ${image}...\n`);
        log(`🔗 Full reference: ${ref}\n`);
        
        try {
          await runCommand(['docker', 'pull', ref]);
          successCount++;
          log(`✅ [${i + 1}/${images.length}] Successfully pulled ${image}\n\n`);
        } catch (error) {
          failCount++;
          log(`❌ [${i + 1}/${images.length}] Failed to pull ${image}\n`);
          log(`🔍 Error details: ${error.message}\n`);
          
          // Provide specific error diagnostics
          if (error.message.includes('manifest unknown') || error.message.includes('not found')) {
            log(`💡 This image may not exist in the registry. Check: https://quay.io/repository/xavs.images/${image.split(':')[0]}\n`);
          } else if (error.message.includes('connection') || error.message.includes('network')) {
            log(`💡 Network connectivity issue. Check internet connection and registry access.\n`);
          } else if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
            log(`💡 Authentication issue. You may need to login: docker login quay.io\n`);
          } else if (error.message.includes('timeout')) {
            log(`💡 Request timeout. The registry may be slow or overloaded.\n`);
          }
          log('\n');
          // Continue with next image instead of stopping
        }
      }
      
      if (isPulling) {
        log(`\n🎉 Pull operation completed!\n`);
        log(`✅ Success: ${successCount} images\n`);
        if (failCount > 0) {
          log(`❌ Failed: ${failCount} images\n`);
        }
        log(`📊 Total processed: ${successCount + failCount}/${images.length} images\n`);
        $('push-btn').disabled = false;
      }
      
    } catch (e) {
      log(`❌ Error: ${e.message}\n`);
    } finally {
      isPulling = false;
      currentPullProcess = null;
      $('pull-btn').textContent = 'Pull Images';
      $('pull-btn').className = 'btn btn-primary';
    }
  });

  $('run-registry-btn').addEventListener('click', async () => {
    log('Starting docker-registry (host network, port 4000)…');
    try {
      // Run registry container
      await runCommand([
        'docker', 'run', '-d', '--network', 'host', 
        '--name', REGISTRY_CONTAINER_NAME, '--restart=always',
        '-e', 'REGISTRY_HTTP_ADDR=0.0.0.0:4000',
        '-v', 'registry:/var/lib/registry',
        'registry:2'
      ]);
      
      // Apply Docker daemon configuration
      await runCommand(['mkdir', '-p', '/etc/docker']);
      await writeFile(DOCKER_DAEMON_JSON, JSON.stringify(DOCKER_CONFIG_TEMPLATE, null, 2));
      log('Applied Docker daemon configuration\n');
      
      log('Registry started successfully!');
      $('restart-docker-btn').disabled = false;
      await checkStatus();
    } catch (e) {
      // Container might already exist, that's okay
      if (e.message.includes('already in use')) {
        log('Registry container already exists');
        await checkStatus();
      } else {
        log(`Error: ${e.message}`);
      }
    }
  });

  $('restart-docker-btn').addEventListener('click', async () => {
    log('Restarting Docker…');
    try {
      await runCommand(['systemctl', 'restart', 'docker']);
      
      // Wait a moment for Docker to restart
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check Docker status
      const { stdout } = await runCommand(['systemctl', 'is-active', 'docker']);
      log(`Docker service status: ${stdout}\nDocker restarted successfully!`);
      
      await checkStatus();
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('check-status-btn').addEventListener('click', checkStatus);

  $('push-btn').addEventListener('click', async () => {
    log('Pushing images to local registry…');
    try {
      // Read images list
      const imagesList = await readFile(IMAGE_LIST_PATH);
      const images = imagesList && imagesList.trim() ? 
        imagesList.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')) : [];
      
      if (images.length === 0) {
        log('No images found in the images list\n');
        return;
      }
      
      for (const image of images) {
        const src = `${PUBLIC_REG}/xavs.images/${image}`;
        const dest = `${LOCAL_REG_HOST}/xavs.images/${image}`;
        
        log(`Tagging ${src} -> ${dest}…\n`);
        await runCommand(['docker', 'tag', src, dest]);
        
        log(`Pushing ${dest}…\n`);
        await runCommand(['docker', 'push', dest]);
        
        // Remove source image to save space
        try {
          await runCommand(['docker', 'rmi', src]);
        } catch {
          // Ignore errors when removing source image
        }
      }
      
      log(`Successfully pushed ${images.length} images to local registry!`);
      await refreshCatalog();
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('refresh-catalog-btn').addEventListener('click', refreshCatalog);

  // ---- Docker Configuration Actions ----
  $('apply-docker-config-btn').addEventListener('click', async () => {
    log('Applying Docker daemon configuration…');
    try {
      // Ensure directory exists
      await runCommand(['mkdir', '-p', '/etc/docker']);
      
      // Read existing config if it exists
      let existingConfig = {};
      try {
        const existing = await readFile(DOCKER_DAEMON_JSON);
        existingConfig = JSON.parse(existing);
        log('Read existing Docker configuration\n');
      } catch {
        log('Creating new Docker configuration\n');
      }
      
      // Merge with our required settings
      const newConfig = { ...existingConfig, ...DOCKER_CONFIG_TEMPLATE };
      
      // Ensure insecure-registries includes our registry
      const insecureRegs = newConfig['insecure-registries'] || [];
      if (!insecureRegs.includes(LOCAL_REG_HOST)) {
        insecureRegs.push(LOCAL_REG_HOST);
      }
      newConfig['insecure-registries'] = insecureRegs;
      
      // Write updated configuration
      await writeFile(DOCKER_DAEMON_JSON, JSON.stringify(newConfig, null, 2));
      log(`Applied Docker configuration to ${DOCKER_DAEMON_JSON}\n`);
      
      // Restart Docker service
      log('Restarting Docker service…\n');
      await runCommand(['systemctl', 'restart', 'docker']);
      
      // Wait and check status
      await new Promise(resolve => setTimeout(resolve, 3000));
      const { stdout } = await runCommand(['systemctl', 'is-active', 'docker']);
      log(`Docker service status: ${stdout}\nConfiguration applied successfully!`);
      
      await checkDockerConfig();
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  $('check-docker-config-btn').addEventListener('click', checkDockerConfig);

  $('view-images-list-btn').addEventListener('click', async () => {
    try {
      let content;
      try {
        content = await readFile(IMAGE_LIST_PATH);
      } catch {
        content = await generateDefaultImagesList();
        // Create the file with default content
        await runCommand(['mkdir', '-p', '/etc/xavs']);
        await writeFile(IMAGE_LIST_PATH, content);
      }
      $('images-list-content').textContent = content || 'No images list found';
    } catch (e) {
      log(`Error getting images list: ${e.message}`);
    }
  });

  $('update-images-list-btn').addEventListener('click', async () => {
    const content = $('images-list-editor').value.trim();
    if (!content) return log('Please enter image list content');
    
    log('Updating images list…');
    try {
      // Ensure directory exists
      await runCommand(['mkdir', '-p', '/etc/xavs']);
      
      // Write the images list
      await writeFile(IMAGE_LIST_PATH, content);
      
      // Count non-empty, non-comment lines
      const lines = content && content.trim() ? 
        content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')) : [];
      
      log(`Images list updated successfully with ${lines.length} images`);
      $('view-images-list-btn').click(); // refresh display
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  // ---- Status & Catalog helpers ----
  async function checkStatus() {
    try {
      // Check if docker-registry container is running
      const { stdout } = await runCommand(['docker', 'ps', '--format', '{{.Names}}', '--filter', `name=${REGISTRY_CONTAINER_NAME}`]);
      const running = stdout.trim() === REGISTRY_CONTAINER_NAME;
      
      $('registry-status').textContent = running ? 'Running' : 'Not running';
      $('registry-dot').classList.toggle('ok', running);
      $('registry-dot').classList.toggle('bad', !running);
    } catch (e) {
      $('registry-status').textContent = 'Unknown';
      $('registry-dot').classList.remove('ok','bad');
      log(`Status error: ${e.message}`);
    }
  }

  async function refreshCatalog() {
    try {
      // Get registry catalog using curl
      const { stdout } = await runCommand(['curl', '-s', `http://${LOCAL_REG_HOST}/v2/_catalog`]);
      const data = JSON.parse(stdout);
      const repositories = data.repositories || [];
      
      const ul = $('catalog');
      ul.innerHTML = '';
      repositories.forEach(repo => {
        const li = document.createElement('li');
        li.textContent = repo;
        ul.appendChild(li);
      });
    } catch (e) {
      // If catalog fetch fails, show empty list
      const ul = $('catalog');
      ul.innerHTML = '<li>Registry not accessible or empty</li>';
      log(`Catalog error: ${e.message}`);
    }
  }

  async function checkDockerConfig() {
    try {
      let configured = false;
      let currentConfig = 'No configuration found';
      
      try {
        const config = await readFile(DOCKER_DAEMON_JSON);
        const parsed = JSON.parse(config);
        const insecureRegs = parsed['insecure-registries'] || [];
        configured = insecureRegs.includes(LOCAL_REG_HOST);
        currentConfig = config;
      } catch {
        // File doesn't exist or can't be read
        configured = false;
        currentConfig = 'No daemon.json found';
      }
      
      $('docker-config-status').textContent = configured ? 'Configured' : 'Not configured';
      $('docker-config-dot').classList.toggle('ok', configured);
      $('docker-config-dot').classList.toggle('bad', !configured);
      $('current-docker-config').textContent = currentConfig;
      
      if (configured) {
        $('apply-docker-config-btn').textContent = 'Reconfigure Docker';
      } else {
        $('apply-docker-config-btn').textContent = 'Apply Docker Config';
      }
    } catch (e) {
      $('docker-config-status').textContent = 'Unknown';
      $('docker-config-dot').classList.remove('ok','bad');
      log(`Docker config check error: ${e.message}`);
    }
  }

  // ---- Overview Tab Functions ----
  async function refreshOverview() {
    await Promise.all([
      checkDockerStatus(),
      checkRegistryStatus(),
      checkConfigurationStatus(),
      countDockerImages(),
      countRegistryImages(),
      countImagesList()
    ]);
  }

  async function checkDockerStatus() {
    try {
      // Check Docker service status
      const { stdout: status } = await runCommand(['systemctl', 'is-active', 'docker']);
      const isRunning = status.trim() === 'active';
      
      $('docker-status').textContent = isRunning ? 'Running' : 'Stopped';
      $('docker-status-dot').classList.toggle('ok', isRunning);
      $('docker-status-dot').classList.toggle('bad', !isRunning);
      
      // Get Docker version
      try {
        const { stdout: version } = await runCommand(['docker', '--version']);
        if (version) {
          $('docker-version').textContent = version.replace('Docker version ', '').split(',')[0];
        } else {
          $('docker-version').textContent = 'Unknown';
        }
      } catch {
        $('docker-version').textContent = 'Unknown';
      }
    } catch (e) {
      $('docker-status').textContent = 'Unknown';
      $('docker-status-dot').classList.remove('ok', 'bad');
      $('docker-version').textContent = 'Error';
    }
  }

  async function checkRegistryStatus() {
    try {
      const { stdout } = await runCommand(['docker', 'ps', '--format', '{{.Names}}', '--filter', `name=${REGISTRY_CONTAINER_NAME}`]);
      const running = stdout.trim() === REGISTRY_CONTAINER_NAME;
      
      $('overview-registry-status').textContent = running ? 'Running' : 'Not running';
      $('overview-registry-dot').classList.toggle('ok', running);
      $('overview-registry-dot').classList.toggle('bad', !running);
    } catch (e) {
      $('overview-registry-status').textContent = 'Unknown';
      $('overview-registry-dot').classList.remove('ok', 'bad');
    }
  }

  async function checkConfigurationStatus() {
    try {
      let configured = false;
      try {
        const config = await readFile(DOCKER_DAEMON_JSON);
        const parsed = JSON.parse(config);
        const insecureRegs = parsed['insecure-registries'] || [];
        configured = insecureRegs.includes(LOCAL_REG_HOST);
      } catch {
        configured = false;
      }
      
      $('overview-config-status').textContent = configured ? 'Configured' : 'Not configured';
      $('overview-config-dot').classList.toggle('ok', configured);
      $('overview-config-dot').classList.toggle('bad', !configured);
      $('insecure-registry-status').textContent = configured ? 'Enabled' : 'Disabled';
    } catch (e) {
      $('overview-config-status').textContent = 'Unknown';
      $('overview-config-dot').classList.remove('ok', 'bad');
      $('insecure-registry-status').textContent = 'Error';
    }
  }

  async function countDockerImages() {
    try {
      const { stdout } = await runCommand(['docker', 'images', '--format', '{{.Repository}}:{{.Tag}}']);
      if (stdout && stdout.trim()) {
        const images = stdout.trim().split('\n').filter(line => line.trim());
        $('docker-images-count').textContent = `${images.length} images`;
      } else {
        $('docker-images-count').textContent = '0 images';
      }
    } catch (e) {
      $('docker-images-count').textContent = 'Error';
    }
  }

  async function countRegistryImages() {
    try {
      const { stdout } = await runCommand(['curl', '-s', `http://${LOCAL_REG_HOST}/v2/_catalog`]);
      const data = JSON.parse(stdout);
      const repositories = data.repositories || [];
      $('registry-images-count').textContent = `${repositories.length} repositories`;
    } catch (e) {
      $('registry-images-count').textContent = 'Registry offline';
    }
  }

  async function countImagesList() {
    try {
      let content;
      try {
        content = await readFile(IMAGE_LIST_PATH);
      } catch {
        content = await generateDefaultImagesList();
      }
      
      if (content) {
        const lines = content.split('\n')
          .filter(line => line.trim() && !line.trim().startsWith('#'));
        $('images-list-count').textContent = `${lines.length} images configured`;
      } else {
        $('images-list-count').textContent = '0 images configured';
      }
    } catch (e) {
      $('images-list-count').textContent = 'Error';
    }
  }

  async function quickSetup() {
    log('Running quick setup...');
    try {
      // 1. Apply Docker configuration
      log('Step 1: Applying Docker configuration...');
      $('apply-docker-config-btn').click();
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 2. Start registry
      log('Step 2: Starting registry...');
      $('run-registry-btn').click();
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      log('Quick setup completed! Check the Overview tab for status.');
      refreshOverview();
    } catch (e) {
      log(`Quick setup error: ${e.message}`);
    }
  }

  // ---- Overview Event Listeners ----
  $('refresh-overview-btn').addEventListener('click', refreshOverview);
  $('quick-setup-btn').addEventListener('click', quickSetup);

  // initial checks on load
  checkStatus();
  refreshOverview();
});
