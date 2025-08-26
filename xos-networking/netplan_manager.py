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
        # Debug: Print initial info
        print(f"DEBUG: Starting netplan_manager.py", file=sys.stderr, flush=True)
        
        # Read JSON input
        input_data = sys.stdin.read().strip()
        if not input_data:
            print(json.dumps({'error': 'No input provided'}), file=sys.stdout, flush=True)
            sys.exit(1)
            
        print(f"DEBUG: Received input: {input_data}", file=sys.stderr, flush=True)
            
        req = json.loads(input_data)
        action = req.get('action')
        config = req.get('config')
        fname = req.get('filename', '99-cockpit.yaml')

        print(f"DEBUG: Action={action}, Config={config}", file=sys.stderr, flush=True)

        if not action or not config:
            print(json.dumps({'error': 'Missing action or config'}), file=sys.stdout, flush=True)
            sys.exit(1)

        configs = load_netplan()
        print(f"DEBUG: Loaded netplan configs: {list(configs.keys())}", file=sys.stderr, flush=True)
        
        netplan = configs.get(fname, {'network': {}})
        network = ensure_network_root(netplan)

        # Always merge new constructs, never overwrite
        if action == 'add_bond':
            # Add bonding interface
            bond_name = config.get('name')
            bond_mode = config.get('mode', 'active-backup')
            bond_interfaces = config.get('interfaces', [])
            miimon = config.get('miimon')
            primary = config.get('primary')
            
            if not bond_name or not bond_interfaces:
                print(json.dumps({'error': 'Bond name and interfaces are required'}), flush=True)
                sys.exit(1)
            
            if len(bond_interfaces) < 2:
                print(json.dumps({'error': 'At least 2 interfaces required for bonding'}), flush=True)
                sys.exit(1)
            
            # Ensure ethernets section exists for slave interfaces
            add_empty_ethernets(network, bond_interfaces)
            
            # Create bonds section
            if 'bonds' not in network:
                network['bonds'] = {}
            
            # Configure the bond
            bond_config = {
                'interfaces': bond_interfaces,
                'parameters': {
                    'mode': bond_mode
                }
            }
            
            # Add MII monitoring if specified
            if miimon and isinstance(miimon, int) and miimon > 0:
                bond_config['parameters']['mii-monitor-interval'] = miimon
            
            # Add primary interface if specified and valid
            if primary and primary in bond_interfaces:
                bond_config['parameters']['primary'] = primary
            
            # Add additional parameters based on mode
            if bond_mode == '802.3ad':
                bond_config['parameters']['lacp-rate'] = 'fast'
                bond_config['parameters']['transmit-hash-policy'] = 'layer3+4'
            elif bond_mode in ['balance-tlb', 'balance-alb']:
                if not miimon:
                    bond_config['parameters']['mii-monitor-interval'] = 100
            
            network['bonds'][bond_name] = bond_config
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
        elif action == 'set_ip':
            # Set IP address configuration for an interface
            iface_name = config.get('name')
            static_ip = config.get('static_ip')
            gateway = config.get('gateway')
            dns = config.get('dns')
            
            if not iface_name or not static_ip:
                print(json.dumps({'error': 'Interface name and static IP are required'}), flush=True)
                sys.exit(1)
            
            # Debug: Print current action information
            print(f"DEBUG: Configuring IP for {iface_name}: static_ip={static_ip}, gateway={gateway}, dns={dns}", file=sys.stderr, flush=True)
            
            # Determine the correct section based on interface type
            target_section = None
            target_config = None
            
            if iface_name.startswith('bond'):
                # Bond interface - configure in bonds section
                if 'bonds' in network and iface_name in network['bonds']:
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
                else:
                    # Create bond section if it doesn't exist
                    network.setdefault('bonds', {})
                    network['bonds'][iface_name] = {'interfaces': []}
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
            elif iface_name.startswith('br'):
                # Bridge interface - configure in bridges section
                if 'bridges' in network and iface_name in network['bridges']:
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
                else:
                    # Create bridge section if it doesn't exist
                    network.setdefault('bridges', {})
                    network['bridges'][iface_name] = {'interfaces': []}
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
            elif '.' in iface_name and not iface_name.startswith('br'):
                # VLAN interface - configure in vlans section
                if 'vlans' in network and iface_name in network['vlans']:
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
                else:
                    # Create basic VLAN config if it doesn't exist
                    network.setdefault('vlans', {})
                    parts = iface_name.split('.')
                    network['vlans'][iface_name] = {
                        'id': int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1,
                        'link': parts[0] if len(parts) > 0 else 'eth0'
                    }
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
            else:
                # Regular interface - configure in ethernets section
                add_empty_ethernets(network, [iface_name])
                target_section = 'ethernets'
                target_config = network['ethernets'][iface_name]
            
            # Configure the IP settings
            if target_config is not None:
                target_config['dhcp4'] = False  # Disable DHCP for static IP
                target_config['addresses'] = [static_ip]
                
                # Set gateway if provided
                if gateway:
                    target_config['gateway4'] = gateway
                
                # Set DNS if provided  
                if dns:
                    dns_list = [d.strip() for d in dns.split(',') if d.strip()]
                    if dns_list:
                        target_config['nameservers'] = {'addresses': dns_list}
                        
                print(f"DEBUG: Configured IP for {iface_name} in {target_section} section", file=sys.stderr, flush=True)
                print(f"DEBUG: Config now: {target_config}", file=sys.stderr, flush=True)
            else:
                raise Exception(f"Could not determine configuration section for interface {iface_name}")

        elif action == 'set_mtu':
            # Set MTU for an interface
            iface_name = config.get('name')
            mtu_value = config.get('mtu')
            
            if not iface_name or not mtu_value:
                print(json.dumps({'error': 'Interface name and MTU value are required'}), flush=True)
                sys.exit(1)
            
            if not isinstance(mtu_value, int) or mtu_value < 68 or mtu_value > 9000:
                print(json.dumps({'error': 'MTU must be an integer between 68 and 9000'}), flush=True)
                sys.exit(1)
            
            # Determine the correct section based on interface type
            target_section = None
            target_config = None
            
            if iface_name.startswith('bond'):
                # Bond interface - configure in bonds section
                if 'bonds' in network and iface_name in network['bonds']:
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
                else:
                    # Create bond section if it doesn't exist
                    network.setdefault('bonds', {})
                    network['bonds'][iface_name] = {'interfaces': []}
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
            elif iface_name.startswith('br'):
                # Bridge interface - configure in bridges section
                if 'bridges' in network and iface_name in network['bridges']:
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
                else:
                    # Create bridge section if it doesn't exist
                    network.setdefault('bridges', {})
                    network['bridges'][iface_name] = {'interfaces': []}
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
            elif '.' in iface_name and not iface_name.startswith('br'):
                # VLAN interface - configure in vlans section
                if 'vlans' in network and iface_name in network['vlans']:
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
                else:
                    # Create basic VLAN config if it doesn't exist
                    network.setdefault('vlans', {})
                    parts = iface_name.split('.')
                    network['vlans'][iface_name] = {
                        'id': int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1,
                        'link': parts[0] if len(parts) > 0 else 'eth0'
                    }
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
            else:
                # Regular interface - configure in ethernets section
                add_empty_ethernets(network, [iface_name])
                target_section = 'ethernets'
                target_config = network['ethernets'][iface_name]
            
            # Set MTU
            if target_config is not None:
                target_config['mtu'] = mtu_value
                print(f"Set MTU {mtu_value} for {iface_name} in {target_section} section", file=sys.stderr, flush=True)
            else:
                raise Exception(f"Could not determine configuration section for interface {iface_name}")
        else:
            print(json.dumps({'error': 'Unknown action'}), file=sys.stdout, flush=True)
            sys.exit(1)

        write_netplan(fname, netplan)
        print(f"DEBUG: Successfully wrote netplan file", file=sys.stderr, flush=True)
        
        apply_netplan()
        print(f"DEBUG: Successfully applied netplan", file=sys.stderr, flush=True)
        
        # Always output clean JSON to stdout
        print(json.dumps({'result': 'success'}), file=sys.stdout, flush=True)
        
    except Exception as e:
        print(f"DEBUG: Exception occurred: {e}", file=sys.stderr, flush=True)
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}), file=sys.stdout, flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
