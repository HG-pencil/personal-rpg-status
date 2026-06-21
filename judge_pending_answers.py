import os
import sys
import json
import argparse
from datetime import datetime

# Add directory containing status.py to import path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import status

def main():
    parser = argparse.ArgumentParser(description="Antigravity RPG - Pending Test Answers Grading Tool")
    parser.add_argument("--user", "-u", type=str, default="HG_pencil", help="User ID for the save data (default: HG_pencil)")
    args = parser.parse_args()

    user_id = args.user
    base_path = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(base_path, f"status_{user_id}.json")

    # 1. Verify and load private key
    try:
        status.init_crypto_keys()
    except Exception as e:
        print(f"\n[Startup Error] Failed to load private key. Exiting grading tool: {e}")
        sys.exit(1)

    # 2. Load save data
    if not os.path.exists(filepath):
        print(f"\n[!] Error: Save data file not found: {filepath}")
        sys.exit(1)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"\n[!] Error: Failed to load save data: {e}")
        sys.exit(1)

    # 3. Get pending answers
    pending_answers = data.setdefault("pending_answers", [])
    
    # Load from legacy pending file if exists for backwards compatibility
    legacy_pending_path = os.path.join(base_path, f"pending_answers_{user_id}.json")
    if os.path.exists(legacy_pending_path):
        try:
            with open(legacy_pending_path, 'r', encoding='utf-8') as f:
                legacy_answers = json.load(f)
                if isinstance(legacy_answers, list):
                    for ans in legacy_answers:
                        # Append if not duplicate
                        if not any(x.get("test_id") == ans.get("test_id") and x.get("submitted_at") == ans.get("submitted_at") for x in pending_answers):
                            pending_answers.append(ans)
            # Remove legacy file after merge
            os.remove(legacy_pending_path)
            print(f"[+] Recovered answers from legacy {legacy_pending_path} and removed it.")
        except Exception as e:
            print(f"[!] Error occurred while recovering answers from legacy file: {e}")

    if not pending_answers:
        print(f"\n[+] No pending answers for user '{user_id}'.")
        sys.exit(0)

    # Load test questions pool
    tests_filepath = os.path.join(base_path, "status_tests.json")
    tests_dict = {}
    if os.path.exists(tests_filepath):
        try:
            with open(tests_filepath, 'r', encoding='utf-8') as f:
                all_tests = json.load(f)
                tests_dict = {t["id"]: t for t in all_tests}
        except Exception as e:
            print(f"[!] Warning: Failed to load test collection: {e}")

    print(f"\n======================================================================")
    print(f"               * Antigravity RPG Pending Answers Grading Mode *")
    print(f"======================================================================")
    print(f" User: {user_id} | Pending answers count: {len(pending_answers)}")
    print("======================================================================")

    processed_any = False
    new_pending_answers = []

    for idx, ans in enumerate(pending_answers, 1):
        test_id = ans.get("test_id")
        param = ans.get("param")
        target_gate = ans.get("target_gate")
        submitted_at = ans.get("submitted_at", "Unknown")
        elapsed = ans.get("elapsed_seconds", 0)
        timeout = ans.get("timeout", False)
        raw_answer = ans.get("answer")

        # 4. Decrypt answer (individual error handling)
        decrypted_answer = "[Decryption Error]"
        is_decrypted = False
        try:
            if isinstance(raw_answer, dict) and "key_version" in raw_answer:
                decrypted_answer = status.decrypt_answer(raw_answer)
                is_decrypted = True
            elif isinstance(raw_answer, str):
                if raw_answer.strip().startswith("{") and "key_version" in raw_answer:
                    try:
                        ans_dict = json.loads(raw_answer)
                        decrypted_answer = status.decrypt_answer(ans_dict)
                        is_decrypted = True
                    except Exception:
                        decrypted_answer = raw_answer
                else:
                    decrypted_answer = raw_answer
                    is_decrypted = True
        except Exception as e:
            print(f"\n[!] Warning: Error decrypting answer for {test_id}: {e}")
            decrypted_answer = f"[Decryption failed: Private key error or similar]\n(Raw encrypted data: {raw_answer})"

        # Get question text
        test_meta = tests_dict.get(test_id, {})
        question_text = test_meta.get("question", "Question text not found in test definition file.")

        print(f"\n--- [Answer {idx}/{len(pending_answers)}] {test_id} ({param} -> {target_gate}) ---")
        print(f" Submitted at: {submitted_at}")
        print(f" Elapsed time: {elapsed} seconds (Timeout: {'Yes' if timeout else 'No'})")
        print("----------------------------------------------------------------------")
        print("[Question]")
        print(question_text)
        print("----------------------------------------------------------------------")
        print("[Submitted Answer]")
        print(decrypted_answer)
        print("----------------------------------------------------------------------")

        # Determine test type
        test_type = ans.get("test_type") or test_meta.get("test_type", "gate")
        is_measurement = (test_type == "measurement")

        # Grading input
        if is_measurement:
            while True:
                judge = input(" Enter score (0-100 or s: Skip): ").strip().lower()
                if judge == 's':
                    break
                try:
                    score = int(judge)
                    if 0 <= score <= 100:
                        break
                except ValueError:
                    pass
                print(" [!] Please enter an integer between 0 and 100, or 's' to skip.")
        else:
            while True:
                judge = input(" Enter grade (y: Pass / n: Fail / s: Skip): ").strip().lower()
                if judge in ['y', 'n', 's']:
                    break
                print(" [!] Please enter 'y', 'n', or 's'.")

        if judge == 's':
            print(" -> Skipped grading for this answer. Retaining pending status.")
            new_pending_answers.append(ans)
            continue

        feedback = input(" Enter feedback comment: ").strip()
        if not feedback:
            if is_measurement:
                feedback = f"Measured with score {score}."
            else:
                feedback = "Passed the criteria." if judge == 'y' else "Please try again."

        processed_any = True

        if is_measurement:
            # Linear grading calculation
            new_current = target_gate + int(score * 0.99)
            print(f" -> [Measurement] Calculated new current value for {param} as {new_current} (score: {score}).")

            # Update status parameters
            status_dict = data.setdefault("status", {})
            param_status = status_dict.setdefault(param, {"current": 100, "peak": 100})
            
            old_current = param_status.get("current", 100)
            old_peak = param_status.get("peak", 100)
            
            param_status["current"] = new_current
            param_status["peak"] = max(old_peak, new_current)
            param_status["last_measured"] = datetime.now().strftime("%Y-%m-%d")
            param_status["last_measured_at"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

            # Recalculate total combat power
            combat_power = 0
            for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]:
                p_val = status_dict.get(p, {}).get("current", 100)
                combat_power += p_val
            data["combat_power"] = combat_power
            print(f" -> Recalculated total combat power: {combat_power}")

            # Add event to history
            history = data.setdefault("history", [])
            history.append({
                "date": datetime.now().strftime("%Y-%m-%d"),
                "event": f"Measurement Rated: {test_id} ({param} rated to {new_current}! Score: {score})",
                "status_change": {},
                "summary": feedback
            })

            # Automatically evaluate achievements/titles
            newly_unlocked_ach = status.check_achievements(base_path, data)
            newly_unlocked_titles = status.check_titles(base_path, data)

            if newly_unlocked_ach:
                print(f" [Achievement Unlocked] Achieved: {[a['name'] for a in newly_unlocked_ach]}")
            if newly_unlocked_titles:
                print(f" [Title Unlocked] Acquired titles: {[t['name'] for t in newly_unlocked_titles]}")

        elif judge == 'y':
            print(f" -> [Pass] Unleashing {param} current value to {target_gate}.")
            
            # Update status parameters
            status_dict = data.setdefault("status", {})
            param_status = status_dict.setdefault(param, {"current": 100, "peak": 100})
            
            old_current = param_status.get("current", 100)
            old_peak = param_status.get("peak", 100)
            
            param_status["current"] = target_gate
            param_status["peak"] = max(old_peak, target_gate)
            param_status["last_measured"] = datetime.now().strftime("%Y-%m-%d")
            param_status["last_measured_at"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

            # Recalculate total combat power
            combat_power = 0
            for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]:
                p_val = status_dict.get(p, {}).get("current", 100)
                combat_power += p_val
            data["combat_power"] = combat_power
            print(f" -> Recalculated total combat power: {combat_power}")

            # Add event to history
            history = data.setdefault("history", [])
            history.append({
                "date": datetime.now().strftime("%Y-%m-%d"),
                "event": f"Exam Passed: {test_id} ({param} level {target_gate} Gate Cleared!)",
                "status_change": {},
                "summary": feedback
            })

            # Automatically evaluate achievements/titles
            newly_unlocked_ach = status.check_achievements(base_path, data)
            newly_unlocked_titles = status.check_titles(base_path, data)

            if newly_unlocked_ach:
                print(f" [Achievement Unlocked] Achieved: {[a['name'] for a in newly_unlocked_ach]}")
            if newly_unlocked_titles:
                print(f" [Title Unlocked] Acquired titles: {[t['name'] for t in newly_unlocked_titles]}")

        else:
            print(" -> [Fail] Logged failed exam event.")
            history = data.setdefault("history", [])
            history.append({
                "date": datetime.now().strftime("%Y-%m-%d"),
                "event": f"Exam Failed: {test_id} ({param} level {target_gate} Gate Failed)",
                "status_change": {},
                "summary": feedback
            })

    if processed_any:
        # Update pending answers list
        data["pending_answers"] = new_pending_answers
        data["last_updated"] = datetime.now().isoformat()

        # Atomic save using save_json and sync with cloud
        print("\nSaving changes and syncing with cloud...")
        status.save_json(filepath, data, user_id)
        print("[+] Grading results applied and synchronized with cloud successfully.")
    else:
        print("\n[-] No grading executed (all answers skipped).")

if __name__ == "__main__":
    main()
