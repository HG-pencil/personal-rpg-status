import os
import sys
import json
import argparse
import subprocess
import time
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

def get_base_path():
    return os.path.dirname(os.path.abspath(__file__))

def pull_from_firestore():
    url = "https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/kingo"
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

def push_to_firestore(data):
    url = "https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/kingo"
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
    
    # 初期実績の自動付与
    if "ACH_FIRST_STEP" not in unlocked:
        unlocked.append("ACH_FIRST_STEP")
        for word in ["目覚めし人", "の"]:
            if word not in parts:
                parts.append(word)
                
    return data

def load_status(filepath):
    # まずクラウドからのプルを試みる
    cloud_data = pull_from_firestore()
    if cloud_data:
        cloud_data = migrate_data(cloud_data)
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(cloud_data, f, ensure_ascii=False, indent=2)
            return cloud_data
        except Exception:
            return cloud_data
            
    # クラウドがオフラインならローカルキャッシュからロード
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            local_data = json.load(f)
            return migrate_data(local_data)
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

def save_json(filepath, data):
    # ローカルキャッシュの保存
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"エラー: ファイルの保存に失敗しました: {e}")
        
    # クラウド同期
    push_to_firestore(data)

def print_status_cli(data):
    status = data.get("status", {})
    training = data.get("training", {})
    tickets = data.get("tickets", {})
    titles = data.get("titles", {})
    archetypes = data.get("archetypes", [])
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
    print(f" USER: kingo [{build_score}]")
    print(f" Combat Power: {combat_power}")
    
    # HPバー表示 (20文字分)
    hp_bar_len = 20
    hp_blocks = int(hp_curr / hp_max * hp_bar_len) if hp_max > 0 else 0
    hp_bar_str = "■" * hp_blocks + "." * (hp_bar_len - hp_blocks)
    print(f" HP: {hp_curr}/{hp_max} [{hp_bar_str}] {hp_pct}% ({hp_cond})")
    print("----------------------------------------------------------------------")
    
    active_titles = titles.get("active", [])
    title_str = ", ".join(active_titles) if active_titles else "(None)"
    arch_str = ", ".join(archetypes) if archetypes else "(None)"
    print(f" TITLES:     {title_str}")
    print(f" ARCHETYPE:  {arch_str}")
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

def import_training_data(base_path, data, json_str):
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
    save_json(os.path.join(base_path, "status.json"), data)

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

def run_test_mode(base_path, status_data):
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
        param = test.get("param")
        target_gate = test.get("target_gate")
        p_data = status.get(param, {"current": 100})
        curr_val = p_data.get("current", 100)
        
        if get_next_gate(curr_val) == target_gate:
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
        time_min = test.get("time_limit_seconds", 0) // 60
        has_t = tickets.get(param, 0) > 0 or tickets.get("all", 0) > 0
        t_status = "" if has_t else " ⚠️ (チケット不足)"
        print(f"  [{idx}] {param} -> {test.get('target_gate')} ゲート試験{t_status}")
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
    
    # チケットの有無チェック
    has_specific = tickets.get(param, 0) > 0
    has_all = tickets.get("all", 0) > 0
    if not has_specific and not has_all:
        print(f"\n [!] 測定チケット({param}) または 測定チケット(all) が不足しています。")
        return

    print("\n======================================================================")
    print(f" 【警告】これより {param} の {gate}ゲート試験を開始します。")
    print(f" 制限時間: {limit_sec // 60}分 ({limit_sec}秒)")
    print(" 开始するとタイマーが作動し、チケットを1枚消費します。")
    print(" 中断した場合もチケットは消費されますのでご注意ください。")
    print("======================================================================")
    
    confirm = input(" 試験を開始しますか？ (y/n): ").strip().lower()
    if confirm != 'y':
        print(" 開始を中止しました。")
        return

    # チケット消費（優先度：専用 ➡️ all）
    consumed_type = ""
    if tickets.get(param, 0) > 0:
        tickets[param] -= 1
        consumed_type = f"専用チケット({param})"
    elif tickets.get("all", 0) > 0:
        tickets["all"] -= 1
        consumed_type = "万能チケット(all)"

    save_json(os.path.join(base_path, "status.json"), status_data)
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

    pending_path = os.path.join(base_path, "pending_answers.json")
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
        "submitted_at": datetime.now().isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "time_limit_seconds": limit_sec,
        "timeout": timeout,
        "answer": answer_text
    }
    
    pending_data.append(new_answer)
    save_json(pending_path, pending_data)
    
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
    args = parser.parse_args()
    
    base_path = get_base_path()
    filepath = os.path.join(base_path, "status.json")
    
    data = load_status(filepath)
    
    if args.import_training:
        import_training_data(base_path, data, args.import_training)
    elif args.test:
        run_test_mode(base_path, data)
    elif args.web:
        launch_web_server(base_path)
    else:
        # ステータスの表示
        print_status_cli(data)
        
        # オプション処理
        if args.image:
            open_character_image(base_path)
        if args.radar:
            show_radar_chart(data)

if __name__ == "__main__":
    main()
