// Command availability cache to avoid repeated failures
const commandCache = new Map();

async function checkCommandAvailable(command) {
  if (commandCache.has(command)) {
    return commandCache.get(command);
  }
  
  try {
    await run('which', [command], { superuser: 'try' });
    commandCache.set(command, true);
    return true;
  } catch (e) {
    commandCache.set(command, false);
    return false;
  }
}

// Export for use in other modules
window.checkCommandAvailable = checkCommandAvailable;
