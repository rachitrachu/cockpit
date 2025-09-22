document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // ---- Helpers ----
  // Format path to remove double slashes and clean up display
  const formatPath = (path) => {
    if (!path) return '';
    return path.replace(/\/+/g, '/').replace(/^\//, '/');
  };

  // Format path with icon for better visual display
  const formatPathWithIcon = (path, isFile = false) => {
    if (!path) return '';
    const cleanPath = formatPath(path);
    
    // Determine icon based on path and file type
    let icon = '📁'; // Default folder icon
    
    if (isFile || cleanPath.includes('.')) {
      if (cleanPath.endsWith('.tar.gz') || cleanPath.endsWith('.tar')) {
        icon = '📦'; // Archive icon for tar files
      } else {
        icon = '📄'; // Generic file icon
      }
    } else if (cleanPath === '/root' || cleanPath.startsWith('/root')) {
      icon = '🏠'; // Home icon for root directory
    } else if (cleanPath.includes('/home/')) {
      icon = '👤'; // User icon for home directories
    }
    
    return `${icon} ${cleanPath}`;
  };

  const logEl = $("log");
  const log = (t="") => {
    if (!logEl) {
      console.warn('Log element not found');
      return;
    }
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${t}`;
    
    // Handle HTML content by checking if it contains HTML tags
    if (t.includes('<i class=') || t.includes('<span') || t.includes('<div')) {
      // For HTML content, create a new div element
      const logDiv = document.createElement('div');
      logDiv.innerHTML = logEntry;
      logEl.appendChild(logDiv);
    } else {
      // For plain text, use textContent
      logEl.textContent += logEntry + "\n";
    }
    
    logEl.scrollTop = logEl.scrollHeight;
    
    // Update status bar (strip HTML for status bar)
    const statusElement = $('status-text');
    if (statusElement) {
      const cleanText = t.replace(/<[^>]*>/g, '').trim() || "Ready";
      statusElement.textContent = cleanText;
    }
    
    // Store logs for persistence across tabs (localStorage for better cross-tab sync)
    try {
        const existingLogs = localStorage.getItem('xavs-images-logs') || '';
        const newLogs = existingLogs + logEntry + '\n';
        localStorage.setItem('xavs-images-logs', newLogs);
        
        // Trigger custom event for immediate cross-tab sync
        window.dispatchEvent(new CustomEvent('xavs-logs-updated', { 
          detail: { logs: newLogs } 
        }));
        
    } catch (e) {
        // Fallback to sessionStorage if localStorage fails
        console.warn('localStorage failed, trying sessionStorage:', e);
        try {
            const existingLogs = sessionStorage.getItem('xavs-images-logs') || '';
            sessionStorage.setItem('xavs-images-logs', existingLogs + logEntry + '\n');
        } catch (e2) {
            console.warn('Could not store logs:', e2);
        }
    }
  };
  
  // Load existing logs from storage on page load
  const loadStoredLogs = () => {
    try {
        let storedLogs = localStorage.getItem('xavs-images-logs');
        
        // Fallback to sessionStorage if localStorage is empty
        if (!storedLogs) {
            storedLogs = sessionStorage.getItem('xavs-images-logs');
        }
        
        if (storedLogs && logEl) {
            logEl.textContent = storedLogs;
            logEl.scrollTop = logEl.scrollHeight;
        }
    } catch (e) {
        console.warn('Could not load stored logs:', e);
    }
  };

  // Cross-tab log synchronization
  const syncLogsAcrossTabs = () => {
    // Listen for storage changes from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'xavs-images-logs' && e.newValue !== e.oldValue) {
        if (logEl && e.newValue) {
          logEl.textContent = e.newValue;
          logEl.scrollTop = logEl.scrollHeight;
        }
      }
    });

    // Listen for custom log update events (for same-tab updates)
    window.addEventListener('xavs-logs-updated', (e) => {
      if (logEl && e.detail && e.detail.logs) {
        // Only update if the content is different to avoid cursor jumps
        if (logEl.textContent !== e.detail.logs) {
          logEl.textContent = e.detail.logs;
          logEl.scrollTop = logEl.scrollHeight;
        }
      }
    });

    // Also check for updates periodically in case of sessionStorage fallback
    setInterval(() => {
      if (!logEl) return;
      
      try {
        let currentLogs = localStorage.getItem('xavs-images-logs');
        if (!currentLogs) {
          currentLogs = sessionStorage.getItem('xavs-images-logs');
        }
        
        if (currentLogs && currentLogs !== logEl.textContent) {
          logEl.textContent = currentLogs;
          logEl.scrollTop = logEl.scrollHeight;
        }
      } catch (e) {
        // Ignore errors during periodic sync
      }
    }, 2000); // Check every 2 seconds
  };

  // ---- Server File Browser for Extract Tab ----
  const serverFileModal = $('server-file-modal');
  const serverFileList = $('server-file-list');
  const serverFilePath = $('server-file-path');
  const selectArchiveBtn = $('select-archive-btn');
  const selectedArchivePathSpan = $('selected-archive-path');
  const selectDestBtn = $('select-dest-btn');
  const selectedDestPathSpan = $('selected-dest-path');
  const copyArchiveBtn = $('copy-archive-btn');
  const destinationSelectBlock = document.getElementById('destination-select-block');
  const closeModalBtn = $('close-server-file-modal');
  
  // Extract section elements (always visible)
  const browseExtractFileBtn = $('browse-extract-file-btn');
  const browsedExtractFilePathSpan = $('browsed-extract-file-path');
  const extractFileInfo = $('extract-file-info');
  const extractArchiveBtn = $('extract-archive-btn');
  
  // Navigation buttons
  const navHomeBtn = $('nav-home-btn');
  const navRootBtn = $('nav-root-btn');
  const navTmpBtn = $('nav-tmp-btn');
  const navVarBtn = $('nav-var-btn');

  let currentServerDir = '/root';
  let selectedExtractFilePath = null;

  // Backend implementation using shell commands via cockpit
  async function listServerDir(path) {
    try {
      // Version check - if you see this, the new code is loaded
      
      // Validate and sanitize the path to prevent directory traversal attacks
      const sanitizedPath = path.replace(/\.\.+/g, '').replace(/\/+/g, '/');
      
      
      // Check if directory exists and is accessible
      try {
        await runCommand(['test', '-d', sanitizedPath]);
      } catch (e) {
        return [];
      }
      
      // List directory contents with detailed info
      const { stdout } = await runCommand([
        'ls', '-la', '--time-style=+%Y-%m-%d %H:%M', sanitizedPath
      ]);
      
      if (!stdout || !stdout.trim()) {
        return [];
      }
      
      
      const lines = stdout.trim().split('\n');
      const items = [];
      
      
      // Skip the first line (total) and parse each entry
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Split by whitespace, but keep the last field (filename) even if it contains spaces
        // ls -la --time-style=+%Y-%m-%d %H:%M output: perms, links, owner, group, size, date, time, name
        // e.g. drwxr-x---  4 xloud xloud 4096 2025-09-11 05:28 xloud
        const parts = line.split(/\s+/);
        if (parts.length < 8) {
          continue;
        }
        // The filename is always the last field (or fields if spaces)
        const name = parts.slice(7).join(' ');
        if (name === '.' || name === '..') {
          continue;
        }
        const perms = parts[0];
        const isDir = perms[0] === 'd';
        const size = parseInt(parts[4], 10);
        const date = parts[5];
        const time = parts[6];
        const item = {
          name,
          type: isDir ? 'dir' : (perms[0] === 'l' ? 'link' : 'file'),
          size: !isDir ? size : null,
          modified: `${date} ${time}`,
          permissions: perms,
          user: parts[2],
          group: parts[3]
        };
        items.push(item);
      }
      
      
      // Filter out hidden files (name starts with '.') and symlinks (type === 'link')
      const visibleItems = items.filter(item => !item.name.startsWith('.') && item.type !== 'link');

      // Sort: directories first, then files, both alphabetically
      visibleItems.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });

      return visibleItems;
      
    } catch (error) {
      console.error(`Error listing directory ${path}:`, error.message);
      return [];
    }
  }

  async function openServerFileModal(startPath = '/') {
    try {
      
      // Test multiple common directories and log results
      const testPaths = ['/home', '/root', '/tmp', '/var', '/opt', '/usr', '/'];
      
      let accessiblePaths = [];
      for (const testPath of testPaths) {
        try {
          await runCommand(['test', '-d', testPath]);
          accessiblePaths.push(testPath);
        } catch (e) {
        }
      }
      
      
      // Try to start from the specified path, but have fallbacks
      let initialPath = startPath;
      
      // Use the first accessible directory from our preferred list
      const preferredPaths = [startPath, '/home', '/tmp', '/var', '/'];
      for (const testPath of preferredPaths) {
        if (accessiblePaths.includes(testPath)) {
          initialPath = testPath;
          break;
        }
      }
      
      if (initialPath !== startPath) {
      }
      
      serverFileModal.style.display = 'flex';
      await renderServerFileList(initialPath);
    } catch (error) {
      log(`🚨 Error opening file browser: ${error.message}`);
      serverFileModal.style.display = 'none';
    }
  }

  // Create breadcrumb navigation
  function createBreadcrumb(path) {
    const segments = path.split('/').filter(segment => segment !== '');
    const breadcrumbHtml = [];
    
    // Add root
    breadcrumbHtml.push(`<a class="breadcrumb-segment" data-path="/" title="Go to root">/</a>`);
    
    // Add each path segment
    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += '/' + segment;
      breadcrumbHtml.push(`<span class="breadcrumb-separator">/</span>`);
      breadcrumbHtml.push(`<a class="breadcrumb-segment" data-path="${currentPath}" title="Go to ${currentPath}">${segment}</a>`);
    });
    
    return breadcrumbHtml.join('');
  }

  async function renderServerFileList(path) {
    try {
      currentServerDir = path;
      // Update breadcrumb navigation
      serverFilePath.innerHTML = createBreadcrumb(path);
      // Add click handlers to breadcrumb segments
      serverFilePath.querySelectorAll('.breadcrumb-segment').forEach(segment => {
        segment.addEventListener('click', (e) => {
          e.preventDefault();
          const targetPath = segment.getAttribute('data-path');
          renderServerFileList(targetPath);
        });
      });
      serverFileList.innerHTML = '';
      // Add parent directory navigation (except for root)
      if (path !== '/') {
        const parentPath = path.replace(/\/[^/]*$/, '') || '/';
        const parentLi = document.createElement('li');
        parentLi.className = 'parent-dir';
  parentLi.innerHTML = '<div><i class="fa-solid fa-level-up-alt file-icon icon-up"></i><strong>.. (Parent Directory)</strong></div><div></div>';
        parentLi.title = `Go to ${parentPath}`;
        parentLi.onclick = () => renderServerFileList(parentPath);
        serverFileList.appendChild(parentLi);
      }

      // Ensure modal footer exists
      // Prefer to use .modal-actions if it exists, else fallback to #server-file-modal-footer
      let modalFooter = serverFileModal.querySelector('.modal-actions');
      if (!modalFooter) {
        modalFooter = document.getElementById('server-file-modal-footer');
      }
      if (!modalFooter) {
        // Try to find the modal and append a footer if missing
        if (serverFileModal) {
          modalFooter = document.createElement('div');
          modalFooter.id = 'server-file-modal-footer';
          modalFooter.className = 'modal-footer';
          let modalContent = serverFileModal.querySelector('.modal-content') || serverFileModal;
          modalContent.appendChild(modalFooter);
        }
      }
      // Remove any existing select-folder-footer button
      if (modalFooter) {
        const oldBtn = document.getElementById('select-folder-footer-btn');
        if (oldBtn) oldBtn.remove();
      }
      if (fileBrowserMode === 'select-dest' && modalFooter) {
        // Add 'Select this folder' button to modal footer
        const selectFolderBtn = document.createElement('button');
        selectFolderBtn.id = 'select-folder-footer-btn';
        selectFolderBtn.className = 'btn btn-brand'; // Use brand color class
  selectFolderBtn.innerHTML = `<i class=\"fa-solid fa-check-circle\"></i> Select this folder`;
        selectFolderBtn.onclick = () => {
          selectedDestPath = path;
          selectedDestPathSpan.innerHTML = formatPathWithIcon(path);
          serverFileModal.style.display = 'none';
          if (selectedArchivePath && selectedDestPath) {
            copyArchiveBtn.disabled = false;
          }
        };
        // Always insert before the Cancel/Close button if it exists
        const cancelBtn = modalFooter.querySelector('#close-server-file-modal');
        if (cancelBtn) {
          modalFooter.insertBefore(selectFolderBtn, cancelBtn);
        } else {
          modalFooter.appendChild(selectFolderBtn);
        }
      }

      const items = await listServerDir(path);
      if (items.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty';
  emptyLi.innerHTML = '<div><i class="fa-solid fa-info-circle file-icon icon-info"></i><em>Directory is empty or not accessible</em></div><div></div>';
        serverFileList.appendChild(emptyLi);
        return;
      }
      for (const item of items) {
        const li = document.createElement('li');
        let iconClass, colorClass;
        li.dataset.path = path === '/' ? '/' + item.name : path + '/' + item.name;
        li.dataset.isdir = item.type === 'dir' ? 'true' : 'false';
        if (item.type === 'dir') {
    iconClass = 'fa-solid fa-folder';
          colorClass = 'icon-folder';
          li.title = `Open directory: ${item.name}`;
          li.dataset.selectable = 'true';
          // In destination select mode, only navigate into directory on click (do not select)
          li.onclick = () => renderServerFileList(path + '/' + item.name);
        } else if (item.type === 'link') {
    iconClass = 'fa-solid fa-link';
          colorClass = 'icon-link';
          li.title = `Symbolic link: ${item.name}`;
          li.classList.add('file-disabled');
          li.dataset.selectable = 'false';
        } else {
          if (item.name.endsWith('.tar.gz') || item.name.endsWith('.tar')) {
            iconClass = 'fa-solid fa-file-archive';
            colorClass = 'icon-file-archive';
            li.classList.add('file-selectable');
            li.title = `Select this archive file: ${item.name}`;
            li.dataset.selectable = 'true';
          } else {
            iconClass = 'fa-solid fa-file';
            colorClass = 'icon-file';
            li.classList.add('file-disabled');
            li.title = 'Only .tar and .tar.gz files can be selected';
            li.dataset.selectable = 'false';
          }
        }
        // Main content
        const mainDiv = document.createElement('div');
  mainDiv.innerHTML = `<i class="${iconClass} file-icon ${colorClass}"></i><strong>${item.name}</strong>`;
        const infoDiv = document.createElement('div');
        infoDiv.className = 'file-info';
        if (item.type === 'file' && item.size && item.modified) {
          const sizeFormatted = formatFileSize(parseInt(item.size));
          infoDiv.textContent = `${sizeFormatted} • ${item.modified}`;
        } else if (item.type === 'dir') {
    infoDiv.innerHTML = '<i class="fa-solid fa-chevron-right icon-chevron"></i>';
        }
        li.appendChild(mainDiv);
        li.appendChild(infoDiv);
        serverFileList.appendChild(li);
      }
      
    } catch (error) {
      console.error('Error rendering server file list:', error);
  serverFileList.innerHTML = `<li class="error"><div><i class="fa-solid fa-exclamation-triangle file-icon icon-warning"></i>Error loading directory: ${error.message}</div><div></div></li>`;
    }
  }

  // Helper function to format file sizes
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Initialize server file browser event listeners
  // --- Archive selection and destination selection logic ---
  let selectedArchivePath = null;
  let selectedDestPath = null;
  let fileBrowserMode = null; // 'select-archive', 'select-dest', or 'browse-extract'

  if (selectArchiveBtn && serverFileModal && closeModalBtn) {
    selectArchiveBtn.onclick = () => {
      fileBrowserMode = 'select-archive';
      openServerFileModal('/');
    };
    if (selectDestBtn) {
      selectDestBtn.onclick = () => {
        fileBrowserMode = 'select-dest';
        openServerFileModal('/');
      };
    }
    
    // Browse extract file button handler
    if (browseExtractFileBtn) {
      browseExtractFileBtn.onclick = () => {
        fileBrowserMode = 'browse-extract';
        openServerFileModal('/');
      };
    }
    
    closeModalBtn.onclick = () => {
      serverFileModal.style.display = 'none';
    };
    // Navigation button handlers for modal
    if (navHomeBtn) navHomeBtn.onclick = () => renderServerFileList('/home');
    if (navRootBtn) navRootBtn.onclick = () => renderServerFileList('/root');
    if (navTmpBtn) navTmpBtn.onclick = () => renderServerFileList('/tmp');
    if (navVarBtn) navVarBtn.onclick = () => renderServerFileList('/var');
    // Optional: close modal on outside click
    serverFileModal.addEventListener('click', (e) => {
      if (e.target === serverFileModal) serverFileModal.style.display = 'none';
    });
  }

  // Patch: handle file selection in modal for archive and destination
  if (serverFileList) {
    serverFileList.onclick = async (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      const path = li.dataset.path;
      const isDir = li.dataset.isdir === 'true';
      const isSelectable = li.dataset.selectable === 'true';
      
      if (fileBrowserMode === 'select-archive') {
        // Allow both .tar and .tar.gz files to be selected
        if (!isDir && isSelectable && (path.endsWith('.tar.gz') || path.endsWith('.tar'))) {
          selectedArchivePath = path;
          selectedArchivePathSpan.innerHTML = formatPathWithIcon(path, true);
          serverFileModal.style.display = 'none';
          // Show destination select block (remove .hidden class)
          destinationSelectBlock.classList.remove('hidden');
          // Reset destination selection
          selectedDestPath = null;
          selectedDestPathSpan.textContent = '';
          copyArchiveBtn.disabled = true;
        }
      } else if (fileBrowserMode === 'browse-extract') {
        // Handle browse extract file selection - support both .tar and .tar.gz
        if (!isDir && isSelectable && (path.endsWith('.tar.gz') || path.endsWith('.tar'))) {
          selectedExtractFilePath = path;
          browsedExtractFilePathSpan.innerHTML = formatPathWithIcon(path, true);
          serverFileModal.style.display = 'none';
          
          // Update extract file info and enable extract button
          const fileName = path.split('/').pop();
          extractFileInfo.innerHTML = `
            <div class="file-info-item">
              <i class="fa fa-file-archive text-blue"></i>
              <div class="file-details">
                <div class="file-name">${fileName}</div>
                <div class="file-path">${formatPathWithIcon(path, true)}</div>
                <div class="file-status"><i class="fa fa-check-circle text-green"></i> Ready for extraction</div>
              </div>
            </div>
          `;
          extractFileInfo.classList.remove('hidden');
          extractArchiveBtn.disabled = false;
          
          // Set up extract button handler for browsed file
          extractArchiveBtn.onclick = async () => {
            await extractArchive(selectedExtractFilePath);
          };
        }
      }
      // In destination select mode, do not select dir on click, only navigate (handled in renderServerFileList)
    };
  }

  // Copy archive button logic
  if (copyArchiveBtn) {
    const copyProgressContainer = document.getElementById('copy-progress-container');
    const copyProgressBar = document.getElementById('copy-progress-bar');
    const copyProgressText = document.getElementById('copy-progress-text');
    const copyProgressCount = document.getElementById('copy-progress-count');
    copyArchiveBtn.onclick = async () => {
      if (!selectedArchivePath || !selectedDestPath) return;
      copyArchiveBtn.disabled = true;
      log(`Copying archive <span class="text-blue">${selectedArchivePath}</span> to <span class="text-blue">${selectedDestPath}</span> ...`);
      // Show progress bar
      copyProgressContainer.classList.remove('hidden');
      copyProgressBar.style.width = '0%';
      copyProgressText.textContent = 'Preparing copy...';
      copyProgressCount.textContent = '';
      try {
        // Check if pv is available
        let pvAvailable = false;
        try {
          await runCommand(['which', 'pv']);
          pvAvailable = true;
        } catch {}
        const destFile = selectedDestPath.replace(/\/+$/, '') + '/' + selectedArchivePath.split('/').pop();
        if (pvAvailable) {
          // Get file size (in bytes)
          let fileSize = 0;
          try {
            const { stdout } = await runCommand(['stat', '-c', '%s', selectedArchivePath]);
            fileSize = parseInt(stdout.trim(), 10);
          } catch {}
          copyProgressText.textContent = 'Copying...';
          // Use cockpit.spawn directly for streaming
          const process = cockpit.spawn(['pv', '-n', selectedArchivePath], { superuser: 'require', err: 'message' });
          let copied = 0;
          process.stream(data => {
            // pv -n outputs bytes copied as a number per line
            const lines = data.split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
              const val = parseInt(line.trim(), 10);
              if (!isNaN(val) && fileSize > 0) {
                copied = val;
                const percent = Math.min(100, Math.round((copied / fileSize) * 100));
                copyProgressBar.style.width = percent + '%';
                copyProgressCount.textContent = `${percent}%`;
              }
            }
          });
          // Pipe pv output to destination file
          await new Promise((resolve, reject) => {
            const destProc = cockpit.spawn(['sh', '-c', `pv -n '${selectedArchivePath.replace(/'/g, "'\\''")}' > '${destFile.replace(/'/g, "'\\''")}'`], { superuser: 'require', err: 'message' });
            destProc.stream(data => {
              const lines = data.split(/\r?\n/).filter(Boolean);
              for (const line of lines) {
                const val = parseInt(line.trim(), 10);
                if (!isNaN(val) && fileSize > 0) {
                  const percent = Math.min(100, Math.round((val / fileSize) * 100));
                  copyProgressBar.style.width = percent + '%';
                  copyProgressCount.textContent = `${percent}%`;
                }
              }
            });
            destProc.then(resolve).catch(reject);
          });
          copyProgressBar.style.width = '100%';
          copyProgressCount.textContent = '100%';
        } else {
          // Fallback: cp without progress
          copyProgressText.textContent = 'Copying (no progress info)...';
          await runCommand(['cp', '-f', selectedArchivePath, destFile], { superuser: true });
          copyProgressBar.style.width = '100%';
          copyProgressCount.textContent = '100%';
        }
        log(`<span class="text-green">Archive copied successfully.</span>`);
        
        // Update extract section after successful copy
        if (extractFileInfo && extractArchiveBtn) {
          const fileName = selectedArchivePath.split('/').pop();
          
          // Update the browsed file path to show the copied file
          selectedExtractFilePath = destFile;
          browsedExtractFilePathSpan.innerHTML = formatPathWithIcon(destFile, true);
          
          // Update extract file info
          extractFileInfo.innerHTML = `
            <div class="file-info-item">
              <i class="fa fa-file-archive text-blue"></i>
              <div class="file-details">
                <div class="file-name">${fileName}</div>
                <div class="file-path">Copied to: ${formatPathWithIcon(selectedDestPath)}</div>
                <div class="file-status"><i class="fa fa-check-circle text-green"></i> Ready for extraction</div>
              </div>
            </div>
          `;
          extractFileInfo.classList.remove('hidden');
          extractArchiveBtn.disabled = false;
          
          // Set up extract button handler for copied file
          extractArchiveBtn.onclick = async () => {
            await extractArchive(destFile);
          };
        }
        
      } catch (e) {
        log(`<span class="text-red">Failed to copy archive: ${e.message || e}</span>`);
      } finally {
        copyArchiveBtn.disabled = false;
        setTimeout(() => {
          copyProgressContainer.classList.add('hidden');
        }, 1200);
      }
    };
  }

  // Extract archive function with hardcoded destination
  async function extractArchive(archivePath) {
    const EXTRACT_DESTINATION = '/etc/xavs/xavs-images/';
    
    const extractBtn = document.getElementById('extract-archive-btn');
    const extractProgressContainer = document.getElementById('extract-progress-container');
    const extractProgressBar = document.getElementById('extract-progress-bar');
    const extractProgressText = document.getElementById('extract-progress-text');
    const extractProgressCount = document.getElementById('extract-progress-count');
    
    if (!extractBtn || !extractProgressContainer) return;
    
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extracting...';
    
    // Show progress bar
    extractProgressContainer.classList.remove('hidden');
    extractProgressBar.style.width = '0%';
    extractProgressText.textContent = 'Preparing extraction...';
    extractProgressCount.textContent = '';
    
    const fileName = archivePath.split('/').pop();
    log(`Extracting archive <span class="text-blue">${fileName}</span> to <span class="text-blue">${EXTRACT_DESTINATION}</span>...`);
    
    try {
      // Ensure destination directory exists
      await runCommand(['mkdir', '-p', EXTRACT_DESTINATION]);
      
      // Determine the appropriate tar options based on file extension
      const isGzipped = archivePath.toLowerCase().endsWith('.tar.gz');
      const tarOptions = isGzipped ? '-xzf' : '-xf';
      const fileTypeMsg = isGzipped ? 'gzipped tar archive' : 'tar archive';
      
      log(`Detected ${fileTypeMsg}, using tar options: ${tarOptions}`);
      
      // Check if pv is available for progress monitoring
      let pvAvailable = false;
      try {
        await runCommand(['which', 'pv']);
        pvAvailable = true;
      } catch {}
      
      if (pvAvailable) {
        // Get archive size for progress calculation
        let archiveSize = 0;
        try {
          const { stdout } = await runCommand(['stat', '-c', '%s', archivePath]);
          archiveSize = parseInt(stdout.trim(), 10);
        } catch {}
        
        extractProgressText.textContent = 'Extracting with progress...';
        
        // Use pv to monitor extraction progress with appropriate tar options
        const extractCommand = `pv -n '${archivePath.replace(/'/g, "'\\''")}' | tar ${tarOptions} - -C '${EXTRACT_DESTINATION}' --verbose`;
        
        const process = cockpit.spawn(['sh', '-c', extractCommand], { 
          superuser: 'require', 
          err: 'message' 
        });
        
        let lastFile = '';
        process.stream(data => {
          const lines = data.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            
            // pv progress line (numeric percentage)
            const progressMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
            if (progressMatch) {
              const percent = Math.min(100, Math.round(parseFloat(progressMatch[1])));
              extractProgressBar.style.width = percent + '%';
              extractProgressCount.textContent = `${percent}%`;
            }
            
            // Log extracted files (tar verbose output)
            if (trimmed && !progressMatch && (trimmed.includes('/') || trimmed.length > 3)) {
              lastFile = trimmed;
              const shortPath = trimmed.length > 50 ? '...' + trimmed.slice(-47) : trimmed;
              extractProgressText.textContent = `Extracting: ${shortPath}`;
            }
          }
        });
        
        await process;
        
        extractProgressBar.style.width = '100%';
        extractProgressCount.textContent = '100%';
        extractProgressText.textContent = 'Extraction completed!';
        
      } else {
        // Fallback: tar without progress monitoring
        extractProgressText.textContent = 'Extracting (no progress info)...';
        extractProgressBar.style.width = '50%';
        
        const tarProcess = cockpit.spawn([
          'tar', tarOptions, archivePath, '-C', EXTRACT_DESTINATION, '--verbose'
        ], { superuser: 'require', err: 'message' });
        
        // Show some file names being extracted
        tarProcess.stream(data => {
          const lines = data.split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            if (line.trim()) {
              const shortPath = line.length > 50 ? '...' + line.slice(-47) : line;
              extractProgressText.textContent = `Extracting: ${shortPath}`;
            }
          }
        });
        
        await tarProcess;
        
        extractProgressBar.style.width = '100%';
        extractProgressCount.textContent = '100%';
        extractProgressText.textContent = 'Extraction completed!';
      }
      
      log(`<span class="text-green">Archive extracted successfully!</span>`);
      log(`Contents extracted to: <span class="text-blue">${EXTRACT_DESTINATION}</span>`);
      
      // List extracted contents
      try {
        const { stdout } = await runCommand(['ls', '-la', EXTRACT_DESTINATION]);
        log(`\nExtracted contents in ${EXTRACT_DESTINATION}:\n<pre>${stdout}</pre>`);
      } catch (e) {
        log(`\nCould not list extracted contents: ${e.message}`);
      }
      
    } catch (e) {
      log(`<span class="text-red">Failed to extract archive: ${e.message || e}</span>`);
      extractProgressText.textContent = `Error: ${e.message}`;
      extractProgressBar.style.backgroundColor = '#dc2626';
    } finally {
      extractBtn.disabled = false;
      extractBtn.innerHTML = '<i class="fa-solid fa-magic"></i> Extract Archive';
      
      setTimeout(() => {
        extractProgressContainer.classList.add('hidden');
        extractProgressBar.style.backgroundColor = '';
      }, 3000);
    }
  }

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

  // ---- USB Device Management ----
  async function detectUSBDevices() {
    const usbList = $('usb-devices-list');
    const noDevicesMsg = $('no-usb-devices');
    
    if (!usbList) return; // Element not found, exit gracefully
    
    usbList.innerHTML = '<div class="loading-state">Scanning for USB devices...</div>';
    if (noDevicesMsg) noDevicesMsg.style.display = 'none';
    
    try {
      log('🔍 Scanning for USB storage devices...\n');
      
      // Get device information using lsblk in JSON format
      // TRAN=usb filters for USB devices only
      const { stdout } = await runCommand([
        'lsblk', '-J', '-o', 'NAME,SIZE,TRAN,FSTYPE,MOUNTPOINT,LABEL,MODEL'
      ]);
      
      // Parse the JSON response
      const deviceData = JSON.parse(stdout);
      
      // Filter for USB devices only (TRAN=usb)
      const usbDevices = [];
      
      // Process and flatten device tree to find all USB-connected block devices
      function processDevices(devices, isUSB = false) {
        if (!devices) return;
        
        devices.forEach(device => {
          // Check if this is a USB device or descended from one
          const deviceIsUSB = isUSB || device.tran === 'usb';
          
          // If it's a USB device with a filesystem, add it to our list
          if (deviceIsUSB && device.fstype && !device.name.startsWith('loop')) {
            usbDevices.push({
              name: device.name,
              path: `/dev/${device.name}`,
              size: device.size,
              fstype: device.fstype,
              mountpoint: device.mountpoint || null,
              label: device.label || device.name,
              model: device.model || 'USB Storage Device'
            });
          }
          
          // Recursively process children with the USB flag
          if (device.children) {
            processDevices(device.children, deviceIsUSB);
          }
        });
      }
      
      processDevices(deviceData.blockdevices);
      
      // Update UI based on results
      if (usbDevices.length === 0) {
        usbList.innerHTML = '';
        if (noDevicesMsg) noDevicesMsg.style.display = 'block';
        log('No USB storage devices detected\n');
      } else {
        if (noDevicesMsg) noDevicesMsg.style.display = 'none';
        usbList.innerHTML = '';
        
        log(`Found ${usbDevices.length} USB storage devices:\n`);
        
        usbDevices.forEach(device => {
          const isMounted = !!device.mountpoint;
          const mountStatus = isMounted ? 
            `<span class="usb-device-status status-mounted">Mounted at ${device.mountpoint}</span>` : 
            '<span class="usb-device-status status-unmounted">Not mounted</span>';
          
          const deviceDiv = document.createElement('div');
          deviceDiv.className = 'usb-device-item';
          deviceDiv.innerHTML = `
            <div class="usb-device-info">
              <div class="usb-device-name">
                <i class="fab fa-usb"></i> ${device.label || device.name}
              </div>
              <div class="usb-device-details">
                ${device.path} • ${device.size} • ${device.fstype || 'Unknown filesystem'}
                ${mountStatus}
              </div>
            </div>
            <div class="usb-device-actions">
              ${isMounted ? `
                <button class="btn btn-sm btn-outline-primary browse-device" 
                  data-path="${device.mountpoint}" title="Browse files">
                  <i class="fa-solid fa-folder-open"></i> Browse
                </button>
                <button class="btn btn-sm btn-outline-secondary unmount-device" 
                  data-device="${device.path}" title="Unmount device">
                  <i class="fa-solid fa-eject"></i> Unmount
                </button>
              ` : `
                <button class="btn btn-sm btn-primary mount-device" 
                  data-device="${device.path}" data-fstype="${device.fstype}" title="Mount device">
                  <i class="fa-solid fa-plug"></i> Mount
                </button>
              `}
            </div>
          `;
          usbList.appendChild(deviceDiv);
          
          log(`• ${device.name} (${device.size}, ${device.fstype}): ${isMounted ? 'Mounted at ' + device.mountpoint : 'Not mounted'}\n`);
        });
        
        // Add event listeners to the buttons
        document.querySelectorAll('.mount-device').forEach(btn => {
          btn.addEventListener('click', () => mountUSBDevice(btn.dataset.device, btn.dataset.fstype));
        });
        
        document.querySelectorAll('.unmount-device').forEach(btn => {
          btn.addEventListener('click', () => unmountUSBDevice(btn.dataset.device));
        });
        
        document.querySelectorAll('.browse-device').forEach(btn => {
          btn.addEventListener('click', () => openServerFileModal(btn.dataset.path));
        });
      }
      
    } catch (error) {
      usbList.innerHTML = `<div class="error-state">Error scanning for USB devices: ${error.message}</div>`;
      log(`Error detecting USB devices: ${error.message}\n`);
      console.error('USB device detection error:', error);
    }
  }

  async function mountUSBDevice(devicePath, fstype) {
    try {
      log(`🔌 Mounting USB device ${devicePath}...\n`);
      
      // Create mount point directory if it doesn't exist
      // Using a consistent naming scheme based on device name
      const deviceName = devicePath.split('/').pop();
      const mountPoint = `/mnt/usb-${deviceName}`;
      
      // Create mount directory
      await runCommand(['mkdir', '-p', mountPoint]);
      log(`Created mount point: ${mountPoint}\n`);
      
      // Build mount options based on filesystem type
      let mountOptions = [];
      
      if (fstype === 'ntfs') {
        // For NTFS, use ntfs-3g if available
        try {
          await runCommand(['which', 'ntfs-3g']);
          // If we get here, ntfs-3g is available
          mountOptions = ['-t', 'ntfs-3g', '-o', 'uid=1000,gid=1000,dmask=027,fmask=137'];
        } catch {
          // Fall back to regular mount
          mountOptions = ['-t', 'ntfs', '-o', 'uid=1000,gid=1000'];
        }
      } else if (fstype === 'vfat' || fstype === 'fat' || fstype === 'exfat') {
        // FAT/exFAT options for better permissions
        mountOptions = ['-o', 'uid=1000,gid=1000,dmask=027,fmask=137'];
      }
      
      // Mount the device
      await runCommand(['mount', ...mountOptions, devicePath, mountPoint]);
      log(`✅ Device mounted successfully at ${mountPoint}\n`);
      
      // Refresh the device list after a short delay
      setTimeout(detectUSBDevices, 500);
      
    } catch (error) {
      log(`❌ Failed to mount device: ${error.message}\n`);
      
      // Show user-friendly error dialog
      alert(`Failed to mount USB device: ${error.message}`);
    }
  }

  async function unmountUSBDevice(devicePath) {
    try {
      log(`📤 Unmounting USB device ${devicePath}...\n`);
      
      // Unmount the device
      await runCommand(['umount', devicePath]);
      log(`✅ Device unmounted successfully\n`);
      
      // Refresh the device list after a short delay
      setTimeout(detectUSBDevices, 500);
      
    } catch (error) {
      log(`❌ Failed to unmount device: ${error.message}\n`);
      
      if (error.message.includes('target is busy')) {
        log(`💡 Device is busy. Make sure no files are open on the device.\n`);
        alert('Cannot unmount device: Device is busy. Close any open files or programs using this device.');
      } else {
        alert(`Failed to unmount USB device: ${error.message}`);
      }
    }
  }

  // Initialize USB device detection
  function initUSBDevices() {
    detectUSBDevices();
    
    // Add refresh button handler
    const refreshBtn = $('refresh-usb-devices');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', detectUSBDevices);
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
        stopLocalImagesAutoRefresh(); // Stop auto-refresh when leaving extract tab
      }
      if (link.dataset.tab === 'tab-catalog') {
        refreshCatalog();
        stopLocalImagesAutoRefresh(); // Stop auto-refresh when leaving extract tab
      }
      if (link.dataset.tab === 'tab-extract') {
        loadCurrentImagesList();
        loadLocalDockerImages();
        countImagesList();
        startLocalImagesAutoRefresh(); // Start auto-refresh for local images
        // Initialize USB device detection with a small delay to ensure DOM is ready
        setTimeout(initUSBDevices, 100);
      }
    });
  });

  // ---- Images List Management ----
  async function loadCurrentImagesList() {
    const listElement = $('current-images-list');
    const countElement = $('current-images-count');
    
    listElement.innerHTML = '<li class="loading-state">Loading images...</li>';
    countElement.textContent = '(Loading...)';
    
    try {
      // Use the simplified image list loading (only /etc/xavs/images.list)
      const imagesList = await getImagesList();
      
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
      
      countElement.textContent = `(${images.length} images)`;
      listElement.innerHTML = '';
      
      images.forEach((image, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="image-name">${image}</span>
        `;
        listElement.appendChild(li);
      });
      
    } catch (e) {
      if (e.message.includes('Images list file not found')) {
        listElement.innerHTML = `
          <li class="error-state">
            <div class="error-title">❌ Images configuration missing</div>
            <div class="error-details">Images configuration file not found</div>
            <div class="error-hint">Create the configuration file with image names (one per line)<br>
            <small>Example: keystone, nova-api, neutron-server<br>
            Tag :2024.1-ubuntu-jammy will be auto-added</small></div>
          </li>`;
        countElement.textContent = '(Missing config)';
      } else {
        listElement.innerHTML = `<li class="error-state">Error loading images: ${e.message}</li>`;
        countElement.textContent = '(Error)';
      }
    }
  }

  // ---- Auto-refresh functionality for local images ----
  function startLocalImagesAutoRefresh(interval = AUTO_REFRESH_INTERVAL) {
    // Stop any existing interval
    stopLocalImagesAutoRefresh();
    
    isAutoRefreshActive = true;
    localImagesRefreshInterval = setInterval(async () => {
      if (isAutoRefreshActive) {
        try {
          await loadLocalDockerImages();
        } catch (e) {
          console.warn('Auto-refresh failed:', e.message);
        }
      }
    }, interval);
    
    console.log(`Local images auto-refresh started (${interval}ms interval)`);
  }

  function stopLocalImagesAutoRefresh() {
    if (localImagesRefreshInterval) {
      clearInterval(localImagesRefreshInterval);
      localImagesRefreshInterval = null;
    }
    isAutoRefreshActive = false;
    console.log('Local images auto-refresh stopped');
  }

  // ---- Local Docker Images Management ----
  async function loadLocalDockerImages() {
    const listElement = $('local-images-list');
    const countElement = $('local-images-count');
    
    listElement.innerHTML = '<li class="loading-state">Loading Docker images...</li>';
    countElement.textContent = '(Loading...)';
    
    try {
      // Get all Docker images with their details
      const { stdout } = await runCommand([
        'docker', 'images', 
        '--format', '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}'
      ]);
      
      if (!stdout || stdout.trim() === '') {
        listElement.innerHTML = '<li class="empty-state">No Docker images found</li>';
        countElement.textContent = '(0 images)';
        return;
      }
      
      const lines = stdout.trim().split('\n');
      // Filter out empty lines
      const imageLines = lines.filter(line => line.trim());
      
      if (imageLines.length === 0) {
        listElement.innerHTML = '<li class="empty-state">No Docker images found</li>';
        countElement.textContent = '(0 images)';
        return;
      }
      
      countElement.textContent = `(${imageLines.length} images)`;
      listElement.innerHTML = '';
      
      imageLines.forEach((line, index) => {
        const [repoTag, imageId, size, createdAt] = line.split('\t');
        
        // Skip if any required field is missing
        if (!repoTag || !imageId) return;
        
        const li = document.createElement('li');
        li.className = 'local-image-item';
        li.innerHTML = `
          <div class="image-info">
            <div class="image-name">${repoTag}</div>
            <div class="image-details">
              <span class="image-id">ID: ${imageId.substring(0, 12)}</span>
              <span class="image-size">Size: ${size || 'Unknown'}</span>
              <span class="image-created">Created: ${createdAt ? createdAt.substring(0, 19) : 'Unknown'}</span>
            </div>
          </div>
          <div class="image-actions">
            <button class="btn-icon inspect" data-action="inspect-local" data-image-id="${imageId}" title="Inspect Image">
              <i class="fa-solid fa-info"></i>
            </button>
            <button class="btn-icon delete" data-action="delete-local" data-image-id="${imageId}" data-image-name="${repoTag}" title="Delete Image">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;
        listElement.appendChild(li);
      });
      
    } catch (e) {
      listElement.innerHTML = `<li class="error-state">Error loading images: ${e.message}</li>`;
      countElement.textContent = '(Error)';
      log(`Error loading local Docker images: ${e.message}`);
    }
    
    // Update push button state after loading images
    await updatePushButtonState();
  }

  // Delete specific local Docker image
  window.deleteLocalImage = async function(imageId, imageName) {
    if (!confirm(`Delete Docker image "${imageName}"?\n\nThis will permanently remove the image from your system.`)) return;
    
    try {
      log(`Deleting Docker image: ${imageName}`);
      await runCommand(['docker', 'rmi', '-f', imageId]);
      log(`Successfully deleted Docker image: ${imageName}`);
      
      // Refresh the local images list
      await loadLocalDockerImages();
      
    } catch (e) {
      log(`Error deleting Docker image: ${e.message}`);
    }
  }

  // Inspect local Docker image
  window.inspectLocalImage = async function(imageId) {
    try {
      log(`Inspecting Docker image: ${imageId}`);
      const { stdout } = await runCommand(['docker', 'inspect', imageId]);
      const imageData = JSON.parse(stdout)[0];
      
      // Show basic image information
      const info = `Image: ${imageData.RepoTags ? imageData.RepoTags.join(', ') : 'No tags'}
ID: ${imageData.Id}
Created: ${imageData.Created}
Size: ${(imageData.Size / (1024 * 1024)).toFixed(2)} MB
Architecture: ${imageData.Architecture}
OS: ${imageData.Os}`;
      
      alert(`Docker Image Details:\n\n${info}`);
      log(`Image inspection completed for: ${imageId}`);
      
    } catch (e) {
      log(`Error inspecting Docker image: ${e.message}`);
      alert(`Failed to inspect image: ${e.message}`);
    }
  }

  // Helper function for safe event listener binding
  const safeAddEventListener = (id, event, handler) => {
    const element = $(id);
    if (element) {
      element.addEventListener(event, handler);
    } else {
      console.warn(`Element with id '${id}' not found for event listener`);
    }
  };

  // Event listeners for local Docker images management
  safeAddEventListener('refresh-local-images-btn', 'click', async () => {
    await loadLocalDockerImages();
    log('🔄 Local Docker images refreshed manually\n');
  });

  // Cleanup auto-refresh on page unload
  window.addEventListener('beforeunload', () => {
    stopLocalImagesAutoRefresh();
  });

  // Also stop auto-refresh if user navigates away from extract tab
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLocalImagesAutoRefresh();
    } else if (document.querySelector('[data-tab="tab-extract"]').classList.contains('active')) {
      startLocalImagesAutoRefresh();
    }
  });

  // Event delegation for dynamically created buttons
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const button = e.target.closest('[data-action]');
    
    switch (action) {
      case 'inspect-local':
        const inspectImageId = button.dataset.imageId;
        inspectLocalImage(inspectImageId);
        break;
        
      case 'delete-local':
        const deleteImageId = button.dataset.imageId;
        const deleteImageName = button.dataset.imageName;
        deleteLocalImage(deleteImageId, deleteImageName);
        break;
        
      case 'inspect-catalog':
        const repoName = button.dataset.repo;
        inspectImage(repoName);
        break;
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
        // Show USB section only in Extract mode
        if ($('usb-devices-section')) {
          $('usb-devices-section').style.display = '';
        }
      } else {
        $('extract-block').classList.add('pull-block-hidden');
        $('pull-block').classList.remove('pull-block-hidden');
        // Hide USB section in Pull mode
        if ($('usb-devices-section')) {
          $('usb-devices-section').style.display = 'none';
        }
      }
      log('Ready.');
    });
  });

  // ---- Constants ----
  const IMAGE_LIST_PATH = '/etc/xavs/images.list';
  const DOCKER_DAEMON_JSON = '/etc/docker/daemon.json';
  const PUBLIC_REG = 'quay.io';
  const LOCAL_REG_HOST = 'docker-registry:4000';
  const REGISTRY_CONTAINER_NAME = 'docker-registry';

  // Cache for images list to reduce repeated file reads
  let imageListCache = null;
  let imageListCacheTime = 0;
  let imageListLoading = false; // Prevent multiple simultaneous loads
  const CACHE_TTL = 5000; // 5 seconds cache

  // ---- Helper to get images list from /etc/xavs/images.list ----
  async function getImagesList() {
    // Return cached result if still valid
    const now = Date.now();
    if (imageListCache && (now - imageListCacheTime) < CACHE_TTL) {
      return imageListCache;
    }

    // If already loading, wait for the existing load to complete
    if (imageListLoading) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!imageListLoading) {
            clearInterval(checkInterval);
            resolve(imageListCache);
          }
        }, 100);
      });
    }

    imageListLoading = true;

    try {
      const imagePath = '/etc/xavs/images.list';
      
      try {
        const content = await readFile(imagePath);
        if (content && content.trim()) {
          // Cache the result
          imageListCache = content.trim();
          imageListCacheTime = now;
          return imageListCache;
        } else {
          throw new Error('File is empty');
        }
      } catch (error) {
        // Prompt user about missing file
        const errorMessage = `Images list file not found. Please create the images configuration file with one image per line.\nExample content:\nkeystone\nnova-api\nneutron-server\n(Tags will be auto-added as :2024.1-ubuntu-jammy)`;
        log(`❌ ERROR: ${errorMessage}`);
        throw new Error(errorMessage);
      }
    } finally {
      imageListLoading = false;
    }
  }

  // Global variable to track current pull process
  let currentPullProcess = null;
  let isPulling = false;

  // Auto-refresh variables for local images
  let localImagesRefreshInterval = null;
  let isAutoRefreshActive = false;
  const AUTO_REFRESH_INTERVAL = 60000; // 1 minute (60 seconds)
  const PULL_REFRESH_INTERVAL = 30000; // 30 seconds during pull operations

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
  // Removed obsolete extract-btn event listener and logic (now handled by new copy/archive flow)

  // Test connectivity button
  $('test-connectivity-btn').addEventListener('click', async () => {
  log('<i class="fa-solid fa-flask text-blue"></i> CONNECTIVITY & PREREQUISITES TEST\n');
    log('================================================================\n\n');
    
    const testResults = {
      docker: { status: 'pending', details: '' },
      network: { status: 'pending', details: '' },
      dockerPull: { status: 'pending', details: '' },
      hostsFile: { status: 'pending', details: '' },
      xavsRegistry: { status: 'pending', details: '' }
    };
    
    // Test 1: Docker daemon
    log('� TEST 1: Docker Daemon Status\n');
    log('-----------------------------------\n');
    try {
      const result = await runCommand(['docker', 'version']);
      const dockerVersion = result.stdout.split('\n')[0];
      testResults.docker = { status: 'pass', details: dockerVersion };
  log('<i class="fa-solid fa-check text-green"></i> PASS: Docker daemon is running and accessible\n');
      log(`    Version: ${dockerVersion}\n\n`);
    } catch (e) {
      testResults.docker = { status: 'fail', details: e.message };
  log('<i class="fa-solid fa-times text-red"></i> FAIL: Docker daemon is not running or not accessible\n');
  log(`   <i class="fa-solid fa-exclamation-triangle text-yellow"></i> Error: ${e.message}\n`);
  log('   <i class="fa-solid fa-lightbulb text-blue"></i> Solution: Start Docker Desktop or run "systemctl start docker"\n\n');
      
      // If Docker fails, show summary and exit
      showTestSummary(testResults);
      return;
    }

    // Test 2: Network connectivity
    log(' TEST 2: Internet & Registry Connectivity\n');
    log('-----------------------------------────────────\n');
    try {
      log('    Testing internet connectivity (Google DNS)...\n');
      await runCommand(['ping', '-c', '1', '8.8.8.8'], { timeout: 10000 });
      log('    Internet connectivity confirmed\n');
      
      log('    Testing registry connectivity (quay.io via nslookup)...\n');
      await runCommand(['nslookup', 'quay.io'], { timeout: 10000 });
      testResults.network = { status: 'pass', details: 'Internet and registry DNS resolved' };
      log('<i class="fas fa-check text-green"></i> PASS: Internet connectivity and registry DNS resolution working\n');
      log('   � Can reach Google DNS and resolve quay.io hostname\n\n');
    } catch (e) {
      // Try alternative connectivity tests
      try {
        log('    Fallback: Testing with curl to Google...\n');
        await runCommand(['curl', '-s', '--connect-timeout', '5', '--max-time', '10', 'http://google.com'], { timeout: 15000 });
        testResults.network = { status: 'pass', details: 'Internet reachable via HTTP' };
        log('<i class="fas fa-check text-green"></i> PASS: Internet connectivity confirmed via HTTP\n');
        log('   � Alternative connectivity test successful\n\n');
      } catch (e2) {
        testResults.network = { status: 'fail', details: `Ping failed: ${e.message}, HTTP failed: ${e2.message}` };
        log(' FAIL: Cannot establish internet connectivity\n');
        log(`    Ping error: ${e.message}\n`);
        log(`    HTTP error: ${e2.message}\n`);
        log('    Solution: Check internet connection, DNS settings, and firewall\n\n');
      }
    }

    // Test 3: Docker pull functionality
    log(' TEST 3: Docker Pull Functionality\n');
    log('-----------------------------------────\n');
    try {
      log('    Testing with hello-world image...\n');
      await runCommand(['docker', 'pull', 'hello-world:latest']);
      testResults.dockerPull = { status: 'pass', details: 'hello-world pulled successfully' };
      log(' PASS: Docker pull functionality works\n');
      log('    Successfully pulled test image\n');
      
      // Clean up test image
      try {
        log('   � Cleaning up test image...\n');
        await runCommand(['docker', 'rmi', 'hello-world:latest']);
        log('    Test image removed\n\n');
      } catch (e) {
        log('    Test image cleanup skipped\n\n');
      }
    } catch (e) {
      testResults.dockerPull = { status: 'fail', details: e.message };
      log(' FAIL: Docker pull test failed\n');
      log(`    Error: ${e.message}\n`);
      log('    Solution: Check Docker daemon and registry access\n\n');
    }

    // Test 4: /etc/hosts validation
    log(' TEST 4: Local Registry Hostname Resolution\n');
    log('-----------------------------------──────────────\n');
    try {
      const hostsContent = await readFile('/etc/hosts');
      if (hostsContent.includes('docker-registry')) {
        testResults.hostsFile = { status: 'pass', details: 'docker-registry entry exists' };
        log(' PASS: docker-registry entry found in /etc/hosts\n');
        log('    Local registry hostname will resolve correctly\n\n');
      } else {
        testResults.hostsFile = { status: 'warning', details: 'docker-registry entry missing' };
        log(' WARNING: docker-registry entry NOT found in /etc/hosts\n');
        log('   � Impact: "docker-registry:4000" may not be resolvable\n');
        log('    Solution: Click "Run Registry" to add the entry automatically\n\n');
      }
    } catch (e) {
      testResults.hostsFile = { status: 'fail', details: e.message };
      log(' FAIL: Could not read /etc/hosts\n');
      log(`    Error: ${e.message}\n`);
      log('    Solution: Check file permissions\n\n');
    }

    // Test 5: xAVS registry validation
    log('� TEST 5: xAVS Registry & Image Availability\n');
    log('-----------------------------------─────────────\n');
    try {
      log('    Checking keystone image manifest...\n');
      await runCommand(['docker', 'manifest', 'inspect', 'quay.io/xavs.images/keystone:2024.1-ubuntu-jammy']);
      testResults.xavsRegistry = { status: 'pass', details: 'keystone manifest accessible' };
      log(' PASS: xAVS registry is accessible\n');
      log('    Image manifests are available\n');
      log('    Images can be pulled successfully\n\n');
    } catch (e) {
      testResults.xavsRegistry = { status: 'fail', details: e.message };
      log('❌ FAIL: Could not access xAVS image manifests\n');
      log(`🔍 Error: ${e.message}\n`);
      
      const errorLower = e.message.toLowerCase();
      
      if (errorLower.includes('manifest unknown') || errorLower.includes('not found') || errorLower.includes('repository does not exist')) {
        log('📋 DIAGNOSIS: The test image does not exist in the registry\n');
        log('🔗 Verify at: https://quay.io/repository/xavs.images/keystone\n');
        log('💡 This could mean:\n');
        log('   • The xAVS images repository is not set up correctly\n');
        log('   • The test image name/tag has changed\n');
        log('   • Repository has been moved or removed\n');
      } else if (errorLower.includes('unauthorized') || errorLower.includes('authentication') || errorLower.includes('access denied')) {
        log('🔐 DIAGNOSIS: Authentication required for private images\n');
        log('🔑 Solution: Run "docker login quay.io" with valid credentials\n');
        log('ℹ️  Note: Some xAVS images may require authentication\n');
      } else if (errorLower.includes('connection') || errorLower.includes('network') || errorLower.includes('dial tcp')) {
        log('🌐 DIAGNOSIS: Network connectivity issue\n');
        log('🔧 Troubleshooting:\n');
        log('   • Check internet connection\n');
        log('   • Verify firewall allows access to quay.io\n');
        log('   • Test basic connectivity: ping quay.io\n');
      } else if (errorLower.includes('timeout') || errorLower.includes('deadline exceeded')) {
        log('⏱️ DIAGNOSIS: Request timeout\n');
        log('🔄 Registry may be temporarily slow - try again later\n');
      } else {
        log('❓ DIAGNOSIS: Unexpected registry issue\n');
        log('🔧 Possible causes:\n');
        log('   • Temporary registry outage\n');
        log('   • Docker daemon issues\n');
        log('   • DNS resolution problems\n');
        log('💡 Try restarting Docker or check registry status\n');
      }
      log('\n');
    }

    // Show comprehensive summary
    showTestSummary(testResults);
  });

  // Function to display test summary
  function showTestSummary(results) {
    log(' TEST RESULTS SUMMARY\n');
    log('================================================================\n');
    
    const tests = [
      { name: 'Docker Daemon', key: 'docker', icon: '�' },
      { name: 'Network Connectivity', key: 'network', icon: '' },
      { name: 'Docker Pull Function', key: 'dockerPull', icon: '' },
      { name: 'Hosts File Setup', key: 'hostsFile', icon: '' },
      { name: 'xAVS Registry Access', key: 'xavsRegistry', icon: '�' }
    ];
    
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;
    
    tests.forEach(test => {
      const result = results[test.key];
      let statusIcon, statusText;
      
      switch (result.status) {
        case 'pass':
          statusIcon = '';
          statusText = 'PASS';
          passCount++;
          break;
        case 'warning':
          statusIcon = '';
          statusText = 'WARN';
          warnCount++;
          break;
        case 'fail':
          statusIcon = '';
          statusText = 'FAIL';
          failCount++;
          break;
        default:
          statusIcon = '⏳';
          statusText = 'SKIP';
      }
      
      log(`${test.icon} ${test.name.padEnd(25)} ${statusIcon} ${statusText}\n`);
    });
    
    log('\n');
    log(` OVERALL STATUS: ${passCount} passed, ${warnCount} warnings, ${failCount} failed\n`);
    
    if (failCount === 0 && warnCount === 0) {
      log('� EXCELLENT: All tests passed! Ready to pull images.\n');
    } else if (failCount === 0) {
      log(' GOOD: Core functionality working. Warnings can be ignored or fixed.\n');
    } else if (failCount === 1 && results.hostsFile.status === 'fail') {
      log(' MINOR ISSUE: Only hosts file issue detected. Use "Run Registry" to fix.\n');
    } else {
      log(' ISSUES DETECTED: Please resolve the failed tests before pulling images.\n');
    }
    
    log('-----------------------------------────────────────────────────────\n');
    log(' TIP: If tests pass, the "Pull Images" operation should work smoothly!\n');
    log(' Connectivity test completed!\n');
  }

  $('pull-btn').addEventListener('click', async () => {
    if (isPulling) {
      // Cancel current operation
      log('Stopping pull operation...\n');
      isPulling = false;
      $('pull-btn').textContent = 'Pull Images';
      $('pull-btn').className = 'btn btn-primary';
      
      // Hide progress bar
      $('pull-progress-container').classList.add('hidden');
      
      log('Pull operation stopped. You may need to wait for the current image pull to complete.\n');
      return;
    }

    log('📋 Checking prerequisites...\n');
    isPulling = true;
    $('pull-btn').textContent = 'Stop Pull';
    $('pull-btn').className = 'btn btn-danger';
    
    // Start faster auto-refresh during pull operation
    startLocalImagesAutoRefresh(PULL_REFRESH_INTERVAL);
    
    // Show and initialize progress bar
    const progressContainer = $('pull-progress-container');
    const progressBar = $('pull-progress-bar');
    const progressText = $('pull-progress-text');
    const progressCount = $('pull-progress-count');
    
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = 'Checking prerequisites...';
    progressCount.textContent = '0/0';
    
    try {
      // Check if Docker is running
      log('Checking Docker daemon...\n');
      progressText.textContent = 'Checking Docker daemon...';
      try {
        await runCommand(['docker', 'version']);
        log(' Docker daemon is running\n');
      } catch (e) {
        throw new Error('Docker daemon is not running. Please start Docker first.');
      }

      // Check registry connectivity
      log('Testing registry connectivity...\n');
      progressText.textContent = 'Testing registry connectivity...';
      try {
        await runCommand(['docker', 'pull', '--help'], { timeout: 5000 });
        log(' Docker pull command is available\n');
      } catch (e) {
        log(' Docker pull command test failed, but continuing...\n');
      }

    log('📖 Reading images list...\n');
      progressText.textContent = 'Reading images list...';
      
      let imagesList;
      try {
        // Use the simplified image list loading (only /etc/xavs/images.list)
        imagesList = await getImagesList();
      } catch (e) {
        // Show user-friendly error for missing images list file
        log('❌ IMAGES LIST FILE MISSING\n');
        log('================================================================\n');
        log('❗ The images configuration file is required and must contain one image per line.\n\n');
        log('📝 Example content for the images list:\n');
        log('   keystone\n');
        log('   nova-api\n');
        log('   neutron-server\n');
        log('   glance-api\n');
        log('   horizon\n\n');
        log('ℹ️  Note: The :2024.1-ubuntu-jammy tag will be automatically added\n');
        log('💡 Solution: Create the images configuration file with the required images\n');
        log('================================================================\n');
        
        progressText.textContent = 'Error: Images list file missing';
        progressBar.style.backgroundColor = '#dc2626'; // Red color for error
        progressBar.style.width = '100%';
        
        // Hide progress bar after delay
        setTimeout(() => {
          progressContainer.classList.add('hidden');
          progressBar.style.backgroundColor = ''; // Reset color
        }, 5000);
        
        return;
      }
      
      // Parse and pull images
      const images = imagesList && imagesList.trim() ? 
        imagesList.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')) : [];
      
      if (images.length === 0) {
        log('❌ No images found in the images configuration file\n');
        log('📝 Please add images to the configuration file (one per line)\n');
        
        progressText.textContent = 'Error: No images configured';
        progressBar.style.backgroundColor = '#dc2626'; // Red color for error
        progressBar.style.width = '100%';
        
        // Hide progress bar after delay
        setTimeout(() => {
          progressContainer.classList.add('hidden');
          progressBar.style.backgroundColor = ''; // Reset color
        }, 3000);
        
        return;
      }
      
      log(`Found ${images.length} images to pull\n\n`);
      
      // Initialize progress
      progressText.textContent = 'Starting image pulls...';
      progressCount.textContent = `0/${images.length}`;
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < images.length; i++) {
        if (!isPulling) {
          log('\n🛑 Pull operation was stopped by user.\n');
          break;
        }
        
        let image = images[i];
        
        // Auto-append :2024.1-ubuntu-jammy tag if no tag is specified
        if (!image.includes(':')) {
          image = `${image}:2024.1-ubuntu-jammy`;
          log(`📝 Auto-appending tag: ${images[i]} → ${image}\n`);
        }
        
        const ref = `${PUBLIC_REG}/xavs.images/${image}`;
        
        // Update progress
        const currentProgress = ((i) / images.length) * 100;
        progressBar.style.width = `${currentProgress}%`;
        progressText.textContent = `Pulling ${image}...`;
        progressCount.textContent = `${i}/${images.length}`;
        
        log(`🐳 [${i + 1}/${images.length}] Pulling ${image}...\n`);
        log(`📍 Full reference: ${ref}\n`);
        
        try {
          await runCommand(['docker', 'pull', ref]);
          successCount++;
          log(`✅ [${i + 1}/${images.length}] Successfully pulled ${image}\n\n`);
        } catch (error) {
          failCount++;
          log(`❌ [${i + 1}/${images.length}] Failed to pull ${image}\n`);
          log(`🔍 Error details: ${error.message}\n`);
          
          // Provide specific error diagnostics based on error type
          const errorLower = error.message.toLowerCase();
          
          if (errorLower.includes('manifest unknown') || errorLower.includes('not found') || errorLower.includes('repository does not exist')) {
            log(`� IMAGE NOT FOUND: The image "${image}" does not exist in the registry.\n`);
            log(`🔗 Check if the image exists: https://quay.io/repository/xavs.images/${image.split(':')[0]}\n`);
            log(`💡 Possible causes:\n`);
            log(`   • Image name or tag is incorrect\n`);
            log(`   • Image has been removed or relocated\n`);
            log(`   • Typo in the image list file\n`);
          } else if (errorLower.includes('unauthorized') || errorLower.includes('authentication') || errorLower.includes('access denied')) {
            log(`🔐 AUTHENTICATION REQUIRED: Access to this image requires login.\n`);
            log(`🔑 Solution: Run "docker login quay.io" with valid credentials\n`);
            log(`ℹ️  Some images may be private and require authentication\n`);
          } else if (errorLower.includes('connection') || errorLower.includes('network') || errorLower.includes('dial tcp')) {
            log(`🌐 NETWORK ISSUE: Cannot connect to the registry.\n`);
            log(`🔧 Troubleshooting:\n`);
            log(`   • Check internet connection\n`);
            log(`   • Verify firewall/proxy settings\n`);
            log(`   • Test: ping quay.io\n`);
          } else if (errorLower.includes('timeout') || errorLower.includes('deadline exceeded')) {
            log(`⏱️ TIMEOUT: Request timed out while pulling the image.\n`);
            log(`🔄 This may be temporary - try again later\n`);
            log(`💡 Large images may take longer to download\n`);
          } else if (errorLower.includes('pull rate limit') || errorLower.includes('rate limit')) {
            log(`� RATE LIMITED: Too many requests to the registry.\n`);
            log(`⏳ Wait a few minutes before trying again\n`);
            log(`💡 Consider using docker login to get higher rate limits\n`);
          } else if (errorLower.includes('disk space') || errorLower.includes('no space left')) {
            log(`💾 DISK SPACE: Insufficient disk space to store the image.\n`);
            log(`🧹 Free up disk space and try again\n`);
            log(`📊 Check: docker system df\n`);
          } else {
            log(`❓ UNKNOWN ERROR: Unexpected issue during image pull.\n`);
            log(`🔧 This might be a temporary registry issue or Docker daemon problem.\n`);
            log(`💡 Try: docker system prune (to clean up) or restart Docker\n`);
          }
          log('\n');
          // Continue with next image instead of stopping
        }
      }
      
      if (isPulling) {
        // Complete progress bar
        progressBar.style.width = '100%';
        progressText.textContent = 'Pull operation completed!';
        progressCount.textContent = `${images.length}/${images.length}`;
        
        log(` Pull operation completed!`);
        log(` Success: ${successCount} images`);
        if (failCount > 0) {
          log(` Failed: ${failCount} images`);
        }
        log(` Total processed: ${successCount + failCount}/${images.length} images`);
        $('push-btn').disabled = false;
        
        // Refresh images list and counts with final update
        setTimeout(async () => {
          await loadCurrentImagesList();
          await countImagesList();
          await loadLocalDockerImages(); // Final refresh of local images
          
          log('📊 Updated images lists and counts\n');
          
          // Hide progress bar after a delay
          setTimeout(() => {
            progressContainer.classList.add('hidden');
          }, 2000);
        }, 500);
      }
      
    } catch (e) {
      log(` Error: ${e.message}\n`);
      // Update progress bar to show error
      progressText.textContent = `Error: ${e.message}`;
      progressBar.style.width = '100%';
      progressBar.style.backgroundColor = '#dc2626'; // Red color for error
      
      // Hide progress bar after delay
      setTimeout(() => {
        progressContainer.classList.add('hidden');
        progressBar.style.backgroundColor = ''; // Reset color
      }, 3000);
    } finally {
      isPulling = false;
      currentPullProcess = null;
      $('pull-btn').textContent = 'Pull Images';
      $('pull-btn').className = 'btn btn-primary';
      
      // Restore normal auto-refresh interval after pull operation
      if (document.querySelector('[data-tab="tab-extract"]').classList.contains('active')) {
        startLocalImagesAutoRefresh(AUTO_REFRESH_INTERVAL);
      }
    }
  });

  $('toggle-registry-btn').addEventListener('click', async () => {
    // Check current status to determine action
    try {
      const { stdout } = await runCommand(['docker', 'ps', '--format', '{{.Names}}', '--filter', `name=${REGISTRY_CONTAINER_NAME}`]);
      const running = stdout.trim() === REGISTRY_CONTAINER_NAME;
      
      if (running) {
        // Registry is running, so stop it
        await stopRegistry();
      } else {
        // Registry is not running, so start it
        await startRegistry();
      }
    } catch (e) {
      log(`Error checking registry status: ${e.message}\n`);
      // Assume it's not running and try to start it
      await startRegistry();
    }
  });

  // Split registry start logic into separate function
  async function startRegistry() {
    log('Starting docker-registry (host network, port 4000)...\n');
    try {
      // Check if hosts entry exists and add if needed
      log('Checking /etc/hosts for docker-registry entry...\n');
      try {
        const hostsContent = await readFile('/etc/hosts');
        if (!hostsContent.includes('docker-registry')) {
          log('Adding docker-registry entry to /etc/hosts...\n');
          const newHostsContent = hostsContent.trim() + '\n127.0.0.1\tdocker-registry\n';
          await writeFile('/etc/hosts', newHostsContent);
          log(' Added docker-registry to /etc/hosts\n');
        } else {
          log(' docker-registry entry already exists in /etc/hosts\n');
        }
      } catch (e) {
        log(` Could not update /etc/hosts: ${e.message}\n`);
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
      log(' Applied Docker daemon configuration\n');
      
      log(' Registry started successfully!');
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
          
          if (running) {
            log(' Registry container is already running!\n');
            log('Registry is accessible at: http://docker-registry:4000\n');
            $('restart-docker-btn').disabled = false;
          } else {
            log('Registry container exists but is not running. Starting it...\n');
            await runCommand(['docker', 'start', REGISTRY_CONTAINER_NAME]);
            log(' Registry container started successfully!\n');
            log('Registry is accessible at: http://docker-registry:4000\n');
            $('restart-docker-btn').disabled = false;
          }
        } catch (statusError) {
          log(` Could not check registry status: ${statusError.message}\n`);
        }
        
        await checkStatus();
      } else {
        log(` Error: ${e.message}\n`);
      }
    }
  }

  // Split registry stop logic into separate function
  async function stopRegistry() {
    log('Stopping docker-registry...\n');
    try {
      // Stop and remove the registry container
      try {
        await runCommand(['docker', 'stop', REGISTRY_CONTAINER_NAME]);
        log(' Registry container stopped\n');
      } catch (e) {
        log(` Could not stop container (may not be running): ${e.message}\n`);
      }
      
      try {
        await runCommand(['docker', 'rm', REGISTRY_CONTAINER_NAME]);
        log(' Registry container removed\n');
      } catch (e) {
        log(` Could not remove container: ${e.message}\n`);
      }

      // Optionally remove hosts entry (ask user or just inform)
      log('Note: /etc/hosts entry for docker-registry is kept for future use\n');
      log('If you want to remove it, manually edit /etc/hosts\n');
      
      log(' Registry stopped successfully!');
      await checkStatus();
    } catch (e) {
      log(` Error stopping registry: ${e.message}\n`);
    }
  }

  $('restart-docker-btn').addEventListener('click', async () => {
    log('Restarting Docker...');
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

  $('check-status-btn').addEventListener('click', async () => {
    log(' Checking registry status...\n');
    await checkStatus();
    log(' Status check completed\n');
  });

  $('push-btn').addEventListener('click', async () => {
    const pushBtn = $('push-btn');
    const originalText = pushBtn.innerHTML;
    const progressContainer = $('push-progress-container');
    const progressText = $('push-progress-text');
    const progressCount = $('push-progress-count');
    const progressBar = $('push-progress-bar');
    
    // Show immediate visual feedback
    pushBtn.disabled = true;
    pushBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Starting Push...';
    
    // Show progress container
    if (progressContainer) {
      progressContainer.classList.remove('hidden');
      progressText.textContent = 'Preparing push operation...';
      progressCount.textContent = '0/0';
      progressBar.style.width = '0%';
    }
    
    log('� Starting push operation to local registry...\n');
    
    try {
      // Get actual Docker images that can be pushed (exclude localhost:5000 and <none>)
      const { stdout } = await runCommand(['docker', 'images', '--format', '{{.Repository}}:{{.Tag}}']);
      const availableImages = stdout ? stdout.trim().split('\n').filter(line => 
        line && !line.includes('<none>') && !line.includes('localhost:5000')
      ) : [];
      
      if (availableImages.length === 0) {
        log(' No pushable Docker images found\n');
        log(' Pull some images first or check if all images are already in the registry\n');
        pushBtn.disabled = false;
        pushBtn.innerHTML = originalText;
        if (progressContainer) progressContainer.classList.add('hidden');
        return;
      }
      
      // Update progress with total count
      if (progressContainer) {
        progressText.textContent = 'Analyzing available images...';
        progressCount.textContent = `0/${availableImages.length}`;
      }
      
      log(` Found ${availableImages.length} Docker images to push:\n`);
      availableImages.forEach((img, i) => log(`   ${i+1}. ${img}\n`));
      log('\n');
      
      let completedCount = 0;
      
      for (const imageTag of availableImages) {
        // Split from the right to handle registry:port/repo:tag format correctly
        const lastColonIndex = imageTag.lastIndexOf(':');
        const repository = imageTag.substring(0, lastColonIndex);
        const tag = imageTag.substring(lastColonIndex + 1);
        
        // Check if image is already retagged for local registry
        let dest;
        if (imageTag.startsWith(LOCAL_REG_HOST + '/')) {
          // Already retagged, use as-is
          dest = imageTag;
        } else {
          // Need to retag for local registry - remove registry hostname but keep namespace
          let repoPath = repository;
          
          // Remove registry hostname (like 'quay.io') but preserve namespace and image name
          if (repository.includes('/')) {
            const parts = repository.split('/');
            if (parts.length > 1) {
              // Remove the first part (registry hostname) and keep the rest
              repoPath = parts.slice(1).join('/');
            }
          }
          
          dest = `${LOCAL_REG_HOST}/${repoPath}:${tag}`;
        }
        
        // Update progress in both button and progress bar
        const progressPercent = Math.round((completedCount / availableImages.length) * 100);
        pushBtn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Pushing ${completedCount + 1}/${availableImages.length}`;
        
        // Extract clean path for display (remove registry hostname but keep namespace)
        let displayName = repository;
        if (repository.includes('/')) {
          const parts = repository.split('/');
          if (parts.length > 1) {
            // Remove the first part (registry hostname) and keep the rest
            displayName = parts.slice(1).join('/');
          }
        }
        
        if (progressContainer) {
          progressText.textContent = `Processing: ${displayName}:${tag}`;
          progressCount.textContent = `${completedCount}/${availableImages.length}`;
          progressBar.style.width = `${progressPercent}%`;
        }
        
        // Only retag if not already retagged
        if (imageTag !== dest) {
          log(`�  [${completedCount + 1}/${availableImages.length}] Tagging ${imageTag} → ${dest}...\n`);
          
          try {
            await runCommand(['docker', 'tag', imageTag, dest]);
            log(` Tagged successfully\n`);
          } catch (tagError) {
            log(` [${completedCount + 1}/${availableImages.length}] Failed to tag ${imageTag}: ${tagError.message}\n\n`);
            completedCount++;
            continue;
          }
        } else {
          log(`�  [${completedCount + 1}/${availableImages.length}] Using existing tag ${dest}...\n`);
        }
        
        try {
          // Update progress for push phase
          if (progressContainer) {
            progressText.textContent = `Pushing: ${displayName}:${tag}`;
          }
          
          log(`� [${completedCount + 1}/${availableImages.length}] Pushing ${dest}...\n`);
          
          // Use spawn for real-time progress on push
          const pushProc = cockpit.spawn(['docker', 'push', dest], {
            err: 'message',
            superuser: 'try'
          });
          
          let pushOutput = '';
          pushProc.stream((data) => {
            pushOutput += data;
            // Log real-time progress for important updates
            if (data.includes('Pushed') || data.includes('Layer already exists') || data.includes('Waiting')) {
              log(`   ${data.trim()}\n`);
            }
          });
          
          await pushProc;
          log(` [${completedCount + 1}/${availableImages.length}] Successfully pushed: ${dest}\n`);
          
          // Clean up: Remove original image after successful push to save space
          if (imageTag !== dest) {
            log(`� Removing original image: ${imageTag}...\n`);
            try {
              await runCommand(['docker', 'rmi', imageTag]);
              log(` Removed original image: ${imageTag}\n`);
            } catch (cleanupError) {
              // Don't fail the whole operation if cleanup fails
              log(` Could not remove original image ${imageTag}: ${cleanupError.message}\n`);
              log(`   (Tagged version ${dest} is still available)\n`);
            }
          }
          
          completedCount++;
          
          // Update final progress for this image
          const finalPercent = Math.round((completedCount / availableImages.length) * 100);
          if (progressContainer) {
            progressCount.textContent = `${completedCount}/${availableImages.length}`;
            progressBar.style.width = `${finalPercent}%`;
          }
          
          log(` Progress: ${completedCount}/${availableImages.length} images completed\n\n`);
          
        } catch (imageError) {
          log(` [${completedCount + 1}/${availableImages.length}] Failed to push ${imageTag}: ${imageError.message}\n\n`);
          completedCount++; // Still count as processed
          
          // Update progress even for failed images
          const finalPercent = Math.round((completedCount / availableImages.length) * 100);
          if (progressContainer) {
            progressCount.textContent = `${completedCount}/${availableImages.length}`;
            progressBar.style.width = `${finalPercent}%`;
          }
        }
      }
      
      // Final success message
      log(` Push operation completed!\n`);
      log(` Successfully processed ${completedCount}/${availableImages.length} images\n`);
      log(` Local registry: http://localhost:5000/v2/_catalog\n\n`);
      
      // Update progress to completion
      if (progressContainer) {
        progressText.textContent = 'Updating catalog...';
        progressBar.style.width = '100%';
      }
      
      // Refresh catalog and reset button
      pushBtn.innerHTML = '<i class="fa fa-refresh fa-spin"></i> Updating Catalog...';
      await refreshCatalog();
      
      // Final completion state
      if (progressContainer) {
        progressText.textContent = `Completed! Pushed ${completedCount}/${availableImages.length} images`;
        setTimeout(() => {
          progressContainer.classList.add('hidden');
        }, 3000);
      }
      
    } catch (e) {
      log(` Error during push operation: ${e.message}\n`);
      if (progressContainer) {
        progressText.textContent = `Error: ${e.message}`;
        setTimeout(() => {
          progressContainer.classList.add('hidden');
        }, 5000);
      }
    } finally {
      // Reset button state
      pushBtn.disabled = false;
      pushBtn.innerHTML = originalText;
      updatePushButtonState(); // Refresh button state
    }
  });

  $('refresh-catalog-btn').addEventListener('click', refreshCatalog);

  // ---- Registry Management Actions ----
  $('registry-info-btn').addEventListener('click', showRegistryInfo);
  $('registry-storage-btn').addEventListener('click', showStorageUsage);
  
  // Registry Management tab buttons
  safeAddEventListener('clear-registry-content-btn', 'click', clearRegistryContent);
  safeAddEventListener('delete-entire-registry-btn', 'click', deleteEntireRegistry);

  // ---- Status & Catalog helpers ----
  async function checkStatus() {
    try {
      // Check if docker-registry container is running
      const { stdout } = await runCommand(['docker', 'ps', '--format', '{{.Names}}', '--filter', `name=${REGISTRY_CONTAINER_NAME}`]);
      const running = stdout.trim() === REGISTRY_CONTAINER_NAME;
      
      $('registry-status').textContent = running ? 'Running' : 'Not running';
      $('registry-dot').classList.toggle('ok', running);
      $('registry-dot').classList.toggle('bad', !running);
      
      // Update toggle button based on status
      const toggleBtn = $('toggle-registry-btn');
      if (toggleBtn) {
        if (running) {
          toggleBtn.textContent = 'Stop Registry';
          toggleBtn.className = 'btn btn-outline-danger';
        } else {
          toggleBtn.textContent = 'Run Registry';
          toggleBtn.className = 'btn btn-success';
        }
      }
      
      // Log current status for user feedback
      console.log(`Registry status: ${running ? 'Running' : 'Not running'}`);
      
    } catch (e) {
      $('registry-status').textContent = 'Unknown';
      $('registry-dot').classList.remove('ok','bad');
      
      // Set button to default state on error
      const toggleBtn = $('toggle-registry-btn');
      if (toggleBtn) {
        toggleBtn.textContent = 'Run Registry';
        toggleBtn.className = 'btn btn-success';
      }
      
      log(`Status error: ${e.message}`);
    }
  }

  async function refreshCatalog() {
    const ul = $('catalog');
    ul.innerHTML = '<li> Checking local registry...</li>';
    
    try {
      // First check if the local registry container is running
      log('Checking local registry status...\n');
      try {
        const { stdout } = await runCommand(['docker', 'ps', '--filter', `name=${REGISTRY_CONTAINER_NAME}`, '--format', 'table {{.Names}}\t{{.Status}}']);
        if (!stdout || !stdout.includes(REGISTRY_CONTAINER_NAME)) {
          throw new Error('Local registry container is not running');
        }
        log(' Local registry container is running\n');
      } catch (e) {
        ul.innerHTML = `
          <li class="registry-error">
            <div> Local registry is not running</div>
            <div class="error-hint">Start the local registry first using the "Start Registry" button in the Registry tab</div>
          </li>`;
        log(`Registry status check failed: ${e.message}\n`);
        return;
      }

      // Test registry connectivity
      ul.innerHTML = '<li> Testing registry connectivity...</li>';
      try {
        await runCommand(['curl', '-f', '-s', '--connect-timeout', '5', `http://${LOCAL_REG_HOST}/v2/`]);
        log(' Registry API is accessible\n');
      } catch (e) {
        ul.innerHTML = `
          <li class="registry-error">
            <div> Registry API not accessible</div>
            <div class="error-hint">Registry may be starting up or there's a network issue</div>
          </li>`;
        log(`Registry connectivity test failed: ${e.message}\n`);
        return;
      }

      // Get registry catalog
      ul.innerHTML = '<li> Loading catalog...</li>';
      const { stdout } = await runCommand(['curl', '-s', `http://${LOCAL_REG_HOST}/v2/_catalog`]);
      const data = JSON.parse(stdout);
      const repositories = data.repositories || [];
      
      ul.innerHTML = '';
      if (repositories.length === 0) {
        ul.innerHTML = `
          <li class="registry-empty">
            <div> Registry is empty</div>
            <div class="empty-hint">Push some images to see them listed here</div>
          </li>`;
        log('Local registry is running but contains no images\n');
      } else {
        log(`Found ${repositories.length} repositories in local registry\n`);
        repositories.forEach(repo => {
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="repo-item">
              <span class="repo-name"> ${repo}</span>
              <span class="repo-actions">
                <button class="btn-small" data-action="inspect-catalog" data-repo="${repo}">Inspect</button>
              </span>
            </div>`;
          ul.appendChild(li);
        });
      }
    } catch (e) {
      // If catalog fetch fails, show detailed error
      ul.innerHTML = `
        <li class="registry-error">
          <div> Failed to load catalog</div>
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
    log(` Inspecting image: ${imageName}\n`);
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

  // ---- Registry Management Functions ----
  
  async function showRegistryInfo() {
    const detailsEl = $('registry-details');
    
    try {
      log(' Gathering registry information...\n');
      
      // Get container info
      const { stdout: containerInfo } = await runCommand(['docker', 'inspect', REGISTRY_CONTAINER_NAME]);
      const containerData = JSON.parse(containerInfo)[0];
      
      // Get container stats
      const { stdout: statsInfo } = await runCommand(['docker', 'stats', '--no-stream', '--format', 'table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}', REGISTRY_CONTAINER_NAME]);
      
      // Get volume info
      const { stdout: volumeInfo } = await runCommand(['docker', 'volume', 'ls', '--filter', 'name=registry']);
      
      // Get registry catalog
      let catalogInfo = 'Unable to fetch catalog';
      try {
        const { stdout: catalogData } = await runCommand(['curl', '-s', `http://${LOCAL_REG_HOST}/v2/_catalog`]);
        const catalog = JSON.parse(catalogData);
        catalogInfo = `${(catalog.repositories || []).length} repositories`;
      } catch (e) {
        catalogInfo = 'Registry not accessible';
      }
      
      const registryDetails = `
Container Information:
  Name: ${containerData.Name.replace('/', '')}
  Status: ${containerData.State.Status}
  Created: ${new Date(containerData.Created).toLocaleString()}
  Image: ${containerData.Config.Image}
  Ports: ${Object.keys(containerData.NetworkSettings.Ports || {}).join(', ')}
  
Performance Stats:
${statsInfo}

Volume Information:
${volumeInfo}

Registry Content:
  Repositories: ${catalogInfo}
  API Endpoint: http://${LOCAL_REG_HOST}/v2/
  
Network Configuration:
  Host: ${LOCAL_REG_HOST}
  Internal IP: ${containerData.NetworkSettings.IPAddress || 'N/A'}
`;
      
      detailsEl.textContent = registryDetails;
      
      // Open the details element to show the information
      const detailsParent = detailsEl.closest('details');
      if (detailsParent) {
        detailsParent.open = true;
      }
      
      log(' Registry information loaded\n');
      
    } catch (e) {
      detailsEl.textContent = `Error loading registry information: ${e.message}`;
      log(` Failed to get registry info: ${e.message}\n`);
    }
  }

  async function showStorageUsage() {
    try {
      log('� Analyzing registry storage usage...\n');
      
      // Get registry volume size
      const { stdout: volumeSize } = await runCommand(['docker', 'system', 'df', '-v']);
      
      // Get container size
      const { stdout: containerSize } = await runCommand(['docker', 'ps', '-s', '--filter', `name=${REGISTRY_CONTAINER_NAME}`, '--format', 'table {{.Names}}\t{{.Size}}\t{{.CreatedAt}}']);
      
      // Get registry directory size inside container
      let registryDataSize = 'N/A';
      try {
        const { stdout: dataSize } = await runCommand(['docker', 'exec', REGISTRY_CONTAINER_NAME, 'du', '-sh', '/var/lib/registry']);
        registryDataSize = dataSize.trim();
      } catch (e) {
        registryDataSize = 'Unable to access registry data';
      }
      
      const storageInfo = `
Storage Usage Analysis:

Container Size:
${containerSize}

Registry Data Size:
${registryDataSize}

Volume Information:
${volumeSize}
`;
      
      $('registry-details').textContent = storageInfo;
      
      // Open the details element to show the information
      const detailsEl = $('registry-details');
      const detailsParent = detailsEl.closest('details');
      if (detailsParent) {
        detailsParent.open = true;
      }
      
      log(' Storage usage analysis complete\n');
      
    } catch (e) {
      $('registry-details').textContent = `Error analyzing storage: ${e.message}`;
      log(` Storage analysis failed: ${e.message}\n`);
    }
  }

  async function clearRegistryContent() {
    const confirmed = confirm(
      ' CLEAR REGISTRY CONTENT\n\n' +
      'This will permanently delete ALL images and data from the registry.\n' +
      'The registry will be recreated as an empty registry.\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!confirmed) {
      log('Registry clear operation cancelled by user\n');
      return;
    }
    
    try {
      log('�  Clearing registry content using proven method...\n');
      
      // Step 1: Get container ID and stop registry
      log('1⃣  Finding and stopping registry container...\n');
      let containerId = '';
      try {
        const { stdout } = await runCommand(['docker', 'ps', '-a', '-q', '--filter', `name=${REGISTRY_CONTAINER_NAME}`]);
        containerId = stdout.trim();
        
        if (containerId) {
          log(`   Found container ID: ${containerId}\n`);
          await runCommand(['docker', 'stop', containerId]);
          log(' Registry container stopped\n');
        } else {
          log('  No registry container found\n');
        }
      } catch (e) {
        log(`  Error stopping container: ${e.message}\n`);
      }
      
      // Step 2: Remove the container
      if (containerId) {
        log('2⃣  Removing registry container...\n');
        try {
          await runCommand(['docker', 'rm', containerId]);
          log(' Registry container removed\n');
        } catch (e) {
          log(`  Error removing container: ${e.message}\n`);
        }
      }
      
      // Step 3: Remove the registry volume (this destroys all data)
      log('3⃣  Removing registry volume (destroys all data)...\n');
      try {
        await runCommand(['docker', 'volume', 'rm', 'registry']);
        log(' Registry volume removed - all data destroyed\n');
      } catch (e) {
        log(`  Error removing volume: ${e.message}\n`);
        // Continue anyway, volume might not exist
      }
      
      // Step 4: Recreate the registry container
      log('4⃣  Recreating registry container...\n');
      try {
        await runCommand([
          'docker', 'run', '-d', 
          '--name', REGISTRY_CONTAINER_NAME,
          '-p', '4000:5000',
          '-v', 'registry:/var/lib/registry',
          'registry:2'
        ]);
        log(' Registry container recreated successfully\n');
      } catch (e) {
        log(` Failed to recreate registry: ${e.message}\n`);
        throw new Error(`Failed to recreate registry: ${e.message}`);
      }
      
      // Step 5: Wait for registry to be ready
      log('5⃣  Waiting for registry to be ready...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 6: Verify the registry is empty
      log('6⃣  Verifying registry is empty...\n');
      try {
        const { stdout } = await runCommand(['curl', '-s', `http://${LOCAL_REG_HOST}/v2/_catalog`]);
        const data = JSON.parse(stdout);
        const repoCount = (data.repositories || []).length;
        
        if (repoCount === 0) {
          log(' Registry content cleared successfully!\n');
          log(' Registry is now empty and ready for new images\n');
          
          // Refresh catalog to show empty state
          await refreshCatalog();
          
          // Update registry status in overview
          await checkRegistryStatus();
        } else {
          log(`  Registry still contains ${repoCount} repositories\n`);
        }
      } catch (e) {
        log(`  Could not verify registry state: ${e.message}\n`);
        log('ℹ  Registry should still be empty - verification failed\n');
        
        // Still try to refresh catalog
        setTimeout(() => refreshCatalog(), 5000);
      }
      
      log(' REGISTRY CLEAR COMPLETE!\n');
      log(' Summary:\n');
      log('   • Container: RECREATED\n');
      log('   • Volume: DESTROYED and recreated\n');
      log('   • Data: COMPLETELY CLEARED\n');
      log('   • Status: Registry is empty and ready\n');
      
    } catch (e) {
      log(` Failed to clear registry content: ${e.message}\n`);
      log(' You may need to manually recreate the registry\n');
    }
  }

  async function deleteEntireRegistry() {
    // First confirmation dialog
    const firstConfirm = confirm(
      '� DELETE ENTIRE REGISTRY\n\n' +
      'This will PERMANENTLY DELETE:\n' +
      '• Registry container\n' +
      '• All registry volumes\n' +
      '• All stored images and metadata\n' +
      '• All registry configuration\n\n' +
      'The registry will be completely removed from your system.\n' +
      'You will need to recreate it if you want to use it again.\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Do you want to continue?'
    );
    
    if (!firstConfirm) {
      log('Registry deletion cancelled by user\n');
      return;
    }
    
    // Second confirmation with text input
    const confirmationText = prompt(
      'FINAL CONFIRMATION\n\n' +
      'Type "DELETE REGISTRY" exactly to confirm registry deletion:\n\n' +
      '(This will permanently remove all registry data)'
    );
    
    if (confirmationText !== 'DELETE REGISTRY') {
      log('Registry deletion cancelled - confirmation text did not match\n');
      log(`Expected: "DELETE REGISTRY", got: "${confirmationText}"\n`);
      return;
    }
    
    try {
      log('� DELETING ENTIRE REGISTRY...\n');
      log('  This operation cannot be undone!\n\n');
      
      // Step 1: Stop the registry container
      log('1⃣  Stopping registry container...\n');
      try {
        await runCommand(['docker', 'stop', REGISTRY_CONTAINER_NAME]);
        log(' Registry container stopped\n');
      } catch (e) {
        log(`  Container stop failed (may already be stopped): ${e.message}\n`);
      }
      
      // Step 2: Remove the registry container
      log('2⃣  Removing registry container...\n');
      try {
        await runCommand(['docker', 'rm', REGISTRY_CONTAINER_NAME]);
        log(' Registry container removed\n');
      } catch (e) {
        log(`  Container removal failed: ${e.message}\n`);
      }
      
      // Step 3: Remove registry volumes
      log('3⃣  Removing registry volumes...\n');
      try {
        const { stdout: volumes } = await runCommand(['docker', 'volume', 'ls', '-q', '--filter', 'name=registry']);
        const volumeList = volumes.trim().split('\n').filter(v => v);
        
        for (const volume of volumeList) {
          if (volume) {
            log(`   Removing volume: ${volume}\n`);
            await runCommand(['docker', 'volume', 'rm', volume]);
          }
        }
        
        if (volumeList.length > 0) {
          log(` Removed ${volumeList.length} registry volumes\n`);
        } else {
          log('ℹ  No registry volumes found to remove\n');
        }
      } catch (e) {
        log(`  Volume removal failed: ${e.message}\n`);
      }
      
      // Step 4: Clean up any orphaned registry images
      log('4⃣  Cleaning up registry images...\n');
      try {
        await runCommand(['docker', 'image', 'prune', '-f', '--filter', 'label=registry']);
        log(' Registry images cleaned up\n');
      } catch (e) {
        log(`  Image cleanup failed: ${e.message}\n`);
      }
      
      // Step 5: Update UI state
      log('5⃣  Updating interface...\n');
      
      // Clear catalog display
      const catalogEl = $('catalog');
      if (catalogEl) {
        catalogEl.innerHTML = `
          <li class="registry-error">
            <div>� Registry has been deleted</div>
            <div class="error-hint">Create a new registry to continue using this functionality</div>
          </li>`;
      }
      
      // Update registry status
      const statusEl = $('registry-status');
      if (statusEl) {
        statusEl.textContent = 'Deleted';
      }
      
      const dotEl = $('registry-dot');
      if (dotEl) {
        dotEl.classList.remove('ok', 'bad');
        dotEl.classList.add('bad');
      }
      
      // Update toggle button
      const toggleBtn = $('toggle-registry-btn');
      if (toggleBtn) {
        toggleBtn.textContent = 'Create Registry';
        toggleBtn.className = 'btn btn-success';
      }
      
      log(' REGISTRY DELETION COMPLETE!\n');
      log(' Summary:\n');
      log('   • Registry container: DELETED\n');
      log('   • Registry volumes: DELETED\n');
      log('   • Registry data: DELETED\n');
      log('   • All images: DELETED\n\n');
      log('ℹ  To use registry functionality again, create a new registry\n');
      
    } catch (e) {
      log(` Registry deletion failed: ${e.message}\n`);
      log('  Registry may be in an inconsistent state\n');
      log(' Try running individual cleanup commands manually if needed\n');
    }
  }

  async function applyDockerConfig() {
    try {
      log('Applying Docker daemon configuration...\n');
      await runCommand(['mkdir', '-p', '/etc/docker']);
      await writeFile(DOCKER_DAEMON_JSON, JSON.stringify(DOCKER_CONFIG_TEMPLATE, null, 2));
      log(' Applied Docker daemon configuration\n');
      log(' Configuration: Allow insecure registry at docker-registry:4000\n');
      log('  Note: Docker service restart may be required for changes to take effect\n\n');
    } catch (e) {
      log(` Failed to apply Docker configuration: ${e.message}\n`);
      throw e;
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
      // Use the simplified image list loading (only /etc/xavs/images.list)
      const content = await getImagesList();
      
      if (content) {
        const lines = content.split('\n')
          .filter(line => line.trim() && !line.trim().startsWith('#'));
        $('images-list-count').textContent = `${lines.length} images configured`;
      } else {
        $('images-list-count').textContent = '0 images configured';
      }
    } catch (e) {
      if (e.message.includes('Images list file not found')) {
        $('images-list-count').textContent = 'Images config missing';
      } else {
        $('images-list-count').textContent = 'Error reading images list';
      }
    }
  }

  async function quickSetup() {
    log('Running quick setup...');
    try {
      // 1. Apply Docker configuration
      log('Step 1: Applying Docker configuration...');
      await applyDockerConfig();
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 2. Start registry (force start, don't toggle)
      log('Step 2: Starting registry...');
      await startRegistry();
      
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

  // Clear log functionality
  $("btn-clear-log").addEventListener("click", () => {
    if (logEl) logEl.textContent = "";
    // Clear stored logs too
    try {
        sessionStorage.removeItem('xavs-images-logs');
        localStorage.removeItem('xavs-images-logs');
    } catch (e) {
        console.warn('Could not clear stored logs:', e);
    }
  });

  // Status bar link to logs
  document.addEventListener('click', (e) => {
    if (e.target.matches('.status-link[data-tab]')) {
      e.preventDefault();
      const tabId = e.target.getAttribute('data-tab');
      
      // Switch to the logs tab
      document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('show', 'active');
      });
      
      document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
      document.getElementById(tabId).classList.add('show', 'active');
    }
  });

  // Clear log functionality
  safeAddEventListener("btn-clear-log", "click", () => {
    if (logEl) logEl.textContent = "";
    // Clear stored logs too
    try {
        sessionStorage.removeItem('xavs-images-logs');
        localStorage.removeItem('xavs-images-logs');
        
        // Trigger custom event for immediate cross-tab sync
        window.dispatchEvent(new CustomEvent('xavs-logs-updated', { 
          detail: { logs: '' } 
        }));
    } catch (e) {
        console.warn('Could not clear stored logs:', e);
    }
  });

  // Function to check and update push button state
  async function updatePushButtonState() {
    const pushBtn = $('push-btn');
    if (!pushBtn) return;
    
    try {
      // First check if Docker is available
      await runCommand(['docker', '--version']);
      
      // Check if we have any Docker images that could be pushed
      const { stdout } = await runCommand(['docker', 'images', '--format', '{{.Repository}}:{{.Tag}}']);
      const imageLines = stdout ? stdout.trim().split('\n').filter(line => 
        line && !line.includes('<none>') && !line.includes('localhost:5000')
      ) : [];
      
      if (imageLines.length > 0) {
        pushBtn.disabled = false;
        pushBtn.title = `Push ${imageLines.length} available images to local registry`;
        pushBtn.innerHTML = '<i class="fa fa-upload"></i> Push Images to Registry';
      } else {
        pushBtn.disabled = true;
        pushBtn.title = 'No pushable images found. Pull images first, or images already in registry.';
        pushBtn.innerHTML = '<i class="fa fa-upload"></i> Push Images (No Images)';
      }
    } catch (e) {
      // If Docker command fails, disable the button
      pushBtn.disabled = true;
      pushBtn.title = 'Docker not available. Ensure Docker is installed and running.';
      pushBtn.innerHTML = '<i class="fa fa-exclamation-triangle"></i> Push Images (Docker N/A)';
    }
  }

  // initial checks on load
  checkStatus();
  refreshOverview();
  loadCurrentImagesList(); // Auto-load images list on startup
  loadLocalDockerImages(); // Auto-load local Docker images on startup
  countImagesList();
  updatePushButtonState(); // Check if push button should be enabled
  
  // Initialize cross-tab log synchronization
  syncLogsAcrossTabs();
  
  // Load stored logs after DOM is ready
  setTimeout(loadStoredLogs, 100);
  
  // Initialize USB devices if Extract tab is already active on page load
  if (document.querySelector('[data-tab="tab-extract"]').classList.contains('active')) {
    setTimeout(initUSBDevices, 500);
  }
  
  // Clear log functionality
  const clearLogBtn = $("btn-clear-log");
  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      if (logEl) logEl.textContent = "";
      // Clear stored logs too
      try {
        sessionStorage.removeItem('xavs-images-logs');
        localStorage.removeItem('xavs-images-logs');
      } catch (e) {
        console.warn('Could not clear stored logs:', e);
      }
    });
  }
  
  // Add a manual button test for development/testing
  if (window.location.search.includes('test=true')) {
    setTimeout(() => {
      const pushBtn = $('push-btn');
      if (pushBtn) {
        pushBtn.disabled = false;
        pushBtn.title = 'Test mode - push button enabled for testing';
        pushBtn.innerHTML = '<i class="fa fa-upload"></i> Push Images (Test Mode)';
        log('Test mode enabled - push button force-enabled for testing\n');
      }
    }, 2000);
  }
});
