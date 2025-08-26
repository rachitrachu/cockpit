#!/usr/bin/env node

// Simple syntax check for main.js
const fs = require('fs');

try {
    const content = fs.readFileSync('xos-networking/main.js', 'utf8');
    
    // Basic syntax validation
    new Function(content);
    console.log('? JavaScript syntax is valid');
    
    // Check for common issues
    const lines = content.split('\n');
    let issues = [];
    
    // Check for missing semicolons at line endings (basic check)
    let braceCount = 0;
    let parenCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('//')) continue;
        
        // Count braces and parentheses
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        parenCount += (line.match(/\(/g) || []).length;
        parenCount -= (line.match(/\)/g) || []).length;
    }
    
    if (braceCount !== 0) {
        issues.push(`?? Unmatched braces (${braceCount > 0 ? 'missing ' + braceCount + ' closing' : 'extra ' + Math.abs(braceCount) + ' closing'} braces)`);
    }
    
    if (parenCount !== 0) {
        issues.push(`?? Unmatched parentheses (${parenCount > 0 ? 'missing ' + parenCount + ' closing' : 'extra ' + Math.abs(parenCount) + ' closing'} parentheses)`);
    }
    
    if (issues.length > 0) {
        console.log('Issues found:');
        issues.forEach(issue => console.log(issue));
    } else {
        console.log('? No obvious structural issues found');
    }
    
} catch (error) {
    console.error('? JavaScript syntax error:', error.message);
    process.exit(1);
}