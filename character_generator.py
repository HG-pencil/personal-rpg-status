import os
import json
import sys

# Windows環境での標準出力エンコーディング対策
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def get_base_path():
    return os.path.dirname(os.path.abspath(__file__))

def main():
    base_path = get_base_path()
    filepath = os.path.join(base_path, "status_HG_pencil.json")
    
    if not os.path.exists(filepath):
        print("エラー: status.json が見つかりません。")
        sys.exit(1)
        
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    combat_power = data.get("combat_power", 0)
    archetypes = data.get("archetypes", [])
    active_titles = data.get("titles", {}).get("active", [])
    
    # 成長度（装備の豪華さ）の判定
    if combat_power < 1000:
        gear_desc = "simple leather armor and a wooden training sword"
    elif combat_power < 2500:
        gear_desc = "sturdy iron chestplate, brown leather boots, and a steel shortsword"
    else:
        gear_desc = "glowing celestial plate armor, a heroic silver cape, and a magical glowing weapon"
        
    # Archetypeによるスタイルの補正
    style_details = ""
    if "Scholar" in archetypes:
        style_details = "holding a thick ancient spellbook, wearing a deep blue sage hood and scholarly wizard robes over the gear"
    elif "Architect" in archetypes:
        style_details = "a magical engineer with neon-glowing blueprints floating around, wearing goggles and holding a high-tech wrench-shaped staff"
    elif "Commander" in archetypes:
        style_details = "wearing a noble commander's sash and cape, holding a small leadership battle flag"
    elif "Titan" in archetypes:
        style_details = "wearing oversized shoulder plates, carrying a giant shield and broadsword on his back"
    elif "Sage" in archetypes:
        style_details = "in a calm pose, wearing simple monk vestments with a soft golden aura"
    elif "Creator" in archetypes:
        style_details = "wearing utility belts full of tools, holding a glowing digital drafting stylus"
    elif "Guardian" in archetypes:
        style_details = "carrying a large metal tower shield, wearing highly protective guardian armor"
    else:
        style_details = "with a small traveler's backpack and a utility belt"
        
    # 自作称号による装飾（画像生成時のAI自身の自律解釈をサポート）
    title_suffix = ""
    custom_title = data.get("custom_title", "")
    if custom_title:
        title_suffix = f" acting out the custom title and dramatic situation of '{custom_title}'"
    elif active_titles:
        title_suffix = f" representing the title '{active_titles[0]}'"
        
    # 最終的なプロンプトの構築（ノービス画像をベースに顔立ちを維持しつつ、アングルやポーズは動的に変化させる）
    prompt = (
        f"Based on the input image 'assets/avatar_Novice.png', keep the exact same character (the same facial features, the friendly closed-eye smile, and the head shape of the middle-aged uncle with short dark hair and no beard). "
        f"Modify his outfit, pose, and camera angle dynamically: dress him in {gear_desc}, {style_details}{title_suffix}, creating an active and exciting pose suitable for this title. "
        f"Maintain the exact 16-bit retro game pixel art style, sprite layout, and solid dark gray background."
    )
    
    print("=== GENERATED IMAGE PROMPT ===")
    print(prompt)
    print("==============================")

if __name__ == "__main__":
    main()
