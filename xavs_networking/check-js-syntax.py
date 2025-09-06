#!/usr/bin/env python3

import re
import sys

def check_js_syntax(filename):
    """Basic JavaScript syntax checking"""
    print(f"Checking JavaScript syntax in {filename}...")
    
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check for basic syntax issues
    issues = []
    
    # Check for unmatched braces
    brace_count = 0
    paren_count = 0
    bracket_count = 0
    
    for i, char in enumerate(content):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
        elif char == '(':
            paren_count += 1
        elif char == ')':
            paren_count -= 1
        elif char == '[':
            bracket_count += 1
        elif char == ']':
            bracket_count -= 1
    
    if brace_count != 0:
        issues.append(f"Unmatched braces: {brace_count}")
    if paren_count != 0:
        issues.append(f"Unmatched parentheses: {paren_count}")
    if bracket_count != 0:
        issues.append(f"Unmatched brackets: {bracket_count}")
    
    # Check for our new functions
    validate_func = 'window.validateVlanConfig' in content
    fix_func = 'window.fixVlanConfig' in content
    
    print(f"✅ validateVlanConfig function defined: {validate_func}")
    print(f"✅ fixVlanConfig function defined: {fix_func}")
    
    if issues:
        print("❌ Syntax issues found:")
        for issue in issues:
            print(f"  - {issue}")
        return False
    else:
        print("✅ No obvious syntax issues found")
        return True

if __name__ == "__main__":
    filename = sys.argv[1] if len(sys.argv) > 1 else "netplan-js-manager.js"
    check_js_syntax(filename)
