"""
server/routes/dev_login.py

POST /dev-login
Body: {"role":"doctor|admin|researcher","name":"Display Name"}
Returns: {"success": true, "token": "...", "role": "doctor", "name": "..."}

NOTE: This route is intended for local development only. It creates an in-memory
session token in `server.auth.SESSIONS` so you can test the frontend without
creating a database user. Do NOT enable in production.
"""
from server import auth as auth_module
import json


def handle(handler):
    try:
        length = int(handler.headers.get('Content-Length') or 0)
        body = handler.rfile.read(length) if length else b'{}'
        data = json.loads(body.decode('utf-8') or '{}')
    except Exception:
        data = {}

    role = (data.get('role') or 'doctor').lower()
    name = data.get('name') or f'Dev {role.title()}'

    # Create a fake token and session entry
    import secrets
    token = secrets.token_hex(32)
    auth_module.SESSIONS[token] = {
        'user_id': 0,
        'name': name,
        'email': f'dev+{role}@local',
        'role': role,
    }

    handler.send_response(200)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    handler.wfile.write(json.dumps({'success': True, 'token': token, 'role': role, 'name': name}).encode('utf-8'))
