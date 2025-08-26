#!/usr/bin/env python3
"""
Test script for netplan_manager.py to debug the IP setting issue
"""
import subprocess
import json
import sys
import os

def test_set_ip():
    print("Testing IP setting for bond1...")
    
    # Test data
    test_data = {
        "action": "set_ip",
        "config": {
            "name": "bond1",
            "static_ip": "192.168.0.111/24",
            "gateway": "192.168.0.1",
            "dns": "8.8.8.8,1.1.1.1"
        }
    }
    
    try:
        # Run the netplan_manager.py script
        proc = subprocess.run([
            'python3', 'netplan_manager.py'
        ], 
        input=json.dumps(test_data),
        text=True,
        capture_output=True,
        cwd='/usr/share/cockpit/xos-networking'
        )
        
        print("Return code:", proc.returncode)
        print("STDOUT:", proc.stdout)
        print("STDERR:", proc.stderr)
        
        if proc.returncode == 0:
            print("? Script executed successfully!")
            try:
                result = json.loads(proc.stdout)
                print("Parsed result:", result)
            except:
                print("Could not parse JSON output")
        else:
            print("? Script failed with return code:", proc.returncode)
            
    except Exception as e:
        print("Exception occurred:", e)

if __name__ == '__main__':
    test_set_ip()