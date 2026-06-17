import http.server
import socketserver
import json
import os
import webbrowser
import sys
import socket
import re
from datetime import datetime
from urllib.parse import urlparse, parse_qs


# Workaround for standard output encoding in Windows environment
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class RPGStatusRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        # Handle CORS preflight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        api_path = parsed_path.path
        query = parse_qs(parsed_path.query)
        user_id = query.get('user', ['HG_pencil'])[0]
        
        # Safe user ID validation
        if not re.match(r'^[a-zA-Z0-9_-]+$', user_id):
            user_id = "HG_pencil"

        # Handling API endpoints
        if api_path == '/api/status':
            status_path = os.path.join(DIRECTORY, f'status_{user_id}.json')
            if not os.path.exists(status_path) and user_id == "HG_pencil":
                # Fallback to traditional file
                fallback_path = os.path.join(DIRECTORY, 'status.json')
                if os.path.exists(fallback_path):
                    status_path = fallback_path
            
            if os.path.exists(status_path):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(status_path, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.send_error(404, f"status_{user_id}.json not found")
        elif api_path == '/api/users':
            users = set()
            users.add('HG_pencil')
            if os.path.exists(DIRECTORY):
                for f in os.listdir(DIRECTORY):
                    if f.startswith('status_') and f.endswith('.json'):
                        u = f[7:-5]
                        if re.match(r'^[a-zA-Z0-9_-]+$', u) and u != "tests":
                            users.add(u)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"users": sorted(list(users))}).encode('utf-8'))
        elif api_path == '/api/tests':

            tests_path = os.path.join(DIRECTORY, 'status_tests.json')
            if os.path.exists(tests_path):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(tests_path, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.send_error(404, "status_tests.json not found")
        else:
            # Static file path resolution (prefix correction)
            clean_path = api_path
            
            if clean_path == '/' or clean_path == '':
                new_path = '/web/index.html'
            elif not clean_path.startswith('/web/') and not clean_path.startswith('/assets/'):
                new_path = '/web' + clean_path
            else:
                new_path = clean_path
                
            # Recombine the query part
            if parsed_path.query:
                self.path = new_path + '?' + parsed_path.query
            else:
                self.path = new_path
                
            super().do_GET()


    def do_POST(self):
        # POST endpoints for submit_test and judge_training are deprecated (handled client-side or offline)
        self.send_response(404)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "error", "message": "POST endpoints are deprecated"}).encode('utf-8'))

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def main():
    server_address = ('127.0.0.1', PORT)
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        httpd = socketserver.TCPServer(server_address, RPGStatusRequestHandler)
    except OSError as e:
        local_ip = get_local_ip()
        print(f"[!] Server start error: Port {PORT} is already in use.")
        print("    Another server instance might be running.")
        print(f"[+] Connect from mobile phone: http://{local_ip}:{PORT}/")
        webbrowser.open(f"http://localhost:{PORT}/")
        sys.exit(0)
        
    local_ip = get_local_ip()
    print("======================================================================")
    print(f"[+] Antigravity Status Web Server running at: http://localhost:{PORT}/")
    print(f"[+] Mobile access URL on the same Wi-Fi:")
    print(f"    http://{local_ip}:{PORT}/")
    print("======================================================================")
    print("[+] Press Ctrl+C to stop the server")
    
    webbrowser.open(f"http://localhost:{PORT}/")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[-] Server stopped.")
        httpd.server_close()
        sys.exit(0)

if __name__ == "__main__":
    main()
