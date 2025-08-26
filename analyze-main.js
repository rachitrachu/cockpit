#!/usr/bin/env node

// Quick test to check for duplicate function definitions and other issues
const fs = require('fs');

try {
    const content = fs.readFileSync('xos-networking/main.js', 'utf8');
    
    // Check for duplicate function definitions
    const functions = [
        'setupEventHandlers',
        'setupNetworkingForms',
        'getPhysicalInterfaces',
        'initialize',
        'loadInterfaces',
        'netplanAction'
    ];
    
    console.log('?? Checking for duplicate function definitions...\n');
    
    functions.forEach(funcName => {
        const regex = new RegExp(`(async\\s+)?function\\s+${funcName}\\s*\\(`, 'g');
        const matches = [];
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            matches.push({
                position: match.index,
                line: content.substring(0, match.index).split('\n').length
            });
        }
        
        if (matches.length === 0) {
            console.log(`??  ${funcName}: NOT FOUND`);
        } else if (matches.length === 1) {
            console.log(`? ${funcName}: defined once (line ${matches[0].line})`);
        } else {
            console.log(`? ${funcName}: DUPLICATE DEFINITIONS (${matches.length} times)`);
            matches.forEach((m, i) => {
                console.log(`   ${i + 1}. Line ${m.line}, position ${m.position}`);
            });
        }
    });
    
    // Check for syntax errors
    console.log('\n?? Checking JavaScript syntax...');
    try {
        new Function(content);
        console.log('? JavaScript syntax is valid');
    } catch (syntaxError) {
        console.log('? JavaScript syntax error:');
        console.log(`   ${syntaxError.message}`);
        
        // Try to find the error location
        const lines = content.split('\n');
        if (syntaxError.message.includes('line')) {
            const lineMatch = syntaxError.message.match(/line (\d+)/);
            if (lineMatch) {
                const lineNum = parseInt(lineMatch[1]);
                console.log(`   Problem line ${lineNum}: ${lines[lineNum - 1] || 'N/A'}`);
            }
        }
    }
    
    // Check function call order
    console.log('\n?? Checking function call order...');
    const initializePos = content.indexOf('function initialize(') || content.indexOf('async function initialize(');
    const setupNetworkingPos = content.indexOf('function setupNetworkingForms(') || content.indexOf('async function setupNetworkingForms(');
    
    if (initializePos !== -1 && setupNetworkingPos !== -1) {
        if (setupNetworkingPos < initializePos) {
            console.log('? setupNetworkingForms is defined before initialize');
        } else {
            console.log('? setupNetworkingForms is defined AFTER initialize');
        }
    }
    
    // Check for common issues
    console.log('\n?? Checking for common issues...');
    
    if (content.includes('function setupNetworkingForms') && content.includes('async function setupNetworkingForms')) {
        console.log('? Mixed function declarations (both sync and async)');
    }
    
    if (content.includes('setupNetworkingForms()') && !content.includes('await setupNetworkingForms()')) {
        console.log('??  setupNetworkingForms called without await (might cause issues if it\'s async)');
    }
    
    // Look for specific button handlers
    const buttonHandlers = ['btn-refresh', 'btn-show-netplan', 'btn-backup-netplan'];
    buttonHandlers.forEach(btnId => {
        if (content.includes(`#${btnId}`)) {
            console.log(`? Handler found for ${btnId}`);
        } else {
            console.log(`? No handler found for ${btnId}`);
        }
    });
    
    console.log('\n? Analysis complete!');
    
} catch (error) {
    console.error('? Error reading or analyzing file:', error.message);
}