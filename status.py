import os
import sys
import json
import argparse
import subprocess
import time
import re
from datetime import datetime


# Workaround for standard output encoding in Windows environment
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Check dependency libraries
try:
    import matplotlib.pyplot as plt
    import numpy as np
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False

def translate_to_quest(raw_title, raw_desc):
    # Default values
    title = raw_title
    desc = raw_desc
    rank = "C"
    client = "\u5192\u967a\u8005\u30ae\u30eb\u30c9"
    
    # Normalize judgment
    t_norm = raw_title.lower()
    
    # Default value for training parameter (for estimation)
    param = "MND"
    
    # Mapping rules
    if any(x in t_norm for x in ["\u64a4\u9000\u57fa\u6e96", "\u6700\u5927\u8a31\u5bb9\u640d\u5931", "\u5206\u6563\u57fa\u6e96", "\u640d\u5207\u308a"]):
        client = "\u6295\u8cc7\u5be9\u8b70\u4f1a"
        rank = "B"
        param = "MND"
        if "\u64a4\u9000\u57fa\u6e96" in raw_title:
            title = "\u3010\u9632\u885b\u7d50\u754c\u3011\u6295\u8cc7\u306e\u9632\u885b\u57fa\u6e96\u30cf\u30fc\u30c9\u30b3\u30fc\u30c9"
            desc = "\u76f8\u5834\u304b\u3089\u306e\u611f\u60c5\u30c7\u30d0\u30d5\u3092\u906e\u65ad\u305b\u3088\u3002\u7dcf\u8cc7\u91d110%\u640d\u5931\u6642\u306b\u5168\u30dd\u30b8\u30b7\u30e7\u30f3\u3092\u5f37\u5236\u6c7a\u6e08\u3059\u308b\u7dca\u6025\u30bb\u30fc\u30d5\u30c6\u30a3\u3068\u3001\u5358\u4e00\u9298\u67c4\u306e\u4fdd\u6709\u7387\u309215%\u4ee5\u5185\u306b\u6291\u3048\u308b\u5206\u6563\u7d50\u754c\u3092\u9b54\u5c0e\u56de\u8def\uff08\u30b7\u30b9\u30c6\u30e0\uff09\u3078\u4eca\u65e5\u5b9f\u88c5\u3057\u3001\u305d\u306e\u7d50\u679c\u3092\u5831\u544a\u3059\u3079\u3057\u3002"
        elif "\u6700\u5927\u8a31\u5bb9\u640d\u5931" in raw_title:
            title = "\u3010\u9632\u885b\u6226\u3011\u6700\u5927\u8a31\u5bb9\u640d\u5931\u984d\u306e\u5c01\u5370"
            desc = "\u7dcf\u6295\u8cc7\u8cc7\u91d1\u306e10%\u3092\u4e0b\u56de\u3063\u305f\u6642\u70b9\u3067\u3001\u611f\u60c5\u3084\u72ec\u81ea\u306e\u76f8\u5834\u89b3\u3092\u4e00\u5207\u7121\u8996\u3057\u3066\u5168\u30dd\u30b8\u30b7\u30e7\u30f3\u3092\u5f37\u5236\u6c7a\u6e08\uff08\u30d7\u30e9\u30b0\u3092\u629c\u304f\uff09\u3059\u308b\u30eb\u30fc\u30eb\u3092\u4eca\u65e5\u30b7\u30b9\u30c6\u30e0\u306b\u30cf\u30fc\u30c9\u30b3\u30fc\u30c7\u30a3\u30f3\u30b0\u3057\u3001\u5b8c\u4e86\u5831\u544a\u305b\u3088\u3002"
        elif "\u5206\u6563\u57fa\u6e96" in raw_title:
            title = "\u3010\u9632\u5fa1\u5f37\u5316\u3011\u30a2\u30bb\u30c3\u30c8\u5206\u6563\u7d50\u754c\u306e\u69cb\u7bc9"
            desc = "\u5358\u4e00\u306e\u9298\u67c4\u3078\u306e\u96c6\u4e2d\u6295\u8cc7\u30d0\u30b0\u3092\u9632\u3050\u305f\u3081\u30011\u3064\u306e\u30a2\u30bb\u30c3\u30c8\u30fb\u9298\u67c4\u3078\u306e\u6295\u8cc7\u5272\u5408\u3092\u7dcf\u8cc7\u91d1\u306e15%\u4ee5\u5185\u306b\u5236\u9650\u3059\u308b\u7269\u7406\u7d50\u754c\u3092\u4eca\u65e5\u8a2d\u5b9a\u3057\u3001\u5b8c\u4e86\u5831\u544a\u305b\u3088\u3002"
            
    elif any(x in t_norm for x in ["\u5bb6\u5ead\u5185", "\u59bb", "\u5bfe\u8a71"]):
        client = "\u5bb6\u5ead\u904b\u55b6\u30ae\u30eb\u30c9"
        rank = "A"
        param = "CHA"
        title = "\u3010\u8056\u57df\u5b88\u8b77\u3011\u8056\u57df\u306e\u5b88\u8b77\u8005\u3068\u306e\u5bfe\u8a71"
        desc = "\u4f55\u3088\u308a\u3082\u91cd\u8981\u306a\u300c\u5e73\u7a4f\u306a\u751f\u6d3b\uff08\u8056\u57df\uff09\u300d\u3092\u5b88\u308b\u305f\u3081\u3001\u8056\u57df\u306e\u5b88\u8b77\u8005\uff08\u59bb\uff09\u306830\u5206\u9593\u306e\u5bfe\u8a71\u3092\u4eca\u65e5\u5b9f\u884c\u3057\u3001\u5bb6\u5ead\u306e\u5b89\u5b9a\u5ea6\uff08\u30d0\u30b0\u56de\u53ce\uff09\u3092\u78ba\u8a8d\u305b\u3088\u3002\u305d\u306e\u7d50\u679c\u3092\u5b9f\u7e3e\u5831\u544a\u3059\u3079\u3057\u3002"
        
    elif any(x in t_norm for x in ["\u751f\u30ed\u30b0", "\u30a4\u30f3\u30c7\u30c3\u30af\u30b9"]):
        client = "AI\u958b\u62d3\u8005\u9023\u76df"
        rank = "C"
        param = "DEV"
        title = "\u3010\u30c7\u30fc\u30bf\u6574\u7406\u3011\u97f3\u58f0\u30ed\u30b0\u3078\u306e\u30bf\u30b0\u4ed8\u4e0e"
        desc = "\u672a\u6765\u306eAI\u9b54\u5c0e\u306e\u62bd\u51fa\u7cbe\u5ea6\u3092\u4fdd\u3064\u305f\u3081\u3001\u672c\u65e5\u306e\u97f3\u58f0\u30ed\u30b0\uff08NotebookLM\u7528\uff09\u306e\u672b\u5c3e5\u79d2\u306b\u5fc5\u305a\u300c\u30ad\u30fc\u30ef\u30fc\u30c9\uff1a\u91cd\u91cf\u7269\u3001\u7fbd\u7530\u3001\u30c8\u30e9\u30d6\u30eb\u300d\u306a\u3069\u306e\u691c\u7d22\u7528\u30cf\u30c3\u30b7\u30e5\u30bf\u30b0\u3092\u53e3\u982d\u3067\u4ed8\u4e0e\u3057\u3066\u9332\u97f3\u3092\u5b8c\u4e86\u3057\u3001\u5b9f\u7e3e\u5831\u544a\u305b\u3088\u3002"
        
    elif "\u7cbe\u5bc6\u691c\u67fb" in raw_title:
        client = "\u5065\u5eb7\u7ba1\u7406\u795e\u6bbf"
        rank = "S"
        param = "VIT"
        title = "\u3010\u8089\u4f53\u8a3a\u65ad\u3011\u5065\u5eb7\u7ba1\u7406\u795e\u6bbf\u306e\u4e88\u7d04\u307e\u305f\u306f\u53d7\u8a3a"
        desc = "\u5065\u5eb7\u30c7\u30fc\u30bf\u306e\u8d64\u4fe1\u53f7\u3092\u30c7\u30d0\u30c3\u30b0\u3059\u308b\u305f\u3081\u3001\u4eca\u65e5\u4e2d\u306b\u5185\u79d1\u30fb\u6d88\u5316\u5668\u5185\u79d1\u3067\u306e\u7cbe\u5bc6\u691c\u67fb\u306e\u300c\u4e88\u7d04\uff08\u307e\u305f\u306f\u53d7\u8a3a\uff09\u300d\u3092\u5b8c\u4e86\u3057\u3001\u305d\u306e\u5b9f\u884c\u7d50\u679c\u3092\u5831\u544a\u305b\u3088\u3002"
        
    elif "\u65e5\u5e38\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9" in raw_title or "\u5f92\u6b69" in raw_title or "\u30b7\u30fc\u30d1\u30c3\u30d7" in raw_title:
        client = "\u5065\u5eb7\u7ba1\u7406\u795e\u6bbf"
        rank = "B"
        param = "VIT"
        title = "\u3010\u65e5\u5e38\u935b\u932c\u3011\u65e5\u5e38\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9\u306e\u7d99\u7d9a"
        desc = "\u30cf\u30fc\u30c9\u30a6\u30a7\u30a2\u7dad\u6301\u306e\u305f\u3081\u3001\u672c\u65e5\u300c1\u6642\u9593\u306e\u5f92\u6b69\u935b\u932c\u300d\u304a\u3088\u3073\u7761\u7720\u6642\u306e\u300c\u30b7\u30fc\u30d1\u30c3\u30d7\u88c5\u7740\u300d\u3092\u5b9f\u884c\u3057\u3001\u6b63\u5e38\u306b\u5b8c\u4e86\u3057\u305f\u3053\u3068\u3092\u5831\u544a\u305b\u3088\u3002"
        
    elif "\u526f\u696d\u898f\u5b9a" in raw_title or "\u6cd5\u7684\u30ea\u30b9\u30af" in raw_title:
        client = "\u9632\u6ce2\u5824\uff08\u4f1a\u793e\uff09\u5b88\u5099\u968a"
        rank = "C"
        param = "INT"
        title = "\u3010\u9b54\u5c0e\u898f\u5247\u3011\u526f\u696d\u306b\u95a2\u3059\u308b\u6cd5\u7684\u30ea\u30b9\u30af\u306e\u6574\u7406"
        desc = "\u5b89\u5168\u306a\u8907\u7dda\u5316\u306b\u5411\u3051\u3066\u3001\u52e4\u52d9\u5148\u306e\u5c31\u696d\u898f\u5247\uff08\u526f\u696d\u898f\u5b9a\u3001\u7af6\u696d\u898f\u5b9a\u3001\u60c5\u5831\u7ba1\u7406\u898f\u5b9a\uff09\u3092\u4eca\u65e5\u8aad\u307f\u76f4\u3057\u3001\u6f5c\u3080\u30ea\u30b9\u30af\u3068\u5b89\u5168\u306a\u9632\u885b\u7dda\u3092\u6574\u7406\u3057\u305f\u5b9f\u7e3e\u3092\u5831\u544a\u305b\u3088\u3002"
        
    elif "\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9" in raw_title:
        client = "AI\u958b\u62d3\u8005\u9023\u76df"
        rank = "A"
        param = "DEV"
        title = "\u3010\u9632\u5fa1\u5f37\u5316\u3011\u4fbf\u5229\u5c4b\u5316\u3092\u9632\u3050\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9\u306e\u69cb\u7bc9"
        desc = "\u696d\u52d9\u7bc4\u56f22\u500d\u5316\u306e\u5371\u6a5f\u3092\u9632\u3050\u305f\u3081\u3001\u793e\u5185\u30b7\u30b9\u30c6\u30e0\u3092\u300c\u79c1\u7684Google\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u7d4c\u7531\u3057\u306a\u3051\u308c\u3070\u52d5\u304b\u306a\u3044\u4ed5\u69d8\u300d\u306b\u3059\u308b\u305f\u3081\u306e\u57fa\u672c\u8a2d\u8a08\uff08\u4ed5\u69d8\u7b56\u5b9a\uff09\u3092\u4eca\u65e5\u4e2d\u306b1\u6b69\u9032\u3081\u3001\u305d\u306e\u9032\u6357\u3092\u5831\u544a\u305b\u3088\u3002"
        
    elif "\u53d7\u8a17\u6848\u4ef6" in raw_title:
        client = "\u5546\u696d\u30ae\u30eb\u30c9"
        rank = "A"
        param = "WIS"
        title = "\u3010\u5546\u696d\u4efb\u52d9\u3011\u53d7\u8a17\u6848\u4ef6\u7372\u5f97\u30a2\u30af\u30b7\u30e7\u30f3"
        desc = "\u4f1a\u793e\u7d66\u4e0e\u4ee5\u5916\u306e\u53ce\u5165\u6e90\u3092\u958b\u62d3\u3059\u308b\u305f\u3081\u3001Kintone\u30c4\u30fc\u30eb\u306e\u5916\u8ca9\u6e96\u5099\u3084\u6848\u4ef6\u7372\u5f97\u306b\u5411\u3051\u305f\u521d\u52d5\u30a2\u30af\u30b7\u30e7\u30f3\u3092\u4eca\u65e5\u5b9f\u884c\u3057\u3001\u305d\u306e\u53d6\u308a\u7d44\u307f\u5185\u5bb9\u3092\u5831\u544a\u305b\u3088\u3002"
        
    elif any(x in t_norm for x in ["\u97f3\u58f0\u30ed\u30b0\u84c4\u7a4d", "\u73fe\u5834\u77e5\u8b58", "\u84c4\u7a4d"]):
        client = "\u8ce2\u8005\u306e\u5854"
        rank = "B"
        param = "WIS"
        title = "\u3010\u53e4\u4ee3\u77e5\u8b58\u3011\u73fe\u5834\u7d4c\u9a13\u306e\u97f3\u58f0\u30ed\u30b0\u84c4\u7a4d"
        desc = "20\u5e74\u9593\u306e\u6ce5\u81ed\u3044\u73fe\u5834\u30ce\u30a6\u30cf\u30a6\u3092AI\u30c7\u30fc\u30bf\u30d9\u30fc\u30b9\u3078\u7d44\u307f\u8fbc\u3080\u305f\u3081\u3001\u672c\u65e5\u306e\u73fe\u5834\u77e5\u8b58\u3092\u30cf\u30c3\u30b7\u30e5\u30bf\u30b0\u4ed8\u304d\u3067\u97f3\u58f0\u30ed\u30b0\u3068\u3057\u3066\u9332\u97f3\uff08NotebookLM\u3078\u84c4\u7a4d\uff09\u3057\u3001\u5b8c\u4e86\u3092\u5831\u544a\u305b\u3088\u3002"
    else:
        # Default conversion
        title = f"\u3010\u4efb\u52d9\u3011{raw_title}"
        
        # Infer suitable training parameter from title or description
        search_text = (title + " " + desc + " " + raw_title + " " + raw_desc).lower()
        if any(x in search_text for x in ["\u7b4b\u529b", "\u5f92\u6b69", "\u6b69\u884c", "\u904b\u52d5", "\u6b69\u304f", "str"]):
            param = "STR"
        elif any(x in search_text for x in ["\u5065\u5eb7", "\u7761\u7720", "cpap", "\u30b7\u30fc\u30d1\u30c3\u30d7", "\u53d7\u8a3a", "\u691c\u67fb", "\u5185\u79d1", "\u6d88\u5316\u5668", "vit"]):
            param = "VIT"
        elif any(x in search_text for x in ["\u526f\u696d\u898f\u5b9a", "\u898f\u5247", "\u6cd5\u5f8b", "\u898f\u5b9a", "\u5951\u7d04", "\u6cd5\u7684", "\u8ad6\u7406", "\u69cb\u9020", "int"]):
            param = "INT"
        elif any(x in search_text for x in ["\u77e5\u8b58", "\u97f3\u58f0", "\u30ed\u30b0", "\u84c4\u7a4d", "\u30ce\u30a6\u30cf\u30a6", "\u6559\u990a", "wis"]):
            param = "WIS"
        elif any(x in search_text for x in ["\u6295\u8cc7", "\u8cc7\u91d1", "\u640d\u5931", "\u57fa\u6e96", "\u64a4\u9000", "\u640d\u5207\u308a", "\u611f\u60c5", "\u898f\u5f8b", "mnd"]):
            param = "MND"
        elif any(x in search_text for x in ["\u59bb", "\u5bb6\u5ead", "\u5bb6\u65cf", "\u5bfe\u8a71", "\u4fe1\u983c", "cha"]):
            param = "CHA"
        elif any(x in search_text for x in ["\u30b7\u30b9\u30c6\u30e0", "\u958b\u767a", "\u81ea\u52d5\u5316", "\u8a2d\u8a08", "\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9", "ai", "\u958b\u62d3", "\u30b3\u30fc\u30c9", "dev"]):
            param = "DEV"
        else:
            param = "MND"

    # Determine training points based on difficulty (Rank)
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

    # Estimate due date (today / this week / this month)
    due = "this_month"
    search_all = (title + " " + desc + " " + raw_title + " " + raw_desc).lower()
    if any(x in search_all for x in ["\u4eca\u65e5", "\u672c\u65e5", "\u4eca\u65e5\u4e2d", "today"]):
        due = "today"
    elif any(x in search_all for x in ["\u4eca\u9031", "\u6bce\u9031", "\u9031\u6b21", "this week", "week", "\u66dc\u65e5"]):
        due = "this_week"

    # Estimate weight (light / medium / heavy)
    weight = "light"
    if rank in ["S", "A"]:
        weight = "heavy"
    elif rank == "B":
        weight = "medium"
    elif rank == "C":
        weight = "light"

    return {
        "step": f"Rank {rank}",
        "title": title,
        "description": desc,
        "client": client,
        "reward": reward,
        "original_title": raw_title,
        "status": "pending",
        "due": due,
        "weight": weight
    }

