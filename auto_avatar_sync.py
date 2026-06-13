import os
import sys
import json
import urllib.request

def get_base_path():
    return os.path.dirname(os.path.abspath(__file__))

def pull_from_firestore():
    url = "https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/HG_pencil"
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=5) as res:
            doc = json.loads(res.read().decode('utf-8'))
            status_json = doc.get("fields", {}).get("status_json", {}).get("stringValue", "")
            if status_json:
                return json.loads(status_json)
    except Exception:
        pass
    return None

def main():
    base_path = get_base_path()
    
    # 1. Firestore から最新の custom_title を取得
    data = pull_from_firestore()
    if not data:
        print("NO_SYNC_FAIL")
        sys.exit(0)
        
    custom_title = data.get("custom_title", "")
    
    # 2. 前回の称号を読み込む
    last_title_path = os.path.join(base_path, "last_avatar_title.txt")
    last_title = ""
    if os.path.exists(last_title_path):
        try:
            with open(last_title_path, "r", encoding="utf-8") as f:
                last_title = f.read().strip()
        except Exception:
            pass
            
    # 3. 比較
    if custom_title == last_title:
        # 変更なし
        print("NO_CHANGE")
        sys.exit(0)
    else:
        # 変更あり
        print("CHANGE_DETECTED")
        print(f"NEW_TITLE:{custom_title}")
        
        # ローカルキャッシュ status_HG_pencil.json に同期
        status_json_path = os.path.join(base_path, "status_HG_pencil.json")
        try:
            with open(status_json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
            
        sys.exit(1)

if __name__ == "__main__":
    main()
