import os
import json
import sys

def get_base_path():
    return os.path.dirname(os.path.abspath(__file__))

def main():
    base_path = get_base_path()
    filepath = os.path.join(base_path, "status.json")
    
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
        
    # 称号による装飾
    title_suffix = ""
    if active_titles:
        title_suffix = f" representing the title '{active_titles[0]}'"
        
    # 最終的なプロンプトの構築（2頭身アニメ調のおっさん要素を明示）
    prompt = (
        f"16-bit retro game pixel art sprite of a friendly chibi style (2-head-tall) middle-aged uncle adventurer. "
        f"The character is an approachable middle-aged man with a kind smile, a short neat beard, "
        f"equipped with {gear_desc}, {style_details}{title_suffix}. "
        f"Front-facing standing pose, full body, isolated on a clean solid dark gray background. "
        f"Vibrant colors, cute anime JRPG chibi character style, clear pixel lines."
    )
    
    print("=== GENERATED IMAGE PROMPT ===")
    print(prompt)
    print("==============================")

if __name__ == "__main__":
    main()
