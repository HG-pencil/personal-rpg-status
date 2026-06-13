import os
import sys
import json
import argparse
import subprocess
import time
import re
from datetime import datetime


# Windows環境での標準出力エンコーディング対策
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 依存ライブラリのチェック
try:
    import matplotlib.pyplot as plt
    import numpy as np
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False

def translate_to_quest(raw_title, raw_desc):
    # デフォルト値
    title = raw_title
    desc = raw_desc
    rank = "C"
    client = "冒険者ギルド"
    
    # 判定の正規化
    t_norm = raw_title.lower()
    
    # 努力値パラメータのデフォルト値（推測用）
    param = "MND"
    
    # マッピングルール
    if any(x in t_norm for x in ["撤退基準", "最大許容損失", "分散基準", "損切り"]):
        client = "投資審議会"
        rank = "B"
        param = "MND"
        if "撤退基準" in raw_title:
            title = "【防衛結界】投資の防衛基準ハードコード"
            desc = "相場からの感情デバフを遮断せよ。総資金10%損失時に全ポジションを強制決済する緊急セーフティと、単一銘柄の保有率を15%以内に抑える分散結界を魔導回路（システム）へ今日実装し、その結果を報告すべし。"
        elif "最大許容損失" in raw_title:
            title = "【防衛戦】最大許容損失額の封印"
            desc = "総投資資金の10%を下回った時点で、感情や独自の相場観を一切無視して全ポジションを強制決済（プラグを抜く）するルールを今日システムにハードコーディングし、完了報告せよ。"
        elif "分散基準" in raw_title:
            title = "【防御強化】アセット分散結界の構築"
            desc = "単一の銘柄への集中投資バグを防ぐため、1つのアセット・銘柄への投資割合を総資金の15%以内に制限する物理結界を今日設定し、完了報告せよ。"
            
    elif any(x in t_norm for x in ["家庭内", "妻", "対話"]):
        client = "家庭運営ギルド"
        rank = "A"
        param = "CHA"
        title = "【聖域守護】聖域の守護者との対話"
        desc = "何よりも重要な「平穏な生活（聖域）」を守るため、聖域の守護者（妻）と30分間の対話を今日実行し、家庭の安定度（バグ回収）を確認せよ。その結果を実績報告すべし。"
        
    elif any(x in t_norm for x in ["生ログ", "インデックス"]):
        client = "AI開拓者連盟"
        rank = "C"
        param = "DEV"
        title = "【データ整理】音声ログへのタグ付与"
        desc = "未来のAI魔導の抽出精度を保つため、本日の音声ログ（NotebookLM用）の末尾5秒に必ず「キーワード：重量物、羽田、トラブル」などの検索用ハッシュタグを口頭で付与して録音を完了し、実績報告せよ。"
        
    elif "精密検査" in raw_title:
        client = "健康管理神殿"
        rank = "S"
        param = "VIT"
        title = "【肉体診断】健康管理神殿の予約または受診"
        desc = "健康データの赤信号をデバッグするため、今日中に内科・消化器内科での精密検査の「予約（または受診）」を完了し、その実行結果を報告せよ。"
        
    elif "日常メンテナンス" in raw_title or "徒歩" in raw_title or "シーパップ" in raw_title:
        client = "健康管理神殿"
        rank = "B"
        param = "VIT"
        title = "【日常鍛錬】日常メンテナンスの継続"
        desc = "ハードウェア維持のため、本日「1時間の徒歩鍛錬」および睡眠時の「シーパップ装着」を実行し、正常に完了したことを報告せよ。"
        
    elif "副業規定" in raw_title or "法的リスク" in raw_title:
        client = "防波堤（会社）守備隊"
        rank = "C"
        param = "INT"
        title = "【魔導規則】副業に関する法的リスクの整理"
        desc = "安全な複線化に向けて、勤務先の就業規則（副業規定、競業規定、情報管理規定）を今日読み直し、潜むリスクと安全な防衛線を整理した実績を報告せよ。"
        
    elif "ブラックボックス" in raw_title:
        client = "AI開拓者連盟"
        rank = "A"
        param = "DEV"
        title = "【防御強化】便利屋化を防ぐブラックボックスの構築"
        desc = "業務範囲2倍化の危機を防ぐため、社内システムを「私的Googleアカウントを経由しなければ動かない仕様」にするための基本設計（仕様策定）を今日中に1歩進め、その進捗を報告せよ。"
        
    elif "受託案件" in raw_title:
        client = "商業ギルド"
        rank = "A"
        param = "WIS"
        title = "【商業任務】受託案件獲得アクション"
        desc = "会社給与以外の収入源を開拓するため、Kintoneツールの外販準備や案件獲得に向けた初動アクションを今日実行し、その取り組み内容を報告せよ。"
        
    elif any(x in t_norm for x in ["音声ログ蓄積", "現場知識", "蓄積"]):
        client = "賢者の塔"
        rank = "B"
        param = "WIS"
        title = "【古代知識】現場経験の音声ログ蓄積"
        desc = "20年間の泥臭い現場ノウハウをAIデータベースへ組み込むため、本日の現場知識をハッシュタグ付きで音声ログとして録音（NotebookLMへ蓄積）し、完了を報告せよ。"
    else:
        # デフォルト変換
        title = f"【任務】{raw_title}"
        
        # タイトルや説明文から適合する努力値パラメータを推測
        search_text = (title + " " + desc + " " + raw_title + " " + raw_desc).lower()
        if any(x in search_text for x in ["筋力", "徒歩", "歩行", "運動", "歩く", "str"]):
            param = "STR"
        elif any(x in search_text for x in ["健康", "睡眠", "cpap", "シーパップ", "受診", "検査", "内科", "消化器", "vit"]):
            param = "VIT"
        elif any(x in search_text for x in ["副業規定", "規則", "法律", "規定", "契約", "法的", "論理", "構造", "int"]):
            param = "INT"
        elif any(x in search_text for x in ["知識", "音声", "ログ", "蓄積", "ノウハウ", "教養", "wis"]):
            param = "WIS"
        elif any(x in search_text for x in ["投資", "資金", "損失", "基準", "撤退", "損切り", "感情", "規律", "mnd"]):
            param = "MND"
        elif any(x in search_text for x in ["妻", "家庭", "家族", "対話", "信頼", "cha"]):
            param = "CHA"
        elif any(x in search_text for x in ["システム", "開発", "自動化", "設計", "ブラックボックス", "ai", "開拓", "コード", "dev"]):
            param = "DEV"
        else:
            param = "MND"

    # 難易度（Rank）に応じた努力値ポイント決定
    points = 3
    if rank == "S":
        points = 10
    elif rank == "A":
        points = 7
    elif rank == "B":
        points = 5
    elif rank == "C":
        points = 3
        
    reward = f"{param} +{points}"

    return {
        "step": f"Rank {rank}",
        "title": title,
        "description": desc,
        "client": client,
        "reward": reward,
        "original_title": raw_title,
        "status": "pending"
    }

