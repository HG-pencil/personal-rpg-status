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


# Windows環境での標準出力エンコーディング対策
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
        # CORSプレフライトリクエストへの対応
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        api_path = parsed_path.path
        query = parse_qs(parsed_path.query)
        user_id = query.get('user', ['kingo'])[0]
        
        # 安全なユーザーIDバリデーション
        if not re.match(r'^[a-zA-Z0-9_-]+$', user_id):
            user_id = "kingo"

        # APIエンドポイントのハンドリング
        if api_path == '/api/status':
            status_path = os.path.join(DIRECTORY, f'status_{user_id}.json')
            if not os.path.exists(status_path) and user_id == "kingo":
                # 従来ファイルへのフォールバック
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
            users.add('kingo')
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
            # 静的ファイルのパス解決（プレフィックス補正）
            clean_path = api_path
            
            if clean_path == '/' or clean_path == '':
                new_path = '/web/index.html'
            elif not clean_path.startswith('/web/') and not clean_path.startswith('/assets/'):
                new_path = '/web' + clean_path
            else:
                new_path = clean_path
                
            # クエリ部分を再結合
            if parsed_path.query:
                self.path = new_path + '?' + parsed_path.query
            else:
                self.path = new_path
                
            super().do_GET()


    def do_POST(self):
        parsed_path = urlparse(self.path)
        api_path = parsed_path.path
        query = parse_qs(parsed_path.query)
        user_id = query.get('user', ['kingo'])[0]
        
        # 安全なユーザーIDバリデーション
        if not re.match(r'^[a-zA-Z0-9_-]+$', user_id):
            user_id = "kingo"

        # 試験回答提出 API エンドポイント
        if api_path == '/api/submit_test':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                submitted_answer = json.loads(post_data.decode('utf-8'))
                
                # バリデーション
                required_fields = ["test_id", "param", "target_gate", "answer", "elapsed_seconds", "timeout"]
                if not all(field in submitted_answer for field in required_fields):
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Missing required fields"}).encode('utf-8'))
                    return
                
                # メタデータ付与
                submitted_answer["submitted_at"] = datetime.now().isoformat()
                
                # pending_answers_{user_id}.json に保存
                pending_path = os.path.join(DIRECTORY, f'pending_answers_{user_id}.json')
                pending_data = []
                if os.path.exists(pending_path):
                    try:
                        with open(pending_path, 'r', encoding='utf-8') as f:
                            pending_data = json.load(f)
                    except Exception:
                        pass
                
                pending_data.append(submitted_answer)
                
                with open(pending_path, 'w', encoding='utf-8') as f:
                    json.dump(pending_data, f, ensure_ascii=False, indent=2)
                
                # 測定チケットの消費 ＆ status_{user_id}.json 履歴更新
                status_path = os.path.join(DIRECTORY, f'status_{user_id}.json')
                if not os.path.exists(status_path) and user_id == "kingo":
                    fallback_path = os.path.join(DIRECTORY, 'status.json')
                    if os.path.exists(fallback_path):
                        status_path = fallback_path
                        
                if os.path.exists(status_path):
                    with open(status_path, 'r', encoding='utf-8') as f:
                        status_data = json.load(f)
                    
                    is_training_task = submitted_answer.get("test_id", "").startswith("TRAIN-")
                    
                    tickets = status_data.get("tickets", {})
                    curr_tickets = tickets.get("measurement", 0)
                    
                    # 通常の試験の場合のみチケットを消費
                    if not is_training_task and curr_tickets > 0:
                        tickets["measurement"] = curr_tickets - 1
                        
                    # 履歴追加
                    history = status_data.get("history", [])
                    elapsed_min = round(submitted_answer["elapsed_seconds"] / 60, 1)
                    status_str = "TIMEOUT" if submitted_answer["timeout"] else "COMPLETED"
                    
                    event_prefix = "Training Mission Submitted" if is_training_task else "Exam Answer Submitted"
                    
                    history.append({
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "event": f"{event_prefix}: {submitted_answer['test_id']} ({status_str} in {elapsed_min}m)",
                        "status_change": {}
                    })
                    
                    status_data["last_updated"] = datetime.now().isoformat()
                    
                    save_status_path = os.path.join(DIRECTORY, f'status_{user_id}.json')
                    with open(save_status_path, 'w', encoding='utf-8') as f:
                        json.dump(status_data, f, ensure_ascii=False, indent=2)
                
                # レスポンス返却
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {"status": "success", "message": "Test answer submitted successfully"}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": f"Server error: {str(e)}"}).encode('utf-8'))
        elif api_path == '/api/judge_training':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                test_id = data.get("test_id")
                code = data.get("code", "")
                
                if test_id != "TRAIN-DEV-01":
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Unsupported training task"}).encode('utf-8'))
                    return
                
                # 一時ファイルにコードを書き出す
                temp_filename = os.path.join(DIRECTORY, "temp_fizzbuzz_run.py")
                with open(temp_filename, "w", encoding="utf-8") as f:
                    f.write(code)
                
                # サブプロセスで実行
                import subprocess
                try:
                    result = subprocess.run(
                        [sys.executable, temp_filename],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        encoding="utf-8"
                    )
                    stdout = result.stdout
                    stderr = result.stderr
                    returncode = result.returncode
                except subprocess.TimeoutExpired:
                    stdout = ""
                    stderr = "Error: Timeout (5 seconds expired)"
                    returncode = -1
                except Exception as e:
                    stdout = ""
                    stderr = f"Error: {str(e)}"
                    returncode = -1
                finally:
                    if os.path.exists(temp_filename):
                        os.remove(temp_filename)
                
                # 実行エラー時の処理
                if returncode != 0:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    response = {
                        "status": "success",
                        "passed": False,
                        "error": stderr,
                        "output": stdout
                    }
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                    return
                
                # 出力結果の判定 (期待される FizzBuzz ライン)
                expected_lines = [
                    "1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz",
                    "11", "Fizz", "13", "14", "FizzBuzz", "16", "17", "Fizz", "19", "Buzz",
                    "Fizz", "22", "23", "Fizz", "Buzz", "26", "Fizz", "28", "29", "FizzBuzz"
                ]
                
                # 改行区切りで空行を除外してトリム
                actual_lines = [line.strip() for line in stdout.strip().split('\n') if line.strip()]
                
                # 判定
                passed = actual_lines == expected_lines
                
                if passed:
                    # チケット回復 ＆ status_{user_id}.json 履歴更新
                    status_path = os.path.join(DIRECTORY, f'status_{user_id}.json')
                    if not os.path.exists(status_path) and user_id == "kingo":
                        fallback_path = os.path.join(DIRECTORY, 'status.json')
                        if os.path.exists(fallback_path):
                            status_path = fallback_path
                            
                    if os.path.exists(status_path):
                        with open(status_path, 'r', encoding='utf-8') as f:
                            status_data = json.load(f)
                        
                        tickets = status_data.get("tickets", {})
                        tickets["measurement"] = 1 # チケット回復！
                        
                        # 履歴追加
                        history = status_data.get("history", [])
                        history.append({
                            "date": datetime.now().strftime("%Y-%m-%d"),
                            "event": "Training Passed: Python FizzBuzz Execution (Auto Judged)",
                            "status_change": {}
                        })
                        
                        status_data["last_updated"] = datetime.now().isoformat()
                        
                        save_status_path = os.path.join(DIRECTORY, f'status_{user_id}.json')
                        with open(save_status_path, 'w', encoding='utf-8') as f:
                            json.dump(status_data, f, ensure_ascii=False, indent=2)
                
                # 結果をレスポンス
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response = {
                    "status": "success",
                    "passed": passed,
                    "output": "\n".join(actual_lines),
                    "expected": "\n".join(expected_lines)
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": f"Server error: {str(e)}"}).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": "Endpoint not found"}).encode('utf-8'))

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
    server_address = ('', PORT)
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        httpd = socketserver.TCPServer(server_address, RPGStatusRequestHandler)
    except OSError as e:
        local_ip = get_local_ip()
        print(f"[!] サーバー起動エラー: ポート {PORT} は既に使用されています。")
        print("    すでに別のサーバーが起動している可能性があります。")
        print(f"[+] 📱 スマホ(iPhone等)から接続する場合: http://{local_ip}:{PORT}/")
        webbrowser.open(f"http://localhost:{PORT}/")
        sys.exit(0)
        
    local_ip = get_local_ip()
    print("======================================================================")
    print(f"[+] Antigravity Status Web Server running at: http://localhost:{PORT}/")
    print(f"[+] 📱 同一Wi-Fi上のスマホ(iPhone等)からのアクセス用URL:")
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