def generate_roadmap_events(roadmap, status_data):
    events = []
    if not roadmap or "phases" not in roadmap:
        return events
        
    status = status_data.get("status", {})
    
    # Check items in progress
    for phase in roadmap.get("phases", []):
        for item in phase.get("items", []):
            param_bind = item.get("param_bind")
            if not param_bind:
                continue
                
            p_data = status.get(param_bind, {})
            curr_val = p_data.get("current", 100) if p_data else 100
            threshold = 280 if param_bind == "CHA" else 300
            
            # Generate event if below threshold (PROGRESS state)
            if curr_val < threshold:
                title = f"\u3010\u7a81\u767a\u30a4\u30d9\u30f3\u30c8\u3011{item.get('title')}"
                desc = item.get("description", "")
                client = "\u5192\u967a\u8005\u30ae\u30eb\u30c9"
                rank = "B"
                
                # Game-style custom adaptation based on parameters and keywords
                if param_bind == "VIT" and "\u5065\u5eb7" in item.get("title", ""):
                    title = "\u3010\u7dca\u6025\u6307\u4ee4\u3011\u99c6\u3051\u8fbc\u3081\uff01\u30db\u30b9\u30d4\u30bf\u30eb\uff01\uff01"
                    desc = "\u4f53\u306b\u9577\u5e74\u84c4\u7a4d\u3055\u308c\u305f\u6bd2\uff08BMI\u30fb\u809d\u6a5f\u80fd\u7b49\u306e\u7570\u5e38\u9b54\u529b\uff09\u304c\u4f53\u3092\u8755\u307f\u59cb\u3081\u3066\u3044\u308b\u3002\u4eca\u3059\u3050\u753a\u306e\u5185\u79d1\u306b\u99c6\u3051\u8fbc\u307f\u3001\u7cbe\u5bc6\u691c\u67fb\uff08\u30c7\u30d0\u30c3\u30b0\uff09\u3092\u53d7\u8a3a\u305b\u3088\uff01\u305d\u306e\u5b9f\u7e3e\u5831\u544a\u3092\u3082\u3063\u3066\u30af\u30a8\u30b9\u30c8\u30af\u30ea\u30a2\u3068\u3059\u308b\u3002"
                    client = "\u5065\u5eb7\u7ba1\u7406\u795e\u6bbf"
                    rank = "S"
                elif param_bind == "DEV" and "\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9" in item.get("title", ""):
                    title = "\u3010\u9632\u885b\u4efb\u52d9\u3011\u4fbf\u5229\u5c4b\u5316\u3092\u9632\u3050\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9\u306e\u69cb\u7bc9"
                    desc = "\u4eba\u54e1\u4e0d\u8db3\u306b\u3088\u308b\u300c\u696d\u52d9\u7bc4\u56f22\u500d\u5316\u30ea\u30b9\u30af\u300d\u306e\u9b54\u306e\u624b\u304c\u8feb\u3063\u3066\u3044\u308b\uff01\u793e\u5185\u30b7\u30b9\u30c6\u30e0\u3092\u300c\u79c1\u7684Google\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u7d4c\u7531\u3057\u306a\u3051\u308c\u3070\u52d5\u304b\u306a\u3044\u8a2d\u8a08\u300d\u306b\u3057\u3001\u81ea\u5206\u3092\u4e0d\u8981\u306b\u3059\u308b\u7d76\u5bfe\u9632\u5fa1 of\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9\u4ed5\u69d8\u3092\u7b56\u5b9a\u305b\u3088\u3002"
                    title = "\u3010\u9632\u885b\u4efb\u52d9\u3011\u4fbf\u5229\u5c4b\u5316\u3092\u9632\u3050\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9\u306e\u69cb\u7bc9"
                    desc = "\u4eba\u54e1\u4e0d\u8db3\u306b\u3088\u308b\u300c\u696d\u52d9\u7bc4\u56f22\u500d\u5316\u30ea\u30b9\u30af\u300d\u306e\u9b54\u306e\u624b\u304c\u8feb\u3063\u3066\u3044\u308b\uff01\u793e\u5185\u30b7\u30b9\u30c6\u30e0\u3092\u300c\u79c1\u7684Google\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u7d4c\u7531\u3057\u306a\u3051\u308c\u3070\u52d5\u304b\u306a\u3044\u8a2d\u8a08\u300d\u306b\u3057\u3001\u81ea\u5206\u3092\u4e0d\u8981\u306b\u3059\u308b\u7d76\u5bfe\u9632\u5fa1\u306e\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9\u4ed5\u69d8\u3092\u7b56\u5b9a\u305b\u3088\u3002"
                    client = "AI\u958b\u62d3\u8005\u9023\u76df"
                    rank = "S"
                elif param_bind == "WIS" and "\u73fe\u5834\u77e5\u8b58" in item.get("title", ""):
                    title = "\u3010\u4f1d\u627f\u8a66\u7df4\u3011\u8ce2\u8005\u306e\u97f3\u58f0\u30ed\u30b0\u767e\u9023\u767a\uff01"
                    desc = "20\u5e74\u9593\u306b\u308f\u305f\u308b\u91cd\u91cf\u6a5f\u5de5\u30fb\u7d71\u62ec\u7ba1\u7406\u306e\u8cb4\u91cd\u306a\u6ce5\u81ed\u3044\u7d4c\u9a13\uff08\u53e4\u4ee3\u306e\u82f1\u77e5\uff09\u304c\u6563\u9038\u3059\u308b\u5371\u6a5f\u306b\u3042\u308b\u3002\u30cf\u30c3\u30b7\u30e5\u30bf\u30b0\u4ed8\u304d\u3067\u97f3\u58f0\u30ed\u30b0\u3092NotebookLM\u306b\u3072\u305f\u3059\u3089\u84c4\u7a4d\u3057\u3001\u77e5\u8b58\u3092\u4f1d\u627f\u305b\u3088\u3002"
                    client = "\u8ce2\u8005\u306e\u5854"
                    rank = "B"
                elif param_bind == "MND" and "\u64a4\u9000\u57fa\u6e96" in item.get("title", ""):
                    title = "\u3010\u7cbe\u795e\u8a66\u7df4\u3011\u5e7b\u60d1\u306e\u640d\u5207\u308a\u3068\u7d76\u5bfe\u64a4\u9000\u898f\u5f8b"
                    desc = "\u6295\u8cc7\u306b\u304a\u3051\u308b\u81ea\u5df1\u898f\u5f8b\u3092\u8a66\u3059\u8a66\u7df4\u3002\u5e02\u5834\u306e\u5e7b\u60d1\u9b54\u6cd5\u3092\u9000\u3051\u3001\u64a4\u9000\u57fa\u6e96\uff08\u7dcf\u8cc7\u91d110%\u640d\u5931\u3067\u306e\u5f37\u5236\u6c7a\u6e08\uff09\u3068\u5206\u6563\u7d50\u754c\uff08\u5358\u4e0015%\u4ee5\u5185\uff09\u306e\u898f\u5f8b\u3092\u5fc3\u9b42\u306b\u523b\u307f\u8fbc\u3081\u3002"
                    client = "\u6295\u8cc7\u5be9\u8b70\u4f1a"
                    rank = "B"
                elif param_bind == "CHA" and "\u5bb6\u5ead" in item.get("title", ""):
                    title = "\u3010\u5b88\u8b77\u8a66\u7df4\u3011\u65e5\u5e38\u5bfe\u8a71\u306b\u3088\u308b\u5bb6\u5ead\u5186\u6e80\u7d50\u754c"
                    desc = "\u6700\u4e0a\u4f4d\u306e\u4fa1\u5024\u89b3\u3067\u3042\u308b\u5bb6\u5ead\u306e\u5e73\u7a4f\uff08\u8056\u57df\uff09\u3092\u5b88\u308b\u305f\u3081\u306e\u8a66\u7df4\u3002\u6bce\u9031\u65e5\u66dc\u65e5\u306e\u5348\u524d\u4e2d\u306a\u3069\u3001\u56fa\u5b9a\u3067\u300c\u9031\u6b2130\u5206\u300d\u306e\u5bfe\u8a71\u6642\u9593\u3092\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb\u306b\u5f37\u5236\u30ed\u30c3\u30af\u3057\u3001\u30d0\u30b0\u3092\u672a\u7136\u306b\u56de\u53ce\u305b\u3088\u3002"
                    client = "\u5bb6\u5ead\u904b\u55b6\u30ae\u30eb\u30c9"
                    rank = "A"
                
                # Determine training points based on difficulty (Rank)
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
    target_base = r"G:\\u30de\u30a4\u30c9\u30e9\u30a4\u30d6\\u30ce\u30fc\u30c8\u30d6\u30c3\u30afLM\u7528\u30c7\u30fc\u30bf\u683c\u7d0d\u5834\u6240\\u6211\u90e8\u5b8f\u548c\RPG\u57fa\u672c\u30c7\u30fc\u30bf"
    file_path = os.path.join(target_base, user_id, "\u4eca\u6708\u306e\u76ee\u6a19.txt")
    if not os.path.exists(file_path):
        return []
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        quests = []
        step_matches = list(re.finditer(r'(Step \d+:.*?)(?=Step \d+:|$)', content, re.DOTALL))
        
        # Pattern definition for target tasks
        targets = [
            "\u6295\u8cc7\u30b7\u30b9\u30c6\u30e0\u306e\u300c\u64a4\u9000\u57fa\u6e96\u300d\u3068\u300c\u5206\u6563\u57fa\u6e96\u300d\u306e\u7d76\u5bfe\u8a2d\u5b9a",
            "\u5927\u91cf\u751f\u30ed\u30b0\u3078\u306e\u300c\u30a4\u30f3\u30c7\u30c3\u30af\u30b9\u4ed8\u4e0e\u300d\u30eb\u30fc\u30eb\u306e\u5fb9\u5e95",
            "Discord\u9060\u9694\u64cd\u4f5c\u30b7\u30b9\u30c6\u30e0\u306e\u904b\u7528\u30c6\u30b9\u30c8\u5b9f\u65bd",
            "BOOTH\u516c\u958b\u30c4\u30fc\u30eb\u306e\u5c0e\u7dda\u4f5c\u308a\uff08\u60c5\u5831\u767a\u4fe1\u306e\u521d\u52d5\uff09",
            "\u4eba\u751fRPG\u30c4\u30fc\u30eb\u306e\u81ea\u5df1\u904b\u7528",
            "\u30ed\u30fc\u30ab\u30ebLLM\u5c0e\u5165\u4ea4\u6e09\u3068\u30b9\u30c6\u30eb\u30b9\u81ea\u52d5\u5316\u306e\u4e21\u7acb",
            "Kintone\u696d\u52d9\u81ea\u52d5\u5316\u306e\u5916\u6ce8\u7ba1\u7406",
            "\u300c\u5bb6\u5ead\u5185\u904b\u7528\uff08\u59bb\uff09\u300d\u306e\u7d99\u7d9a",
            "\u5065\u5eb7\u30cf\u30fc\u30c9\u30a6\u30a7\u30a2\u306e\u4fdd\u5b88\u30fb\u30c7\u30fc\u30bf\u53cd\u6620",
            "\u7247\u905345\u5206\u306e\u5f92\u6b69\u901a\u52e4\u3068\u3001CPAP\u6cbb\u7642\u3092\u78ba\u5b9f\u306b\u7d99\u7d9a\u3059\u308b"
        ]
        
        if not step_matches:
            # Fallback when Step is missing (newline split or simple target matching)
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
                desc = re.sub(r'^[:\uff1a\s\-]+', '', desc)
                
                status = "pending"
                if any(x in title or x in desc for x in ["- [x]", "[x]", "\uff08\u5b8c\u4e86\uff09", "(\u5b8c\u4e86)", "\u3010\u5b8c\u4e86\u3011", "\uff08\u6e08\uff09", "(\u6e08)", "\u3010\u9054\u6210\u3011"]):
                    status = "completed"
                    
                quest_obj = translate_to_quest(title, desc)
                quest_obj["status"] = status
                quests.append(quest_obj)
            return quests

        for m in step_matches:
            step_text = m.group(1).strip()
            step_header_match = re.match(r'(Step \d+:\s*(?:\u3010[^\u3011]+\u3011)?[^\u3002\u3001\u300c]+)', step_text)
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
                desc = re.sub(r'^[:\uff1a\s\-]+', '', desc)
                
                status = "pending"
                if any(x in title or x in desc for x in ["- [x]", "[x]", "\uff08\u5b8c\u4e86\uff09", "(\u5b8c\u4e86)", "\u3010\u5b8c\u4e86\u3011", "\uff08\u6e08\uff09", "(\u6e08)", "\u3010\u9054\u6210\u3011"]):
                    status = "completed"
                    
                quest_obj = translate_to_quest(title, desc)
                quest_obj["status"] = status
                quests.append(quest_obj)
        return quests
    except Exception as e:
        print(f"[!] \u4eca\u6708\u306e\u76ee\u6a19\u306e\u30d1\u30fc\u30b9\u306b\u5931\u6557\u3057\u307e\u3057\u305f: {e}")
        return []

