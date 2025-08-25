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
    for fname in os.listdir(NETPLAN_DIR):
        if fname.endswith('.yaml') or fname.endswith('.yml'):
            with open(os.path.join(NETPLAN_DIR, fname)) as f:
                loaded = yaml.safe_load(f)
                if loaded is None:
                    loaded = {}
                configs[fname] = loaded
    return configs


def write_netplan(fname, data):
    try:
        path = os.path.join(NETPLAN_DIR, fname)
        with open(path, 'w') as f:
            yaml.safe_dump(data, f, default_flow_style=False, sort_keys=False)
        # Ensure secure permissions (rw for root only)
        os.chmod(path, 0o600)
    except Exception as e:
        print(json.dumps({'error': f'Failed to write netplan file: {e}', 'trace': traceback.format_exc()}))
        sys.exit(1)


def apply_netplan():
    try:
        subprocess.run(['netplan', 'apply'], check=True)
    except Exception as e:
        print(json.dumps({'error': f'Failed to apply netplan: {e}', 'trace': traceback.format_exc()}))
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
        eths.setdefault(iface, {})


def main():
    try:
        req = json.load(sys.stdin)
        action = req.get('action')
        config = req.get('config')
        fname = req.get('filename', '99-cockpit.yaml')

        configs = load_netplan()
        netplan = configs.get(fname, {'network': {}})
        network = ensure_network_root(netplan)

        # Always merge new constructs, never overwrite
        if action == 'add_bond':
            # Ensure slaves exist in ethernets
            slaves = list(config.get('interfaces') or [])
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
            if config and config.get('type') in network and config.get('name') in network[config['type']]:
                del network[config['type']][config['name']]
        else:
            print(json.dumps({'error': 'Unknown action'}))
            sys.exit(1)

        write_netplan(fname, netplan)
        apply_netplan()
        print(json.dumps({'result': 'success'}))
    except Exception as e:
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}))
        sys.exit(1)


if __name__ == '__main__':
    main()
