#!/usr/bin/env python3
import sys
import yaml
import os
import subprocess
import json
import traceback

NETPLAN_DIR = '/etc/netplan'

# Helper to load all netplan YAML files
def load_netplan():
    configs = {}
    for fname in os.listdir(NETPLAN_DIR):
        if fname.endswith('.yaml') or fname.endswith('.yml'):
            with open(os.path.join(NETPLAN_DIR, fname)) as f:
                configs[fname] = yaml.safe_load(f)
    return configs

# Helper to write a netplan YAML file
def write_netplan(fname, data):
    try:
        with open(os.path.join(NETPLAN_DIR, fname), 'w') as f:
            yaml.safe_dump(data, f, default_flow_style=False)
    except Exception as e:
        print(json.dumps({'error': f'Failed to write netplan file: {e}', 'trace': traceback.format_exc()}))
        sys.exit(1)

# Apply netplan changes
def apply_netplan():
    try:
        subprocess.run(['netplan', 'apply'], check=True)
    except Exception as e:
        print(json.dumps({'error': f'Failed to apply netplan: {e}', 'trace': traceback.format_exc()}))
        sys.exit(1)

# Main entry point
def main():
    try:
        req = json.load(sys.stdin)
        action = req.get('action')
        config = req.get('config')
        fname = req.get('filename', '99-cockpit.yaml')

        # Load or create config file
        configs = load_netplan()
        netplan = configs.get(fname, {'network': {}})
        network = netplan['network']

        if action == 'add_bond':
            # config: {name, mode, interfaces}
            if 'bonds' not in network:
                network['bonds'] = {}
            network['bonds'][config['name']] = {
                'interfaces': config['interfaces'],
                'parameters': {'mode': config['mode']},
                'dhcp4': True
            }
        elif action == 'add_vlan':
            # config: {name, id, link}
            if 'vlans' not in network:
                network['vlans'] = {}
            network['vlans'][config['name']] = {
                'id': config['id'],
                'link': config['link'],
                'dhcp4': True
            }
        elif action == 'add_bridge':
            # config: {name, interfaces}
            if 'bridges' not in network:
                network['bridges'] = {}
            network['bridges'][config['name']] = {
                'interfaces': config['interfaces'],
                'dhcp4': True
            }
        elif action == 'delete':
            # config: {type, name}
            if config['type'] in network and config['name'] in network[config['type']]:
                del network[config['type']][config['name']]
        else:
            print(json.dumps({'error': 'Unknown action'}))
            sys.exit(1)

        # Save and apply
        write_netplan(fname, netplan)
        apply_netplan()
        print(json.dumps({'result': 'success'}))
    except Exception as e:
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}))
        sys.exit(1)

if __name__ == '__main__':
    main()