def parse_roadmap(user_id="HG_pencil"):
    target_base = r"G:\\u30de\u30a4\u30c9\u30e9\u30a4\u30d6\\u30ce\u30fc\u30c8\u30d6\u30c3\u30afLM\u7528\u30c7\u30fc\u30bf\u683c\u7d0d\u5834\u6240\\u6211\u90e8\u5b8f\u548c\RPG\u57fa\u672c\u30c7\u30fc\u30bf"
    file_path = os.path.join(target_base, user_id, "\u30ed\u30fc\u30c9\u30de\u30c3\u30d7.txt")
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
            if line.startswith("\u3010") and "\u30ed\u30fc\u30c9\u30de\u30c3\u30d7" in line:
                roadmap["title"] = line.replace("\u3010", "").replace("\u3011", "")
                continue
                
            phase_match = re.match(r'(\u7b2c\d+\u30d5\u30a7\u30fc\u30ba.*?)[\uff1a:](.*)', line)
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
                item_match = re.match(r'([^:\uff1a]+)[:\uff1a](.*)', line)
                if item_match:
                    title = item_match.group(1).strip()
                    desc = item_match.group(2).strip()
                    
                    param_bind = None
                    if "\u5065\u5eb7" in title or "\u30b7\u30fc\u30d1\u30c3\u30d7" in title or "\u5f92\u6b69" in title:
                        param_bind = "VIT"
                    elif "\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9" in title or "\u81ea\u52d5\u5316" in title:
                        param_bind = "DEV"
                    elif "\u73fe\u5834\u77e5\u8b58" in title or "\u84c4\u7a4d" in title:
                        param_bind = "WIS"
                    elif "\u64a4\u9000\u57fa\u6e96" in title or "\u611f\u60c5" in title or "\u640d\u5207\u308a" in title:
                        param_bind = "MND"
                    elif "\u5bb6\u5ead" in title or "\u5bfe\u8a71" in title or "\u59bb" in title:
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
        print(f"[!] \u30ed\u30fc\u30c9\u30de\u30c3\u30d7\u306e\u30d1\u30fc\u30b9\u306b\u5931\u6557\u3057\u307e\u3057\u305f: {e}")
        return {}

def get_base_path():
    return os.path.dirname(os.path.abspath(__file__))


def load_auth_config():
    # 1. Try to get authentication from OS environment variables
    env_email = os.environ.get("RPG_EMAIL")
    env_password = os.environ.get("RPG_PASSWORD")
    env_uid = os.environ.get("RPG_UID")
    
    if env_email and env_password:
        return {
            "email": env_email,
            "password": env_password,
            "uid": env_uid
        }
        
    print("[!] Warning: Authentication environment variables (RPG_EMAIL, RPG_PASSWORD) are not set.")
    return None

def get_auth_token(email, password):
    api_key = "AIzaSyA-65Hz0doOnYw8YcrUSvWHgs1Zi99eiLI"
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }
    try:
        import urllib.request
        import json
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            resp = json.loads(res.read().decode('utf-8'))
            return resp.get("idToken")
    except Exception as e:
        print(f"[!] \u8a8d\u8a3c\u30c8\u30fc\u30af\u30f3\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f: {e}")
    return None

def pull_from_firestore(user_id="HG_pencil"):
    config = load_auth_config()
    headers = {}
    if config:
        token = get_auth_token(config.get("email"), config.get("password"))
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if config.get("uid"):
            user_id = config.get("uid")
            
    url = f"https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/{user_id}"
    try:
        import urllib.request
        import json
        req = urllib.request.Request(url, headers=headers, method='GET')
        with urllib.request.urlopen(req, timeout=5) as res:
            doc = json.loads(res.read().decode('utf-8'))
            status_json = doc.get("fields", {}).get("status_json", {}).get("stringValue", "")
            if status_json:
                return json.loads(status_json)
    except Exception as e:
        print(f"[!] Failed to retrieve data from cloud (offline mode): {e}")
    return None

