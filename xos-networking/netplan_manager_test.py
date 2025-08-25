#!/usr/bin/env python3
import sys
import yaml
import os
import json
import traceback

# Ensure output is flushed immediately
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

NETPLAN_DIR = '/etc/netplan'

def main():
    try:
        # Simple input reading without timeout for now
        input_data = sys.stdin.read().strip()
        
        if not input_data:
            print(json.dumps({'error': 'No input provided'}))
            sys.stdout.flush()
            sys.exit(1)
            
        req = json.loads(input_data)
        action = req.get('action')
        config = req.get('config')
        fname = req.get('filename', '99-cockpit.yaml')

        if not action or not config:
            print(json.dumps({'error': f'Missing action ({action}) or config ({config})'}))
            sys.stdout.flush()
            sys.exit(1)

        # Create basic netplan structure
        netplan = {
            'network': {
                'version': 2,
                'renderer': 'networkd',
                'ethernets': {},
                'bonds': {}
            }
        }

        if action == 'add_bond':
            slaves = list(config.get('interfaces') or [])
            if len(slaves) < 2:
                print(json.dumps({'error': f'Bond requires at least 2 interfaces, got {len(slaves)}: {slaves}'}))
                sys.stdout.flush()
                sys.exit(1)
            
            # Add ethernets for slaves
            for iface in slaves:
                netplan['network']['ethernets'][iface] = {}
            
            # Add bond
            netplan['network']['bonds'][config['name']] = {
                'interfaces': slaves,
                'parameters': {'mode': config['mode']},
                'dhcp4': True
            }
        else:
            print(json.dumps({'error': f'Unsupported action: {action}'}))
            sys.stdout.flush()
            sys.exit(1)

        # Try to write the file
        try:
            path = os.path.join(NETPLAN_DIR, fname)
            with open(path, 'w') as f:
                yaml.safe_dump(netplan, f, default_flow_style=False, sort_keys=False)
            os.chmod(path, 0o600)
        except Exception as e:
            print(json.dumps({'error': f'Failed to write {path}: {e}'}))
            sys.stdout.flush()
            sys.exit(1)
        
        # Success
        print(json.dumps({
            'result': 'success', 
            'note': f'File {fname} created with bond {config["name"]}',
            'config': netplan
        }))
        sys.stdout.flush()
        
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON input: {e}'}))
        sys.stdout.flush()
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': f'Unexpected error: {e}', 'trace': traceback.format_exc()}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == '__main__':
    main()