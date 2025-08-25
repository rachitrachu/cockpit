#!/usr/bin/env python3
import sys
import yaml
import os
import json
import traceback

NETPLAN_DIR = '/etc/netplan'

def load_netplan():
    configs = {}
    try:
        for fname in os.listdir(NETPLAN_DIR):
            if fname.endswith('.yaml') or fname.endswith('.yml'):
                try:
                    with open(os.path.join(NETPLAN_DIR, fname)) as f:
                        loaded = yaml.safe_load(f)
                        if loaded is None:
                            loaded = {}
                        configs[fname] = loaded
                except:
                    pass
    except Exception as e:
        print(json.dumps({'error': f'Failed to load netplan configs: {e}'}), flush=True)
        sys.exit(1)
    return configs

def write_netplan(fname, data):
    try:
        path = os.path.join(NETPLAN_DIR, fname)
        with open(path, 'w') as f:
            yaml.safe_dump(data, f, default_flow_style=False, sort_keys=False)
        os.chmod(path, 0o600)
    except Exception as e:
        print(json.dumps({'error': f'Failed to write netplan file: {e}'}), flush=True)
        sys.exit(1)

def main():
    try:
        # Read JSON input with timeout protection
        import signal
        def timeout_handler(signum, frame):
            raise TimeoutError("Input timeout")
        
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(5)  # 5 second timeout for input
        
        try:
            input_data = sys.stdin.read().strip()
        finally:
            signal.alarm(0)
        
        if not input_data:
            print(json.dumps({'error': 'No input provided'}), flush=True)
            sys.exit(1)
            
        req = json.loads(input_data)
        action = req.get('action')
        config = req.get('config')
        fname = req.get('filename', '99-cockpit.yaml')

        if not action or not config:
            print(json.dumps({'error': 'Missing action or config'}), flush=True)
            sys.exit(1)

        configs = load_netplan()
        netplan = configs.get(fname, {'network': {}})
        
        if 'network' not in netplan:
            netplan['network'] = {}
        network = netplan['network']
        network.setdefault('version', 2)
        network['renderer'] = 'networkd'

        if action == 'add_bond':
            slaves = list(config.get('interfaces') or [])
            if len(slaves) < 2:
                print(json.dumps({'error': 'Bond requires at least 2 interfaces'}), flush=True)
                sys.exit(1)
            
            # Add ethernets
            network.setdefault('ethernets', {})
            for iface in slaves:
                network['ethernets'].setdefault(iface, {})
            
            # Add bond
            network.setdefault('bonds', {})
            network['bonds'][config['name']] = {
                'interfaces': slaves,
                'parameters': {'mode': config['mode']},
                'dhcp4': True
            }
        else:
            print(json.dumps({'error': 'Unsupported action for test'}), flush=True)
            sys.exit(1)

        write_netplan(fname, netplan)
        
        # Skip netplan apply for now - just test file creation
        print(json.dumps({'result': 'success', 'note': 'File created, netplan apply skipped for testing'}), flush=True)
        
    except Exception as e:
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}), flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()