def generate_roadmap_events(roadmap, status_data):
    events = []
    if not roadmap or "phases" not in roadmap:
        return events
        
    status = status_data.get("status", {})
    
    # 進行中の項目をチェック
    for phase in roadmap.get("phases", []):
        for item in phase.get("items", []):
            param_bind = item.get("param_bind")
            if not param_bind:
                continue
                
            p_data = status.get(param_bind, {})
            curr_val = p_data.get("current", 100) if p_data else 100
            threshold = 280 if param_bind == "CHA" else 300
            
            # 閾値未満（PROGRESS状態）の場合にイベントを生成
            if curr_val < threshold:
                title = f"【突発イベント】{item.get('title')}"
                desc = item.get("description", "")
                client = "冒険者ギルド"
                rank = "B"
                
                # パラメータやキーワードに応じたゲーム風の個別カスタマイズ
                if param_bind == "VIT" and "健康" in item.get("title", ""):
                    title = "【緊急指令】駆け込め！ホスピタル！！"
                    desc = "体に長年蓄積された毒（BMI・肝機能等の異常魔力）が体を蝕み始めている。今すぐ町の内科に駆け込み、精密検査（デバッグ）を受診せよ！その実績報告をもってクエストクリアとする。"
                    client = "健康管理神殿"
                    rank = "S"
                elif param_bind == "DEV" and "ブラックボックス" in item.get("title", ""):
                    title = "【防衛任務】便利屋化を防ぐブラックボックスの構築"
                    desc = "人員不足による「業務範囲2倍化リスク」の魔の手が迫っている！社内システムを「私的Googleアカウントを経由しなければ動かない設計」にし、自分を不要にする絶対防御 ofブラックボックス仕様を策定せよ。"
                    title = "【防衛任務】便利屋化を防ぐブラックボックスの構築"
                    desc = "人員不足による「業務範囲2倍化リスク」の魔の手が迫っている！社内システムを「私的Googleアカウントを経由しなければ動かない設計」にし、自分を不要にする絶対防御のブラックボックス仕様を策定せよ。"
                    client = "AI開拓者連盟"
                    rank = "S"
                elif param_bind == "WIS" and "現場知識" in item.get("title", ""):
                    title = "【伝承試練】賢者の音声ログ百連発！"
                    desc = "20年間にわたる重量機工・統括管理の貴重な泥臭い経験（古代の英知）が散逸する危機にある。ハッシュタグ付きで音声ログをNotebookLMにひたすら蓄積し、知識を伝承せよ。"
                    client = "賢者の塔"
                    rank = "B"
                elif param_bind == "MND" and "撤退基準" in item.get("title", ""):
                    title = "【精神試練】幻惑の損切りと絶対撤退規律"
                    desc = "投資における自己規律を試す試練。市場の幻惑魔法を退け、撤退基準（総資金10%損失での強制決済）と分散結界（単一15%以内）の規律を心魂に刻み込め。"
                    client = "投資審議会"
                    rank = "B"
                elif param_bind == "CHA" and "家庭" in item.get("title", ""):
                    title = "【守護試練】日常対話による家庭円満結界"
                    desc = "最上位の価値観である家庭の平穏（聖域）を守るための試練。毎週日曜日の午前中など、固定で「週次30分」の対話時間をスケジュールに強制ロックし、バグを未然に回収せよ。"
                    client = "家庭運営ギルド"
                    rank = "A"
                
                # 難易度（Rank）に応じた努力値ポイント決定
                points = 5
                if rank == "S":
                    points = 10
                elif rank == "A":
                    points = 7
                elif rank == "B":
                    points = 5
                elif rank == "C":
                    points = 3
                    
                reward = f"{param_bind} +{points}"
                
                events.append({
                    "step": f"Rank {rank}",
                    "title": title,
                    "description": desc,
                    "client": client,
                    "reward": reward,
                    "original_title": item.get("title"),
                    "status": "pending"
                })
    return events

