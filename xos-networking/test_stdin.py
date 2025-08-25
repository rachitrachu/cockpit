#!/usr/bin/env python3
import sys
import json

try:
    # Read input with a timeout
    input_data = sys.stdin.read().strip()
    
    if not input_data:
        result = {'error': 'No input received'}
    else:
        try:
            req = json.loads(input_data)
            result = {'success': True, 'received': req}
        except json.JSONDecodeError as e:
            result = {'error': f'JSON decode error: {e}', 'received_raw': input_data}
    
    print(json.dumps(result))
    sys.stdout.flush()
    
except Exception as e:
    print(json.dumps({'error': f'Exception: {e}'}))
    sys.stdout.flush()
    sys.exit(1)