# Text replacement for masking personal information
def mask_text(text):
    if not text:
        return text
    t = text
    # Masking rules (health data, private info, company name, etc.)
    replacements = [
        (r'(?i)eGFR\s*\d+(\.\d+)?', '\u5065\u5eb7\u6307\u6a19'),
        (r'LDL\u30b3\u30ec\u30b9\S*', '\u30b3\u30ec\u30b9\u30c6\u30ed\u30fc\u30eb'),
        (r'(?i)BMI\s*\d+(\.\d+)?', '\u4f53\u578b\u6307\u6a19'),
        (r'(?i)\u30b7\u30fc\u30d1\u30c3\u30d7|CPAP', '\u547c\u5438\u652f\u63f4\u30c7\u30d0\u30a4\u30b9'),
        (r'\u6295\u8cc7', '\u5546\u696d\u53d6\u5f15'),
        (r'\u682a\u5f0f|FX', '\u30a2\u30bb\u30c3\u30c8'),
        (r'\u640d\u5207\u308a|\u64a4\u9000\u57fa\u6e96', '\u30ea\u30b9\u30af\u7ba1\u7406\u898f\u5f8b'),
        (r'\u60c5\u30b7\u30b9|\u60c5\u30b7\u30b9\u30c6\u30e0', '\u7ba1\u7406\u90e8\u9580'),
        (r'\u4f1a\u793e|\u5c31\u696d\u898f\u5247', '\u30ae\u30eb\u30c9\u898f\u5247'),
        (r'\u59bb', '\u8056\u57df\u306e\u5b88\u8b77\u8005'),
        (r'(?i)Kintone', '\u9b54\u5c0e\u30c7\u30fc\u30bf\u30d9\u30fc\u30b9'),
        (r'(?i)BOOTH', '\u30a2\u30a4\u30c6\u30e0\u5e02\u5834')
    ]
    for pattern, replacement in replacements:
        t = re.sub(pattern, replacement, t)
    return t

# Masking personal information in sent data
def mask_sensitive_data(data):
    if not data:
        return data
    import copy
    c = copy.deepcopy(data)
    
    # 1. Delete history summary completely and mask event text
    if "history" in c:
        for h in c["history"]:
            if "summary" in h:
                del h["summary"]
            if "event" in h:
                h["event"] = mask_text(h["event"])
                
    # 2. Mask description in quests
    if "quests" in c:
        for q in c["quests"]:
            if "description" in q:
                q["description"] = mask_text(q["description"])
                
    # 3. Placeholderize pending answers description
    if "pending_answers" in c:
        for ans in c["pending_answers"]:
            test_id = ans.get("test_id", "")
            if "answer" in ans and test_id and not test_id.startswith("TRAIN-"):
                val = ans["answer"]
                if isinstance(val, dict) and "key_version" in val:
                    continue
                if isinstance(val, str) and (val.strip().startswith("{") and "key_version" in val):
                    continue
                ans["answer"] = "[\u8a18\u8ff0\u56de\u7b54\u306f\u30ed\u30fc\u30ab\u30eb\u306b\u306e\u307f\u4fdd\u5b58\u3055\u308c\u3066\u3044\u307e\u3059]"
                
    return c