def parse_monthly_goals(user_id="HG_pencil"):
    target_base = r"G:\マイドライブ\ノートブックLM用データ格納場所\我部宏和\RPG基本データ"
    file_path = os.path.join(target_base, user_id, "今月の目標.txt")
    if not os.path.exists(file_path):
        return []
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        quests = []
        step_matches = list(re.finditer(r'(Step \d+:.*?)(?=Step \d+:|$)', content, re.DOTALL))
        
        # ターゲットタスクのパターン定義
        targets = [
            "投資システムの「撤退基準」と「分散基準」の絶対設定",
            "大量生ログへの「インデックス付与」ルールの徹底",
            "Discord遠隔操作システムの運用テスト実施",
            "BOOTH公開ツールの導線作り（情報発信の初動）",
            "人生RPGツールの自己運用",
            "ローカルLLM導入交渉とステルス自動化の両立",
            "Kintone業務自動化の外注管理",
            "「家庭内運用（妻）」の継続",
            "健康ハードウェアの保守・データ反映",
            "片道45分の徒歩通勤と、CPAP治療を確実に継続する"
        ]
        
        if not step_matches:
            # Step がない場合のフォールバック（改行区切りや単純ターゲットマッチ）
            found_tasks = []
            for target in targets:
                idx = content.find(target)
                if idx != -1:
                    found_tasks.append((idx, target))
            found_tasks.sort()
            
            for i in range(len(found_tasks)):
                start_idx, title = found_tasks[i]
                end_idx = found_tasks[i+1][0] if i+1 < len(found_tasks) else len(content)
                desc = content[start_idx + len(title):end_idx].strip()
                desc = re.sub(r'^[:：\s\-]+', '', desc)
                
                status = "pending"
                if any(x in title or x in desc for x in ["- [x]", "[x]", "（完了）", "(完了)", "【完了】", "（済）", "(済)", "【達成】"]):
                    status = "completed"
                    
                quest_obj = translate_to_quest(title, desc)
                quest_obj["status"] = status
                quests.append(quest_obj)
            return quests

        for m in step_matches:
            step_text = m.group(1).strip()
            step_header_match = re.match(r'(Step \d+:\s*(?:【[^】]+】)?[^。、「]+)', step_text)
            step_name = step_header_match.group(1).strip() if step_header_match else "Mission"
            
            found_tasks = []
            for target in targets:
                idx = step_text.find(target)
                if idx != -1:
                    found_tasks.append((idx, target))
            found_tasks.sort()
            
            for i in range(len(found_tasks)):
                start_idx, title = found_tasks[i]
                end_idx = found_tasks[i+1][0] if i+1 < len(found_tasks) else len(step_text)
                desc = step_text[start_idx + len(title):end_idx].strip()
                desc = re.sub(r'^[:：\s\-]+', '', desc)
                
                status = "pending"
                if any(x in title or x in desc for x in ["- [x]", "[x]", "（完了）", "(完了)", "【完了】", "（済）", "(済)", "【達成】"]):
                    status = "completed"
                    
                quest_obj = translate_to_quest(title, desc)
                quest_obj["status"] = status
                quests.append(quest_obj)
        return quests
    except Exception as e:
        print(f"[!] 今月の目標のパースに失敗しました: {e}")
        return []

def parse_roadmap(user_id="HG_pencil"):
    target_base = r"G:\マイドライブ\ノートブックLM用データ格納場所\我部宏和\RPG基本データ"
    file_path = os.path.join(target_base, user_id, "ロードマップ.txt")
    if not os.path.exists(file_path):
        return {}
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        roadmap = {
            "title": "HERO ROADMAP",
            "phases": []
        }
        
        current_phase = None
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith("【") and "ロードマップ" in line:
                roadmap["title"] = line.replace("【", "").replace("】", "")
                continue
                
            phase_match = re.match(r'(第\d+フェーズ.*?)[：:](.*)', line)
            if phase_match:
                if current_phase:
                    roadmap["phases"].append(current_phase)
                current_phase = {
                    "name": phase_match.group(1).strip(),
                    "theme": phase_match.group(2).strip(),
                    "items": []
                }
                continue
                
            if current_phase:
                item_match = re.match(r'([^:：]+)[:：](.*)', line)
                if item_match:
                    title = item_match.group(1).strip()
                    desc = item_match.group(2).strip()
                    
                    param_bind = None
                    if "健康" in title or "シーパップ" in title or "徒歩" in title:
                        param_bind = "VIT"
                    elif "ブラックボックス" in title or "自動化" in title:
                        param_bind = "DEV"
                    elif "現場知識" in title or "蓄積" in title:
                        param_bind = "WIS"
                    elif "撤退基準" in title or "感情" in title or "損切り" in title:
                        param_bind = "MND"
                    elif "家庭" in title or "対話" in title or "妻" in title:
                        param_bind = "CHA"
                        
                    current_phase["items"].append({
                        "title": title,
                        "description": desc,
                        "param_bind": param_bind,
                        "status": "pending"
                    })
                else:
                    if current_phase["items"]:
                        current_phase["items"][-1]["description"] += " " + line
                    else:
                        current_phase["theme"] += " " + line
                        
        if current_phase:
            roadmap["phases"].append(current_phase)
        return roadmap
    except Exception as e:
        print(f"[!] ロードマップのパースに失敗しました: {e}")
        return {}

def get_base_path():
    return os.path.dirname(os.path.abspath(__file__))


def pull_from_firestore(user_id="HG_pencil"):
    url = f"https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/{user_id}"
    try:
        import urllib.request
        import json
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=5) as res:
            doc = json.loads(res.read().decode('utf-8'))
            status_json = doc.get("fields", {}).get("status_json", {}).get("stringValue", "")
            if status_json:
                return json.loads(status_json)
    except Exception as e:
        print(f"[!] クラウドからのデータ取得に失敗しました (オフライン動作): {e}")
    return None

