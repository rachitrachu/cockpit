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
      if (link.dataset.tab === 'tab-pull') loadCurrentImagesList();
    });
  });

  // ---- Images List Management ----
  async function loadCurrentImagesList() {
    const listElement = $('current-images-list');
    const countElement = $('current-images-count');
    
    listElement.innerHTML = '<li class="loading-state">Loading images...</li>';
    countElement.textContent = '(Loading...)';
    
    try {
      let imagesList;
      let isFromUserFile = false;
      
      try {
        // First try to load from user's custom list
        imagesList = await readFile(IMAGE_LIST_PATH);
        if (imagesList && imagesList.trim() !== '') {
          isFromUserFile = true;
        } else {
          throw new Error('User file is empty');
        }
      } catch (error) {
        // Fallback: load from module images list
        try {
          const moduleImages = await loadModuleImagesList();
          if (moduleImages && moduleImages.length > 0) {
            imagesList = moduleImages.join('\n');
            isFromUserFile = false;
          } else {
            throw new Error('Module images list is empty');
          }
        } catch (moduleError) {
          imagesList = '';
        }
      }
      
      // Update the count element to show source
      const sourceText = isFromUserFile ? '(custom list)' : '(module default)';
      
      if (!imagesList || imagesList.trim() === '') {
        listElement.innerHTML = '<li class="empty-state">No images configured</li>';
        countElement.textContent = '(0 images)';
        return;
      }
      
      const images = imagesList.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      if (images.length === 0) {
        listElement.innerHTML = '<li class="empty-state">No images configured</li>';
        countElement.textContent = '(0 images)';
        return;
      }
      
      countElement.textContent = `(${images.length} images ${sourceText})`;
      listElement.innerHTML = '';
      
      images.forEach((image, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="image-name">${image}</span>
          <div class="image-actions">
            ${isFromUserFile ? `<button class="btn-icon delete" onclick="deleteImage(${index}, '${image.replace(/'/g, "\\'")}')">ðŸ—‘ï¸</button>` : `<button class="btn-icon" onclick="copyToUserList()">ðŸ“‹ Copy to Custom List</button>`}
          </div>
        `;
        listElement.appendChild(li);
      });
      
    } catch (e) {
      listElement.innerHTML = `<li class="error-state">Error loading images: ${e.message}</li>`;
      countElement.textContent = '(Error)';
    }
  }

  // Copy module list to user's custom list
  window.copyToUserList = async function() {
    try {
      const moduleImages = await loadModuleImagesList();
      if (moduleImages && moduleImages.length > 0) {
        const content = `# xAVS Container Images List
# One image per line - these will be pulled from quay.io/xavs.images/
${moduleImages.join('\n')}`;
        
        await runCommand(['mkdir', '-p', '/etc/xavs']);
        await writeFile(IMAGE_LIST_PATH, content);
        log(`Copied ${moduleImages.length} images to custom list\n`);
        
        // Refresh the list and counts
        await loadCurrentImagesList();
        await countImagesList();
      }
    } catch (e) {
      log(`Error copying to custom list: ${e.message}\n`);
    }
  }

  // Delete specific image
  window.deleteImage = async function(index, imageName) {
    if (!confirm(`Delete image "${imageName}"?`)) return;
    
    try {
      let imagesList = await readFile(IMAGE_LIST_PATH);
      let images = imagesList.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      images.splice(index, 1);
      
      const newContent = `# xAVS Container Images List
# One image per line - these will be pulled from quay.io/xavs.images/
${images.join('\n')}`;
      
      await writeFile(IMAGE_LIST_PATH, newContent);
      log(`Deleted image: ${imageName}\n`);
      
      // Refresh the list and counts
      await loadCurrentImagesList();
      await countImagesList();
      
    } catch (e) {
      log(`Error deleting image: ${e.message}\n`);
    }
  }

  // Event listeners for images list management
  $('refresh-images-list-btn').addEventListener('click', async () => {
    await loadCurrentImagesList();
    await countImagesList();
    log('Images list refreshed\n');
  });

  $('clear-all-images-btn').addEventListener('click', async () => {
    if (!confirm('Clear all images from the list? This cannot be undone.')) return;
    
    try {
      const emptyContent = `# xAVS Container Images List
# One image per line - these will be pulled from quay.io/xavs.images/
# List is currently empty`;
      
      await writeFile(IMAGE_LIST_PATH, emptyContent);
      log('All images cleared from list\n');
      
      // Refresh the list and counts
      await loadCurrentImagesList();
      await countImagesList();
      
    } catch (e) {
      log(`Error clearing images: ${e.message}\n`);
    }
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
    
    log('Extracting and loading imagesâ€¦');
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
          log(`Loading ${tarFile}â€¦\n`);
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
    log('ðŸ§ª CONNECTIVITY & PREREQUISITES TEST\n');
    log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n');
    
    const testResults = {
      docker: { status: 'pending', details: '' },
      network: { status: 'pending', details: '' },
      dockerPull: { status: 'pending', details: '' },
      hostsFile: { status: 'pending', details: '' },
      xavsRegistry: { status: 'pending', details: '' }
    };
    
    // Test 1: Docker daemon
    log('ðŸ³ TEST 1: Docker Daemon Status\n');
    log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');
    try {
      const result = await runCommand(['docker', 'version']);
      const dockerVersion = result.stdout.split('\n')[0];
      testResults.docker = { status: 'pass', details: dockerVersion };
      log('âœ… PASS: Docker daemon is running and accessible\n');
      log(`   ðŸ“‹ Version: ${dockerVersion}\n\n`);
    } catch (e) {
      testResults.docker = { status: 'fail', details: e.message };
      log('âŒ FAIL: Docker daemon is not running or not accessible\n');
      log(`   âš ï¸ Error: ${e.message}\n`);
      log('   ðŸ’¡ Solution: Start Docker Desktop or run "systemctl start docker"\n\n');
      
      // If Docker fails, show summary and exit
      showTestSummary(testResults);
      return;
    }

    // Test 2: Network connectivity
    log('ðŸŒ TEST 2: Internet & Registry Connectivity\n');
    log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');
    try {
      log('   ðŸ” Pinging quay.io...\n');
      await runCommand(['ping', '-c', '1', 'quay.io'], { timeout: 10000 });
      testResults.network = { status: 'pass', details: 'quay.io reachable' };
      log('âœ… PASS: Can reach quay.io registry\n');
      log('   ðŸ“¡ Internet connectivity confirmed\n\n');
    } catch (e) {
      testResults.network = { status: 'fail', details: e.message };
      log('âŒ FAIL: Cannot reach quay.io registry\n');
      log(`   âš ï¸ Error: ${e.message}\n`);
      log('   ðŸ’¡ Solution: Check internet connection and firewall settings\n\n');
    }

    // Test 3: Docker pull functionality
    log('ðŸ“¦ TEST 3: Docker Pull Functionality\n');
    log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');
    try {
      log('   ðŸ” Testing with hello-world image...\n');
      await runCommand(['docker', 'pull', 'hello-world:latest']);
      testResults.dockerPull = { status: 'pass', details: 'hello-world pulled successfully' };
      log('âœ… PASS: Docker pull functionality works\n');
      log('   ðŸ“¦ Successfully pulled test image\n');
      
      // Clean up test image
      try {
        log('   ðŸ§¹ Cleaning up test image...\n');
        await runCommand(['docker', 'rmi', 'hello-world:latest']);
        log('   âœ… Test image removed\n\n');
      } catch (e) {
        log('   âš ï¸ Test image cleanup skipped\n\n');
      }
    } catch (e) {
      testResults.dockerPull = { status: 'fail', details: e.message };
      log('âŒ FAIL: Docker pull test failed\n');
      log(`   âš ï¸ Error: ${e.message}\n`);
      log('   ðŸ’¡ Solution: Check Docker daemon and registry access\n\n');
    }

    // Test 4: /etc/hosts validation
    log('ðŸ  TEST 4: Local Registry Hostname Resolution\n');
    log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');
    try {
      const hostsContent = await readFile('/etc/hosts');
      if (hostsContent.includes('docker-registry')) {
        testResults.hostsFile = { status: 'pass', details: 'docker-registry entry exists' };
        log('âœ… PASS: docker-registry entry found in /etc/hosts\n');
        log('   ðŸ  Local registry hostname will resolve correctly\n\n');
      } else {
        testResults.hostsFile = { status: 'warning', details: 'docker-registry entry missing' };
        log('âš ï¸ WARNING: docker-registry entry NOT found in /etc/hosts\n');
        log('   ï¿½ Impact: "docker-registry:4000" may not be resolvable\n');
        log('   ðŸ’¡ Solution: Click "Run Registry" to add the entry automatically\n\n');
      }
    } catch (e) {
      testResults.hostsFile = { status: 'fail', details: e.message };
      log('âŒ FAIL: Could not read /etc/hosts\n');
      log(`   âš ï¸ Error: ${e.message}\n`);
      log('   ðŸ’¡ Solution: Check file permissions\n\n');
    }

    // Test 5: xAVS registry validation
    log('ðŸ—ï¸ TEST 5: xAVS Registry & Image Availability\n');
    log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');
    try {
      log('   ðŸ” Checking keystone image manifest...\n');
      await runCommand(['docker', 'manifest', 'inspect', 'quay.io/xavs.images/keystone:2024.1-ubuntu-jammy']);
      testResults.xavsRegistry = { status: 'pass', details: 'keystone manifest accessible' };
      log('âœ… PASS: xAVS registry is accessible\n');
      log('   ðŸ“‹ Image manifests are available\n');
      log('   ðŸŽ¯ Images can be pulled successfully\n\n');
    } catch (e) {
      testResults.xavsRegistry = { status: 'fail', details: e.message };
      log('âŒ FAIL: Could not access xAVS image manifests\n');
      log(`   âš ï¸ Error: ${e.message}\n`);
      
      if (e.message.includes('manifest unknown') || e.message.includes('not found')) {
        log('   ðŸ’¡ Cause: Image may not exist in the registry\n');
        log('   ï¿½ Check: https://quay.io/repository/xavs.images/keystone\n');
      } else if (e.message.includes('unauthorized')) {
        log('   ðŸ’¡ Cause: Authentication required\n');
        log('   ðŸ”§ Solution: Run "docker login quay.io"\n');
      } else {
        log('   ðŸ’¡ Cause: Network or registry issue\n');
        log('   ðŸ”§ Solution: Check internet connection and try again\n');
      }
      log('\n');
    }

    // Show comprehensive summary
    showTestSummary(testResults);
  });

  // Function to display test summary
  function showTestSummary(results) {
    log('ðŸ“Š TEST RESULTS SUMMARY\n');
    log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n');
    
    const tests = [
      { name: 'Docker Daemon', key: 'docker', icon: 'ðŸ³' },
      { name: 'Network Connectivity', key: 'network', icon: 'ðŸŒ' },
      { name: 'Docker Pull Function', key: 'dockerPull', icon: 'ðŸ“¦' },
      { name: 'Hosts File Setup', key: 'hostsFile', icon: 'ðŸ ' },
      { name: 'xAVS Registry Access', key: 'xavsRegistry', icon: 'ðŸ—ï¸' }
    ];
    
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;
    
    tests.forEach(test => {
      const result = results[test.key];
      let statusIcon, statusText;
      
      switch (result.status) {
        case 'pass':
          statusIcon = 'âœ…';
          statusText = 'PASS';
          passCount++;
          break;
        case 'warning':
          statusIcon = 'âš ï¸';
          statusText = 'WARN';
          warnCount++;
          break;
        case 'fail':
          statusIcon = 'âŒ';
          statusText = 'FAIL';
          failCount++;
          break;
        default:
          statusIcon = 'â³';
          statusText = 'SKIP';
      }
      
      log(`${test.icon} ${test.name.padEnd(25)} ${statusIcon} ${statusText}\n`);
    });
    
    log('\n');
    log(`ðŸ“ˆ OVERALL STATUS: ${passCount} passed, ${warnCount} warnings, ${failCount} failed\n`);
    
    if (failCount === 0 && warnCount === 0) {
      log('ï¿½ EXCELLENT: All tests passed! Ready to pull images.\n');
    } else if (failCount === 0) {
      log('âœ… GOOD: Core functionality working. Warnings can be ignored or fixed.\n');
    } else if (failCount === 1 && results.hostsFile.status === 'fail') {
      log('âš ï¸ MINOR ISSUE: Only hosts file issue detected. Use "Run Registry" to fix.\n');
    } else {
      log('âŒ ISSUES DETECTED: Please resolve the failed tests before pulling images.\n');
    }
    
    log('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');
    log('ðŸ’¡ TIP: If tests pass, the "Pull Images" operation should work smoothly!\n');
  }

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

    log('ðŸ” Checking prerequisites...\n');
    isPulling = true;
    $('pull-btn').textContent = 'Stop Pull';
    $('pull-btn').className = 'btn btn-danger';
    
    try {
      // Check if Docker is running
      log('Checking Docker daemon...\n');
      try {
        await runCommand(['docker', 'version']);
        log('âœ… Docker daemon is running\n');
      } catch (e) {
        throw new Error('Docker daemon is not running. Please start Docker first.');
      }

      // Check registry connectivity
      log('Testing registry connectivity...\n');
      try {
        await runCommand(['docker', 'pull', '--help'], { timeout: 5000 });
        log('âœ… Docker pull command is available\n');
      } catch (e) {
        log('âš ï¸ Docker pull command test failed, but continuing...\n');
      }

    log('ðŸ“‹ Reading images list...\n');
      // Read images list - prioritize user's custom list, fallback to module
      let imagesList;
      let isFromUserFile = false;
      
      try {
        // First try to load from user's custom list
        imagesList = await readFile(IMAGE_LIST_PATH);
        if (imagesList && imagesList.trim() !== '' && !imagesList.includes('List is currently empty')) {
          isFromUserFile = true;
          log(`âœ… Using custom images list (${imagesList.split('\n').filter(l => l.trim() && !l.startsWith('#')).length} images)\n`);
        } else {
          throw new Error('User file is empty or not found');
        }
      } catch (error) {
        // Fallback: load from module images list
        log(`Custom list not available: ${error.message}\n`);
        log('Loading from module default list...\n');
        try {
          const moduleImages = await loadModuleImagesList();
          if (moduleImages && moduleImages.length > 0) {
            imagesList = moduleImages.join('\n');
            isFromUserFile = false;
            log(`âœ… Using module images list (${moduleImages.length} images)\n`);
          } else {
            throw new Error('Module images list is empty');
          }
        } catch (moduleError) {
          log(`Module list also failed: ${moduleError.message}\n`);
          const defaultContent = await generateDefaultImagesList();
          imagesList = defaultContent;
          log('âœ… Using generated default images list\n');
        }
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
          log('\nðŸ›‘ Pull operation was stopped by user.\n');
          break;
        }
        
        const image = images[i];
        const ref = `${PUBLIC_REG}/xavs.images/${image}`;
        log(`ðŸ“¦ [${i + 1}/${images.length}] Pulling ${image}...\n`);
        log(`ðŸ”— Full reference: ${ref}\n`);
        
        try {
          await runCommand(['docker', 'pull', ref]);
          successCount++;
          log(`âœ… [${i + 1}/${images.length}] Successfully pulled ${image}\n\n`);
        } catch (error) {
          failCount++;
          log(`âŒ [${i + 1}/${images.length}] Failed to pull ${image}\n`);
          log(`ðŸ” Error details: ${error.message}\n`);
          
          // Provide specific error diagnostics
          if (error.message.includes('manifest unknown') || error.message.includes('not found')) {
            log(`ðŸ’¡ This image may not exist in the registry. Check: https://quay.io/repository/xavs.images/${image.split(':')[0]}\n`);
          } else if (error.message.includes('connection') || error.message.includes('network')) {
            log(`ðŸ’¡ Network connectivity issue. Check internet connection and registry access.\n`);
          } else if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
            log(`ðŸ’¡ Authentication issue. You may need to login: docker login quay.io\n`);
          } else if (error.message.includes('timeout')) {
            log(`ðŸ’¡ Request timeout. The registry may be slow or overloaded.\n`);
          }
          log('\n');
          // Continue with next image instead of stopping
        }
      }
      
      if (isPulling) {
        log(`\nðŸŽ‰ Pull operation completed!\n`);
        log(`âœ… Success: ${successCount} images\n`);
        if (failCount > 0) {
          log(`âŒ Failed: ${failCount} images\n`);
        }
        log(`ðŸ“Š Total processed: ${successCount + failCount}/${images.length} images\n`);
        $('push-btn').disabled = false;
        
        // Refresh images list and counts
        setTimeout(async () => {
          await loadCurrentImagesList();
          await countImagesList();
        }, 500);
      }
      
    } catch (e) {
      log(`âŒ Error: ${e.message}\n`);
    } finally {
      isPulling = false;
      currentPullProcess = null;
      $('pull-btn').textContent = 'Pull Images';
      $('pull-btn').className = 'btn btn-primary';
    }
  });

  $('run-registry-btn').addEventListener('click', async () => {
    log('Starting docker-registry (host network, port 4000)â€¦\n');
    try {
      // Check if hosts entry exists and add if needed
      log('Checking /etc/hosts for docker-registry entry...\n');
      try {
        const hostsContent = await readFile('/etc/hosts');
        if (!hostsContent.includes('docker-registry')) {
          log('Adding docker-registry entry to /etc/hosts...\n');
          const newHostsContent = hostsContent.trim() + '\n127.0.0.1\tdocker-registry\n';
          await writeFile('/etc/hosts', newHostsContent);
          log('âœ… Added docker-registry to /etc/hosts\n');
        } else {
          log('âœ… docker-registry entry already exists in /etc/hosts\n');
        }
      } catch (e) {
        log(`âš ï¸ Could not update /etc/hosts: ${e.message}\n`);
        log('Registry may not be accessible via hostname docker-registry\n');
      }

      // Run registry container
      log('Starting registry container...\n');
      await runCommand([
        'docker', 'run', '-d', '--network', 'host', 
        '--name', REGISTRY_CONTAINER_NAME, '--restart=always',
        '-e', 'REGISTRY_HTTP_ADDR=0.0.0.0:4000',
        '-v', 'registry:/var/lib/registry',
        'registry:2'
      ]);
      
      // Apply Docker daemon configuration
      log('Updating Docker daemon configuration...\n');
      await runCommand(['mkdir', '-p', '/etc/docker']);
      await writeFile(DOCKER_DAEMON_JSON, JSON.stringify(DOCKER_CONFIG_TEMPLATE, null, 2));
      log('âœ… Applied Docker daemon configuration\n');
      
      log('ðŸŽ‰ Registry started successfully!\n');
      log('Registry is accessible at: http://docker-registry:4000\n');
      $('restart-docker-btn').disabled = false;
      await checkStatus();
    } catch (e) {
      // Container might already exist, that's okay
      if (e.message.includes('already in use')) {
        log('Registry container already exists, checking status...\n');
        
        // Check if the existing container is running
        try {
          const { stdout } = await runCommand(['docker', 'ps', '--format', '{{.Names}}', '--filter', `name=${REGISTRY_CONTAINER_NAME}`]);
          const running = stdout.trim() === REGISTRY_CONTAINER_NAME;
          
          if (!running) {
            log('Container exists but is not running, starting it...\n');
            await runCommand(['docker', 'start', REGISTRY_CONTAINER_NAME]);
            log('âœ… Registry container started successfully!\n');
          } else {
            log('âœ… Registry container is already running!\n');
          }
        } catch (startError) {
          log(`âŒ Error starting existing container: ${startError.message}\n`);
        }
        
        await checkStatus();
      } else {
        log(`âŒ Error: ${e.message}\n`);
      }
    }
  });

  $('stop-registry-btn').addEventListener('click', async () => {
    log('Stopping docker-registry...\n');
    try {
      // Stop and remove the registry container
      try {
        await runCommand(['docker', 'stop', REGISTRY_CONTAINER_NAME]);
        log('âœ… Registry container stopped\n');
      } catch (e) {
        log(`âš ï¸ Could not stop container (may not be running): ${e.message}\n`);
      }
      
      try {
        await runCommand(['docker', 'rm', REGISTRY_CONTAINER_NAME]);
        log('âœ… Registry container removed\n');
      } catch (e) {
        log(`âš ï¸ Could not remove container: ${e.message}\n`);
      }

      // Optionally remove hosts entry (ask user or just inform)
      log('Note: /etc/hosts entry for docker-registry is kept for future use\n');
      log('If you want to remove it, manually edit /etc/hosts\n');
      
      log('ðŸŽ‰ Registry stopped successfully!\n');
      await checkStatus();
    } catch (e) {
      log(`âŒ Error stopping registry: ${e.message}\n`);
    }
  });

  $('restart-docker-btn').addEventListener('click', async () => {
    log('Restarting Dockerâ€¦');
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
    log('Pushing images to local registryâ€¦');
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
        
        log(`Tagging ${src} -> ${dest}â€¦\n`);
        await runCommand(['docker', 'tag', src, dest]);
        
        log(`Pushing ${dest}â€¦\n`);
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
    log('Applying Docker daemon configurationâ€¦');
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
      log('Restarting Docker serviceâ€¦\n');
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
    
    log('Updating images listâ€¦');
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
    const ul = $('catalog');
    ul.innerHTML = '<li>ðŸ” Checking local registry...</li>';
    
    try {
      // First check if the local registry container is running
      log('Checking local registry status...\n');
      try {
        const { stdout } = await runCommand(['docker', 'ps', '--filter', `name=${REGISTRY_CONTAINER_NAME}`, '--format', 'table {{.Names}}\t{{.Status}}']);
        if (!stdout || !stdout.includes(REGISTRY_CONTAINER_NAME)) {
          throw new Error('Local registry container is not running');
        }
        log('âœ… Local registry container is running\n');
      } catch (e) {
        ul.innerHTML = `
          <li class="registry-error">
            <div>âŒ Local registry is not running</div>
            <div class="error-hint">Start the local registry first using the "Start Registry" button in the Registry tab</div>
          </li>`;
        log(`Registry status check failed: ${e.message}\n`);
        return;
      }

      // Test registry connectivity
      ul.innerHTML = '<li>ðŸŒ Testing registry connectivity...</li>';
      try {
        await runCommand(['curl', '-f', '-s', '--connect-timeout', '5', `http://${LOCAL_REG_HOST}/v2/`]);
        log('âœ… Registry API is accessible\n');
      } catch (e) {
        ul.innerHTML = `
          <li class="registry-error">
            <div>âŒ Registry API not accessible</div>
            <div class="error-hint">Registry may be starting up or there's a network issue</div>
          </li>`;
        log(`Registry connectivity test failed: ${e.message}\n`);
        return;
      }

      // Get registry catalog
      ul.innerHTML = '<li>ðŸ“‹ Loading catalog...</li>';
      const { stdout } = await runCommand(['curl', '-s', `http://${LOCAL_REG_HOST}/v2/_catalog`]);
      const data = JSON.parse(stdout);
      const repositories = data.repositories || [];
      
      ul.innerHTML = '';
      if (repositories.length === 0) {
        ul.innerHTML = `
          <li class="registry-empty">
            <div>ðŸ“¦ Registry is empty</div>
            <div class="empty-hint">Push some images to see them listed here</div>
          </li>`;
        log('Local registry is running but contains no images\n');
      } else {
        log(`Found ${repositories.length} repositories in local registry\n`);
        repositories.forEach(repo => {
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="repo-item">
              <span class="repo-name">ðŸ“¦ ${repo}</span>
              <span class="repo-actions">
                <button class="btn-small" onclick="inspectImage('${repo}')">Inspect</button>
              </span>
            </div>`;
          ul.appendChild(li);
        });
      }
    } catch (e) {
      // If catalog fetch fails, show detailed error
      ul.innerHTML = `
        <li class="registry-error">
          <div>âŒ Failed to load catalog</div>
          <div class="error-details">${e.message}</div>
          <div class="error-hint">
            Check if the local registry is running and accessible at ${LOCAL_REG_HOST}
          </div>
        </li>`;
      log(`Catalog error: ${e.message}\n`);
    }
  }

  // Function to inspect an image in the local registry
  window.inspectImage = async function(imageName) {
    log(`ðŸ” Inspecting image: ${imageName}\n`);
    try {
      // Get image tags
      const { stdout } = await runCommand(['curl', '-s', `http://${LOCAL_REG_HOST}/v2/${imageName}/tags/list`]);
      const data = JSON.parse(stdout);
      log(`Image: ${imageName}\n`);
      log(`Tags: ${(data.tags || []).join(', ')}\n\n`);
    } catch (e) {
      log(`Failed to inspect ${imageName}: ${e.message}\n`);
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
        // First try to read the actual images list file
        content = await readFile(IMAGE_LIST_PATH);
      } catch {
        // If it doesn't exist, try to read from module file
        try {
          const moduleImages = await loadModuleImagesList();
          content = moduleImages ? moduleImages.join('\n') : '';
        } catch {
          // If that fails too, generate default
          content = await generateDefaultImagesList();
        }
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