# 3-way merge
def merge_status_data(cloud, local, base):
    import copy
    merged = copy.deepcopy(cloud)
    params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
    
    # 1. Merge training (add local increments from base to cloud)
    for p in params:
        local_val = local.get("training", {}).get(p, 0)
        base_val = base.get("training", {}).get(p, 0) if base else 0
        delta = local_val - base_val
        if delta > 0:
            merged.setdefault("training", {})
            old_val = merged["training"].get(p, 0)
            merged["training"][p] = old_val + delta
            
            # Automatically determine ticket acquisition
            merged.setdefault("tickets", {})
            tickets_earned = (merged["training"][p] // 100) - (old_val // 100)
            if tickets_earned > 0:
                merged["tickets"][p] = merged["tickets"].get(p, 0) + tickets_earned
                merged.setdefault("history", []).append({
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "event": f"Measurement Ticket ({p}) Obtained by Training Points (Accumulated: {merged['training'][p]}pts)",
                    "status_change": {}
                })
                
    # 2. Merge tickets (reflect increment/decrement from base)
    for t in ["all"] + params:
        local_count = local.get("tickets", {}).get(t, 0)
        base_count = base.get("tickets", {}).get(t, 0) if base else 0
        delta = local_count - base_count
        if delta != 0:
            merged.setdefault("tickets", {})
            merged["tickets"][t] = max(0, merged["tickets"].get(t, 0) + delta)
            
    # 3. Merge history (deduplicate)
    cloud_events = {f"{h.get('date')}_{h.get('event')}" for h in cloud.get("history", [])}
    for lh in local.get("history", []):
        key = f"{lh.get('date')}_{lh.get('event')}"
        if key not in cloud_events:
            merged.setdefault("history", []).append(lh)
    merged["history"].sort(key=lambda x: x.get("date", ""))
    
    # 4. Merge quests (reflect completed ones from local)
    if "quests" in local:
        merged.setdefault("quests", [])
        for lq in local["quests"]:
            if lq.get("status") == "completed":
                for mq in merged["quests"]:
                    if mq.get("title") == lq.get("title") and mq.get("status") != "completed":
                        mq["status"] = "completed"
                        
    # 5. custom_title / active_archetype
    local_custom = local.get("custom_title", "")
    base_custom = base.get("custom_title", "") if base else ""
    if local_custom != base_custom:
        merged["custom_title"] = local_custom
        merged["active_title_parts"] = list(local.get("active_title_parts", []))
        merged.setdefault("titles", {})["active"] = list(local.get("titles", {}).get("active", []))
        
    local_arch = local.get("active_archetype", "Novice")
    base_arch = base.get("active_archetype", "Novice") if base else "Novice"
    if local_arch != base_arch:
        merged["active_archetype"] = local_arch
        merged["archetypes"] = list(local.get("archetypes", []))
        
    # 6. Merge pending_answers
    cloud_pending_ids = {ans.get("test_id") for ans in cloud.get("pending_answers", [])}
    for ans in local.get("pending_answers", []):
        if ans.get("test_id") not in cloud_pending_ids:
            merged.setdefault("pending_answers", []).append(ans)
            
    # 7. Use the higher value for status (current/peak)
    for p in params:
        cloud_p = cloud.get("status", {}).get(p, {"current": 100, "peak": 100})
        local_p = local.get("status", {}).get(p, {"current": 100, "peak": 100})
        merged.setdefault("status", {})[p] = {
            "current": max(cloud_p.get("current", 100), local_p.get("current", 100)),
            "peak": max(cloud_p.get("peak", 100), local_p.get("peak", 100)),
            "last_measured": cloud_p.get("last_measured") or local_p.get("last_measured")
        }
        
    # Prioritize cloud HP
    cloud_hp = cloud.get("status", {}).get("HP", {"current": 100, "max": 100})
    local_hp = local.get("status", {}).get("HP", {"current": 100, "max": 100})
    merged["status"]["HP"] = {
        "current": min(cloud_hp.get("current", 100), local_hp.get("current", 100)),
        "max": cloud_hp.get("max", 100)
    }
    
    return merged

def push_to_firestore(data, user_id="HG_pencil"):
    # 1. GET latest data for conflict checking
    cloud_data = pull_from_firestore(user_id)
    
    final_data = data
    if cloud_data:
        if "revision" not in cloud_data:
            cloud_data["revision"] = 1
        if "revision" not in data:
            data["revision"] = 1
            
        # Conflict: Cloud revision differs from local revision
        if cloud_data["revision"] != data.get("revision", 1):
            print(f"[*] Sync conflict detected (Cloud revision: {cloud_data['revision']}, Local revision: {data.get('revision', 1)}). Executing merge...")
            
            # Load baseline file from local cache before merge
            base_data = None
            base_filepath = os.path.join(get_base_path(), f"status_{user_id}.json")
            if os.path.exists(base_filepath):
                try:
                    with open(base_filepath, 'r', encoding='utf-8') as f:
                        base_data = json.load(f)
                except Exception:
                    pass
            
            final_data = merge_status_data(cloud_data, data, base_data)
            
    # Increment revision
    final_revision = (cloud_data.get("revision", 1) if cloud_data else data.get("revision", 1)) + 1
    final_data["revision"] = final_revision
    final_data["last_updated"] = datetime.now().isoformat()
    
    # 2. Mask personal information for public push
    masked_data = mask_sensitive_data(final_data)
    
    config = load_auth_config()
    headers = {'Content-Type': 'application/json'}
    if config:
        token = get_auth_token(config.get("email"), config.get("password"))
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if config.get("uid"):
            user_id = config.get("uid")
            
    url = f"https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/{user_id}"
    try:
        import urllib.request
        import json
        
        data_str = json.dumps(masked_data, ensure_ascii=False, indent=2)
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
            headers=headers,
            method='PATCH'
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            # Update local status file in case of conflict merge
            if final_data is not data:
                filepath = os.path.join(get_base_path(), f"status_{user_id}.json")
                try:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(final_data, f, ensure_ascii=False, indent=2)
                    print(f"[+] Saved merged data to local cache: {filepath}")
                except Exception as e:
                    print(f"[!] Failed to save merged data to local cache: {e}")
            return True
    except Exception as e:
        print(f"[!] Failed to sync data to cloud: {e}")
    return False

def migrate_data(data):
    if not data:
        return data
    if "revision" not in data:
        data["revision"] = 1
    tickets = data.setdefault("tickets", {})
    # Convert legacy measurement tickets key to all
    if "measurement" in tickets:
        tickets["all"] = tickets.get("all", 0) + tickets.pop("measurement", 0)
        
    # Initialize new achievements and custom titles
    unlocked = data.setdefault("unlocked_achievements", [])
    parts = data.setdefault("title_parts", [])
    data.setdefault("custom_title", "")
    data.setdefault("active_title_parts", [])
    
    # Initialize archetype data
    if "active_archetype" not in data:
        data["active_archetype"] = "Novice"
        
    # Unlock first achievement by default
    if "ACH_FIRST_STEP" not in unlocked:
        unlocked.append("ACH_FIRST_STEP")
        for word in ["\u76ee\u899a\u3081\u3057\u4eba", "\u306e"]:
            if word not in parts:
                parts.append(word)
                
    return data

KEY_CACHE = {}

def get_private_key(version):
    """\u6307\u5b9a\u3055\u308c\u305f\u30d0\u30fc\u30b8\u30e7\u30f3\u306e\u79d8\u5bc6\u9375\u3092\u53d6\u5f97\uff08\u30ad\u30e3\u30c3\u30b7\u30e5\u304b\u3089\u3001\u306a\u3051\u308c\u3070\u30ed\u30fc\u30c9\uff09"""
    if version in KEY_CACHE:
        return KEY_CACHE[version]
        
    base_path = get_base_path()
    key_filename = f"private_key_{version}.pem"
    key_paths = [
        os.path.join(base_path, key_filename),
        key_filename
    ]
    
    for kp in key_paths:
        if os.path.exists(kp):
            try:
                from cryptography.hazmat.primitives import serialization
                with open(kp, "rb") as f:
                    private_key = serialization.load_pem_private_key(f.read(), password=None)
                    KEY_CACHE[version] = private_key
                    return private_key
            except Exception as e:
                print(f"[!] Failed to load private key {kp}: {e}")
                
    return None

def decrypt_answer(payload):
    """\u6697\u53f7\u5316\u3055\u308c\u305f\u56de\u7b54\u30c7\u30fc\u30bf\u3092\u5fa9\u53f7\u3059\u308b\u3002"""
    key_version = payload.get("key_version")
    if not key_version:
        raise ValueError("key_version \u304c\u6307\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093")
        
    private_key = get_private_key(key_version)
    if not private_key:
        raise FileNotFoundError(f"\u30d0\u30fc\u30b8\u30e7\u30f3 {key_version} \u306b\u5bfe\u5fdc\u3059\u308b\u79d8\u5bc6\u9375\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093")
        
    import base64
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    
    encrypted_key = base64.b64decode(payload["encrypted_key"])
    aes_key = private_key.decrypt(
        encrypted_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    
    iv = base64.b64decode(payload["iv"])
    full_ciphertext = base64.b64decode(payload["ciphertext"])
    
    aesgcm = AESGCM(aes_key)
    plaintext_bytes = aesgcm.decrypt(iv, full_ciphertext, None)
    return plaintext_bytes.decode('utf-8')

def encrypt_answer(plaintext, version="v1"):
    """Encrypt the answer data using RSA public key and AES-GCM, compatible with JS frontend."""
    private_key = get_private_key(version)
    if not private_key:
        raise FileNotFoundError(f"Private key for version {version} not found")
        
    public_key = private_key.public_key()
    
    import base64
    import os
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    
    aes_key = AESGCM.generate_key(bit_length=256)
    encrypted_key = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    
    iv = os.urandom(12)
    aesgcm = AESGCM(aes_key)
    ciphertext = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
    
    return {
        "key_version": version,
        "encrypted_key": base64.b64encode(encrypted_key).decode('utf-8'),
        "iv": base64.b64encode(iv).decode('utf-8'),
        "ciphertext": base64.b64encode(ciphertext).decode('utf-8')
    }

def init_crypto_keys():
    """\u8d77\u52d5\u6642\u306b\u79d8\u5bc6\u9375 v1 \u3092\u30c1\u30a7\u30c3\u30af\u30fb\u30ed\u30fc\u30c9\u3059\u308b"""
    v1_key = get_private_key("v1")
    if not v1_key:
        raise RuntimeError("\u79d8\u5bc6\u9375 private_key_v1.pem \u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002\u8d77\u52d5\u3092\u505c\u6b62\u3057\u307e\u3059\u3002")
    print("[OK] RSA private key loaded (version: v1)")

def load_status(filepath, user_id="HG_pencil"):
    # Try pulling from cloud first
    cloud_data = pull_from_firestore(user_id)
    
    # Decrypt written answers
    if cloud_data and "pending_answers" in cloud_data:
        for ans in cloud_data["pending_answers"]:
            answer_val = ans.get("answer")
            if answer_val:
                # Parse string if it is a JSON string
                if isinstance(answer_val, str) and (answer_val.strip().startswith("{") or "key_version" in answer_val):
                    try:
                        answer_val = json.loads(answer_val)
                    except Exception:
                        pass
                
                # If the answer is an encrypted data structure
                if isinstance(answer_val, dict) and "key_version" in answer_val:
                    try:
                        decrypted_text = decrypt_answer(answer_val)
                        ans["answer"] = decrypted_text
                    except Exception as e:
                        print(f"[!] Failed to decrypt answer: {e}")
                        ans["answer"] = "[Grading error: unable to decrypt]"
    
    # Parse monthly goals and roadmap from text files
    quests = parse_monthly_goals(user_id)
    roadmap = parse_roadmap(user_id)
    
    if cloud_data:
        cloud_data = migrate_data(cloud_data)
        
        # Generate sudden events from roadmap
        roadmap_events = generate_roadmap_events(roadmap, cloud_data)
        all_quests = quests + roadmap_events
        
        # Merge goals and roadmap into data
        if all_quests:
            existing_quests = cloud_data.get("quests", [])
            completed_titles = {q["title"] for q in existing_quests if q.get("status") == "completed"}
            completed_originals = {q.get("original_title") for q in existing_quests if q.get("status") == "completed" and q.get("original_title")}
            
            history = cloud_data.setdefault("history", [])
            existing_history_events = {h.get("event") for h in history}
            training = cloud_data.setdefault("training", {p: 0 for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]})
            tickets = cloud_data.setdefault("tickets", {})
            status = cloud_data.setdefault("status", {})
            hp = status.setdefault("HP", {"current": 100, "max": 100})
            
            for q in all_quests:
                if q["title"] in completed_titles or q.get("original_title") in completed_originals:
                    q["status"] = "completed"
                    
                # Automatically grant rewards for newly completed quests
                if q["status"] == "completed":
                    event_key = f"Quest Completed: {q['title']} (Reward: {q['reward']})"
                    if event_key not in existing_history_events:
                        # Parse reward (e.g. "VIT +10")
                        reward_str = q.get("reward", "")
                        match = re.search(r'([A-Z]+)\s*\+?\s*(\d+)', reward_str)
                        if match:
                            param = match.group(1)
                            val = int(match.group(2))
                            if param in training:
                                old_val = training[param]
                                training[param] += val
                                new_val = training[param]
                                
                                # Automatically determine ticket acquisition
                                tickets_earned = (new_val // 100) - (old_val // 100)
                                if tickets_earned > 0:
                                    tickets[param] = tickets.get(param, 0) + tickets_earned
                                    history.append({
                                        "date": datetime.now().strftime("%Y-%m-%d"),
                                        "event": f"Measurement Ticket ({param}) Obtained by Training Points (Accumulated: {new_val}pts)",
                                        "status_change": {}
                                    })
                                    
                        # Determine if quest is a rest quest
                        q_title = q.get("title", "")
                        q_desc = q.get("description", "")
                        q_orig = q.get("original_title", "")
                        search_q = (q_title + " " + q_desc + " " + q_orig).lower()
                        rest_keywords = ["\u4f11\u606f", "\u4f11\u990a", "\u7761\u7720", "\u30ea\u30d5\u30ec\u30c3\u30b7\u30e5", "\u30c7\u30c8\u30c3\u30af\u30b9", "\u6e29\u6cc9", "\u30de\u30c3\u30b5\u30fc\u30b8", "\u65e5\u5e38\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9"]
                        is_rest_quest = any(k in search_q for k in rest_keywords)
                        
                        if is_rest_quest:
                            old_hp = hp.get("current", 100)
                            hp["current"] = min(hp.get("max", 100), hp.get("current", 100) + 50)
                            hp_recovered = hp["current"] - old_hp
                            if hp_recovered > 0:
                                history.append({
                                    "date": datetime.now().strftime("%Y-%m-%d"),
                                    "event": f"HP Recovered: +{hp_recovered} HP (Rest Quest: {q['title']})",
                                    "status_change": {}
                                })

                        # Add to history and prevent duplication
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
            print(f"[!] \u30ed\u30fc\u30ab\u30eb\u30ad\u30e3\u30c3\u30b7\u30e5\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f: {e}")
            
        export_to_notebooklm(cloud_data, user_id)
        push_to_firestore(cloud_data, user_id)
        return cloud_data
            
    # Load from local cache if cloud is offline
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            local_data = json.load(f)
            local_data = migrate_data(local_data)
            
            # Generate sudden events from roadmap
            roadmap_events = generate_roadmap_events(roadmap, local_data)
            all_quests = quests + roadmap_events
            
            # Merge text files if they exist offline
            if all_quests:
                existing_quests = local_data.get("quests", [])
                completed_titles = {q["title"] for q in existing_quests if q.get("status") == "completed"}
                completed_originals = {q.get("original_title") for q in existing_quests if q.get("status") == "completed" and q.get("original_title")}
                
                history = local_data.setdefault("history", [])
                existing_history_events = {h.get("event") for h in history}
                training = local_data.setdefault("training", {p: 0 for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]})
                tickets = local_data.setdefault("tickets", {})
                status = local_data.setdefault("status", {})
                hp = status.setdefault("HP", {"current": 100, "max": 100})
                
                for q in all_quests:
                    if q["title"] in completed_titles or q.get("original_title") in completed_originals:
                        q["status"] = "completed"
                        
                    # Automatically grant rewards (offline fallback)
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
                                        
                            # Determine if quest is a rest quest
                            q_title = q.get("title", "")
                            q_desc = q.get("description", "")
                            q_orig = q.get("original_title", "")
                            search_q = (q_title + " " + q_desc + " " + q_orig).lower()
                            rest_keywords = ["\u4f11\u606f", "\u4f11\u990a", "\u7761\u7720", "\u30ea\u30d5\u30ec\u30c3\u30b7\u30e5", "\u30c7\u30c8\u30c3\u30af\u30b9", "\u6e29\u6cc9", "\u30de\u30c3\u30b5\u30fc\u30b8", "\u65e5\u5e38\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9"]
                            is_rest_quest = any(k in search_q for k in rest_keywords)
                            
                            if is_rest_quest:
                                old_hp = hp.get("current", 100)
                                hp["current"] = min(hp.get("max", 100), hp.get("current", 100) + 50)
                                hp_recovered = hp["current"] - old_hp
                                if hp_recovered > 0:
                                    history.append({
                                        "date": datetime.now().strftime("%Y-%m-%d"),
                                        "event": f"HP Recovered: +{hp_recovered} HP (Rest Quest: {q['title']})",
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
        print(f"Error: Data file not found: {filepath}")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Failed to parse JSON file: {filepath}")
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

        # Condition evaluation
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

            # Add to history
            words_str = ", ".join(reward_words)
            history.append({
                "date": datetime.now().strftime("%Y-%m-%d"),
                "event": f"Achievement Unlocked: {ach.get('name')} (Acquired words: {words_str})",
                "status_change": {}
            })

    return newly_unlocked

def count_activities(history):
    counts = {
        "TRAINING_DAYS": 0,
        "EXAMS_PASSED": 0,
        "EXAMS_TRIED": 0,
        "REST_COUNT": 0,
        "DEV_PROJECTS": 0
    }
    if not history:
        return counts
    for h in history:
        event = h.get("event", "")
        if "Training Reflected" in event:
            counts["TRAINING_DAYS"] += 1
        if "Passed" in event:
            counts["EXAMS_PASSED"] += 1
        if "Answer Submitted" in event or "Gate Exam: Passed" in event:
            counts["EXAMS_TRIED"] += 1
        if "HP Recovered" in event:
            counts["REST_COUNT"] += 1
        if "Project [" in event:
            counts["DEV_PROJECTS"] += 1
    return counts

def eval_simple_condition(cond, status, data=None):
    for op in [">=", "<=", ">", "<", "=="]:
        if op in cond:
            parts = cond.split(op)
            if len(parts) == 2:
                param = parts[0].strip()
                val_str = parts[1].strip()
                try:
                    val = int(val_str)
                except ValueError:
                    return False
                
                activity_params = ["TRAINING_DAYS", "EXAMS_PASSED", "EXAMS_TRIED", "REST_COUNT", "DEV_PROJECTS"]
                if param in activity_params:
                    history = data.get("history", []) if data else []
                    counts = count_activities(history)
                    current_val = counts.get(param, 0)
                else:
                    current_val = status.get(param, {}).get("current", 0)
                    
                if op == ">=":
                    return current_val >= val
                elif op == "<=":
                    return current_val <= val
                elif op == ">":
                    return current_val > val
                elif op == "<":
                    return current_val < val
                elif op == "==":
                    return current_val == val
            break
    return False


def eval_condition(condition_str, status, data=None):
    or_parts = condition_str.split(" or ")
    or_results = []
    for op in or_parts:
        and_parts = op.split(" and ")
        and_results = []
        for ap in and_parts:
            and_results.append(eval_simple_condition(ap, status, data))
        or_results.append(all(and_results))
    return any(or_results)


def generate_procedural_titles(count, status, exclude_ids, data=None):
    import hashlib, random
    prefixes = ["\u84bc\u7a79\u306e", "\u6f06\u9ed2\u306e", "\u7d05\u84ee\u306e", "\u96f7\u9cf4\u306e", "\u6df1\u6df5\u306e", "\u6a5f\u5de5\u306e", "\u53e4\u306e", "\u8056\u306a\u308b", "\u4e0d\u5c48\u306e", "\u6975\u9650\u306e", "\u661f\u3005\u306e", "\u9ece\u660e\u306e", "\u9ec4\u91d1\u306e", "\u6d41\u661f\u306e", "\u6df7\u6c8c\u306e", "\u865a\u7121\u306e"]
    cores = ["\u6226\u58eb", "\u9b54\u5c0e\u58eb", "\u8ce2\u8005", "\u9a0e\u58eb", "\u72e9\u4eba", "\u5de5\u5320", "\u652f\u914d\u8005", "\u6c42\u9053\u8005", "\u89b3\u6e2c\u8005", "\u65c5\u4eba", "\u5263\u58eb", "\u5b88\u8b77\u8005", "\u8abf\u505c\u8005", "\u9053\u5316\u5e2b", "\u6697\u6bba\u8005", "\u53f8\u796d"]
    suffixes = ["", "\u30fb\u771f", "\u30fb\u6975", "\u30fb\u8d85\u8d8a\u8005", "\u30fb\u5148\u99c6\u8005", "\u30fb\u96f6\u5f0f", "\u30fb\u8987\u738b"]
    status_params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
    activity_params = ["TRAINING_DAYS", "EXAMS_PASSED", "EXAMS_TRIED", "REST_COUNT", "DEV_PROJECTS"]
    
    generated = []
    attempts = 0
    while len(generated) < count and attempts < 100:
        attempts += 1
        pfx = random.choice(prefixes)
        core = random.choice(cores)
        sfx = random.choice(suffixes)
        name = f"{pfx}{core}{sfx}"
        t_id = "TITLE_GEN_" + hashlib.md5(name.encode('utf-8')).hexdigest()[:10].upper()
        
        if t_id in exclude_ids or any(g["id"] == t_id for g in generated):
            continue
            
        # Always select one activity parameter
        chosen_act = random.choice(activity_params)
        cond_parts = []
        desc_parts = []
        
        history = data.get("history", []) if data else []
        counts = count_activities(history)
        curr_act_val = counts.get(chosen_act, 0)
        
        # Calculate target increment for each activity
        if chosen_act == "TRAINING_DAYS":
            target_act_val = curr_act_val + random.randint(3, 7)
            desc_name = "\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0\u30ed\u30b0\u53cd\u6620\u65e5\u6570"
            desc_parts.append(f"{desc_name}\u304c{target_act_val}\u65e5\u4ee5\u4e0a")
        elif chosen_act == "EXAMS_PASSED":
            target_act_val = curr_act_val + random.randint(1, 3)
            desc_name = "\u8a66\u9a13\u5408\u683c\u56de\u6570"
            desc_parts.append(f"{desc_name}\u304c{target_act_val}\u56de\u4ee5\u4e0a")
        elif chosen_act == "EXAMS_TRIED":
            target_act_val = curr_act_val + random.randint(2, 5)
            desc_name = "\u8a66\u9a13\u53d7\u9a13\u56de\u6570"
            desc_parts.append(f"{desc_name}\u304c{target_act_val}\u56de\u4ee5\u4e0a")
        elif chosen_act == "REST_COUNT":
            target_act_val = curr_act_val + random.randint(1, 3)
            desc_name = "\u4f11\u606f\u56de\u5fa9\u56de\u6570"
            desc_parts.append(f"{desc_name}\u304c{target_act_val}\u56de\u4ee5\u4e0a")
        else:  # DEV_PROJECTS
            target_act_val = curr_act_val + random.randint(1, 2)
            desc_name = "AI\u958b\u767a\u5b9f\u7e3e\u56de\u6570"
            desc_parts.append(f"{desc_name}\u304c{target_act_val}\u56de\u4ee5\u4e0a")
            
        cond_parts.append(f"{chosen_act} >= {target_act_val}")
        
        # Combine with status condition (50% chance) to control difficulty
        if random.random() < 0.5:
            chosen_stat = random.choice(status_params)
            curr_stat_val = status.get(chosen_stat, {}).get("current", 0)
            target_stat_val = curr_stat_val + random.choice([0, 5, 10, 15])
            cond_parts.append(f"{chosen_stat} >= {target_stat_val}")
            desc_parts.append(f"{chosen_stat}\u304c{target_stat_val}\u4ee5\u4e0a")
            
        condition = " and ".join(cond_parts)
        desc = "\u3001\u304b\u3064".join(desc_parts) + "\u306b\u5230\u9054\u3059\u308b" if len(desc_parts) > 1 else desc_parts[0] + "\u306b\u5230\u9054\u3059\u308b"
        
        reward_words = [pfx, core]
        if sfx:
            reward_words.append(sfx)
            
        generated.append({
            "id": t_id,
            "name": name,
            "desc": desc,
            "condition": condition,
            "reward_words": reward_words
        })
    return generated


def check_titles(base_path, data):
    unlocked_sys = data.setdefault("unlocked_system_titles", [])
    available_sys = data.setdefault("available_system_titles", [])
    status = data.setdefault("status", {})
    parts = data.setdefault("title_parts", [])
    history = data.setdefault("history", [])
    
    newly_unlocked = []
    remaining_available = []
    
    for t in available_sys:
        t_id = t.get("id")
        cond = t.get("condition", "")
        is_cond_cleared = False
        if cond:
            try:
                is_cond_cleared = eval_condition(cond, status, data)
            except Exception:
                is_cond_cleared = False
                
        if is_cond_cleared:
            if len(parts) >= 50:
                t["is_cleared"] = True
                remaining_available.append(t)
                print(f"[WARNING] Title parts limit reached (50). Retaining pending claim: {t.get('name')}")
            else:
                t.pop("is_cleared", None)
                unlocked_sys.append(t_id)
                reward_words = t.get("reward_words", [])
                added_words = []
                for word in reward_words:
                    if word not in parts:
                        parts.append(word)
                        added_words.append(word)
                
                newly_unlocked.append({
                    "name": t.get("name"),
                    "words": added_words
                })
                
                words_str = ", ".join(reward_words)
                history.append({
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "event": f"Title Unlocked: {t.get('name')} (Acquired words: {words_str})",
                    "status_change": {}
                })
        else:
            t.pop("is_cleared", None)
            remaining_available.append(t)
            
    data["available_system_titles"] = remaining_available
    
    TARGET_COUNT = 5
    current_count = len(data["available_system_titles"])
    
    if current_count < TARGET_COUNT:
        needed = TARGET_COUNT - current_count
        master_filepath = os.path.join(base_path, "web", "status_system_titles.json")
        master_pool = []
        if os.path.exists(master_filepath):
            try:
                with open(master_filepath, 'r', encoding='utf-8') as f:
                    master_pool = json.load(f)
            except Exception:
                pass
                
        existing_ids = {t.get("id") for t in data["available_system_titles"]}
        unlocked_ids = set(unlocked_sys)
        
        candidates = [t for t in master_pool if t.get("id") not in existing_ids and t.get("id") not in unlocked_ids]
        added_from_pool = candidates[:needed]
        data["available_system_titles"].extend(added_from_pool)
        
        current_count = len(data["available_system_titles"])
        if current_count < TARGET_COUNT:
            needed_dynamic = TARGET_COUNT - current_count
            dynamic_titles = generate_procedural_titles(needed_dynamic, status, existing_ids | unlocked_ids | {t.get("id") for t in master_pool}, data=data)
            data["available_system_titles"].extend(dynamic_titles)
            
    return newly_unlocked


def export_to_notebooklm(data, user_id="HG_pencil"):
    target_base = r"G:\\u30de\u30a4\u30c9\u30e9\u30a4\u30d6\\u30ce\u30fc\u30c8\u30d6\u30c3\u30afLM\u7528\u30c7\u30fc\u30bf\u683c\u7d0d\u5834\u6240\\u6211\u90e8\u5b8f\u548c\RPG\u57fa\u672c\u30c7\u30fc\u30bf"
    if not os.path.exists(target_base):
        return
        
    target_dir = os.path.join(target_base, user_id)
    if not os.path.exists(target_dir):
        try:
            os.makedirs(target_dir)
        except Exception as e:
            print(f"[!] Failed to create subfolder for NotebookLM: {e}")
            return
        
    # 1. Copy status.json
    try:
        with open(os.path.join(target_dir, "status.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[!] Failed to write JSON for NotebookLM: {e}")
        
    # 2. Generate and save status_summary.md
    try:
        status = data.get("status", {})
        hp = status.get("HP", {"current": 100, "max": 100})
        titles = data.get("titles", {"active": []})
        active_archetype = data.get("active_archetype", "Novice")
        
        md_lines = []
        md_lines.append(f"# {user_id} RPG\u80fd\u529b\u30b9\u30c6\u30fc\u30bf\u30b9\u30b5\u30de\u30ea\u30fc")
        md_lines.append(f"\u6700\u7d42\u540c\u671f\u65e5\u6642: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        md_lines.append("## \u1f464 \u30d2\u30fc\u30ed\u30fc\u57fa\u672c\u30b9\u30c6\u30fc\u30bf\u30b9")
        md_lines.append(f"- **\u30d3\u30eb\u30c9\u79f0\u53f7 / \u30e9\u30f3\u30af\u30b9\u30b3\u30a2**: {data.get('build_score', 'Novice Build')} / {', '.join(titles.get('active', [])) if titles.get('active') else '\u306a\u3057'}")
        md_lines.append(f"- **\u6226\u95d8\u529b (Combat Power)**: {data.get('combat_power', 0)}")
        md_lines.append(f"- **HP (\u30b3\u30f3\u30c7\u30a3\u30b7\u30e7\u30f3)**: {hp.get('current')}/{hp.get('max')}")
        md_lines.append(f"- **\u8077\u696d (Active Archetype)**: {active_archetype}\n")
        
        md_lines.append("## \u1f4ca \u80fd\u529b\u5024 (\u5404\u30d1\u30e9\u30e1\u30fc\u30bf\u8a73\u7d30)")
        params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
        param_names = {
            "STR": "STR (\u7b4b\u529b\u30fb\u8eab\u4f53\u51fa\u529b)",
            "VIT": "VIT (\u6301\u4e45\u529b\u30fb\u75b2\u52b4\u8010\u6027)",
            "INT": "INT (\u8ad6\u7406\u601d\u8003\u30fb\u69cb\u9020\u5316)",
            "WIS": "WIS (\u77e5\u8b58\u30fb\u6559\u990a)",
            "MND": "MND (\u7cbe\u795e\u529b\u30fb\u81ea\u5df1\u7d71\u5236)",
            "CHA": "CHA (\u9b45\u529b\u30fb\u4fe1\u983c\u5f62\u6210)",
            "DEV": "DEV (\u958b\u62d3\u30fbAI\u30b7\u30b9\u30c6\u30e0\u69cb\u7bc9)"
        }
        for p in params:
            val = status.get(p, {"current": 100, "peak": 100})
            t_val = data.get("training", {}).get(p, 0)
            md_lines.append(f"- **{param_names[p]}**: \u73fe\u5728\u5024 {val.get('current')} / Peak\u5024 {val.get('peak')} (\u52aa\u529b\u7d2f\u7a4d: {t_val}pts)")
        md_lines.append("")
        
        md_lines.append("## \u1f3ab \u6240\u6301\u30c1\u30b1\u30c3\u30c8 (\u6e2c\u5b9a\u30a2\u30a4\u30c6\u30e0)")
        tickets = data.get("tickets", {})
        has_tickets = False
        for k, v in tickets.items():
            if v > 0:
                md_lines.append(f"- \u6e2c\u5b9a\u30c1\u30b1\u30c3\u30c8 ({k}): {v}\u679a")
                has_tickets = True
        if not has_tickets:
            md_lines.append("- \u306a\u3057 (\u30b2\u30fc\u30c8\u8a66\u9a13\u306b\u6311\u6226\u4e2d\u307e\u305f\u306f\u672a\u7372\u5f97)")
        md_lines.append("")
        
        md_lines.append("## \u1f3c6 \u89e3\u9664\u6e08\u307f\u30a2\u30c1\u30fc\u30d6\u30e1\u30f3\u30c8 (\u5b9f\u7e3e)")
        unlocked = data.get("unlocked_achievements", [])
        md_lines.append(f"\u89e3\u9664\u6570: {len(unlocked)}\u500b")
        for ach_id in unlocked:
            md_lines.append(f"- {ach_id}")
        md_lines.append("")
        
        md_lines.append("## \u1f396\ufe0f \u89e3\u9664\u6e08\u307f\u30b7\u30b9\u30c6\u30e0\u79f0\u53f7")
        unlocked_sys_titles = data.get("unlocked_system_titles", [])
        md_lines.append(f"\u89e3\u9664\u6570: {len(unlocked_sys_titles)}\u500b")
        for t_id in unlocked_sys_titles:
            md_lines.append(f"- {t_id}")
        md_lines.append("")
        
        md_lines.append("## \u1f4dc \u6d3b\u52d5\u8a18\u9332\u30fb\u30a4\u30d9\u30f3\u30c8\u5c65\u6b74 (History)")
        history = data.get("history", [])[-20:] # \u76f4\u8fd120\u4ef6\u3092\u66f8\u304d\u51fa\u3057
        for h in reversed(history):
            md_lines.append(f"- **{h.get('date')}**: {h.get('event')}")
            
        md_content = "\n".join(md_lines)
        with open(os.path.join(target_dir, "status_summary.md"), "w", encoding="utf-8") as f:
            f.write(md_content)
    except Exception as e:
        print(f"[!] Failed to write summary Markdown for NotebookLM: {e}")

def clean_surrogates(obj):
    """Recursively clean invalid UTF-16 surrogates from strings, lists, and dicts."""
    if isinstance(obj, str):
        return "".join(c for c in obj if not (0xD800 <= ord(c) <= 0xDFFF))
    elif isinstance(obj, list):
        return [clean_surrogates(item) for item in obj]
    elif isinstance(obj, dict):
        return {clean_surrogates(k): clean_surrogates(v) for k, v in obj.items()}
    else:
        return obj

def save_json(filepath, data, user_id="HG_pencil"):
    data = clean_surrogates(data)
    
    tmp_filepath = filepath + ".tmp"
    save_success = False
    try:
        with open(tmp_filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_filepath, filepath)
        save_success = True
    except Exception as e:
        print(f"Error: Failed to save file: {e}")
    finally:
        if os.path.exists(tmp_filepath):
            try:
                os.remove(tmp_filepath)
            except Exception:
                pass

    if save_success:
        export_to_notebooklm(data, user_id)
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
    
    # HP condition evaluation
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
    
    # HP bar display (20 chars width)
    hp_bar_len = 20
    hp_blocks = int(hp_curr / hp_max * hp_bar_len) if hp_max > 0 else 0
    hp_bar_str = "\u25a0" * hp_blocks + "." * (hp_bar_len - hp_blocks)
    print(f" HP: {hp_curr}/{hp_max} [{hp_bar_str}] {hp_pct}% ({hp_cond})")
    print("----------------------------------------------------------------------")
    
    active_titles = titles.get("active", [])
    title_str = ", ".join(active_titles) if active_titles else "(None)"
    print(f" TITLES:     {title_str}")
    print(f" ARCHETYPE:  {active_archetype}")
    print("----------------------------------------------------------------------")
    
    params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
    param_names = {
        "STR": "\u7b4b\u529b",
        "VIT": "\u6301\u4e45",
        "INT": "\u77e5\u80fd",
        "WIS": "\u77e5\u8b58",
        "MND": "\u7cbe\u795e",
        "CHA": "\u9b45\u529b",
        "DEV": "\u958b\u767a"
    }
    
    bar_len = 30
    for p in params:
        p_data = status.get(p, {"current": 100, "peak": 100, "last_measured": None})
        curr = p_data.get("current", 100)
        peak = p_data.get("peak", 100)
        
        # Workaround for ??? display
        if curr is None or str(curr).startswith("?"):
            print(f" {p} [{param_names[p]}] :  ??? (Peak: {peak}) [??????????????????????????????]")
            continue
            
        cur_blocks = int(curr / 999 * bar_len)
        peak_blocks = int(peak / 999 * bar_len)
        
        # Plot CLI bar graph
        bar_str = "\u25a0" * cur_blocks + "\u25a1" * max(0, peak_blocks - cur_blocks) + "." * max(0, bar_len - peak_blocks)
        
        print(f" {p} [{param_names[p]}] :  {curr:3d} (Peak: {peak:3d}) [{bar_str}] [Training: {training.get(p, 0):4d}]")
        
    print("----------------------------------------------------------------------")
    t_list = [f"{k.capitalize()}: {v}" for k, v in tickets.items()]
    tickets_str = ", ".join(t_list) if t_list else "(None)"
    print(f" TICKETS: {tickets_str}")
    print("======================================================================")

def open_character_image(base_path):
    img_path = os.path.join(base_path, "assets", "character.png")
    if not os.path.exists(img_path):
        print(f"\n[!] Character image not found: {img_path}")
        print("   A dot art image will be generated when you proceed with tests or update status.")
        return
        
    print(f"\n[+] Opening character image: {img_path}")
    try:
        if sys.platform.startswith('win'):
            os.startfile(img_path)
        elif sys.platform.startswith('darwin'):
            subprocess.run(['open', img_path])
        else:
            subprocess.run(['xdg-open', img_path])
    except Exception as e:
        print(f"Error occurred while opening character image: {e}")

def show_radar_chart(data):
    if not HAS_MATPLOTLIB:
        print("\n[!] Error: matplotlib or numpy is not installed, cannot display radar chart.")
        print("To install, run the following command:")
        print("  pip install matplotlib numpy")
        return

    status = data.get("status", {})
    params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]
    labels = ["STR (\u7b4b\u529b)", "VIT (\u6301\u4e45)", "INT (\u77e5\u80fd)", "WIS (\u77e5\u8b58)", "MND (\u7cbe\u795e)", "CHA (\u9b45\u529b)", "DEV (\u958b\u767a)"]
    
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
    ax.set_yticklabels(["100 (\u57fa\u790e)", "300 (\u4e00\u822c)", "500 (\u30c8\u30c3\u30d7)", "700 (\u4ee3\u8868)", "900 (\u4eba\u985e\u53f2)"], fontsize=8)
    
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=10, fontweight='bold')
    
    ax.plot(angles, peaks, color='#e74c3c', linewidth=2, linestyle='dashed', label='Peak Status')
    ax.fill(angles, peaks, color='#e74c3c', alpha=0.1)
    
    ax.plot(angles, values, color='#3498db', linewidth=2, linestyle='solid', label='Current Status')
    ax.fill(angles, values, color='#3498db', alpha=0.25)
    
    plt.title(f"Antigravity Status - {data.get('build_score', 'Novice')}", size=14, y=1.1, fontweight='bold')
    plt.legend(loc='upper right', bbox_to_anchor=(0.1, 0.1))
    
    plt.tight_layout()
    print("\n[+] Displaying radar chart...")
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
        # Parse JSON string
        import_data = json.loads(json_str)
        if not isinstance(import_data, list):
            import_data = [import_data]
    except Exception as e:
        print(f"JSON parse error: {e}")
        return

    reflected_dates = data.setdefault("reflected_dates", [])
    accumulated_points = data.setdefault("accumulated_training_points", 0)
    training = data.setdefault("training", {p: 0 for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]})
    status = data.setdefault("status", {})
    hp = status.setdefault("HP", {"current": 70, "max": 100})
    tickets = data.setdefault("tickets", {})
    history = data.setdefault("history", [])

    # Create copy of initial training points
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

        # --- Calculate HP debuff multiplier ---
        hp_curr = hp.get("current", 100)
        hp_max = hp.get("max", 100)
        hp_pct = (hp_curr / hp_max * 100) if hp_max > 0 else 100
        
        debuff_multiplier = 1.0
        debuff_text = ""
        if hp_pct < 40:
            debuff_multiplier = 0.5
            debuff_text = " [HP Debuff -50% applied]"
        elif hp_pct < 80:
            debuff_multiplier = 0.8
            debuff_text = " [HP Debuff -20% applied]"

        is_override = False
        old_points = {}
        target_history_idx = -1
        
        if date in reflected_dates:
            # Search for import history of this date
            for idx, h in enumerate(history):
                if h.get("event", "").startswith(f"Training Reflected: {date} ") or h.get("event", "").startswith(f"Daily Log Reflected: {date} "):
                    old_points = h.get("status_change", {})
                    target_history_idx = idx
                    is_override = True
                    break
            
            if is_override:
                # Delta merge process
                added_points = {}
                daily_points = 0
                has_diff = False
                
                for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"]:
                    new_val = int(int(points.get(p, 0)) * debuff_multiplier)
                    old_val = int(old_points.get(p, 0))
                    diff = new_val - old_val
                    if diff != 0:
                        has_diff = True
                        training[p] += diff
                        added_points[p] = diff
                        daily_points += diff
                
                if not has_diff:
                    # Skip if identical data
                    results.append(f"\u30b9\u30ad\u30c3\u30d7 (\u91cd\u8907\u30fb\u5909\u66f4\u306a\u3057): {date}")
                    continue
                else:
                    # Override update if difference exists
                    history[target_history_idx]["status_change"] = {p: int(int(points.get(p, 0)) * debuff_multiplier) for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"] if int(int(points.get(p, 0)) * debuff_multiplier) > 0}
                    history[target_history_idx]["status_change_detail"] = entry.get("detail", {})
                    history[target_history_idx]["summary"] = summary
                    
                    pts_str = ", ".join([f"{k}+{int(int(v)*debuff_multiplier)}" for k, v in points.items() if int(v) > 0])
                    history[target_history_idx]["event"] = f"Training Reflected: {date} ({pts_str}){debuff_text}"
                    
                    # Recalculate HP recovery offset based on VIT/MND delta
                    old_vit = int(old_points.get("VIT", 0))
                    old_mnd = int(old_points.get("MND", 0))
                    new_vit = int(int(points.get("VIT", 0)) * debuff_multiplier)
                    new_mnd = int(int(points.get("MND", 0)) * debuff_multiplier)
                    
                    old_hp_to_recover = int((old_vit + old_mnd) * 0.5)
                    new_hp_to_recover = int((new_vit + new_mnd) * 0.5)
                    hp_diff = new_hp_to_recover - old_hp_to_recover
                    
                    if hp_diff != 0:
                        old_hp = hp["current"]
                        hp["current"] = min(hp["max"], max(0, hp["current"] + hp_diff))
                        hp_recovered_total += (hp["current"] - old_hp)
                    
                    new_points_total += daily_points
                    
                    diff_str = ", ".join([f"{k}{'+' if v > 0 else ''}{v}" for k, v in added_points.items() if v != 0])
                    results.append(f"Overwrite update success: {date} (Delta: {diff_str}) - {summary}")
                    continue

        # Reflect training points
        daily_points = 0
        added_points = {}
        for p, val in points.items():
            if p in training:
                val_int = int(int(val) * debuff_multiplier)
                training[p] += val_int
                daily_points += val_int
                added_points[p] = val_int

        # Recalculate HP recovery based on VIT/MND increments
        vit_add = added_points.get("VIT", 0)
        mnd_add = added_points.get("MND", 0)
        hp_to_recover = int((vit_add + mnd_add) * 0.5)
        
        # Extra HP recovery based on physical condition rating
        cond_val = entry.get("condition") or entry.get("detail", {}).get("condition")
        if cond_val is not None:
            try:
                cond_num = int(cond_val)
                if cond_num == 5:
                    hp_to_recover += 50
                elif cond_num == 4:
                    hp_to_recover += 30
                elif cond_num == 3:
                    hp_to_recover += 15
                elif cond_num == 2:
                    hp_to_recover += 5
            except (ValueError, TypeError):
                pass

        if hp_to_recover > 0:
            old_hp = hp["current"]
            hp["current"] = min(hp["max"], hp["current"] + hp_to_recover)
            hp_recovered_total += (hp["current"] - old_hp)

        reflected_dates.append(date)
        new_points_total += daily_points

        # Add to history
        pts_str = ", ".join([f"{k}+{v}" for k, v in added_points.items() if v > 0])
        history.append({
            "date": datetime.now().strftime("%Y-%m-%d"),
            "event": f"Training Reflected: {date} ({pts_str}){debuff_text}",
            "status_change": added_points,
            "status_change_detail": entry.get("detail", {}),
            "summary": summary
        })

        results.append(f"Reflection success: {date} ({pts_str}){debuff_text} - {summary}")

    # Check ticket acquisition thresholds (per 100 points)
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
            tickets_earned_msg.append(f"[\u1f389 \u30c1\u30b1\u30c3\u30c8\u7372\u5f97] {p}\u306e\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0\u5024\u304c {new_val}pts \u306b\u5230\u9054\uff01\u300c\u6e2c\u5b9a\u30c1\u30b1\u30c3\u30c8({p})\u300d\u3092 {tickets_earned}\u679a \u7372\u5f97\u3057\u307e\u3057\u305f\uff01")

    # Check achievements unlock
    unlocked_list = check_achievements(base_path, data)
    unlocked_titles_list = check_titles(base_path, data)

    # Reset legacy cumulative counter
    data["accumulated_training_points"] = 0
    data["last_updated"] = datetime.now().isoformat()

    # Save status
    save_json(os.path.join(base_path, f"status_{user_id}.json"), data, user_id)

    # Print result
    print("======================================================================")
    print("                \u26a1 TRAINING IMPORT RESULT \u26a1")
    print("======================================================================")
    for r in results:
        print(f" - {r}")
    print("----------------------------------------------------------------------")
    print(f" New cumulative points: +{new_points_total} pts")
    for msg in tickets_earned_msg:
        print(f" {msg}")
    for ach in unlocked_list:
        words_str = "\u3001".join([f"\u300c{w}\u300d" for w in ach["words"]])
        print(f" [\u1f389 \u5b9f\u7e3e\u89e3\u9664] \u5b9f\u7e3e\u300e{ach['name']}\u300f\u3092\u9054\u6210\uff01 \u5831\u916c\u5358\u8a9e\uff1a{words_str} \u3092\u7372\u5f97\u3057\u307e\u3057\u305f\uff01")
    for ut in unlocked_titles_list:
        words_str = "\u3001".join([f"\u300c{w}\u300d" for w in ut["words"]])
        print(f" [\u1f389 \u79f0\u53f7\u7372\u5f97] \u30b7\u30b9\u30c6\u30e0\u79f0\u53f7\u300e{ut['name']}\u300f\u3092\u7372\u5f97\uff01 \u5831\u916c\u5358\u8a9e\uff1a{words_str} \u304c\u8ffd\u52a0\u3055\u308c\u307e\u3057\u305f\uff01")
    if hp_recovered_total > 0:
        print(f" [\u2764\ufe0f HP\u56de\u5fa9] \u4f53\u8abf\u304c\u6574\u3044\u3001HP\u304c {hp_recovered_total} \u56de\u5fa9\u3057\u307e\u3057\u305f\uff01(\u73fe\u5728: {hp['current']}/{hp['max']})")
    print("======================================================================")

def run_test_mode(base_path, status_data, user_id="HG_pencil"):
    tests_filepath = os.path.join(base_path, "status_tests.json")
    if not os.path.exists(tests_filepath):
        print(f"\n[!] Test question file not found: {tests_filepath}")
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
        print("\n[!] No test currently available (the test question corresponding to the next gate is not defined).")
        return

    # Build tickets string
    t_list = [f"all x{tickets.get('all', 0)}"] + [f"{p} x{tickets.get(p, 0)}" for p in ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"] if tickets.get(p, 0) > 0]
    tickets_str = ", ".join(t_list)

    print("\n======================================================================")
    print("                     * Rank Gate Exam Selection *")
    print("======================================================================")
    print(f" Tickets owned: {tickets_str}")
    print("----------------------------------------------------------------------")
    print(" List of available exams:")
    for idx, test in enumerate(available_tests, 1):
        param = test.get("param")
        target_gate = test.get("target_gate")
        time_min = test.get("time_limit_seconds", 0) // 60
        test_type = test.get("test_type", "gate")
        
        if test_type == "measurement":
            print(f"  [{idx}] [Practice] {param} -> {target_gate} level practice exam (no ticket required)")
        else:
            has_t = tickets.get(param, 0) > 0 or tickets.get("all", 0) > 0
            t_status = " (Ticket Cost: 1 ticket)" if has_t else " [!] (Insufficient tickets, cannot challenge)"
            print(f"  [{idx}] [Gate Exam] {param} -> {target_gate} gate breakthrough exam{t_status}")
            
        print(f"      (Difficulty: {test.get('difficulty')}, Time limit: {time_min} min)")
    print("----------------------------------------------------------------------")
    
    choice = input(" Enter the exam number to challenge (or 'q' to cancel): ").strip()
    if choice.lower() == 'q':
        print(" Cancelled the exam.")
        return

    try:
        choice_idx = int(choice) - 1
        if choice_idx < 0 or choice_idx >= len(available_tests):
            print(" [!] Invalid number.")
            return
    except ValueError:
        print(" [!] Please enter a number.")
        return

    selected_test = available_tests[choice_idx]
    param = selected_test.get("param")
    gate = selected_test.get("target_gate")
    limit_sec = selected_test.get("time_limit_seconds", 0)
    test_type = selected_test.get("test_type", "gate")
    is_measurement = (test_type == "measurement")
    
    # Check ticket availability (gate exam only)
    if not is_measurement:
        has_specific = tickets.get(param, 0) > 0
        has_all = tickets.get("all", 0) > 0
        if not has_specific and not has_all:
            print(f"\n [!] Insufficient measurement ticket ({param}) or universal ticket (all).")
            return

    print("\n======================================================================")
    if is_measurement:
        print(f" [Measurement] Starting {param} level {gate} practice exam now.")
        print(f" Time limit: {limit_sec // 60} min ({limit_sec} sec)")
        print(" * Since this is a practice exam, no tickets will be consumed.")
    else:
        print(f" [Warning] Starting {param} level {gate} Gate Exam now.")
        print(f" Time limit: {limit_sec // 60} min ({limit_sec} sec)")
        print(" Once started, the timer will begin and 1 ticket will be consumed.")
        print(" Please note that tickets will be consumed even if aborted.")
    print("======================================================================")
    
    confirm = input(" Do you want to start the exam? (y/n): ").strip().lower()
    if confirm != 'y':
        print(" Aborted exam start.")
        return

    # Consume ticket (gate exam only, priority: specific -> all)
    consumed_type = ""
    if is_measurement:
        consumed_type = "None (practice exam requires no ticket)"
    else:
        if tickets.get(param, 0) > 0:
            tickets[param] -= 1
            consumed_type = f"Specific ticket ({param})"
        elif tickets.get("all", 0) > 0:
            tickets["all"] -= 1
            consumed_type = "Universal ticket (all)"

    save_json(os.path.join(base_path, f"status_{user_id}.json"), status_data, user_id)
    if is_measurement:
        print(f"\n[+] Starting practice exam (no ticket required).")
    else:
        print(f"\n[+] {consumed_type} consumed (1 ticket).")
    print("----------------------------------------------------------------------")
    print("[Question]")
    print(selected_test.get("question"))
    print("----------------------------------------------------------------------")
    print(" * Once you finish your answer, type ':q' on a new line and press Enter.")
    print(" [Timer Started!]")
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
    print(f" Time elapsed: {elapsed:.1f} sec / Limit: {limit_sec} sec")
    
    if timeout:
        print(" [!] [Timeout] Time limit exceeded. This answer will be treated as failed.")
    else:
        print(" [+] Answer submitted within the time limit.")
    print("======================================================================")

    # Encrypt the answer using the JS-compatible encrypt_answer function
    encrypted_payload = encrypt_answer(answer_text, version="v1")

    new_answer = {
        "test_id": selected_test.get("id"),
        "param": param,
        "target_gate": gate,
        "test_type": test_type,
        "submitted_at": datetime.now().isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "time_limit_seconds": limit_sec,
        "timeout": timeout,
        "answer": encrypted_payload
    }
    
    pending_answers = status_data.setdefault("pending_answers", [])
    pending_answers.append(new_answer)
    save_json(os.path.join(base_path, f"status_{user_id}.json"), status_data, user_id)
    
    print("\n[+] Answer has been temporarily saved locally.")
    print("    The GM will automatically grade it during your next chat with AI.")
    print("======================================================================")

def launch_web_server(base_path):
    server_script = os.path.join(base_path, "server.py")
    if not os.path.exists(server_script):
        print(f"[!] Server startup script not found: {server_script}")
        return
        
    print("\n[+] Starting web server...")
    try:
        # Configurations for running background process on Windows
        if sys.platform.startswith('win'):
            # Spawn asynchronous process using subprocess.Popen
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
        print("[+] Opening web dashboard at http://localhost:8000.")
    except Exception as e:
        print(f"Failed to start web server in background: {e}")

def main():
    # Load and verify private key
    try:
        init_crypto_keys()
    except Exception as e:
        print(f"[Startup Error] {e}")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Antigravity Status CLI Visualizer")
    parser.add_argument("--image", "-i", action="store_true", help="Display the character dot-art image")
    parser.add_argument("--radar", "-r", action="store_true", help="Display the status radar chart")
    parser.add_argument("--test", "-t", action="store_true", help="Launch the rank gate exam mode")
    parser.add_argument("--web", "-w", action="store_true", help="Open the local web dashboard in browser")
    parser.add_argument("--import-training", "-p", type=str, help="Import training data (JSON string format)")
    parser.add_argument("--user", "-u", type=str, default="HG_pencil", help="User ID for status data (default: HG_pencil)")
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
        # Show CLI status dashboard
        print_status_cli(data, user_id)
        
        # Handle arguments
        if args.image:
            open_character_image(base_path)
        if args.radar:
            show_radar_chart(data)

if __name__ == "__main__":
    main()
