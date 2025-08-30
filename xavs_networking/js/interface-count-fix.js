// Interface Count Fix and Debug Script
// This script addresses the "Showing all 0 interfaces" issue

console.log('=== Interface Count Fix Debug ===');

// Function to check and fix interface counting
function debugInterfaceCount() {
    console.log('1. Checking table structure...');
    
    const table = document.querySelector('#table-interfaces');
    if (!table) {
        console.error('❌ Table #table-interfaces not found!');
        return;
    }
    console.log('✅ Table found');
    
    const tbody = table.querySelector('tbody');
    if (!tbody) {
        console.error('❌ Table tbody not found!');
        return;
    }
    console.log('✅ Table tbody found');
    
    const rows = tbody.querySelectorAll('tr');
    console.log(`✅ Found ${rows.length} rows in tbody`);
    
    if (rows.length === 0) {
        console.log('⚠️ No rows found - interfaces may not be loaded yet');
        return false;
    }
    
    // Check each row
    rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        console.log(`Row ${index + 1}: ${cells.length} cells, content: "${row.textContent.trim().substring(0, 50)}..."`);
    });
    
    return rows.length;
}

// Function to manually trigger interface count update
function forceUpdateInterfaceCount() {
    console.log('2. Forcing interface count update...');
    
    const rowCount = debugInterfaceCount();
    if (rowCount === false) {
        console.log('⚠️ Cannot update count - no rows found');
        return;
    }
    
    // Find and update status text
    const statusElement = document.querySelector('#status-message');
    if (statusElement) {
        const newText = `Showing all ${rowCount} interfaces`;
        statusElement.textContent = newText;
        console.log(`✅ Updated status to: "${newText}"`);
    } else {
        console.log('⚠️ Status element not found');
    }
    
    // Find and update search info
    const searchInfo = document.querySelector('#search-info');
    if (searchInfo) {
        const newText = `Showing all ${rowCount} interfaces`;
        searchInfo.textContent = newText;
        console.log(`✅ Updated search info to: "${newText}"`);
    } else {
        console.log('⚠️ Search info element not found');
    }
}

// Function to wait for interfaces to load and then update count
function waitForInterfacesAndUpdate() {
    console.log('3. Waiting for interfaces to load...');
    
    let attempts = 0;
    const maxAttempts = 20;
    
    const checkInterval = setInterval(() => {
        attempts++;
        console.log(`Attempt ${attempts}/${maxAttempts}: Checking for interfaces...`);
        
        const rowCount = debugInterfaceCount();
        
        if (rowCount > 0) {
            console.log(`✅ Found ${rowCount} interfaces! Updating count...`);
            forceUpdateInterfaceCount();
            clearInterval(checkInterval);
            
            // Trigger search function if available
            if (typeof window.updateInterfaceSearch === 'function') {
                console.log('✅ Triggering search update...');
                window.updateInterfaceSearch('');
            }
        } else if (attempts >= maxAttempts) {
            console.log('❌ Max attempts reached - interfaces may not be loading');
            clearInterval(checkInterval);
        }
    }, 500);
}

// Function to fix export dialog encoding issues
function fixExportDialog() {
    console.log('4. Checking for export dialog issues...');
    
    // Override the export function to use proper encoding
    const exportButton = document.querySelector('button[onclick*="export"]');
    if (exportButton) {
        console.log('✅ Found export button - encoding should be fixed in events.js');
    }
}

// Initialize the fix
console.log('🚀 Starting interface count fix...');
setTimeout(() => {
    debugInterfaceCount();
    waitForInterfacesAndUpdate();
    fixExportDialog();
}, 1000);

// Export functions for manual testing
window.debugInterfaceCount = debugInterfaceCount;
window.forceUpdateInterfaceCount = forceUpdateInterfaceCount;
window.waitForInterfacesAndUpdate = waitForInterfacesAndUpdate;

console.log('=== Interface Count Fix Loaded ===');
console.log('Manual commands available:');
console.log('  debugInterfaceCount() - Check current state');
console.log('  forceUpdateInterfaceCount() - Force update count');
console.log('  waitForInterfacesAndUpdate() - Wait and update');
