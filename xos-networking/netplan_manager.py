#!/usr/bin/env python3
import sys
import yaml
import os
import subprocess
import json
import traceback

NETPLAN_DIR = '/etc/netplan'


def load_netplan():
    configs = {}
    try:
        for fname in os.listdir(NETPLAN_DIR):
            if fname.endswith('.yaml') or fname.endswith('.yml'):
                with open(os.path.join(NETPLAN_DIR, fname)) as f:
                    loaded = yaml.safe_load(f)
                    if loaded is None:
                        loaded = {}
                    configs[fname] = loaded
    except Exception as e:
        print(json.dumps({'error': f'Failed to load netplan configs: {e}'}), file=sys.stdout, flush=True)
        sys.exit(1)
    return configs


def write_netplan(fname, data):
    try:
        path = os.path.join(NETPLAN_DIR, fname)
        with open(path, 'w') as f:
            yaml.safe_dump(data, f, default_flow_style=False, sort_keys=False)
        # Ensure secure permissions (rw for root only)
        os.chmod(path, 0o600)
    except Exception as e:
        print(json.dumps({'error': f'Failed to write netplan file: {e}'}), file=sys.stdout, flush=True)
        sys.exit(1)


def apply_netplan():
    try:
        # Suppress stderr to avoid Open vSwitch warnings in JSON output
        result = subprocess.run(['netplan', 'apply'], 
                              stdout=subprocess.PIPE, 
                              stderr=subprocess.PIPE, 
                              text=True, 
                              check=True)
    except subprocess.CalledProcessError as e:
        print(json.dumps({'error': f'Failed to apply netplan: {e.stderr}'}), file=sys.stdout, flush=True)
        sys.exit(1)


def ensure_network_root(netplan):
    if 'network' not in netplan or not isinstance(netplan['network'], dict):
        netplan['network'] = {}
    net = netplan['network']
    # Enforce standard Linux networking
    net.setdefault('version', 2)
    net['renderer'] = 'networkd'
    return net


def ensure_ethernets(network):
    if 'ethernets' not in network or not isinstance(network['ethernets'], dict):
        network['ethernets'] = {}
    return network['ethernets']


def add_empty_ethernets(network, ifaces):
    eths = ensure_ethernets(network)
    for iface in ifaces:
        # Mark slave/member links optional per netplan docs to avoid boot delays
        if iface not in eths or not isinstance(eths.get(iface), dict):
            eths[iface] = {}
        eths[iface].setdefault('optional', True)


def main():
    try:
        # Read JSON input
        input_data = sys.stdin.read().strip()
        if not input_data:
            print(json.dumps({'error': 'No input provided'}), file=sys.stdout, flush=True)
            sys.exit(1)
            
        req = json.loads(input_data)
        action = req.get('action')
        config = req.get('config')
        fname = req.get('filename', '99-cockpit.yaml')

        if not action or not config:
            print(json.dumps({'error': 'Missing action or config'}), file=sys.stdout, flush=True)
            sys.exit(1)

        configs = load_netplan()
        netplan = configs.get(fname, {'network': {}})
        network = ensure_network_root(netplan)

        # Always merge new constructs, never overwrite
        if action == 'add_bond':
            # Ensure slaves exist in ethernets
            slaves = list(config.get('interfaces') or [])
            if len(slaves) < 2:
                print(json.dumps({'error': 'Bond requires at least 2 interfaces'}), file=sys.stdout, flush=True)
                sys.exit(1)
            add_empty_ethernets(network, slaves)
            # Create bonds section
            network.setdefault('bonds', {})
            # Merge bond, preserve others
            network['bonds'][config['name']] = {
                'interfaces': slaves,
                'parameters': {'mode': config['mode']},
                'dhcp4': True
            }
        elif action == 'add_vlan':
            # Ensure parent link exists in ethernets
            link = config.get('link')
            if link:
                add_empty_ethernets(network, [link])
            network.setdefault('vlans', {})
            network['vlans'][config['name']] = {
                'id': config['id'],
                'link': link,
                'dhcp4': True
            }
        elif action == 'add_bridge':
            members = list(config.get('interfaces') or [])
            add_empty_ethernets(network, members)
            network.setdefault('bridges', {})
            network['bridges'][config['name']] = {
                'interfaces': members,
                'dhcp4': True
            }
        elif action == 'delete':
            # config: {type, name}
            print(f"Attempting to delete {config.get('type')} named {config.get('name')}", file=sys.stderr)
            if config and config.get('type') in network and config.get('name') in network[config['type']]:
                del network[config['type']][config['name']]
                print(f"Deleted {config.get('type')} named {config.get('name')}", file=sys.stderr)
                # Also delete the bond interface using ip link (best-effort)
                if config.get('type') == 'bonds':
                    try:
                        subprocess.run(['ip', 'link', 'delete', config.get('name')], 
                                     stdout=subprocess.PIPE, 
                                     stderr=subprocess.PIPE, 
                                     check=True)
                    except:
                        pass  # Ignore errors if interface doesn't exist
            else:
                print(f"No matching {config.get('type')} named {config.get('name')} found for deletion.", file=sys.stderr)
        else:
            print(json.dumps({'error': 'Unknown action'}), file=sys.stdout, flush=True)
            sys.exit(1)

        write_netplan(fname, netplan)
        apply_netplan()
        
        # Always output clean JSON to stdout
        print(json.dumps({'result': 'success'}), file=sys.stdout, flush=True)
        
    except Exception as e:
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}), file=sys.stdout, flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
