#!/usr/bin/env python3
"""
Test script for VLAN MTU functionality in XOS Networking
This script tests the netplan_manager.py MTU setting for VLAN interfaces
"""

import json
import subprocess
import sys
import os

def run_netplan_manager(action, config):
    """Run netplan_manager.py with given action and config"""
    try:
        # Prepare input
        input_data = json.dumps({"action": action, "config": config})
        
        # Run the script
        result = subprocess.run([
            sys.executable, 'netplan_manager.py'
        ], input=input_data, text=True, capture_output=True)
        
        print(f"Return code: {result.returncode}")
        print(f"STDOUT: {result.stdout}")
        print(f"STDERR: {result.stderr}")
        
        # Parse JSON response
        if result.stdout.strip():
            lines = result.stdout.strip().split('\n')
            for line in reversed(lines):
                if line.startswith('{'):
                    try:
                        return json.loads(line)
                    except json.JSONDecodeError:
                        continue
        
        return {"error": "No valid JSON response", "stdout": result.stdout, "stderr": result.stderr}
        
    except Exception as e:
        return {"error": str(e)}

def test_vlan_mtu():
    """Test VLAN MTU setting functionality"""
    print("Testing VLAN MTU functionality...")
    
    # Test 1: Create a test VLAN with custom MTU
    print("\n=== Test 1: Create VLAN with MTU ===")
    vlan_config = {
        "name": "eth0.100",
        "id": 100,
        "link": "eth0",
        "mtu": 9000
    }
    
    result = run_netplan_manager("add_vlan", vlan_config)
    print(f"Create VLAN result: {result}")
    
    # Test 2: Set MTU on existing VLAN
    print("\n=== Test 2: Set MTU on VLAN ===")
    mtu_config = {
        "name": "eth0.100",
        "mtu": 1400
    }
    
    result = run_netplan_manager("set_mtu", mtu_config)
    print(f"Set MTU result: {result}")
    
    # Test 3: Set MTU on non-existent VLAN (should create config)
    print("\n=== Test 3: Set MTU on non-existent VLAN ===")
    mtu_config = {
        "name": "eth0.200",
        "mtu": 1200
    }
    
    result = run_netplan_manager("set_mtu", mtu_config)
    print(f"Set MTU on non-existent VLAN result: {result}")
    
    # Test 4: Invalid MTU values
    print("\n=== Test 4: Invalid MTU values ===")
    invalid_configs = [
        {"name": "eth0.300", "mtu": 50},    # Too small
        {"name": "eth0.300", "mtu": 10000}, # Too large
        {"name": "eth0.300", "mtu": "abc"}, # Non-numeric
    ]
    
    for config in invalid_configs:
        result = run_netplan_manager("set_mtu", config)
        print(f"Invalid MTU {config['mtu']} result: {result}")

def check_environment():
    """Check if we have the necessary environment"""
    if not os.path.exists('netplan_manager.py'):
        print("Error: netplan_manager.py not found in current directory")
        return False
        
    if os.geteuid() != 0:
        print("Warning: Not running as root - some tests may fail")
        
    return True

if __name__ == "__main__":
    if not check_environment():
        sys.exit(1)
        
    print("XOS Networking VLAN MTU Test Script")
    print("=" * 40)
    
    test_vlan_mtu()
    
    print("\n" + "=" * 40)
    print("Test completed. Check output above for results.")