def push_to_firestore(data, user_id="HG_pencil"):
    url = f"https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/{user_id}"
    try:
        import urllib.request
        import json
        
        data_str = json.dumps(data, ensure_ascii=False, indent=2)
        doc = {
            'fields': {
                'status_json': {
                    'stringValue': data_str
                }
            }
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(doc).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='PATCH'
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            return True
    except Exception as e:
        print(f"[!] クラウドへのデータ同期に失敗しました: {e}")
    return False

def migrate_data(data):
    if not data:
        return data
    tickets = data.setdefault("tickets", {})
    # 古い measurement キーがあれば all に変換して削除
    if "measurement" in tickets:
        tickets["all"] = tickets.get("all", 0) + tickets.pop("measurement", 0)
        
    # 新しいアチーブメント・自作称号データの初期設定
    unlocked = data.setdefault("unlocked_achievements", [])
    parts = data.setdefault("title_parts", [])
    data.setdefault("custom_title", "")
    data.setdefault("active_title_parts", [])
    
    # 職業データの初期設定
    if "active_archetype" not in data:
        data["active_archetype"] = "Novice"
        
    # 初期実績の自動付与
    if "ACH_FIRST_STEP" not in unlocked:
        unlocked.append("ACH_FIRST_STEP")
        for word in ["目覚めし人", "の"]:
            if word not in parts:
                parts.append(word)
                
    return data

def load_status(filepath, user_id="HG_pencil"):
    # まずクラウドからのプルを試みる
    cloud_data = pull_from_firestore(user_id)
    
    # テキストファイルから目標・ロードマップをパース
    quests = parse_monthly_goals(user_id)
    roadmap = parse_roadmap(user_id)
    
    if cloud_data:
        cloud_data = migrate_data(cloud_data)
        
        # ロードマップから突発イベントを生成
        roadmap_events = generate_roadmap_events(roadmap, cloud_data)
        all_quests = quests + roadmap_events
        
        # 目標・ロードマップをデータにマージ
        if all_quests:
            existing_quests = cloud_data.get("quests", [])
            completed_titles = {q["title"] for q in existing_quests if q.get("status") == "completed"}
            completed_originals = {q.get("original_title") for q in existing_quests if q.get("status") == "completed" and q.get("original_title")}
            
            history = cloud_data.setdefault("history", [])
            existing_history_events = {h.get("event") for h in history}
            training = cloud_data.setdefault("training", {p: 0 for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]})
            tickets = cloud_data.setdefault("tickets", {})
            
            for q in all_quests:
                if q["title"] in completed_titles or q.get("original_title") in completed_originals:
                    q["status"] = "completed"
                    
                # 報酬の自動付与（新しく完了になったクエスト）
                if q["status"] == "completed":
                    event_key = f"Quest Completed: {q['title']} (Reward: {q['reward']})"
                    if event_key not in existing_history_events:
                        # 報酬の解析（例: "VIT +10"）
                        reward_str = q.get("reward", "")
                        match = re.search(r'([A-Z]+)\s*\+?\s*(\d+)', reward_str)
                        if match:
                            param = match.group(1)
                            val = int(match.group(2))
                            if param in training:
                                old_val = training[param]
                                training[param] += val
                                new_val = training[param]
                                
                                # チケットの自動獲得判定
                                tickets_earned = (new_val // 100) - (old_val // 100)
                                if tickets_earned > 0:
                                    tickets[param] = tickets.get(param, 0) + tickets_earned
                                    history.append({
                                        "date": datetime.now().strftime("%Y-%m-%d"),
                                        "event": f"Measurement Ticket ({param}) Obtained by Training Points (Accumulated: {new_val}pts)",
                                        "status_change": {}
                                    })
                                    
                        # 履歴に追加して重複を防止
                        history.append({
                            "date": datetime.now().strftime("%Y-%m-%d"),
                            "event": event_key,
                            "status_change": {}
                        })
                        
            cloud_data["quests"] = all_quests
            
        if roadmap:
            cloud_data["roadmap"] = roadmap
            
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(cloud_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[!] ローカルキャッシュの保存に失敗しました: {e}")
            
        export_to_notebooklm(cloud_data, user_id)
        push_to_firestore(cloud_data, user_id)
        return cloud_data
            
    # クラウドがオフラインならローカルキャッシュからロード
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            local_data = json.load(f)
            local_data = migrate_data(local_data)
            
            # ロードマップから突発イベントを生成
            roadmap_events = generate_roadmap_events(roadmap, local_data)
            all_quests = quests + roadmap_events
            
            # オフライン時でもテキストファイルがあればマージ
            if all_quests:
                existing_quests = local_data.get("quests", [])
                completed_titles = {q["title"] for q in existing_quests if q.get("status") == "completed"}
                completed_originals = {q.get("original_title") for q in existing_quests if q.get("status") == "completed" and q.get("original_title")}
                
                history = local_data.setdefault("history", [])
                existing_history_events = {h.get("event") for h in history}
                training = local_data.setdefault("training", {p: 0 for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]})
                tickets = local_data.setdefault("tickets", {})
                
                for q in all_quests:
                    if q["title"] in completed_titles or q.get("original_title") in completed_originals:
                        q["status"] = "completed"
                        
                    # 報酬の自動付与（オフライン用）
                    if q["status"] == "completed":
                        event_key = f"Quest Completed: {q['title']} (Reward: {q['reward']})"
                        if event_key not in existing_history_events:
                            reward_str = q.get("reward", "")
                            match = re.search(r'([A-Z]+)\s*\+?\s*(\d+)', reward_str)
                            if match:
                                param = match.group(1)
                                val = int(match.group(2))
                                if param in training:
                                    old_val = training[param]
                                    training[param] += val
                                    new_val = training[param]
                                    
                                    tickets_earned = (new_val // 100) - (old_val // 100)
                                    if tickets_earned > 0:
                                        tickets[param] = tickets.get(param, 0) + tickets_earned
                                        history.append({
                                            "date": datetime.now().strftime("%Y-%m-%d"),
                                            "event": f"Measurement Ticket ({param}) Obtained by Training Points (Accumulated: {new_val}pts)",
                                            "status_change": {}
                                        })
                                        
                            history.append({
                                "date": datetime.now().strftime("%Y-%m-%d"),
                                "event": event_key,
                                "status_change": {}
                            })
                            
                local_data["quests"] = all_quests
                
            if roadmap:
                local_data["roadmap"] = roadmap
                
            export_to_notebooklm(local_data, user_id)
            return local_data
    except FileNotFoundError:
        print(f"エラー: データファイルが見つかりません: {filepath}")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"エラー: JSONファイルの解析に失敗しました: {filepath}")
        sys.exit(1)


def check_achievements(base_path, data):
    ach_filepath = os.path.join(base_path, "web", "status_achievements.json")
    if not os.path.exists(ach_filepath):
        return []

    try:
        with open(ach_filepath, 'r', encoding='utf-8') as f:
            ach_master = json.load(f)
    except Exception:
        return []

    status = data.setdefault("status", {})
    unlocked = data.setdefault("unlocked_achievements", [])
    parts = data.setdefault("title_parts", [])
    history = data.setdefault("history", [])

    newly_unlocked = []

    for ach in ach_master:
        ach_id = ach.get("id")
        if ach_id in unlocked:
            continue

        # 条件判定
        is_cleared = False
        if ach_id == "ACH_FIRST_STEP":
            is_cleared = True
        elif ach_id == "ACH_AI_MASTER_200":
            is_cleared = status.get("DEV", {}).get("current", 0) >= 200
        elif ach_id == "ACH_FITNESS_300":
            is_cleared = status.get("STR", {}).get("current", 0) >= 300 or status.get("VIT", {}).get("current", 0) >= 300
        elif ach_id == "ACH_CONTINUITY_7":
            is_cleared = len(data.get("reflected_dates", [])) >= 7
        elif ach_id == "ACH_MIND_CONTROL":
            is_cleared = status.get("MND", {}).get("current", 0) >= 300
        elif ach_id == "ACH_CHARISMATIC_LEADER":
            is_cleared = status.get("CHA", {}).get("current", 0) >= 280
        elif ach_id == "ACH_LIMIT_BREAK":
            is_cleared = any(v >= 100 for v in data.get("training", {}).values())

        if is_cleared:
            unlocked.append(ach_id)
            reward_words = ach.get("reward_words", [])
            added_words = []
            for word in reward_words:
                if word not in parts:
                    parts.append(word)
                    added_words.append(word)

            newly_unlocked.append({
                "name": ach.get("name"),
                "words": added_words
            })

            # 履歴に追加
            words_str = ", ".join(reward_words)
            history.append({
                "date": datetime.now().strftime("%Y-%m-%d"),
                "event": f"Achievement Unlocked: {ach.get('name')} (Acquired words: {words_str})",
                "status_change": {}
            })

    return newly_unlocked

def export_to_notebooklm(data, user_id="HG_pencil"):
    target_base = r"G:\マイドライブ\ノートブックLM用データ格納場所\我部宏和\RPG基本データ"
    if not os.path.exists(target_base):
        return
        
    target_dir = os.path.join(target_base, user_id)
    if not os.path.exists(target_dir):
        try:
            os.makedirs(target_dir)
        except Exception as e:
            print(f"[!] NotebookLM用サブフォルダの作成に失敗しました: {e}")
            return
        
    # 1. status.json のコピー
    try:
        with open(os.path.join(target_dir, "status.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[!] NotebookLM用JSONの書き出しに失敗しました: {e}")
        
    # 2. status_summary.md (要約Markdown) の生成と保存
    try:
        status = data.get("status", {})
        hp = status.get("HP", {"current": 100, "max": 100})
        titles = data.get("titles", {"active": []})
        active_archetype = data.get("active_archetype", "Novice")
        
        md_lines = []
        md_lines.append(f"# {user_id} RPG能力ステータスサマリー")
        md_lines.append(f"最終同期日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        md_lines.append("## 👤 ヒーロー基本ステータス")
        md_lines.append(f"- **ビルド称号 / ランクスコア**: {data.get('build_score', 'Novice Build')} / {', '.join(titles.get('active', [])) if titles.get('active') else 'なし'}")
        md_lines.append(f"- **戦闘力 (Combat Power)**: {data.get('combat_power', 0)}")
        md_lines.append(f"- **HP (コンディション)**: {hp.get('current')}/{hp.get('max')}")
        md_lines.append(f"- **職業 (Active Archetype)**: {active_archetype}\n")
        
        md_lines.append("## 📊 能力値 (各パラメータ詳細)")
        params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
        param_names = {
            "STR": "STR (筋力・身体出力)",
            "VIT": "VIT (持久力・疲労耐性)",
            "INT": "INT (論理思考・構造化)",
            "WIS": "WIS (知識・教養)",
            "MND": "MND (精神力・自己統制)",
            "CHA": "CHA (魅力・信頼形成)",
            "DEV": "DEV (開拓・AIシステム構築)"
        }
        for p in params:
            val = status.get(p, {"current": 100, "peak": 100})
            t_val = data.get("training", {}).get(p, 0)
            md_lines.append(f"- **{param_names[p]}**: 現在値 {val.get('current')} / Peak値 {val.get('peak')} (努力累積: {t_val}pts)")
        md_lines.append("")
        
        md_lines.append("## 🎫 所持チケット (測定アイテム)")
        tickets = data.get("tickets", {})
        has_tickets = False
        for k, v in tickets.items():
            if v > 0:
                md_lines.append(f"- 測定チケット ({k}): {v}枚")
                has_tickets = True
        if not has_tickets:
            md_lines.append("- なし (ゲート試験に挑戦中または未獲得)")
        md_lines.append("")
        
        md_lines.append("## 🏆 解除済みアチーブメント (実績)")
        unlocked = data.get("unlocked_achievements", [])
        md_lines.append(f"解除数: {len(unlocked)}個")
        for ach_id in unlocked:
            md_lines.append(f"- {ach_id}")
        md_lines.append("")
        
        md_lines.append("## 📜 活動記録・イベント履歴 (History)")
        history = data.get("history", [])[-20:] # 直近20件を書き出し
        for h in reversed(history):
            md_lines.append(f"- **{h.get('date')}**: {h.get('event')}")
            
        md_content = "\n".join(md_lines)
        with open(os.path.join(target_dir, "status_summary.md"), "w", encoding="utf-8") as f:
            f.write(md_content)
    except Exception as e:
        print(f"[!] NotebookLM用サマリーMarkdownの書き出しに失敗しました: {e}")

def save_json(filepath, data, user_id="HG_pencil"):
    # ローカルキャッシュの保存
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"エラー: ファイルの保存に失敗しました: {e}")
        
    # NotebookLM用自動エクスポート
    export_to_notebooklm(data, user_id)
        
    # クラウド同期
    push_to_firestore(data, user_id)

def print_status_cli(data, user_id="HG_pencil"):
    status = data.get("status", {})
    training = data.get("training", {})
    tickets = data.get("tickets", {})
    titles = data.get("titles", {})
    active_archetype = data.get("active_archetype", "Novice")
    combat_power = data.get("combat_power", 0)
    build_score = data.get("build_score", "Novice Build")
    hp = status.get("HP", {"current": 100, "max": 100})
    
    hp_curr = hp.get("current", 100)
    hp_max = hp.get("max", 100)
    hp_pct = int((hp_curr / hp_max) * 100) if hp_max > 0 else 0
    
    # HPコンディション判定
    if hp_pct >= 80:
        hp_cond = "Healthy"
    elif hp_pct >= 40:
        hp_cond = "Fatigued (Training Efficiency -20%)"
    else:
        hp_cond = "Exhausted (Training Efficiency -50%)"

    print("======================================================================")
    print("                    * ANTIGRAVITY STATUS *")
    print("======================================================================")
    print(f" USER: {user_id} [{build_score}]")
    print(f" Combat Power: {combat_power}")
    
    # HPバー表示 (20文字分)
    hp_bar_len = 20
    hp_blocks = int(hp_curr / hp_max * hp_bar_len) if hp_max > 0 else 0
    hp_bar_str = "■" * hp_blocks + "." * (hp_bar_len - hp_blocks)
    print(f" HP: {hp_curr}/{hp_max} [{hp_bar_str}] {hp_pct}% ({hp_cond})")
    print("----------------------------------------------------------------------")
    
    active_titles = titles.get("active", [])
    title_str = ", ".join(active_titles) if active_titles else "(None)"
    print(f" TITLES:     {title_str}")
    print(f" ARCHETYPE:  {active_archetype}")
    print("----------------------------------------------------------------------")
    
    params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
    param_names = {
        "STR": "筋力",
        "VIT": "持久",
        "INT": "知能",
        "WIS": "知識",
        "MND": "精神",
        "CHA": "魅力",
        "DEV": "開発"
    }
    
    bar_len = 30
    for p in params:
        p_data = status.get(p, {"current": 100, "peak": 100, "last_measured": None})
        curr = p_data.get("current", 100)
        peak = p_data.get("peak", 100)
        
        # ??? 表示対策
        if curr is None or str(curr).startswith("?"):
            print(f" {p} [{param_names[p]}] :  ??? (Peak: {peak}) [??????????????????????????????]")
            continue
            
        cur_blocks = int(curr / 999 * bar_len)
        peak_blocks = int(peak / 999 * bar_len)
        
        # グラフ描画
        bar_str = "■" * cur_blocks + "□" * max(0, peak_blocks - cur_blocks) + "." * max(0, bar_len - peak_blocks)
        
        print(f" {p} [{param_names[p]}] :  {curr:3d} (Peak: {peak:3d}) [{bar_str}] [Training: {training.get(p, 0):4d}]")
        
    print("----------------------------------------------------------------------")
    t_list = [f"{k.capitalize()}: {v}" for k, v in tickets.items()]
    tickets_str = ", ".join(t_list) if t_list else "(None)"
    print(f" TICKETS: {tickets_str}")
    print("======================================================================")

def open_character_image(base_path):
    img_path = os.path.join(base_path, "assets", "character.png")
    if not os.path.exists(img_path):
        print(f"\n[!] キャラクター画像が見つかりません: {img_path}")
        print("※ 測定を進めるか、ステータス更新時にドット絵が生成されます。")
        return
        
    print(f"\n[+] キャラクター画像を開いています: {img_path}")
    try:
        if sys.platform.startswith('win'):
            os.startfile(img_path)
        elif sys.platform.startswith('darwin'):
            subprocess.run(['open', img_path])
        else:
            subprocess.run(['xdg-open', img_path])
    except Exception as e:
        print(f"画像を開く際にエラーが発生しました: {e}")

def show_radar_chart(data):
    if not HAS_MATPLOTLIB:
        print("\n[!] エラー: matplotlib または numpy がインストールされていないため、レーダーチャートを表示できません。")
        print("インストールするには以下のコマンドを実行してください：")
        print("  pip install matplotlib numpy")
        return

    status = data.get("status", {})
    params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
    labels = ["STR (筋力)", "VIT (持久)", "INT (知能)", "WIS (知識)", "MND (精神)", "CHA (魅力)", "DEV (開発)"]
    
    values = []
    peaks = []
    
    for p in params:
        p_data = status.get(p, {"current": 100, "peak": 100})
        curr = p_data.get("current", 100)
        peak = p_data.get("peak", 100)
        if curr is None or isinstance(curr, str):
            curr = 0
        if peak is None or isinstance(peak, str):
            peak = 0
        values.append(curr)
        peaks.append(peak)
        
    num_vars = len(labels)
    angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
    angles += angles[:1]
    values += values[:1]
    peaks += peaks[:1]

    fig, ax = plt.subplots(figsize=(6, 6), subplot_kw=dict(polar=True))
    
    ax.set_ylim(0, 1000)
    ax.set_yticks([100, 300, 500, 700, 900])
    ax.set_yticklabels(["100 (基礎)", "300 (一般)", "500 (トップ)", "700 (代表)", "900 (人類史)"], fontsize=8)
    
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=10, fontweight='bold')
    
    ax.plot(angles, peaks, color='#e74c3c', linewidth=2, linestyle='dashed', label='Peak Status')
    ax.fill(angles, peaks, color='#e74c3c', alpha=0.1)
    
    ax.plot(angles, values, color='#3498db', linewidth=2, linestyle='solid', label='Current Status')
    ax.fill(angles, values, color='#3498db', alpha=0.25)
    
    plt.title(f"Antigravity Status - {data.get('build_score', 'Novice')}", size=14, y=1.1, fontweight='bold')
    plt.legend(loc='upper right', bbox_to_anchor=(0.1, 0.1))
    
    plt.tight_layout()
    print("\n[+] レーダーチャートを表示しています...")
    plt.show()

def get_next_gate(current_val):
    gates = [100, 200, 300, 400, 500, 600, 700, 800, 900, 999]
    eligible_gates = [g for g in gates if g > current_val]
    return eligible_gates[0] if eligible_gates else 999

def import_training_data(base_path, data, json_str, user_id="HG_pencil"):
    if json_str == "-":
        import sys
        json_str = sys.stdin.read()
    try:
        # JSON 文字列をパース
        import_data = json.loads(json_str)
        if not isinstance(import_data, list):
            import_data = [import_data]
    except Exception as e:
        print(f"JSONパースエラー: {e}")
        return

    reflected_dates = data.setdefault("reflected_dates", [])
    accumulated_points = data.setdefault("accumulated_training_points", 0)
    training = data.setdefault("training", {p: 0 for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]})
    status = data.setdefault("status", {})
    hp = status.setdefault("HP", {"current": 70, "max": 100})
    tickets = data.setdefault("tickets", {})
    history = data.setdefault("history", [])

    # 初期トレーニング累積値のコピーを作成
    initial_training = {p: training.get(p, 0) for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]}

    results = []
    new_points_total = 0
    hp_recovered_total = 0

    for entry in import_data:
        date = entry.get("date")
        points = entry.get("training_points", entry.get("training", {}))
        summary = entry.get("summary", "")

        if not date:
            continue

        if date in reflected_dates:
            results.append(f"スキップ (重複): {date}")
            continue

        # 反映処理
        daily_points = 0
        added_points = {}
        for p, val in points.items():
            if p in training:
                val_int = int(val)
                training[p] += val_int
                daily_points += val_int
                added_points[p] = val_int

        # HP回復計算 (VIT と MND の加算量に基づいて回復)
        vit_add = added_points.get("VIT", 0)
        mnd_add = added_points.get("MND", 0)
        hp_to_recover = int((vit_add + mnd_add) * 0.5)
        if hp_to_recover > 0:
            old_hp = hp["current"]
            hp["current"] = min(hp["max"], hp["current"] + hp_to_recover)
            hp_recovered_total += (hp["current"] - old_hp)

        reflected_dates.append(date)
        new_points_total += daily_points

        # 履歴追加
        pts_str = ", ".join([f"{k}+{v}" for k, v in added_points.items() if v > 0])
        history.append({
            "date": datetime.now().strftime("%Y-%m-%d"),
            "event": f"Training Reflected: {date} ({pts_str})",
            "status_change": added_points,
            "summary": summary
        })

        results.append(f"反映成功: {date} ({pts_str}) - {summary}")

    # 各ステータスごとに、100ポイント毎のチケット回復判定を行う
    tickets_earned_msg = []
    for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]:
        old_val = initial_training[p]
        new_val = training.get(p, 0)
        
        tickets_earned = (new_val // 100) - (old_val // 100)
        if tickets_earned > 0:
            old_tickets = tickets.get(p, 0)
            tickets[p] = old_tickets + tickets_earned
            
            history.append({
                "date": datetime.now().strftime("%Y-%m-%d"),
                "event": f"Measurement Ticket ({p}) Obtained by Training Points (Accumulated: {new_val}pts)",
                "status_change": {}
            })
            tickets_earned_msg.append(f"[🎉 チケット獲得] {p}のトレーニング値が {new_val}pts に到達！「測定チケット({p})」を {tickets_earned}枚 獲得しました！")

    # 実績解除のチェック
    unlocked_list = check_achievements(base_path, data)

    # 旧合算カウンターは廃止しリセット
    data["accumulated_training_points"] = 0
    data["last_updated"] = datetime.now().isoformat()

    # 保存
    save_json(os.path.join(base_path, f"status_{user_id}.json"), data, user_id)

    # 結果出力
    print("======================================================================")
    print("                ⚡ TRAINING IMPORT RESULT ⚡")
    print("======================================================================")
    for r in results:
        print(f" - {r}")
    print("----------------------------------------------------------------------")
    print(f" 新規累積ポイント: +{new_points_total} pts")
    for msg in tickets_earned_msg:
        print(f" {msg}")
    for ach in unlocked_list:
        words_str = "、".join([f"「{w}」" for w in ach["words"]])
        print(f" [🎉 実績解除] 実績『{ach['name']}』を達成！ 報酬単語：{words_str} を獲得しました！")
    if hp_recovered_total > 0:
        print(f" [❤️ HP回復] 体調が整い、HPが {hp_recovered_total} 回復しました！(現在: {hp['current']}/{hp['max']})")
    print("======================================================================")

def run_test_mode(base_path, status_data, user_id="HG_pencil"):
    tests_filepath = os.path.join(base_path, "status_tests.json")
    if not os.path.exists(tests_filepath):
        print(f"\n[!] テスト問題ファイルが見つかりません: {tests_filepath}")
        return

    with open(tests_filepath, 'r', encoding='utf-8') as f:
        all_tests = json.load(f)

    status = status_data.get("status", {})
    tickets = status_data.get("tickets", {})

    available_tests = []
    for test in all_tests:
        if test.get("is_training"):
            continue
        param = test.get("param")
        target_gate = test.get("target_gate")
        p_data = status.get(param, {"current": 100})
        curr_val = p_data.get("current", 100)
        
        next_gate = get_next_gate(curr_val)
        if target_gate == next_gate:
            test["test_type"] = "gate"
            available_tests.append(test)
        elif target_gate <= curr_val:
            test["test_type"] = "measurement"
            available_tests.append(test)

    if not available_tests:
        print("\n[!] 現在挑戦可能なテストがありません（次のゲートに対応する試験問題が未定義です）。")
        return

    # 所持チケット文字列の構成
    t_list = [f"all x{tickets.get('all', 0)}"] + [f"{p} x{tickets.get(p, 0)}" for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"] if tickets.get(p, 0) > 0]
    tickets_str = ", ".join(t_list)

    print("\n======================================================================")
    print("                    ⚡ ランクゲート（昇段試験）選択 ⚡")
    print("======================================================================")
    print(f" 所持チケット: {tickets_str}")
    print("----------------------------------------------------------------------")
    print(" 挑戦可能な試験一覧:")
    for idx, test in enumerate(available_tests, 1):
        param = test.get("param")
        target_gate = test.get("target_gate")
        time_min = test.get("time_limit_seconds", 0) // 60
        test_type = test.get("test_type", "gate")
        
        if test_type == "measurement":
            print(f"  [{idx}] 【実力測定】 {param} -> {target_gate} レベル実力測定 (チケット不要)")
        else:
            has_t = tickets.get(param, 0) > 0 or tickets.get("all", 0) > 0
            t_status = " (チケット消費: 1枚)" if has_t else " ⚠️ (チケット不足・挑戦不可)"
            print(f"  [{idx}] 【ゲート試験】 {param} -> {target_gate} ゲート突破試験{t_status}")
            
        print(f"      (難易度: {test.get('difficulty')}, 制限時間: {time_min}分)")
    print("----------------------------------------------------------------------")
    
    choice = input(" 挑戦する試験の番号を入力してください (キャンセルは 'q'): ").strip()
    if choice.lower() == 'q':
        print(" 測定をキャンセルしました。")
        return

    try:
        choice_idx = int(choice) - 1
        if choice_idx < 0 or choice_idx >= len(available_tests):
            print(" [!] 無効な番号です。")
            return
    except ValueError:
        print(" [!] 数字を入力してください。")
        return

    selected_test = available_tests[choice_idx]
    param = selected_test.get("param")
    gate = selected_test.get("target_gate")
    limit_sec = selected_test.get("time_limit_seconds", 0)
    test_type = selected_test.get("test_type", "gate")
    is_measurement = (test_type == "measurement")
    
    # チケットの有無チェック（ゲート試験の場合のみ）
    if not is_measurement:
        has_specific = tickets.get(param, 0) > 0
        has_all = tickets.get("all", 0) > 0
        if not has_specific and not has_all:
            print(f"\n [!] 測定チケット({param}) または 測定チケット(all) が不足しています。")
            return

    print("\n======================================================================")
    if is_measurement:
        print(f" 【測定】これより {param} の {gate}レベル実力測定試験を開始します。")
        print(f" 制限時間: {limit_sec // 60}分 ({limit_sec}秒)")
        print(" ※実力測定のため、チケットは消費されません。")
    else:
        print(f" 【警告】これより {param} の {gate}ゲート試験を開始します。")
        print(f" 制限時間: {limit_sec // 60}分 ({limit_sec}秒)")
        print(" 開始するとタイマーが作動し、チケットを1枚消費します。")
        print(" 中断した場合もチケットは消費されますのでご注意ください。")
    print("======================================================================")
    
    confirm = input(" 試験を開始しますか？ (y/n): ").strip().lower()
    if confirm != 'y':
        print(" 開始を中止しました。")
        return

    # チケット消費（ゲート試験の場合のみ、優先度：専用 ➡️ all）
    consumed_type = ""
    if is_measurement:
        consumed_type = "なし (実力測定試験のためチケット不要)"
    else:
        if tickets.get(param, 0) > 0:
            tickets[param] -= 1
            consumed_type = f"専用チケット({param})"
        elif tickets.get("all", 0) > 0:
            tickets["all"] -= 1
            consumed_type = "万能チケット(all)"

    save_json(os.path.join(base_path, f"status_{user_id}.json"), status_data, user_id)
    if is_measurement:
        print(f"\n[+] 実力測定試験を開始します (チケット不要)。")
    else:
        print(f"\n[+] {consumed_type}を1枚消費しました。")
    print("----------------------------------------------------------------------")
    print("【問題】")
    print(selected_test.get("question"))
    print("----------------------------------------------------------------------")
    print(" ※ 回答の入力が終わったら、改行して半角で ':q' と入力し、Enterキーを押してください。")
    print(" [タイマースタート！]")
    print("----------------------------------------------------------------------")

    start_time = time.time()
    
    lines = []
    try:
        while True:
            line = input()
            if line.strip() == ":q":
                break
            lines.append(line)
    except EOFError:
        pass

    end_time = time.time()
    elapsed = end_time - start_time
    answer_text = "\n".join(lines)

    timeout = elapsed > limit_sec
    
    print("\n----------------------------------------------------------------------")
    print(f" 所要時間: {elapsed:.1f} 秒 / 制限時間: {limit_sec} 秒")
    
    if timeout:
        print(" [🚨 タイムアウト] 制限時間を超過しました。この回答は「不合格」扱いとなります。")
    else:
        print(" [+] 制限時間内に回答が提出されました。")
    print("======================================================================")

    pending_path = os.path.join(base_path, f"pending_answers_{user_id}.json")
    pending_data = []
    if os.path.exists(pending_path):
        try:
            with open(pending_path, 'r', encoding='utf-8') as f:
                pending_data = json.load(f)
        except Exception:
            pass

    new_answer = {
        "test_id": selected_test.get("id"),
        "param": param,
        "target_gate": gate,
        "test_type": test_type,
        "submitted_at": datetime.now().isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "time_limit_seconds": limit_sec,
        "timeout": timeout,
        "answer": answer_text
    }
    
    pending_data.append(new_answer)
    save_json(pending_path, pending_data, user_id)
    
    print("\n[+] 回答がローカルに一時保存されました。")
    print("    次回のAI（Antigravity）とのチャット時に、GMが自動的に採点を行います。")
    print("======================================================================")

def launch_web_server(base_path):
    server_script = os.path.join(base_path, "server.py")
    if not os.path.exists(server_script):
        print(f"[!] サーバー起動スクリプトが見つかりません: {server_script}")
        return
        
    print("\n[+] Webサーバーを起動しています...")
    try:
        # Windows環境で完全にバックグラウンドで動かすための設定
        if sys.platform.startswith('win'):
            # subprocess.Popen で新しいプロセスグループを生成して非同期起動
            subprocess.Popen(
                [sys.executable, server_script],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        else:
            subprocess.Popen(
                [sys.executable, server_script],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True
            )
        print("[+] http://localhost:8000 でWebダッシュボードを開いています。")
    except Exception as e:
        print(f"サーバーのバックグラウンド起動に失敗しました: {e}")

def main():
    parser = argparse.ArgumentParser(description="Antigravity Status CLI Visualizer")
    parser.add_argument("--image", "-i", action="store_true", help="ドット絵キャラクター画像を表示します")
    parser.add_argument("--radar", "-r", action="store_true", help="レーダーチャート(グラフ)を表示します")
    parser.add_argument("--test", "-t", action="store_true", help="ランクゲート測定試験モードを起動します")
    parser.add_argument("--web", "-w", action="store_true", help="ローカルWebダッシュボードをブラウザで開きます")
    parser.add_argument("--import-training", "-p", type=str, help="トレーニングデータを反映します (JSON文字列形式)")
    parser.add_argument("--user", "-u", type=str, default="HG_pencil", help="セーブデータのユーザーIDを指定します (デフォルト: HG_pencil)")
    args = parser.parse_args()
    
    base_path = get_base_path()
    user_id = args.user
    filepath = os.path.join(base_path, f"status_{user_id}.json")
    
    data = load_status(filepath, user_id)
    
    if args.import_training:
        import_training_data(base_path, data, args.import_training, user_id)
    elif args.test:
        run_test_mode(base_path, data, user_id)
    elif args.web:
        launch_web_server(base_path)
    else:
        # ステータスの表示
        print_status_cli(data, user_id)
        
        # オプション処理
        if args.image:
            open_character_image(base_path)
        if args.radar:
            show_radar_chart(data)

if __name__ == "__main__":
    main()
