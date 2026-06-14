// Firebase設定情報
const firebaseConfig = {
  apiKey: "AIzaSyA-65Hz0doOnYw8YcrUSvWHgs1Zi99eiLI",
  authDomain: "rpg-self-visualization-tool.firebaseapp.com",
  projectId: "rpg-self-visualization-tool",
  storageBucket: "rpg-self-visualization-tool.firebasestorage.app",
  messagingSenderId: "438151802535",
  appId: "1:438151802535:web:6ac2911d26e0033aaa7582",
  measurementId: "G-QQ03MJ39ZX"
};

// Initialize Firebase Compat
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// localStorage 例外安全用ヘルパー関数 (iOSプライベートモード等のクラッシュ防止)
function safeGetItem(key, defaultValue = '') {
    try {
        return localStorage.getItem(key) || defaultValue;
    } catch (e) {
        console.warn("localStorage.getItem failed:", e);
        return defaultValue;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn("localStorage.setItem failed:", e);
    }
}

let currentUserId = safeGetItem('rpg_user_id', 'HG_pencil');
let userDocRef = db.collection('users').doc(currentUserId);
let userList = ['HG_pencil'];

// Firebase Auth によるログイン状態の監視
firebase.auth().onAuthStateChanged(user => {
    const authModal = document.getElementById('auth-modal');
    const loggedInUserInfo = document.getElementById('logged-in-user-info');
    const userEmailDisplay = document.getElementById('current-user-email');
    
    if (user) {
        // ログイン状態
        currentUserId = user.uid;
        userDocRef = db.collection('users').doc(currentUserId);
        
        if (authModal) authModal.style.display = 'none';
        if (loggedInUserInfo) loggedInUserInfo.style.display = 'flex';
        if (userEmailDisplay) userEmailDisplay.innerText = user.email;
        
        // 【SWRパターン】ローカルストレージからキャッシュされたステータスを即座に仮表示（遅延0秒化）
        const cachedStr = safeGetItem('rpg_status_cache', '');
        if (cachedStr) {
            try {
                const cachedData = JSON.parse(cachedStr);
                // キャッシュのUIDが一致している場合のみ仮表示
                if (cachedData.uid === user.uid || !cachedData.uid) {
                    console.log("[SWR] キャッシュデータから即時仮描画します。");
                    cachedStatusData = cachedData;
                    originalBaseData = JSON.parse(JSON.stringify(cachedData));
                    updateUI(cachedData);
                    initRadarChart(cachedData);
                }
            } catch (e) {
                console.warn("[SWR] キャッシュデータのパースに失敗しました:", e);
            }
        }
        
        // 直接Firestoreからデータをフェッチ（1往復）
        fetchStatusData().then(data => {
            if (!data) {
                // フェッチ失敗、または新規ユーザーでドキュメントが存在しない場合に初期化を行う（フォールバック）
                console.log("データが取得できなかったため、新規ドキュメント初期化を確認します。");
                initializeUserDocumentIfNotExist(user.uid).then(() => {
                    fetchStatusData();
                });
            }
        });
    } else {
        // 未ログイン状態
        currentUserId = '';
        if (authModal) authModal.style.display = 'flex';
        if (loggedInUserInfo) loggedInUserInfo.style.display = 'none';
        
        // ログイン状態でないときは常にログインビューを表示するようにリセット
        toggleAuthView(false);
    }
});


// グローバル変数
let statusChart = null;
let cachedStatusData = null; // キャッシュ用
let activeTest = null;
let testTimerInterval = null;
let testSecondsRemaining = 0;
let testSecondsTotal = 0;
let testStartTime = null;
let pyodideInstance = null; // Pyodideインスタンス保持用

// ヘルパー関数
function roundNumber(num, decimals) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function getTodayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function getPyodide() {
    if (!pyodideInstance) {
        pyodideInstance = await loadPyodide();
    }
    return pyodideInstance;
}

document.addEventListener('DOMContentLoaded', () => {
    // textareaでのCtrl+Enter提出ショートカット設定
    const textarea = document.getElementById('test-answer-input');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                // 追試ミッションか通常の試験かでハンドラーを切り替える
                if (activeTest && activeTest.id.startsWith("TRAIN-")) {
                    judgeTrainingCode();
                } else {
                    submitTestAnswer();
                }
            }
        });
    }
});
// ログイン処理
function loginUser() {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const errorMsgEl = document.getElementById('auth-error-msg');
    
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) {
        if (errorMsgEl) {
            errorMsgEl.innerText = "メールアドレスとパスワードを入力してください。";
            errorMsgEl.style.display = "block";
        }
        return;
    }
    
    if (errorMsgEl) errorMsgEl.style.display = "none";
    
    const loginBtn = document.querySelector('#auth-modal .btn-primary');
    const originalText = loginBtn ? loginBtn.innerText : "LOGIN";
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerText = "LOADING...";
    }
    
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerText = originalText;
            }
        })
        .catch(error => {
            console.error("Login failed:", error);
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerText = originalText;
            }
            if (errorMsgEl) {
                let message = "ログインに失敗しました。";
                if (error.code === 'auth/invalid-email') {
                    message = "メールアドレスの形式が正しくありません。";
                } else if (error.code === 'auth/user-disabled') {
                    message = "このアカウントは無効化されています。";
                } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    message = "メールアドレスまたはパスワードが間違っています。";
                }
                errorMsgEl.innerText = message;
                errorMsgEl.style.display = "block";
            }
        });
}

// ログアウト処理
function logoutUser() {
    if (confirm("ログアウトしますか？")) {
        firebase.auth().signOut()
            .then(() => {
                cachedStatusData = null;
                if (statusChart) {
                    statusChart.destroy();
                    statusChart = null;
                }
                document.getElementById('build-score').innerText = '要ログイン';
                document.getElementById('combat-power-value').innerText = '0';
                document.getElementById('hp-value-text').innerText = '0/0';
                const hpProgress = document.getElementById('hp-progress');
                if (hpProgress) hpProgress.style.width = '0%';
                
                const emailInput = document.getElementById('login-email');
                const passwordInput = document.getElementById('login-password');
                if (emailInput) emailInput.value = '';
                if (passwordInput) passwordInput.value = '';
                const errorMsgEl = document.getElementById('auth-error-msg');
                if (errorMsgEl) errorMsgEl.style.display = 'none';
            })
            .catch(error => {
                console.error("Logout failed:", error);
                alert("ログアウトに失敗しました。");
            });
    }
}

// HTMLエスケープユーティリティ
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}
// ログイン・新規登録画面の切り替え
function toggleAuthView(showSignup) {
    const loginView = document.getElementById('auth-login-view');
    const signupView = document.getElementById('auth-signup-view');
    const errorMsgEl = document.getElementById('auth-error-msg');
    
    if (errorMsgEl) errorMsgEl.style.display = 'none';
    
    if (showSignup) {
        if (loginView) loginView.style.display = 'none';
        if (signupView) signupView.style.display = 'block';
        const signupEmail = document.getElementById('signup-email');
        if (signupEmail) signupEmail.focus();
    } else {
        if (loginView) loginView.style.display = 'block';
        if (signupView) signupView.style.display = 'none';
        const loginEmail = document.getElementById('login-email');
        if (loginEmail) loginEmail.focus();
    }
}

// 新規アカウント作成（サインアップ）処理 (管理者登録制移行に伴い無効化)
function registerUser() {
    const errorMsgEl = document.getElementById('auth-error-msg');
    if (errorMsgEl) {
        errorMsgEl.innerText = "現在、新規アカウント作成は制限されています。管理者へ直接ご連絡ください。";
        errorMsgEl.style.display = "block";
    }
    return;
}

// 新規ユーザー用の初期ドキュメント生成処理
function initializeUserDocumentIfNotExist(uid) {
    const docRef = db.collection('users').doc(uid);
    return docRef.get().then(doc => {
        if (doc.exists) {
            return; // すでに存在する場合は何もしない
        }
        
        // 新規ユーザーの初期データテンプレート（ノービス）
        const initialData = {
            "build_score": "Novice Adventurer",
            "combat_power": 700,
            "last_updated": new Date().toISOString(),
            "status": {
                "HP": {"current": 100, "max": 100},
                "STR": {"current": 100, "peak": 100},
                "VIT": {"current": 100, "peak": 100},
                "INT": {"current": 100, "peak": 100},
                "WIS": {"current": 100, "peak": 100},
                "MND": {"current": 100, "peak": 100},
                "CHA": {"current": 100, "peak": 100},
                "DEV": {"current": 100, "peak": 100}
            },
            "training": {
                "STR": 0, "VIT": 0, "INT": 0, "WIS": 0, "MND": 0, "CHA": 0, "DEV": 0
            },
            "tickets": {
                "all": 0, "STR": 0, "VIT": 0, "INT": 0, "WIS": 0, "MND": 0, "CHA": 0, "DEV": 0
            },
            "titles": {
                "active": ["目覚めし人"],
                "list": ["目覚めし人"]
            },
            "active_title_parts": ["目覚めし人"],
            "title_parts": ["目覚めし人", "の"],
            "unlocked_achievements": ["ACH_FIRST_STEP"],
            "archetypes": ["Adventurer"],
            "active_archetype": "Novice",
            "history": [
                {
                    "date": getTodayString(),
                    "event": "Character Created: Adventurer Registration Completed",
                    "status_change": {}
                }
            ],
            "pending_answers": []
        };
        
        return docRef.set({
            status_json: JSON.stringify(initialData)
        }).then(() => {
            console.log("Successfully initialized new user document in Firestore for UID:", uid);
        });
    }).catch(err => {
        console.error("Error checking/initializing user document:", err);
    });
}


// クライアントサイドでのデータマイグレーション
function migrateStatusData(data) {
    if (!data) return data;
    let modified = false;
    if (data.revision === undefined) {
        data.revision = 1;
        modified = true;
    }
    if (!data.unlocked_achievements) {
        data.unlocked_achievements = [];
        modified = true;
    }
    if (!data.title_parts) {
        data.title_parts = [];
        modified = true;
    }
    if (!data.custom_title) {
        data.custom_title = "";
        modified = true;
    }
    if (!data.active_title_parts) {
        data.active_title_parts = [];
        modified = true;
    }
    if (!data.active_archetype) {
        data.active_archetype = "Novice";
        modified = true;
    }
    
    // システム称号関連の初期マイグレーション
    if (!data.unlocked_system_titles) {
        data.unlocked_system_titles = [];
        modified = true;
    }
    if (!data.available_system_titles) {
        data.available_system_titles = [
            {
                "id": "TITLE_SYS_AI_CYBER_JEDI",
                "name": "極限の電脳ジェダイ",
                "desc": "DEV（開発力）が240以上、かつMND（精神力）が350以上に到達する",
                "condition": "DEV >= 240 and MND >= 350",
                "reward_words": ["ジェダイ", "極限の", "フォース"]
            },
            {
                "id": "TITLE_SYS_AI_SANCTUARY_KNIGHT",
                "name": "聖域の鉄壁ナイト",
                "desc": "VIT（持久）が250以上、かつMND（精神力）が350以上に到達する",
                "condition": "VIT >= 250 and MND >= 350",
                "reward_words": ["鉄壁", "聖域", "ナイト"]
            },
            {
                "id": "TITLE_SYS_AI_CODE_SAGE",
                "name": "コードを紡ぐ大賢者",
                "desc": "DEV（開発力）が250以上、かつWIS（知恵）が400以上に到達する",
                "condition": "DEV >= 250 and WIS >= 400",
                "reward_words": ["コード", "賢者", "紡ぎ手"]
            },
            {
                "id": "TITLE_SYS_AI_SOUL_LEADER",
                "name": "魂のカリスマ指揮官",
                "desc": "CHA（魅力）が320以上、かつMND（精神力）が350以上に到達する",
                "condition": "CHA >= 320 and MND >= 350",
                "reward_words": ["魂", "指揮官", "カリスマ"]
            },
            {
                "id": "TITLE_SYS_AI_STR_WIS_HERO",
                "name": "真理を穿つ剛力無双",
                "desc": "STR（筋力）が350以上、かつWIS（知恵）が400以上に到達する",
                "condition": "STR >= 350 and WIS >= 400",
                "reward_words": ["剛力", "穿ちし", "真理"]
            }
        ];
        modified = true;
    }
    
    // tickets.measurement から tickets.all への統合マイグレーション
    if (data.tickets) {
        if (data.tickets.measurement !== undefined) {
            const mCount = data.tickets.measurement || 0;
            data.tickets.all = (data.tickets.all || 0) + mCount;
            delete data.tickets.measurement;
            modified = true;
        }
    }
    
    // 初期実績の自動付与
    if (!data.unlocked_achievements.includes("ACH_FIRST_STEP")) {
        data.unlocked_achievements.push("ACH_FIRST_STEP");
        const defaultWords = ["目覚めし人", "の"];
        defaultWords.forEach(word => {
            if (!data.title_parts.includes(word)) {
                data.title_parts.push(word);
            }
        });
        modified = true;
    }
    
    // 変更があった場合はバックグラウンドでFirestoreへ書き戻し
    if (modified) {
        userDocRef.update({
            status_json: JSON.stringify(data)
        }).then(() => {
            console.log("Firestore data successfully migrated on client side.");
        }).catch(err => {
            console.error("Failed to auto-migrate Firestore data on client:", err);
        });
    }
    return data;
}

let originalBaseData = null; // ベースラインデータのグローバル保持

// 個人情報のマスキング用テキスト置換
function maskText(text) {
    if (!text) return text;
    let t = text;
    const replacements = [
        { pattern: /eGFR\s*\d+(\.\d+)?/gi, replacement: "健康指標" },
        { pattern: /LDLコレス\S*/g, replacement: "コレステロール" },
        { pattern: /BMI\s*\d+(\.\d+)?/gi, replacement: "体型指標" },
        { pattern: /シーパップ|CPAP/gi, replacement: "呼吸支援デバイス" },
        { pattern: /投資/g, replacement: "商業取引" },
        { pattern: /株式|FX/g, replacement: "アセット" },
        { pattern: /損切り|撤退基準/g, replacement: "リスク管理規律" },
        { pattern: /情シス|情システム/g, replacement: "管理部門" },
        { pattern: /会社|就業規則/g, replacement: "ギルド規則" },
        { pattern: /妻/g, replacement: "聖域の守護者" },
        { pattern: /Kintone/gi, replacement: "魔導データベース" },
        { pattern: /BOOTH/gi, replacement: "アイテム市場" }
    ];
    replacements.forEach(r => {
        t = t.replace(r.pattern, r.replacement);
    });
    return t;
}

// 送信データの個人情報マスキング
function maskSensitiveData(data) {
    if (!data) return data;
    const copy = JSON.parse(JSON.stringify(data));
    
    // 1. 履歴 (history) の summary を完全消去し、event をマスク
    if (copy.history) {
        copy.history.forEach(h => {
            if (h.summary !== undefined) {
                delete h.summary;
            }
            if (h.event) {
                h.event = maskText(h.event);
            }
        });
    }
    
    // 2. クエスト (quests) の description をマスク
    if (copy.quests) {
        copy.quests.forEach(q => {
            if (q.description) {
                q.description = maskText(q.description);
            }
        });
    }
    
    // 3. 保留中の解答 (pending_answers) の記述回答をプレースホルダー化
    if (copy.pending_answers) {
        copy.pending_answers.forEach(ans => {
            if (ans.answer && ans.test_id && !ans.test_id.startsWith("TRAIN-")) {
                const val = ans.answer;
                // 暗号化オブジェクトまたはJSON文字列の場合はスキップ
                if (typeof val === 'object' && val !== null && 'key_version' in val) {
                    return;
                }
                if (typeof val === 'string' && val.trim().startsWith('{') && val.includes('key_version')) {
                    return;
                }
                ans.answer = "[記述回答はローカルにのみ保存されています]";
            }
        });
    }
    
    return copy;
}

// 3者間マージ（クラウド、ローカル更新データ、ローカルでのベース）
function mergeStatusData(cloud, local, base) {
    const merged = JSON.parse(JSON.stringify(cloud));
    const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
    
    // 1. training（努力値）のマージ（ベースからの増分をクラウドへ加算）
    params.forEach(p => {
        const localVal = local.training ? (local.training[p] || 0) : 0;
        const baseVal = base && base.training ? (base.training[p] || 0) : 0;
        const delta = localVal - baseVal;
        if (delta > 0) {
            merged.training = merged.training || {};
            const oldVal = merged.training[p] || 0;
            merged.training[p] = oldVal + delta;
            
            // チケットの自動獲得判定
            merged.tickets = merged.tickets || {};
            const ticketsEarned = Math.floor(merged.training[p] / 100) - Math.floor(oldVal / 100);
            if (ticketsEarned > 0) {
                merged.tickets[p] = (merged.tickets[p] || 0) + ticketsEarned;
                merged.history = merged.history || [];
                merged.history.push({
                    "date": getTodayString(),
                    "event": `Measurement Ticket (${p}) Obtained by Training Points (Accumulated: ${merged.training[p]}pts)`,
                    "status_change": {}
                });
            }
        }
    });
    
    // 2. tickets（チケット数）のマージ（ベースからの増分/減分を反映）
    const ticketTypes = ["all", ...params];
    ticketTypes.forEach(t => {
        const localCount = local.tickets ? (local.tickets[t] || 0) : 0;
        const baseCount = base && base.tickets ? (base.tickets[t] || 0) : 0;
        const delta = localCount - baseCount;
        if (delta !== 0) {
            merged.tickets = merged.tickets || {};
            merged.tickets[t] = Math.max(0, (merged.tickets[t] || 0) + delta);
        }
    });
    
    // 3. history（履歴）のマージ（重複排除）
    const cloudEvents = new Set((cloud.history || []).map(h => `${h.date}_${h.event}`));
    (local.history || []).forEach(lh => {
        const key = `${lh.date}_${lh.event}`;
        if (!cloudEvents.has(key)) {
            merged.history = merged.history || [];
            merged.history.push(lh);
        }
    });
    merged.history.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // 4. quests（クエスト）のマージ（localで完了になったものを反映）
    if (local.quests) {
        merged.quests = merged.quests || [];
        local.quests.forEach(lq => {
            if (lq.status === "completed") {
                const mq = merged.quests.find(q => q.title === lq.title);
                if (mq && mq.status !== "completed") {
                    mq.status = "completed";
                }
            }
        });
    }
    
    // 5. custom_title / active_archetype
    if (local.custom_title !== (base ? base.custom_title : "")) {
        merged.custom_title = local.custom_title;
        merged.active_title_parts = [...(local.active_title_parts || [])];
        merged.titles = merged.titles || { active: [] };
        merged.titles.active = [...(local.titles ? (local.titles.active || []) : [])];
    }
    
    if (local.active_archetype !== (base ? base.active_archetype : "Novice")) {
        merged.active_archetype = local.active_archetype;
        merged.archetypes = [...(local.archetypes || [])];
    }
    
    // 6. pending_answers のマージ
    const cloudPendingIds = new Set((cloud.pending_answers || []).map(ans => ans.test_id));
    (local.pending_answers || []).forEach(ans => {
        if (!cloudPendingIds.has(ans.test_id)) {
            merged.pending_answers = merged.pending_answers || [];
            merged.pending_answers.push(ans);
        }
    });
    
    // 7. statusの値（current/peak）は高い方を採用
    params.forEach(p => {
        const cloudP = cloud.status ? (cloud.status[p] || {current: 100, peak: 100}) : {current: 100, peak: 100};
        const localP = local.status ? (local.status[p] || {current: 100, peak: 100}) : {current: 100, peak: 100};
        
        merged.status = merged.status || {};
        merged.status[p] = {
            current: Math.max(cloudP.current || 100, localP.current || 100),
            peak: Math.max(cloudP.peak || 100, localP.peak || 100),
            last_measured: cloudP.last_measured || localP.last_measured
        };
    });
    
    // HPはクラウドの現在値を優先
    const cloudHp = cloud.status && cloud.status.HP ? cloud.status.HP : {current: 100, max: 100};
    const localHp = local.status && local.status.HP ? local.status.HP : {current: 100, max: 100};
    merged.status.HP = {
        current: Math.min(cloudHp.current, localHp.current),
        max: cloudHp.max || 100
    };
    
    return merged;
}

// 楽観的ロックを用いたFirestore保存処理（isFast=trueの時は事前フェッチされたキャッシュを信用してgetをスキップ）
function saveStatusDataToFirestore(updatedData, isFast = false) {
    if (!updatedData) return Promise.reject("データがありません");
    
    if (!originalBaseData && cachedStatusData) {
        originalBaseData = JSON.parse(JSON.stringify(cachedStatusData));
    }
    
    // 高速書き込みモード（isFast が true でキャッシュが存在する場合）
    if (isFast && cachedStatusData) {
        console.log("[Fast Path] Firestore GET をスキップして直接書き込みを開始します。");
        let finalData = updatedData;
        
        // cachedStatusData を現在のクラウドの状態と仮定
        const cloudData = cachedStatusData;
        
        // revisionをインクリメント
        finalData.revision = (cloudData.revision || 1) + 1;
        finalData.last_updated = new Date().toISOString();
        
        // クラウド送信用に個人情報をマスキング
        const maskedData = maskSensitiveData(finalData);
        
        return userDocRef.set({
            status_json: JSON.stringify(maskedData)
        }).then(() => {
            console.log("[Fast Path] Firestoreへの同期成功。New Revision:", finalData.revision);
            finalData.uid = currentUserId; // ユーザー識別子を付与
            cachedStatusData = finalData;
            originalBaseData = JSON.parse(JSON.stringify(finalData));
            // ローカルキャッシュも更新
            safeSetItem('rpg_status_cache', JSON.stringify(finalData));
            updateUI(finalData);
            initRadarChart(finalData);
            return finalData;
        });
    }

    
    if (updatedData.revision === undefined) {
        updatedData.revision = 1;
    }
    
    return userDocRef.get()
        .then(doc => {
            let cloudData = null;
            if (doc.exists) {
                cloudData = JSON.parse(doc.data().status_json);
            }
            
            let finalData = updatedData;
            
            if (cloudData) {
                if (cloudData.revision === undefined) cloudData.revision = 1;
                
                // 競合チェック: クラウドのrevisionがローカルのベースrevisionと異なる場合
                const baseRevision = originalBaseData ? (originalBaseData.revision || 1) : 1;
                if (cloudData.revision !== baseRevision) {
                    console.warn("競合を検知しました。マージを実行します。 Cloud:", cloudData.revision, "Base:", baseRevision);
                    finalData = mergeStatusData(cloudData, updatedData, originalBaseData);
                }
            }
            
            // revisionをインクリメント
            finalData.revision = (cloudData ? (cloudData.revision || 1) : (finalData.revision || 1)) + 1;
            finalData.last_updated = new Date().toISOString();
            
            // クラウド送信用に個人情報をマスキング
            const maskedData = maskSensitiveData(finalData);
            
            return userDocRef.set({
                status_json: JSON.stringify(maskedData)
            }).then(() => {
                console.log("Firestoreへの同期成功。New Revision:", finalData.revision);
                finalData.uid = currentUserId; // ユーザー識別子を付与
                // ローカルのキャッシュとベースラインにはマスキング前のデータを保持
                cachedStatusData = finalData;
                originalBaseData = JSON.parse(JSON.stringify(finalData));
                // ローカルキャッシュも更新
                safeSetItem('rpg_status_cache', JSON.stringify(finalData));
                updateUI(finalData);
                initRadarChart(finalData);
                return finalData;
            });
        });
}

// Firebase Firestore からデータをフェッチ
function fetchStatusData() {
    return userDocRef.get()
        .then(doc => {
            if (!doc.exists) {
                console.warn('クラウド上にデータが見つかりませんでした (新規登録ユーザーの可能性)');
                return null;
            }
            let data = JSON.parse(doc.data().status_json);
            data = migrateStatusData(data); // クライアントサイド・マイグレーションの実行
            data.uid = currentUserId; // ユーザー識別子を付与
            
            cachedStatusData = data; // キャッシュに保持
            originalBaseData = JSON.parse(JSON.stringify(data)); // ベースラインの保存
            
            // ローカルキャッシュに保存
            safeSetItem('rpg_status_cache', JSON.stringify(data));
            
            updateUI(data);
            initRadarChart(data);
            // 公開鍵をバックグラウンドで事前ロードしてキャッシュ
            preloadPublicKey("v1");
            return data;
        })
        .catch(error => {
            console.error('データのフェッチエラー:', error);
            document.getElementById('build-score').innerText = 'データ読み込み失敗';
            return null;
        });
}

function updateUI(data) {
    const status = data.status;
    const hp = status.HP || { current: 100, max: 100 };
    const tickets = data.tickets || { measurement: 0 };
    const titles = data.titles || { active: [] };
    const activeArchetype = data.active_archetype || 'Novice';
    
    // 基本メタ情報
    document.getElementById('build-score').innerText = data.build_score || 'Novice Build';
    document.getElementById('combat-power-value').innerText = data.combat_power || 0;
    
    // HPバーの更新
    const hpCurr = hp.current;
    const hpMax = hp.max;
    const hpPct = hpMax > 0 ? (hpCurr / hpMax) * 100 : 0;
    document.getElementById('hp-value-text').innerText = `${hpCurr}/${hpMax}`;
    
    setTimeout(() => {
        const hpBar = document.getElementById('hp-progress');
        if (hpBar) hpBar.style.width = `${hpPct}%`;
    }, 100);

    // HPコンディション判定
    const hpStatusText = document.getElementById('hp-condition');
    if (hpPct >= 80) {
        hpStatusText.innerText = "Healthy (コンディション良好)";
        hpStatusText.style.color = '#2ed573';
    } else if (hpPct >= 40) {
        hpStatusText.innerText = "Fatigued (トレーニング効率 -20%)";
        hpStatusText.style.color = '#ffa502';
    } else {
        hpStatusText.innerText = "Exhausted (トレーニング効率 -50%)";
        hpStatusText.style.color = '#ff4757';
    }

    // 称号と職業
    document.getElementById('active-title').innerText = titles.active.length > 0 ? titles.active.join(', ') : '(None)';
    document.getElementById('archetype-value').innerText = activeArchetype;

    // アバター画像の切り替え
    const avatarImg = document.getElementById('char-avatar');
    if (avatarImg) {
        avatarImg.src = `assets/avatar_${activeArchetype}.png`;
        avatarImg.onerror = function() {
            avatarImg.src = 'assets/character.png';
            avatarImg.onerror = null; // ループ防止
        };
    }
    
    // 日時フォーマット
    const rawDate = new Date(data.last_updated);
    const formattedDate = rawDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    document.getElementById('last-updated').innerText = formattedDate;

    // パラメータリストの描画
    renderParamsList(status, data.training || {});
    
    // アイテム欄の描画
    renderItems(data);
    
    // GMアドバイスの描画
    renderAdvisories(data);
    
    // クエストの描画
    renderQuests(data);
    
    // 活動履歴の描画
    renderHistory(data);
}


function renderItems(data) {
    const itemsContainer = document.getElementById('items-container');
    if (!itemsContainer) return;
    itemsContainer.innerHTML = '';
    
    const tickets = data.tickets || {};
    
    const ticketNames = {
        "all": "測定チケット (all)",
        "STR": "測定チケット (STR)",
        "VIT": "測定チケット (VIT)",
        "INT": "測定チケット (INT)",
        "WIS": "測定チケット (WIS)",
        "MND": "測定チケット (MND)",
        "CHA": "測定チケット (CHA)",
        "DEV": "測定チケット (DEV)"
    };
    const ticketDescs = {
        "all": "すべてのステータスの昇段（ゲート）試験に挑戦可能な万能の測定チケット。",
        "STR": "STR（筋力・身体出力）の昇段（ゲート）試験にのみ挑戦可能な専用の測定チケット。",
        "VIT": "VIT（持久力・疲労耐性）の昇段（ゲート）試験にのみ挑戦可能な専用の測定チケット。",
        "INT": "INT（論理思考・構造化）の昇段（ゲート）試験にのみ挑戦可能な専用の測定チケット。",
        "WIS": "WIS（知識・教養）の昇段（ゲート）試験にのみ挑戦可能な専用の測定チケット。",
        "MND": "MND（精神力・自己統制）の昇段（ゲート）試験にのみ挑戦可能な専用の測定チケット。",
        "CHA": "CHA（魅力・信頼形成）の昇段（ゲート）試験にのみ挑戦可能な専用の測定チケット。",
        "DEV": "DEV（開拓・AIシステム構築）の昇段（ゲート）試験にのみ挑戦可能な専用の測定チケット。"
    };

    // tickets内の所持数が1以上のチケットをループ表示
    Object.keys(tickets).forEach(key => {
        const count = tickets[key];
        if (count > 0 && ticketNames[key]) {
            const escapedName = escapeHtml(ticketNames[key]);
            const escapedDesc = escapeHtml(ticketDescs[key]);
            const escapedCount = escapeHtml(String(count));
            const ticketHtml = `
                <div class="item-card">
                     <div class="item-icon">${key === "all" ? "🎫" : "🎟️"}</div>
                     <div class="item-info">
                         <div class="item-name">${escapedName}</div>
                         <div class="item-desc">${escapedDesc}</div>
                     </div>
                     <div class="item-count">x${escapedCount}</div>
                </div>
            `;
            itemsContainer.insertAdjacentHTML('beforeend', ticketHtml);
        }
    });
}

function renderAdvisories(data) {
    const listContainer = document.getElementById('advisory-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    const advisories = generateAdvisories(data);
    if (advisories.length === 0) {
        listContainer.innerHTML = '<div class="advisory-item-web">現在、特記事項はありません。Trainingに励みましょう！</div>';
        return;
    }
    
    advisories.forEach(adv => {
        const itemHtml = `<div class="advisory-item-web ${adv.type}">${adv.text}</div>`;
        listContainer.insertAdjacentHTML('beforeend', itemHtml);
    });
}

function generateAdvisories(data) {
    const status = data.status;
    const advisories = [];
    
    // 1. HP警告
    const hp = status.HP || { current: 100, max: 100 };
    const hpPct = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    if (hpPct < 80) {
        advisories.push({
            type: "warning",
            text: `⚠️ **HP低下アラート (${hp.current}/${hp.max})**<br>健康状態（コンディション）が悪化しているため、Training（努力蓄積）の効率が【減衰】しています。睡眠の質向上、水分補給、塩分調整を意識し、休息を取ることを優先してください。`
        });
    }
    
    // 2. ボトルネック分析 (最も低いステータス、DEVとHPを除く)
    const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA"];
    let minParam = "STR";
    let minVal = 999;
    params.forEach(p => {
        if (status[p] && status[p].current < minVal) {
            minVal = status[p].current;
            minParam = p;
        }
    });
    
    const paramJp = { STR: "筋力", VIT: "持久", INT: "知能", WIS: "知識", MND: "精神", CHA: "魅力" };
    if (minVal < 300) {
        advisories.push({
            type: "info",
            text: `🔍 **ボトルネック分析**<br>【${paramJp[minParam]} (${minVal})】が一般成人水準(300)を下回っています。この項目が現在のあなたの成長のボトルネックです。優先的にTraining（歩行、対人訓練など）を行い、基礎力の底上げを図りましょう。`
        });
    }
    
    // 3. DEV偏重（オーバースペック・アラート）
    const otherSum = params.reduce((sum, p) => sum + (status[p]?.current || 0), 0);
    const otherAvg = otherSum / params.length;
    const devVal = status.DEV?.current || 0;
    if (devVal - otherAvg >= 150) {
        advisories.push({
            type: "warning",
            text: `⚔️ **DEV偏重（オーバースペック・アラート）**<br>AI開発力 (DEV: ${devVal}) が他の基礎能力の平均値 (${Math.round(otherAvg)}) より著しく突出しています。肉体(STR/VIT)や精神力(MND)、魅力(CHA)の土台が伴わなければ、高難度クエストで状態異常デバフを受けやすくなります。バランスを取るため、他パラメータのTrainingを意識的に行ってください。`
        });
    }
    
    // 4. CHA停滞（信頼結界の弱体化）
    const history = data.history || [];
    const hasRecentCha = history.slice(-20).some(h => {
        if (h.status_change && h.status_change.CHA > 0) return true;
        if (h.event && (h.event.includes("CHA+") || h.event.includes("CHA) Obtained"))) return true;
        return false;
    });
    if (!hasRecentCha) {
        advisories.push({
            type: "warning",
            text: `💬 **CHA停滞（信頼結界の弱体化）**<br>直近20件の活動履歴に魅力・信頼関係 (CHA) の訓練実績が記録されていません。何よりも重要な聖域 of守護者（妻）との日常対話や、他者とのコミュニケーションが不足している恐れがあります。定期的に「対話クエスト」を実行し、信頼結界を強化してください。`
        });
    }
    
    // 5. AI開発力（DEV）ビルド提案 (偏重警告が出ていない場合のみ表示)
    if (devVal - otherAvg < 150 && status.DEV && status.DEV.current < 200) {
        advisories.push({
            type: "build",
            text: `💡 **ビルド提案（職業特性強化）**<br>現在のAI開発力 (DEV: ${status.DEV.current}) は見習いランクです。まずは 200 ゲート（日常利用）の昇段試験への挑戦を推奨します。ITパスポート等で培った基礎力にAI操作知識をプラスしましょう。`
        });
    }
    
    // 6. 未採点の回答
    const pending = data.pending_answers || [];
    if (pending.length > 0) {
        advisories.push({
            type: "info",
            text: `📝 **未採点の回答が存在します (${pending.length}件)**<br>ギルドに提出済みの昇段試験回答が未採点状態です。AI（Antigravity）との対話チャットにて「採点して」と入力し、速やかに採点結果をステータスへ反映させてください。`
        });
    }
    
    // 7. 測定チケットの案内
    const tickets = data.tickets || {};
    const totalTickets = (tickets.all || 0) + 
                         (tickets.STR || 0) + 
                         (tickets.VIT || 0) + 
                         (tickets.INT || 0) + 
                         (tickets.WIS || 0) + 
                         (tickets.MND || 0) + 
                         (tickets.CHA || 0) + 
                         (tickets.DEV || 0);
    if (totalTickets > 0) {
        const isHeavy = totalTickets >= 5;
        advisories.push({
            type: isHeavy ? "warning" : "success",
            text: isHeavy 
                ? `🎫 **測定チケット過剰蓄積 (${totalTickets}枚)**<br>測定チケットが溜まっています！能力値の成長に対して昇段試験を受けていない状態です。コンディションが良い日に「ゲート試験」タブから試験に挑戦し、ランクアップを果たしてください。`
                : `🎫 **昇段試験（測定）の案内**<br>現在、測定チケットを合計 ${totalTickets} 枚所持しています。頭が十分に回り、コンディションが良いタイミングで「ゲート試験」タブを開き、次のゲート試験に挑戦してください！`
        });
    }
    
    return advisories;
}

function renderParamsList(status, training) {
    const paramsContainer = document.getElementById('params-container');
    if (!paramsContainer) return;
    paramsContainer.innerHTML = '';

    const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
    const paramNames = {
        "STR": { short: "STR", full: "筋力・身体出力" },
        "VIT": { short: "VIT", full: "持久力・疲労耐性" },
        "INT": { short: "INT", full: "論理思考・構造化" },
        "WIS": { short: "WIS", full: "知識・教養" },
        "MND": { short: "MND", full: "精神力・自己統制" },
        "CHA": { short: "CHA", full: "魅力・信頼形成" },
        "DEV": { short: "DEV", full: "開拓・AIシステム構築" }
    };

    params.forEach(p => {
        const pData = status[p] || { current: 100, peak: 100 };
        const curr = pData.current;
        const peak = pData.peak;
        
        const isUnknown = curr === null || String(curr).startsWith("?");
        
        const curPct = isUnknown ? 0 : (curr / 999) * 100;
        const peakPct = isUnknown ? 0 : (peak / 999) * 100;
        
        const currDisplay = isUnknown ? "???" : curr;

        const escapedCurr = escapeHtml(String(currDisplay));
        const escapedPeak = escapeHtml(String(peak));
        const escapedTraining = escapeHtml(String(training[p] || 0));
        const escapedShort = escapeHtml(paramNames[p].short);
        const escapedFull = escapeHtml(paramNames[p].full);

        const itemHtml = `
            <div class="param-item">
                <div class="param-name-container">
                    <span class="param-short">${escapedShort}</span>
                    <span class="param-full">${escapedFull}</span>
                </div>
                <div class="param-bar-wrapper">
                    <div class="param-bar-bg">
                        <div class="param-fill-current" id="fill-cur-${p}" style="width: 0%;"></div>
                        <div class="param-fill-peak-gap" id="fill-peak-${p}" style="width: 0%;"></div>
                    </div>
                </div>
                <div class="param-values">
                    <span class="val-current">${escapedCurr}</span>
                    <span class="val-peak">Peak: ${escapedPeak} | T: ${escapedTraining}</span>
                </div>
            </div>
        `;
        
        paramsContainer.insertAdjacentHTML('beforeend', itemHtml);

        setTimeout(() => {
            const curEl = document.getElementById(`fill-cur-${p}`);
            const peakEl = document.getElementById(`fill-peak-${p}`);
            if (curEl) curEl.style.width = `${curPct}%`;
            if (peakEl) peakEl.style.width = `${peakPct}%`;
        }, 150);
    });
}

function initRadarChart(data) {
    const status = data.status;
    const history = data.history || [];
    
    const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
    const labels = ["STR (筋力)", "VIT (持久)", "INT (知能)", "WIS (知識)", "MND (精神)", "CHA (魅力)", "DEV (開発)"];
    
    const currentValues = [];
    const peakValues = [];
    params.forEach(p => {
        const pData = status[p] || { current: 100, peak: 100 };
        let curr = pData.current;
        let peak = pData.peak;
        if (curr === null || typeof curr === 'string') curr = 0;
        if (peak === null || typeof peak === 'string') peak = 0;
        currentValues.push(curr);
        peakValues.push(peak);
    });

    const datasets = [
        {
            label: 'Current Status (現在)',
            data: currentValues,
            backgroundColor: 'rgba(0, 210, 255, 0.18)',
            borderColor: '#00d2ff',
            borderWidth: 2.5,
            pointBackgroundColor: '#00d2ff',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#00d2ff',
            order: 1
        },
        {
            label: 'Peak Status (最高点)',
            data: peakValues,
            backgroundColor: 'transparent',
            borderColor: '#ff4757',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointBackgroundColor: '#ff4757',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#ff4757',
            order: 4
        }
    ];

    const snapshots = history.filter(h => h.snapshot);
    const pastSnapshots = [];
    
    if (snapshots.length > 1) {
        for (let i = snapshots.length - 2; i >= 0 && pastSnapshots.length < 2; i--) {
            pastSnapshots.push(snapshots[i]);
        }
    }

    const pastColors = [
        { border: 'rgba(241, 196, 15, 0.65)', bg: 'rgba(241, 196, 15, 0.03)', label: 'Previous 1 (前回)' },
        { border: 'rgba(165, 94, 234, 0.5)', bg: 'rgba(165, 94, 234, 0.02)', label: 'Previous 2 (前々回)' }
    ];

    pastSnapshots.forEach((snapEvent, idx) => {
        const snapValues = [];
        params.forEach(p => {
            const val = snapEvent.snapshot[p] || 100;
            snapValues.push(val);
        });

        const colorSet = pastColors[idx] || pastColors[0];
        
        datasets.push({
            label: `${colorSet.label} - ${snapEvent.date}`,
            data: snapValues,
            backgroundColor: colorSet.bg,
            borderColor: colorSet.border,
            borderWidth: 1.5,
            borderDash: [3, 5],
            pointBackgroundColor: colorSet.border,
            pointBorderColor: 'transparent',
            pointRadius: 3,
            order: 2 + idx
        });
    });

    const canvas = document.getElementById('statusRadarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (statusChart) {
        statusChart.destroy();
    }
    
    statusChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.08)'
                    },
                    pointLabels: {
                        color: '#a4b0be',
                        font: {
                            family: 'Outfit',
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        backdropColor: 'transparent',
                        color: '#747d8c',
                        font: {
                            size: 9
                        },
                        stepSize: 200
                    },
                    min: 0,
                    max: 1000
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f1f2f6',
                        font: {
                            family: 'Outfit',
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

// ----------------------------------------------------
// ⚡ ゲート試験（測定）関連のロジック
// ----------------------------------------------------

function getNextGate(currentVal) {
    const gates = [100, 200, 300, 400, 500, 600, 700, 800, 900, 999];
    const eligibleGates = gates.filter(g => g > currentVal);
    return eligibleGates.length > 0 ? eligibleGates[0] : 999;
}

function loadAvailableTests() {
    if (!cachedStatusData) return;
    
    const status = cachedStatusData.status;
    const tickets = cachedStatusData.tickets || {};
    
    // 所持しているすべての種類のチケットの合計数を算出
    const totalTickets = (tickets.all || 0) + 
                         (tickets.STR || 0) + 
                         (tickets.VIT || 0) + 
                         (tickets.INT || 0) + 
                         (tickets.WIS || 0) + 
                         (tickets.MND || 0) + 
                         (tickets.CHA || 0) + 
                         (tickets.DEV || 0);
    
    const container = document.getElementById('test-list-container');
    if (!container) return;
    container.innerHTML = ''; // クリア
    
    // 全試験問題のリストを取得 (静的ファイルからロード)
    fetch('status_tests.json')
        .then(res => {
            if (!res.ok) throw new Error('試験データの取得失敗');
            return res.json();
        })
        .then(allTests => {
            let gateTests = [];
            let measurementTests = [];
            let trainingTasks = [];
            
            // パラメータごとに試験をグループ化する
            const testsByParam = {};
            
            allTests.forEach(test => {
                if (test.is_training) {
                    trainingTasks.push(test);
                    return;
                }
                
                const param = test.param;
                if (!testsByParam[param]) {
                    testsByParam[param] = [];
                }
                testsByParam[param].push(test);
            });
            
            // 各パラメータごとに、現在値に最も適したゲート試験と実力測定試験を1件ずつランダム選出する
            Object.keys(testsByParam).forEach(param => {
                const paramTests = testsByParam[param];
                const pData = status[param] || { current: 100 };
                const currVal = pData.current;
                
                // === ゲート試験の選出（次のゲートに一致する問題群からランダムに1つ） ===
                const nextGate = getNextGate(currVal);
                const eligibleGateTests = paramTests.filter(t => t.target_gate === nextGate);
                if (eligibleGateTests.length > 0) {
                    const randomIndex = Math.floor(Math.random() * eligibleGateTests.length);
                    const gateTest = { ...eligibleGateTests[randomIndex], test_type: 'gate' };
                    gateTests.push(gateTest);
                }
                
                // === 実力測定試験の選出 ===
                // 理想のターゲットゲート（現在値が属する100刻みのランク帯。例: 200〜299なら200）
                const idealGate = Math.floor(currVal / 100) * 100;
                
                let bestTests = [];
                
                // 1. 現在のランク帯（idealGate）に完全一致する試験を探す
                bestTests = paramTests.filter(t => t.target_gate === idealGate);
                
                if (bestTests.length === 0) {
                    // 2. なければ、現在値より上のゲートの中で最も低い（次に目指すべき）試験を探す
                    const sortedHigher = paramTests.filter(t => t.target_gate > currVal)
                                                    .sort((a, b) => a.target_gate - b.target_gate);
                    if (sortedHigher.length > 0) {
                        const targetHigherGate = sortedHigher[0].target_gate;
                        bestTests = paramTests.filter(t => t.target_gate === targetHigherGate);
                    }
                }
                
                if (bestTests.length === 0) {
                    // 3. それもなければ、現在値以下のゲートの中で最大のものを探す（すでにクリア済みの最大難易度）
                    const sortedLower = paramTests.filter(t => t.target_gate <= currVal)
                                                   .sort((a, b) => b.target_gate - a.target_gate);
                    if (sortedLower.length > 0) {
                        const targetLowerGate = sortedLower[0].target_gate;
                        bestTests = paramTests.filter(t => t.target_gate === targetLowerGate);
                    }
                }
                
                if (bestTests.length > 0) {
                    const randomIndex = Math.floor(Math.random() * bestTests.length);
                    const measurementTest = { ...bestTests[randomIndex], test_type: 'measurement' };
                    measurementTests.push(measurementTest);
                }
            });
            
            // 表示の見栄えを揃えるため、STR, VIT, INT, WIS, MND, CHA, DEV の順番でソート
            const paramOrder = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
            measurementTests.sort((a, b) => {
                return paramOrder.indexOf(a.param) - paramOrder.indexOf(b.param);
            });

            
            let html = '';
            
            // 0. チケットが完全に不足している場合、警告と回復ミッションを表示
            if (totalTickets <= 0) {
                html += `
                    <div class="item-card" style="border-color: var(--accent-red-dim); background: rgba(255, 71, 87, 0.02); padding: 16px; text-align: center; display: block; width: 100%; margin-bottom: 15px;">
                        <div style="font-size: 1.8rem; margin-bottom: 4px;">🎫 ❌</div>
                        <div style="font-weight: bold; font-size: 0.9rem; color: #ffffff; margin-bottom: 4px;">測定チケットが不足しています</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4;">
                            通常のゲート試験を受けるには、対応するステータスの専用チケットまたはallチケットが必要です。<br>
                            以下の「チケット回復ミッション（追試）」を達成してチケットを復旧させましょう！
                        </div>
                    </div>
                    <div style="width: 100%; text-align: left; margin-bottom: 8px;">
                        <h4 style="font-family: var(--font-pixel); font-size: 0.75rem; color: var(--accent-blue);">🔥 チケット回復ミッション一覧</h4>
                    </div>
                `;
                if (trainingTasks.length === 0) {
                    html += '<div class="advisory-item-web">現在、有効な回復ミッションはありません。</div>';
                } else {
                    trainingTasks.forEach(test => {
                        const timeMin = test.time_limit_seconds / 60;
                        const escapedId = escapeHtml(test.id);
                        const escapedTitle = escapeHtml(test.question.split('\n')[0].replace('【', '').replace('】', ''));
                        const escapedDiff = escapeHtml(test.difficulty);
                        const escapedTime = test.time_limit_seconds > 0 ? `${escapeHtml(String(timeMin))} 分` : "なし";
                        html += `
                            <div class="test-select-card" style="border-color: rgba(0, 210, 255, 0.25); margin-bottom: 10px;">
                                <div class="test-card-left">
                                    <div class="test-card-title" style="color: var(--accent-blue);">【追試】${escapedTitle}</div>
                                    <div class="test-card-meta" style="margin-top: 4px;">
                                        <span>難易度: <span class="meta-diff" style="color: var(--accent-blue);">${escapedDiff}</span></span>
                                        <span>制限時間: <span class="meta-time">${escapedTime}</span></span>
                                    </div>
                                </div>
                                <button class="btn btn-primary" onclick="startTest('${escapedId}', 'training')">ミッション開始</button>
                            </div>
                        `;
                    });
                }
            }
            
            // 1. ゲート試験の描画
            html += `
                <div style="width: 100%; text-align: left; margin-bottom: 8px; margin-top: 12px;">
                    <h4 style="font-family: var(--font-pixel); font-size: 0.75rem; color: var(--accent-red);">🛡️ ランクゲート試験 (チケットが必要)</h4>
                </div>
            `;
            if (gateTests.length === 0) {
                html += '<div class="advisory-item-web">現在挑戦可能なゲート試験はありません。</div>';
            } else {
                gateTests.forEach(test => {
                    const param = test.param;
                    const targetGate = test.target_gate;
                    const timeMin = test.time_limit_seconds / 60;
                    const timeText = test.time_limit_seconds > 0 ? `${timeMin} 分` : "なし";
                    
                    const pData = status[param] || { current: 100 };
                    const currVal = pData.current;
                    
                    // レベルキャップ - 20 の資格チェック
                    const requiredVal = targetGate - 20;
                    const isQualified = currVal >= requiredVal;
                    
                    const hasSpecific = tickets[param] && tickets[param] > 0;
                    const hasAll = tickets.all && tickets.all > 0;
                    const hasTicket = hasSpecific || hasAll;
                    
                    let ticketStatusHtml = "";
                    let btnDisabled = false;
                    let btnStyle = "";
                    let warningText = "";
                    
                    if (!isQualified) {
                        ticketStatusHtml = `<span class="meta-diff" style="color: var(--accent-red);">受験資格なし (必要値: ${requiredVal})</span>`;
                        btnDisabled = true;
                        btnStyle = 'background: #3a3b3c; border-color: transparent; cursor: not-allowed; opacity: 0.5;';
                        warningText = `<div style="font-size: 0.65rem; color: var(--accent-red); margin-top: 4px; font-family: 'Noto Sans JP', sans-serif;">※この試験を受けるには、現在のステータスが ${requiredVal} 以上である必要があります (現在: ${currVal})。</div>`;
                    } else if (!hasTicket) {
                        ticketStatusHtml = `<span class="meta-diff" style="color: var(--accent-red);">チケット不足</span>`;
                        btnDisabled = true;
                        btnStyle = 'background: #3a3b3c; border-color: transparent; cursor: not-allowed;';
                    } else {
                        ticketStatusHtml = `<span class="meta-time" style="color: var(--hp-green); font-weight:bold;">挑戦可能</span>`;
                    }
                    
                    const escapedId = escapeHtml(test.id);
                    const escapedParam = escapeHtml(param);
                    const escapedGate = escapeHtml(String(targetGate));
                    const escapedDiff = escapeHtml(test.difficulty);
                    const escapedTime = escapeHtml(timeText);
                    
                    html += `
                        <div class="test-select-card" style="${btnDisabled ? 'opacity: 0.6; border-color: rgba(255,255,255,0.02);' : ''}">
                            <div class="test-card-left">
                                <div class="test-card-title">${escapedParam} -> ${escapedGate} ゲート試験</div>
                                <div class="test-card-meta">
                                    <span>難易度: <span class="meta-diff">${escapedDiff}</span></span>
                                    <span>制限時間: <span class="meta-time">${escapedTime}</span></span>
                                    <span>状態: ${ticketStatusHtml}</span>
                                </div>
                                ${warningText}
                            </div>
                            <button class="btn btn-primary" ${btnDisabled ? 'disabled style="' + btnStyle + '"' : ''} onclick="startTest('${escapedId}', 'gate')">試験開始</button>
                        </div>
                    `;
                });
            }
            
            // 2. 実力測定試験の描画
            html += `
                <div style="width: 100%; text-align: left; margin-bottom: 8px; margin-top: 20px;">
                    <h4 style="font-family: var(--font-pixel); font-size: 0.75rem; color: var(--accent-blue);">🔍 実力測定試験 (チケット不要)</h4>
                </div>
            `;
            if (measurementTests.length === 0) {
                html += '<div class="advisory-item-web">挑戦可能な実力測定試験はありません。</div>';
            } else {
                measurementTests.forEach(test => {
                    const param = test.param;
                    const targetGate = test.target_gate;
                    const timeMin = test.time_limit_seconds / 60;
                    const timeText = test.time_limit_seconds > 0 ? `${timeMin} 分` : "なし";
                    
                    const escapedId = escapeHtml(test.id);
                    const escapedParam = escapeHtml(param);
                    const escapedGate = escapeHtml(String(targetGate));
                    const escapedDiff = escapeHtml(test.difficulty);
                    const escapedTime = escapeHtml(timeText);
                    
                    html += `
                        <div class="test-select-card">
                            <div class="test-card-left">
                                <div class="test-card-title">${escapedParam} -> ${escapedGate} レベル測定</div>
                                <div class="test-card-meta">
                                    <span>難易度: <span class="meta-diff" style="color: var(--accent-blue);">${escapedDiff}</span></span>
                                    <span>制限時間: <span class="meta-time">${escapedTime}</span></span>
                                    <span>状態: <span class="meta-time" style="color: var(--hp-green); font-weight:bold;">挑戦可能 (フリー)</span></span>
                                </div>
                            </div>
                            <button class="btn btn-primary" style="background: var(--accent-blue); border-color: var(--accent-blue);" onclick="startTest('${escapedId}', 'measurement')">測定開始</button>
                        </div>
                    `;
                });
            }
            
            container.innerHTML = html;
        })
        .catch(err => {
            console.error(err);
            container.innerHTML = '<div class="advisory-item-web warning">試験データの読み込みに失敗しました。</div>';
        });
}

function startTest(testId, testType) {
    if (!cachedStatusData) return;
    
    const isTrainingTask = testId.startsWith("TRAIN-");

    fetch('status_tests.json')
        .then(res => res.json())
        .then(allTests => {
            const test = allTests.find(t => t.id === testId);
            if (!test) {
                alert("指定された試験が見つかりません。");
                return;
            }
            
            const status = cachedStatusData.status || {};
            const param = test.param;
            const targetGate = test.target_gate;
            const pData = status[param] || { current: 100 };
            const currVal = pData.current;
            
            // 明示的に渡された testType を優先し、なければステータス値から自動判定（フォールバック）
            let isMeasurement = false;
            if (testType) {
                isMeasurement = (testType === 'measurement');
            } else {
                isMeasurement = !test.is_training && (targetGate <= currVal || currVal < (targetGate - 20));
            }
            
            // 受験資格チェック (追試ミッションおよび実力測定試験でない場合のみ)
            if (!isTrainingTask && !isMeasurement) {
                const requiredVal = targetGate - 20;
                if (currVal < requiredVal) {
                    alert(`この試験を受けるには、ステータスが ${requiredVal} 以上である必要があります (現在: ${currVal})。`);
                    return;
                }
                
                const tickets = cachedStatusData.tickets || {};
                const hasSpecific = tickets[param] && tickets[param] > 0;
                const hasAll = tickets.all && tickets.all > 0;
                if (!hasSpecific && !hasAll) {
                    alert(`測定チケット（${param}）または測定チケット（all）が不足しています！`);
                    return;
                }
            }
            
            activeTest = { ...test, test_type: isMeasurement ? 'measurement' : 'gate' };
            testSecondsTotal = test.time_limit_seconds || 0;
            testSecondsRemaining = testSecondsTotal;
            testStartTime = Date.now();
            
            // UI表示の切り替え
            switchTestView('test-active-view');
            
            // 公開鍵をバックグラウンドで事前ロードしてキャッシュ
            preloadPublicKey("v1");
            // さらに最新のFirestoreデータを裏で再取得してキャッシュとベースラインを更新（提出時の高速書き込み用）
            fetchStatusData().then(() => {
                console.log("[OK] Firestore status data preloaded for fast submit.");
            }).catch(err => {
                console.warn("Failed to preload status data:", err);
            });
            
            // 問題文セット
            document.getElementById('test-question-text').innerText = test.question;
            document.getElementById('test-answer-input').value = '';
            document.getElementById('test-answer-input').disabled = false;
            document.getElementById('test-answer-input').focus();
            
            // 判定結果表示エリアのリセット
            const resultBox = document.getElementById('judge-result-box');
            if (resultBox) {
                resultBox.style.display = 'none';
                document.getElementById('judge-status-body').innerText = '';
            }
            
            // ボタンの切り替え
            const submitBtn = document.getElementById('test-submit-btn');
            if (submitBtn) {
                if (testId.startsWith("TRAIN-")) {
                    submitBtn.innerText = "コードを実行してテスト判定";
                    submitBtn.setAttribute("onclick", "judgeTrainingCode()");
                } else {
                    submitBtn.innerText = isMeasurement ? "測定の解答を提出する" : "解答を提出する";
                    submitBtn.setAttribute("onclick", "submitTestAnswer()");
                }
            }
            
            // タイマーUI初期設定
            updateTimerUI();
            
            // タイマーのカウントダウン開始 (1秒ごと、制限時間がある場合のみ)
            if (testTimerInterval) clearInterval(testTimerInterval);
            if (testSecondsTotal > 0) {
                testTimerInterval = setInterval(countdownTick, 1000);
            }

        });
}

function countdownTick() {
    testSecondsRemaining--;
    updateTimerUI();
    
    if (testSecondsRemaining <= 0) {
        clearInterval(testTimerInterval);
        if (activeTest && activeTest.id.startsWith("TRAIN-")) {
            // 追試時間切れの場合は空で自動判定実行 (不合格になる)
            judgeTrainingCode();
        } else {
            submitTestAnswer(true); // 時間切れによる自動提出
        }
    }
}

function updateTimerUI() {
    const clock = document.getElementById('timer-display');
    const bar = document.getElementById('timer-progress');
    if (!clock || !bar) return;
    
    // 制限時間なしの場合の表示
    if (testSecondsTotal <= 0) {
        clock.innerText = "制限時間なし";
        bar.style.width = "100%";
        clock.classList.remove('critical');
        bar.classList.remove('critical');
        return;
    }
    
    // 分・秒のフォーマット
    const mins = Math.floor(Math.max(0, testSecondsRemaining) / 60);
    const secs = Math.max(0, testSecondsRemaining) % 60;
    const minsStr = String(mins).padStart(2, '0');
    const secsStr = String(secs).padStart(2, '0');
    clock.innerText = `${minsStr}:${secsStr}`;
    
    // プログレスバーの割合
    const pct = testSecondsTotal > 0 ? (testSecondsRemaining / testSecondsTotal) * 100 : 0;
    bar.style.width = `${pct}%`;
    
    // 30秒未満になったら赤く点滅させて危機感を演出
    if (testSecondsRemaining < 30) {
        clock.classList.add('critical');
        bar.classList.add('critical');
    } else {
        clock.classList.remove('critical');
        bar.classList.remove('critical');
    }
}


let cachedPublicKey = null;
let cachedPublicKeyVersion = null;

// 公開鍵をバックグラウンドで事前ロード・キャッシュする関数
async function preloadPublicKey(keyVersion = "v1") {
    if (cachedPublicKey && cachedPublicKeyVersion === keyVersion) {
        return cachedPublicKey;
    }
    try {
        const pubKeyResponse = await fetch(`public_key_${keyVersion}.json`);
        if (!pubKeyResponse.ok) {
            throw new Error(`公開鍵 (version: ${keyVersion}) のロードに失敗しました`);
        }
        const jwkKey = await pubKeyResponse.json();
        const pubKey = await window.crypto.subtle.importKey(
            "jwk",
            jwkKey,
            {
                name: "RSA-OAEP",
                hash: { name: "SHA-256" }
            },
            false,
            ["encrypt"]
        );
        cachedPublicKey = pubKey;
        cachedPublicKeyVersion = keyVersion;
        console.log(`[OK] Public key preloaded and cached (version: ${keyVersion})`);
        return pubKey;
    } catch (e) {
        console.error("Public key preload failed:", e);
        return null;
    }
}

// 公開鍵をロードして暗号化を行う非同期関数
async function encryptAnswer(plainText, keyVersion = "v1") {
    // 1. キャッシュから公開鍵を取得、無ければロード
    let pubKey = cachedPublicKey;
    if (!pubKey || cachedPublicKeyVersion !== keyVersion) {
        pubKey = await preloadPublicKey(keyVersion);
    }
    if (!pubKey) {
        throw new Error(`公開鍵 (version: ${keyVersion}) のロードに失敗しました`);
    }

    // 2. AES-GCM 共通鍵 (256ビット) の一時生成
    const aesKey = await window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256 // 256bit 鍵長に固定
        },
        true,
        ["encrypt", "decrypt"]
    );

    // 4. AES鍵を raw (32バイト) でエクスポート
    const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);

    // 5. エクスポートした AES 共通鍵を RSA-OAEP (SHA-256) で暗号化
    const encryptedKeyBuf = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        pubKey,
        rawAesKey
    );

    // 6. IV の生成 (12バイト)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // 7. 本文の暗号化
    const encoder = new TextEncoder();
    const plainBytes = encoder.encode(plainText);
    const ciphertextBuf = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        aesKey,
        plainBytes
    );

    // ArrayBuffer を Base64 形式に変換するヘルパー
    const arrayBufferToBase64 = (buf) => {
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    return {
        key_version: keyVersion,
        encrypted_key: arrayBufferToBase64(encryptedKeyBuf),
        iv: arrayBufferToBase64(iv),
        ciphertext: arrayBufferToBase64(ciphertextBuf)
    };
}

// 通常の試験提出 (Firestoreへの書き込み)
async function submitTestAnswer(isTimeout = false) {
    if (testTimerInterval) clearInterval(testTimerInterval);
    
    const textarea = document.getElementById('test-answer-input');
    const submitBtn = document.getElementById('test-submit-btn');
    
    // UIを即座に無効化（連打防止）
    if (textarea) textarea.disabled = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "暗号化中...";
    }
    
    const answerText = textarea ? textarea.value : '';
    
    // 回答の暗号化を実行
    let encryptedAnswer = null;
    try {
        encryptedAnswer = await encryptAnswer(answerText, "v1");
    } catch (e) {
        console.error("暗号化エラー:", e);
        alert("解答の暗号化処理に失敗しました。提出を中断します。エラー: " + e.message);
        if (textarea) textarea.disabled = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "解答を提出する";
        }
        return;
    }
    
    if (submitBtn) submitBtn.innerText = "提出中...";
    
    // 現在のキャッシュデータをコピーして書き換え
    const updatedData = JSON.parse(JSON.stringify(cachedStatusData));
    
    const isMeasurement = (activeTest.test_type === 'measurement');
    
    // チケット消費（ゲート試験の場合のみ、優先度：専用 ➡️ all）
    const param = activeTest.param;
    if (!isMeasurement && updatedData.tickets) {
        if (updatedData.tickets[param] && updatedData.tickets[param] > 0) {
            updatedData.tickets[param]--;
        } else if (updatedData.tickets.all && updatedData.tickets.all > 0) {
            updatedData.tickets.all--;
        }
    }
    
    const elapsed = testStartTime ? Math.floor((Date.now() - testStartTime) / 1000) : 0;
    const elapsedMin = roundNumber(elapsed / 60, 1);
    const statusStr = isTimeout ? "TIMEOUT" : "COMPLETED";
    
    // 履歴追加
    if (!updatedData.history) updatedData.history = [];
    const eventPrefix = isMeasurement ? "Measurement Test Submitted" : "Exam Answer Submitted";
    updatedData.history.push({
        "date": getTodayString(),
        "event": `${eventPrefix}: ${activeTest.id} (${statusStr} in ${elapsedMin}m)`,
        "status_change": {}
    });
    
    // 保留中の解答を追加
    if (!updatedData.pending_answers) updatedData.pending_answers = [];
    updatedData.pending_answers.push({
        "test_id": activeTest.id,
        "param": activeTest.param,
        "target_gate": activeTest.target_gate,
        "test_type": activeTest.test_type || "gate",
        "answer": encryptedAnswer,
        "elapsed_seconds": elapsed,
        "timeout": isTimeout,
        "submitted_at": new Date().toISOString()
    });
    
    updatedData.last_updated = new Date().toISOString();
    
    // Firestore へ高速同期（試験中に他端末での競合が起きないと想定し、getをスキップ）
    saveStatusDataToFirestore(updatedData, true)
    .then(() => {
        // 通常試験完了時の表示を初期状態に戻す
        document.querySelector('#test-complete-view .complete-icon').innerText = "📝";
        document.querySelector('#test-complete-view .complete-title').innerText = isMeasurement ? "測定提出完了" : "解答提出完了";
        document.querySelector('#test-complete-view .complete-desc').innerText = isMeasurement 
            ? "実力測定の解答がクラウドに保存されました！" 
            : "解答がクラウドに保存されました！";
        
        const descSubs = document.querySelectorAll('#test-complete-view .complete-desc-sub');
        if (descSubs.length >= 3) {
            descSubs[0].innerText = "📋 チャット送信用の文言がクリップボードにコピーされました！";
            descSubs[0].style.color = "var(--accent-blue)";
            descSubs[1].style.display = "block";
            descSubs[1].innerText = "チャット欄に貼り付けて（Ctrl+V）送信すると、GMの採点が始まります。";
            descSubs[2].style.display = "block";
            descSubs[2].innerText = "（自動コピーされない場合は、チャット欄に「採点して」と入力して送信してください）";
        }
        
        // クリップボードへ「採点依頼メッセージ」を自動コピー
        if (navigator.clipboard) {
            const copyText = isMeasurement
                ? `${activeTest.param} ${activeTest.target_gate} の実力測定試験を提出しました。採点をお願いします！`
                : `${activeTest.param} ${activeTest.target_gate} の試験を提出しました。採点をお願いします！`;
            navigator.clipboard.writeText(copyText)
                .then(() => console.log('Clipboard copy success'))
                .catch(err => console.error('Clipboard copy failed', err));
        }
        
        // UI完了表示への切り替え
        switchTestView('test-complete-view');
        
        // ステータスの再ロード
        fetchStatusData();
    })
    .catch(err => {
        console.error("提出エラー:", err);
        alert("解答の送信に失敗しました。クラウドデータベースの接続状態を確認してください。");
        if (textarea) textarea.disabled = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "解答を提出する";
        }
    });
}

function abandonTest() {
    const isMeasurement = (activeTest.test_type === 'measurement');
    const confirmMsg = isMeasurement 
        ? "本当に実力測定を諦めますか？" 
        : "本当に試験を諦めますか？チケットは消費され、今回の試験は「不合格（タイムアウト）」扱いとなります。";
    const confirmAbandon = confirm(confirmMsg);
    if (!confirmAbandon) return;
    
    if (testTimerInterval) clearInterval(testTimerInterval);
    
    const updatedData = JSON.parse(JSON.stringify(cachedStatusData));
    
    // チケット消費（ゲート試験の場合のみ、優先度：専用 ➡️ all）
    const param = activeTest.param;
    if (!isMeasurement && updatedData.tickets) {
        if (updatedData.tickets[param] && updatedData.tickets[param] > 0) {
            updatedData.tickets[param]--;
        } else if (updatedData.tickets.all && updatedData.tickets.all > 0) {
            updatedData.tickets.all--;
        }
    }
    
    const elapsed = testStartTime ? Math.floor((Date.now() - testStartTime) / 1000) : 0;
    const elapsedMin = roundNumber(elapsed / 60, 1);
    
    // 履歴追加
    if (!updatedData.history) updatedData.history = [];
    const eventPrefix = isMeasurement ? "Measurement Test Abandoned" : "Exam Abandoned";
    updatedData.history.push({
        "date": getTodayString(),
        "event": `${eventPrefix}: ${activeTest.id} (TIMEOUT in ${elapsedMin}m)`,
        "status_change": {}
    });
    
    // 不合格の保留データ追加
    if (!updatedData.pending_answers) updatedData.pending_answers = [];
    updatedData.pending_answers.push({
        "test_id": activeTest.id,
        "param": activeTest.param,
        "target_gate": activeTest.target_gate,
        "test_type": activeTest.test_type || "gate",
        "answer": isMeasurement ? "[実力測定中止] ユーザーにより測定が自己中断されました。" : "[試験中止] ユーザーにより試験が自己中断されました。",
        "elapsed_seconds": elapsed,
        "timeout": true,
        "submitted_at": new Date().toISOString()
    });
    
    // Firestore へ同期
    saveStatusDataToFirestore(updatedData)
    .then(() => {
        switchTestView('test-select-view');
        fetchStatusData().then(() => {
            loadAvailableTests(); // リスト再描画
        });
    });
}

// Pyodide を用いたブラウザ内 Python コード判定 (WASM)
function judgeTrainingCode() {
    if (!activeTest) return;
    
    const textarea = document.getElementById('test-answer-input');
    const code = textarea ? textarea.value : '';
    
    if (!code.trim()) {
        alert("コードを入力してください！");
        return;
    }
    
    const submitBtn = document.getElementById('test-submit-btn');
    const resultBox = document.getElementById('judge-result-box');
    const resultBody = document.getElementById('judge-status-body');
    const resultHeader = document.getElementById('judge-status-header');
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "判定中...";
    }
    
    if (resultBox) {
        resultBox.style.display = 'block';
        resultHeader.style.color = '#ffd32c';
        resultHeader.innerText = "⚡ JUDGING CODE (Pyodide WASM)...";
        resultBody.style.color = '#ffffff';
        resultBody.innerText = "ブラウザ内Python環境を起動し、テストを実行中...";
    }
    
    // Pyodideのロードとコード実行
    getPyodide()
    .then(async (pyo) => {
        if (resultBody) {
            resultBody.innerText = "Pythonコードを実行中...";
        }
        
        // テスト用のPythonスクリプトを定義
        let testScript = "";
        if (activeTest.id === "TRAIN-STR-01") {
            testScript = `
try:
    assert calculate_damage(150, 50, False) == 100, "計算エラー (通常ダメージ)"
    assert calculate_damage(150, 50, True) == 150, "計算エラー (クリティカルダメージ)"
    assert calculate_damage(50, 100, False) == 1, "計算エラー (攻撃力 < 防御力時の最小ダメージ1)"
    print("SUCCESS")
except AssertionError as ae:
    print(f"FAIL: {str(ae)}")
except Exception as e:
    print(f"ERROR: {str(e)}")
`;
        } else if (activeTest.id === "TRAIN-VIT-01") {
            testScript = `
try:
    assert apply_turn_effects(80, 100, 5, 10) == 75, "計算エラー (通常変化)"
    assert apply_turn_effects(98, 100, 5, 0) == 100, "計算エラー (最大HPクランプ)"
    assert apply_turn_effects(5, 100, 0, 10) == 0, "計算エラー (最小HPクランプ)"
    print("SUCCESS")
except AssertionError as ae:
    print(f"FAIL: {str(ae)}")
except Exception as e:
    print(f"ERROR: {str(e)}")
`;
        } else if (activeTest.id === "TRAIN-INT-01") {
            testScript = `
try:
    assert cast_spell(50, 10, 120) == (40, 12), "計算エラー (通常魔法成功)"
    assert cast_spell(5, 10, 120) == (-1, 0), "計算エラー (MP不足での失敗)"
    print("SUCCESS")
except AssertionError as ae:
    print(f"FAIL: {str(ae)}")
except Exception as e:
    print(f"ERROR: {str(e)}")
`;
        } else if (activeTest.id === "TRAIN-WIS-01") {
            testScript = `
try:
    assert identify_item("赤の薬草") == "回復薬", "識別エラー (赤の薬草)"
    assert identify_item("錆びた鍵") == "重要アイテム", "識別エラー (錆びた鍵)"
    assert identify_item("謎の鉱石") == "未知のオブジェクト", "識別エラー (その他のオブジェクト)"
    print("SUCCESS")
except AssertionError as ae:
    print(f"FAIL: {str(ae)}")
except Exception as e:
    print(f"ERROR: {str(e)}")
`;
        } else if (activeTest.id === "TRAIN-MND-01") {
            testScript = `
try:
    assert absorb_damage(150, 80) == 70, "計算エラー (通常バリア吸収)"
    assert absorb_damage(50, 100) == 0, "計算エラー (バリア超過による被ダメージ0)"
    print("SUCCESS")
except AssertionError as ae:
    print(f"FAIL: {str(ae)}")
except Exception as e:
    print(f"ERROR: {str(e)}")
`;
        } else if (activeTest.id === "TRAIN-CHA-01") {
            testScript = `
try:
    assert negotiate_price(1000, 150) == 850, "計算エラー (15%割引)"
    assert negotiate_price(1000, 400) == 700, "計算エラー (30%最大割引)"
    assert negotiate_price(1000, 0) == 1000, "計算エラー (0%割引)"
    print("SUCCESS")
except AssertionError as ae:
    print(f"FAIL: {str(ae)}")
except Exception as e:
    print(f"ERROR: {str(e)}")
`;
        }

        // 出力キャプチャのセットアップ
        pyo.runPython(`
            import sys
            import io
            sys.stdout = io.StringIO()
            sys.stderr = io.StringIO()
        `);
        
        try {
            // ユーザーコードの非同期実行
            await pyo.runPythonAsync(code);
            
            let passed = false;
            let stdout = "";
            let stderr = "";
            const expectedLines = [
                "1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz",
                "11", "Fizz", "13", "14", "FizzBuzz", "16", "17", "Fizz", "19", "Buzz",
                "Fizz", "22", "23", "Fizz", "Buzz", "26", "Fizz", "28", "29", "FizzBuzz"
            ];

            if (activeTest.id === "TRAIN-DEV-01") {
                stdout = pyo.runPython("sys.stdout.getvalue()");
                stderr = pyo.runPython("sys.stderr.getvalue()");
                
                const actualLines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l);
                passed = JSON.stringify(actualLines) === JSON.stringify(expectedLines);
            } else {
                // テストアサーションコードの実行
                await pyo.runPythonAsync(testScript);
                stdout = pyo.runPython("sys.stdout.getvalue()");
                stderr = pyo.runPython("sys.stderr.getvalue()");
                
                const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l);
                passed = lines.includes("SUCCESS");
            }
            
            if (submitBtn) submitBtn.disabled = false;
            
            if (passed) {
                // 合格処理 ➔ 直接クラウドデータを書き換えてチケット復旧
                if (testTimerInterval) clearInterval(testTimerInterval);
                
                const updatedData = JSON.parse(JSON.stringify(cachedStatusData));
                
                // チケット回復
                if (!updatedData.tickets) updatedData.tickets = { all: 0 };
                updatedData.tickets.all = (updatedData.tickets.all || 0) + 1;
                
                // 履歴追加
                if (!updatedData.history) updatedData.history = [];
                updatedData.history.push({
                    "date": getTodayString(),
                    "event": `Training Passed: ${activeTest.param} Ticket Recovery Mission (Auto Judged)`,
                    "status_change": {}
                });
                
                // Firestore 同期
                saveStatusDataToFirestore(updatedData)
                .then(() => {
                    document.querySelector('#test-complete-view .complete-icon').innerText = "🎉";
                    document.querySelector('#test-complete-view .complete-title').innerText = "追死ミッション合格！";
                    document.querySelector('#test-complete-view .complete-desc').innerText = "テスト判定をパスしました！";
                    
                    const descSubs = document.querySelectorAll('#test-complete-view .complete-desc-sub');
                    if (descSubs.length >= 3) {
                        descSubs[0].innerText = "📋 おめでとうございます！コードがすべてのテストケースを正常にパスしました。";
                        descSubs[0].style.color = "var(--hp-green)";
                        descSubs[1].style.display = "block";
                        descSubs[1].innerText = "測定チケット（all）が1枚回復しました！ステータス画面で確認してください。";
                        descSubs[2].style.display = "none";
                    }
                    
                    switchTestView('test-complete-view');
                    fetchStatusData();
                });
                
            } else {
                // 出力の不一致 (不合格)
                resultHeader.innerText = "❌ JUDGE FAILED (不合格)";
                resultHeader.style.color = "var(--accent-red)";
                resultBody.style.color = "#ff6b81";
                if (submitBtn) submitBtn.innerText = "コードを実行してテスト判定";
                
                let diffText = "";
                if (activeTest.id === "TRAIN-DEV-01") {
                    diffText = "【出力結果の不一致】\n期待される出力と実際の出力が一致しません。\n\n";
                    diffText += `[期待される出力 (1～30のFizzBuzz)]\n${expectedLines.slice(0, 5).join('\n')}...\n\n`;
                    diffText += `[実際の出力]\n${stdout.substring(0, 200) || '(出力なし)'}\n`;
                } else {
                    diffText = "【テストケース不合格】\n定義された関数のテストで失敗が検出されました。\n\n";
                    diffText += `[テスト実行結果]\n${stdout || '(出力なし)'}\n`;
                }
                if (stderr) {
                    diffText += `\n[エラー出力]\n${stderr}\n`;
                }
                resultBody.innerText = diffText;
            }
            
        } catch (pyErr) {
            // 実行時文法エラーやランタイムエラー
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "コードを実行してテスト判定";
            }
            resultHeader.innerText = "❌ JUDGE FAILED (実行エラー)";
            resultHeader.style.color = "var(--accent-red)";
            resultBody.style.color = "#ff6b81";
            resultBody.innerText = `【実行エラー】\n${pyErr.message}`;
        }
    })
    .catch(err => {
        console.error(err);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "コードを実行してテスト判定";
        }
        if (resultBody) {
            resultBody.style.color = "var(--accent-red)";
            resultBody.innerText = "Pyodide WASM のロードまたは実行に失敗しました。";
        }
    });
}

function resetTestTab() {
    switchTestView('test-select-view');
    switchTab('status-tab');
}

function switchTestView(viewId) {
    const views = document.querySelectorAll('.test-view');
    views.forEach(v => v.classList.remove('active'));
    
    const activeView = document.getElementById(viewId);
    if (activeView) activeView.classList.add('active');
}

// ----------------------------------------------------
// 🛠️ タブ・ナビゲーション制御
// ----------------------------------------------------

function switchTab(tabId) {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => {
        content.classList.remove('active');
    });
    
    const targetContent = document.getElementById(tabId);
    if (targetContent) targetContent.classList.add('active');

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = Array.from(buttons).find(btn => 
        (tabId === 'status-tab' && btn.innerText.includes('能力ステータス')) ||
        (tabId === 'achievement-tab' && btn.innerText.includes('実績')) ||
        (tabId === 'quest-tab' && btn.innerText.includes('今月のクエスト')) ||
        (tabId === 'items-tab' && btn.innerText.includes('アイテム')) ||
        (tabId === 'chart-tab' && btn.innerText.includes('レーダーチャート')) ||
        (tabId === 'advisory-tab' && btn.innerText.includes('GMアドバイス')) ||
        (tabId === 'test-tab' && btn.innerText.includes('ゲート試験')) ||
        (tabId === 'daily-log-tab' && btn.innerText.includes('デイリーログ'))
    );
    if (activeBtn) activeBtn.classList.add('active');

    // タブに応じた個別のリロード・トリガー
    if (tabId === 'chart-tab' && statusChart) {
        setTimeout(() => {
            statusChart.resize();
            statusChart.update();
        }, 50);
    } else if (tabId === 'test-tab') {
        loadAvailableTests();
    } else if (tabId === 'quest-tab') {
        renderQuests(cachedStatusData);
    } else if (tabId === 'achievement-tab') {
        renderAchievementsOnly();
    }
}


// ----------------------------------------------------
// 🏆 アチーブメント＆称号カスタマイズモーダル
// ----------------------------------------------------
let currentBuildTitleParts = [];

function openAchievementModal() {
    const modal = document.getElementById('achievement-modal');
    if (!modal) return;
    
    // 一時的なスロットパーツを選択中から読み込む
    if (cachedStatusData) {
        currentBuildTitleParts = [...(cachedStatusData.active_title_parts || [])];
    } else {
        currentBuildTitleParts = [];
    }
    
    modal.style.display = 'flex';
    renderAchievementsAndWords();
}

function closeAchievementModal() {
    const modal = document.getElementById('achievement-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function renderAchievementsOnly() {
    if (!cachedStatusData) return;
    const unlocked = cachedStatusData.unlocked_achievements || [];
    
    fetch('status_achievements.json')
        .then(res => {
            if (!res.ok) throw new Error('実績データの取得失敗');
            return res.json();
        })
        .then(achievements => {
            const badgesContainer = document.getElementById('achievement-badges-container');
            if (badgesContainer) {
                badgesContainer.innerHTML = '';
                
                achievements.forEach(ach => {
                    const isUnlocked = unlocked.includes(ach.id);
                    const icon = isUnlocked ? "🥇" : "🔒";
                    const cardClass = isUnlocked ? "badge-card unlocked" : "badge-card locked";
                    
                    const escapedName = escapeHtml(ach.name);
                    const escapedDesc = escapeHtml(ach.desc);
                    const escapedRewardWords = ach.reward_words.map(w => `「${escapeHtml(w)}」`).join(' ');
                    
                    const rewardWordsText = isUnlocked 
                        ? `<div style="font-size: 0.65rem; color: var(--timer-yellow); font-weight: bold; margin-top: 4px;">🎁 解放単語: ${escapedRewardWords}</div>` 
                        : `<div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 4px;">🎁 報酬: ${escapedRewardWords} (アンロックで解放)</div>`;
                    
                    const badgeHtml = `
                        <div class="${cardClass}" title="${isUnlocked ? '解除済み' : '未解除'}" style="${!isUnlocked ? 'opacity: 0.55; filter: grayscale(60%);' : ''}">
                            <div class="badge-icon" style="font-size: 1.5rem; margin-right: 12px;">${icon}</div>
                            <div class="badge-info">
                                <div class="badge-name" style="font-weight: bold; color: ${isUnlocked ? 'var(--accent-blue)' : '#888'};">${escapedName}</div>
                                <div class="badge-desc" style="font-size: 0.72rem; margin-top: 2px;">${escapedDesc}</div>
                                ${rewardWordsText}
                            </div>
                        </div>
                    `;
                    badgesContainer.insertAdjacentHTML('beforeend', badgeHtml);
                });
            }
        })
        .catch(err => {
            console.error(err);
            const badgesContainer = document.getElementById('achievement-badges-container');
            if (badgesContainer) {
                badgesContainer.innerHTML = '<div class="advisory-item-web warning">実績マスタのロードに失敗しました。</div>';
            }
        });
}

function parseSimpleCondition(cond, status) {
    const parts = cond.split(">=");
    if (parts.length === 2) {
        const param = parts[0].trim();
        const targetVal = parseInt(parts[1].trim(), 10);
        let currentVal = 0;
        if (status[param]) {
            currentVal = typeof status[param] === 'object' ? (status[param].current || 0) : status[param];
        }
        return {
            param: param,
            current: currentVal,
            target: targetVal,
            isCleared: currentVal >= targetVal
        };
    }
    return null;
}

function evaluateConditionJS(conditionStr, status) {
    const orParts = conditionStr.split(" or ");
    let anyOrPassed = false;
    const parsedDetails = [];

    orParts.forEach(op => {
        const andParts = op.split(" and ");
        let allAndPassed = true;
        const andDetails = [];

        andParts.forEach(ap => {
            const detail = parseSimpleCondition(ap, status);
            if (detail) {
                andDetails.push(detail);
                if (!detail.isCleared) {
                    allAndPassed = false;
                }
            }
        });

        parsedDetails.push({
            conditions: andDetails,
            isCleared: allAndPassed
        });

        if (allAndPassed) {
            anyOrPassed = true;
        }
    });

    return {
        isCleared: anyOrPassed,
        details: parsedDetails
    };
}

function renderSystemTitlesOnly() {
    if (!cachedStatusData) return;
    const container = document.getElementById('available-system-titles-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const availableTitles = cachedStatusData.available_system_titles || [];
    const statusObj = cachedStatusData.status || {};
    
    if (availableTitles.length === 0) {
        container.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-secondary); padding: 15px; text-align: center; width: 100%;">現在、挑戦可能な称号はありません。</div>';
        return;
    }
    
    availableTitles.forEach(t => {
        const isGenerated = t.id && t.id.startsWith("TITLE_GEN_");
        const badgeText = isGenerated ? "Procedural AI" : "Official Title";
        const badgeClass = isGenerated ? "system-title-type-badge generated" : "system-title-type-badge";
        
        const escapedName = escapeHtml(t.name);
        const escapedDesc = escapeHtml(t.desc);
        const escapedRewardWords = t.reward_words.map(w => `「${escapeHtml(w)}」`).join(' ');
        
        const condEval = evaluateConditionJS(t.condition || "", statusObj);
        
        let progressHtml = '';
        if (condEval.details && condEval.details.length > 0) {
            const condGroup = condEval.details[0];
            condGroup.conditions.forEach(c => {
                const percent = Math.min(100, Math.floor((c.current / c.target) * 100));
                const isCleared = c.isCleared;
                const statusIcon = isCleared ? "✅" : "❌";
                const statusClass = isCleared ? "param-status cleared" : "param-status";
                
                progressHtml += `
                    <div class="system-title-progress-container">
                        <div class="system-title-progress-text">
                            <span>${c.param} (目標: ${c.target})</span>
                            <span class="${statusClass}">${statusIcon} ${c.current} / ${c.target}</span>
                        </div>
                        <div class="system-title-progress-bar-bg">
                            <div class="system-title-progress-bar-fill ${isCleared ? 'cleared' : ''}" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                `;
            });
        }
        
        const cardHtml = `
            <div class="system-title-card">
                <div class="system-title-header">
                    <div class="system-title-name">${escapedName}</div>
                    <span class="${badgeClass}">${badgeText}</span>
                </div>
                <div class="system-title-desc">${escapedDesc}</div>
                ${progressHtml}
                <div class="system-title-reward-words">
                    <span>🎁 解放単語: ${escapedRewardWords}</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}

function renderAchievementsAndWords() {
    if (!cachedStatusData) return;
    
    const ownedWords = cachedStatusData.title_parts || [];
    
    renderSystemTitlesOnly();
        
    for (let i = 0; i < 4; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        if (slotEl) {
            if (i < currentBuildTitleParts.length) {
                slotEl.innerText = currentBuildTitleParts[i];
                slotEl.className = "title-slot filled";
            } else {
                slotEl.innerText = "(空き)";
                slotEl.className = "title-slot";
            }
        }
    }
    
    const previewEl = document.getElementById('title-preview-text');
    if (previewEl) {
        if (currentBuildTitleParts.length > 0) {
            previewEl.innerText = `『 ${currentBuildTitleParts.join('')} 』`;
        } else {
            previewEl.innerText = "(称号未設定)";
        }
    }
    
    const wordsContainer = document.getElementById('available-words-list');
    if (wordsContainer) {
        wordsContainer.innerHTML = '';
        
        if (ownedWords.length === 0) {
            wordsContainer.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-secondary); padding: 8px;">所持単語パーツはありません。</div>';
            return;
        }
        
        ownedWords.forEach(word => {
            const isUsed = currentBuildTitleParts.includes(word);
            const chipClass = isUsed ? "word-chip used" : "word-chip";
            const escapedWord = escapeHtml(word);
            
            const chipHtml = `<span class="${chipClass}" onclick="${isUsed ? '' : `selectPart(this.textContent)`}">${escapedWord}</span>`;
            wordsContainer.insertAdjacentHTML('beforeend', chipHtml);
        });
    }
}

function selectPart(word) {
    if (currentBuildTitleParts.length >= 4) {
        alert("称号に設定できる単語は最大4つまでです。");
        return;
    }
    if (currentBuildTitleParts.includes(word)) {
        return;
    }
    currentBuildTitleParts.push(word);
    renderAchievementsAndWords();
}

function removePartFromSlot(slotIdx) {
    if (slotIdx < currentBuildTitleParts.length) {
        currentBuildTitleParts.splice(slotIdx, 1);
        renderAchievementsAndWords();
    }
}

function clearCustomTitle() {
    currentBuildTitleParts = [];
    renderAchievementsAndWords();
}

function saveCustomTitle() {
    if (!cachedStatusData) return;
    
    const customTitle = currentBuildTitleParts.join('');
    
    const updatedData = JSON.parse(JSON.stringify(cachedStatusData));
    updatedData.custom_title = customTitle;
    updatedData.active_title_parts = [...currentBuildTitleParts];
    
    // titles.active の更新 (表示上の一貫性維持)
    if (customTitle) {
        updatedData.titles = updatedData.titles || { active: [] };
        updatedData.titles.active = [customTitle];
    } else {
        updatedData.titles = updatedData.titles || { active: [] };
        updatedData.titles.active = [];
    }
    
    // 保存ボタンを一時的に無効化
    const saveBtn = document.querySelector('.modal-footer .btn-primary');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "保存中...";
    }
    
    saveStatusDataToFirestore(updatedData)
    .then(() => {
        closeAchievementModal();
        fetchStatusData().then(() => {
            const activeTitle = customTitle || "称号無し";
            // クリップボードへ依頼文を自動コピー
            if (navigator.clipboard) {
                const copyText = `自作称号『${activeTitle}』に合わせてアバターを更新してください！`;
                navigator.clipboard.writeText(copyText)
                    .then(() => {
                        alert(`オリジナル称号「${activeTitle}」を設定しました！\nアバター再生成の依頼テキストをクリップボードに自動コピーしました。チャットに貼り付けて送信してください。`);
                    })
                    .catch(err => {
                        console.error('Clipboard copy failed', err);
                        alert(`オリジナル称号「${activeTitle}」を設定しました！`);
                    });
            } else {
                alert(`オリジナル称号「${activeTitle} animate」を設定しました！`);
            }
        });
    })
    .catch(err => {
        console.error("称号の保存エラー:", err);
        alert("称号の保存に失敗しました。クラウドデータベースの接続状態を確認してください。");
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "この称号を名乗る";
        }
    });
}

// ----------------------------------------------------
// 👥 マルチユーザー管理ロジック
// ----------------------------------------------------

async function loadUserList() {
    try {
        const res = await fetch('/api/users');
        if (res.ok) {
            const data = await res.json();
            if (data && data.users) {
                userList = data.users;
            }
        }
    } catch (e) {
        console.log("Local API /api/users is not available, using localStorage/defaults.");
    }
    
    // localStorage からもマージ
    const localUsers = JSON.parse(safeGetItem('rpg_user_list', '[]'));
    localUsers.forEach(u => {
        if (!userList.includes(u)) {
            userList.push(u);
        }
    });
    
    renderUserSelector();
}

function renderUserSelector() {
    const selector = document.getElementById('user-selector');
    if (!selector) return;
    
    selector.innerHTML = '';
    userList.forEach(userId => {
        const option = document.createElement('option');
        option.value = userId;
        option.innerText = userId;
        if (userId === currentUserId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

function switchUser(userId) {
    if (!userId || userId === currentUserId) return;
    
    currentUserId = userId;
    safeSetItem('rpg_user_id', currentUserId);
    userDocRef = db.collection('users').doc(currentUserId);
    
    // UIをロード
    fetchStatusData().then(() => {
        // レーダーチャートのリサイズとアップデート
        if (statusChart) {
            statusChart.resize();
            statusChart.update();
        }
        // テストリストの再描画
        loadAvailableTests();
    });
}

function openUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('new-user-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function closeUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function createNewUser() {
    const input = document.getElementById('new-user-input');
    if (!input) return;
    
    const newUserId = input.value.trim();
    if (!newUserId) {
        alert("冒険者IDを入力してください！");
        return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(newUserId)) {
        alert("IDに使用できるのは半角英数字、アンダースコア（_）、ハイフン（-）のみです。");
        return;
    }
    
    if (userList.includes(newUserId)) {
        alert("このIDは既に存在しています。");
        return;
    }
    
    // 初期データの作成
    const initialData = {
        "build_score": "Novice Adventurer",
        "combat_power": 700,
        "last_updated": new Date().toISOString(),
        "status": {
            "HP": {"current": 100, "max": 100},
            "STR": {"current": 100, "peak": 100},
            "VIT": {"current": 100, "peak": 100},
            "INT": {"current": 100, "peak": 100},
            "WIS": {"current": 100, "peak": 100},
            "MND": {"current": 100, "peak": 100},
            "CHA": {"current": 100, "peak": 100},
            "DEV": {"current": 100, "peak": 100}
        },
        "training": {
            "STR": 0, "VIT": 0, "INT": 0, "WIS": 0, "MND": 0, "CHA": 0, "DEV": 0
        },
        "tickets": {
            "all": 0, "STR": 0, "VIT": 0, "INT": 0, "WIS": 0, "MND": 0, "CHA": 0, "DEV": 0
        },
        "titles": {
            "active": ["目覚めし人"],
            "list": ["目覚めし人"]
        },
        "active_title_parts": ["目覚めし人"],
        "title_parts": ["目覚めし人", "の"],
        "unlocked_achievements": ["ACH_FIRST_STEP"],
        "archetypes": ["Adventurer"],
        "active_archetype": "Novice",
        "history": [
            {
                "date": getTodayString(),
                "event": "Character Created: Adventurer Registration Completed",
                "status_change": {}
            }
        ],
        "pending_answers": []
    };
    
    const saveBtn = document.querySelector('#user-modal .btn-primary');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "登録中...";
    }
    
    // Firestore上に初期化データをセット
    db.collection('users').doc(newUserId).set({
        status_json: JSON.stringify(initialData)
    })
    .then(() => {
        alert(`新しい冒険者「${newUserId}」を登録しました！`);
        
        // ユーザーリストの更新
        userList.push(newUserId);
        
        // localStorageに保存
        const localUsers = JSON.parse(safeGetItem('rpg_user_list', '[]'));
        if (!localUsers.includes(newUserId)) {
            localUsers.push(newUserId);
            safeSetItem('rpg_user_list', JSON.stringify(localUsers));
        }
        
        // ドロップダウン再構築
        renderUserSelector();
        
        // ユーザー切り替え
        currentUserId = newUserId;
        safeSetItem('rpg_user_id', currentUserId);
        userDocRef = db.collection('users').doc(currentUserId);
        
        // UIのロード
        fetchStatusData().then(() => {
            // テストリストの再描画
            loadAvailableTests();
        });
        
        closeUserModal();
    })
    .catch(err => {
        console.error("新規ユーザー登録エラー:", err);
        alert("新規ユーザーの登録に失敗しました。クラウドデータベースの接続状態を確認してください。");
    })
    .finally(() => {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "冒険を開始する";
        }
    });
}

function renderQuests(data) {
    const container = document.getElementById('quests-container');
    const pctText = document.getElementById('quest-completion-pct');
    const progressBar = document.getElementById('quest-progress-bar');
    if (!container) return;
    
    container.innerHTML = '';
    
    const quests = data.quests || [];
    if (quests.length === 0) {
        container.innerHTML = '<div class="advisory-item-web">今月の目標（クエスト）が設定されていません。</div>';
        if (pctText) pctText.innerText = "0% (0/0)";
        if (progressBar) progressBar.style.width = "0%";
        return;
    }
    
    let completedCount = 0;
    
    // クエストを期限（due: today->week->month）と重み（weight: heavy->medium->light）でソート
    // 完了クエストはすべて下部に集める
    const sortedQuests = [...quests].sort((a, b) => {
        const aCompleted = a.status === 'completed' ? 1 : 0;
        const bCompleted = b.status === 'completed' ? 1 : 0;
        
        if (aCompleted !== bCompleted) {
            return aCompleted - bCompleted; // 未完了が先
        }
        
        // 未完了同士のソート
        if (aCompleted === 0) {
            const dueOrder = { "today": 0, "this_week": 1, "this_month": 2 };
            const weightOrder = { "heavy": 0, "medium": 1, "light": 2 };
            
            const aDue = dueOrder[a.due] !== undefined ? dueOrder[a.due] : 2;
            const bDue = dueOrder[b.due] !== undefined ? dueOrder[b.due] : 2;
            
            if (aDue !== bDue) {
                return aDue - bDue; // 今日 ➔ 今週 ➔ 今月
            }
            
            const aWeight = weightOrder[a.weight] !== undefined ? weightOrder[a.weight] : 2;
            const bWeight = weightOrder[b.weight] !== undefined ? weightOrder[b.weight] : 2;
            
            return aWeight - bWeight; // 重い ➔ 中 ➔ 軽い
        }
        return 0;
    });
    
    sortedQuests.forEach(q => {
        const isCompleted = q.status === 'completed';
        if (isCompleted) {
            completedCount++;
        }
        
        const clientText = escapeHtml(q.client || "冒険者ギルド");
        const rewardText = escapeHtml(q.reward || "EXP +100");
        const escapedTitle = escapeHtml(q.title || "");
        const escapedDesc = q.description ? escapeHtml(q.description) : "";
        const escapedStep = escapeHtml(q.step || "");
        
        // 期限と重みのバッジHTML
        const dueVal = q.due || "this_month";
        const weightVal = q.weight || "light";
        const dueNames = { "today": "今日", "this_week": "今週", "this_month": "今月" };
        const weightNames = { "heavy": "重い", "medium": "中", "light": "軽い" };
        
        const dueBadge = `<span class="quest-badge badge-due-${dueVal}">${dueNames[dueVal]}</span>`;
        const weightBadge = `<span class="quest-badge badge-weight-${weightVal}">${weightNames[weightVal]}</span>`;
        
        const questHtml = `
            <div class="quest-card ${isCompleted ? 'completed' : ''}">
                <div class="quest-card-header">
                    <span class="quest-card-client">FROM: ${clientText}</span>
                    <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                        ${dueBadge}
                        ${weightBadge}
                        <span class="quest-card-rank">${escapedStep}</span>
                    </div>
                </div>
                <div class="quest-card-title">${escapedTitle}</div>
                ${escapedDesc ? `<div class="quest-card-desc">${escapedDesc}</div>` : ''}
                <div class="quest-card-footer">
                    <div class="quest-card-reward">REWARD: ${rewardText}</div>
                    <div style="font-family: 'Outfit', sans-serif; font-weight: bold; color: ${isCompleted ? '#ab2c16' : '#70542d'};">
                        ${isCompleted ? '● CLEAR' : '● ACTIVE'}
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', questHtml);
    });
    
    const totalCount = quests.length;
    const pct = Math.round((completedCount / totalCount) * 100);
    
    if (pctText) {
        pctText.innerText = `${pct}% (${completedCount}/${totalCount})`;
    }
    if (progressBar) {
        progressBar.style.width = `${pct}%`;
        if (pct === 100) {
            progressBar.style.background = "linear-gradient(90deg, #2ed573, #2ed573)";
            progressBar.style.boxShadow = "0 0 10px #2ed573";
        } else {
            progressBar.style.background = "linear-gradient(90deg, #00d2ff, #00d2ff)";
            progressBar.style.boxShadow = "0 0 10px #00d2ff";
        }
    }
}

function renderHistory(data) {
    const container = document.getElementById('history-container');
    if (!container) return;
    container.innerHTML = '';
    
    const history = data.history || [];
    if (history.length === 0) {
        container.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-secondary); text-align: center; padding: 10px;">活動履歴がありません。</div>';
        return;
    }
    
    // 直近20件を逆順（最新が上）で表示
    const recentHistory = [...history].reverse().slice(0, 20);
    
    recentHistory.forEach(h => {
        const dateStr = escapeHtml(h.date || "");
        let eventStr = escapeHtml(h.event || "");
        const summaryStr = h.summary ? escapeHtml(h.summary) : "";
        
        // 内訳（根拠）のパースと整形表示
        let detailHtml = '';
        if (h.status_change_detail && Object.keys(h.status_change_detail).length > 0) {
            const details = [];
            Object.keys(h.status_change_detail).forEach(param => {
                const subDetails = [];
                const subObj = h.status_change_detail[param];
                if (typeof subObj === 'object') {
                    Object.keys(subObj).forEach(reason => {
                        const val = subObj[reason];
                        subDetails.push(`${reason}+${val}`);
                    });
                }
                if (subDetails.length > 0) {
                    details.push(`${param} (${subDetails.join(', ')})`);
                }
            });
            if (details.length > 0) {
                detailHtml = `<div class="history-detail-badge" style="font-size: 0.65rem; color: var(--accent-blue); background: rgba(0, 210, 255, 0.08); border: 1px solid rgba(0, 210, 255, 0.2); border-radius: 4px; padding: 2px 6px; display: inline-block; margin-top: 4px; font-family: 'Outfit', 'Noto Sans JP', sans-serif;">根拠: ${escapeHtml(details.join(' | '))}</div>`;
            }
        }
        
        const historyItemHtml = `
            <div class="history-item" style="background: rgba(255, 255, 255, 0.015); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 6px; padding: 8px 12px; font-size: 0.75rem; display: flex; flex-direction: column; gap: 2px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <span style="font-family: 'Outfit', sans-serif; font-weight: bold; color: var(--text-secondary); white-space: nowrap;">${dateStr}</span>
                    <span style="font-family: 'Outfit', sans-serif; color: #fff; font-weight: 600; text-align: right; word-break: break-all;">${eventStr}</span>
                </div>
                ${summaryStr ? `<div style="color: var(--text-secondary); line-height: 1.4; margin-top: 2px; font-family: 'Noto Sans JP', sans-serif; word-break: break-all;">${summaryStr}</div>` : ''}
                ${detailHtml}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', historyItemHtml);
    });
}

// ----------------------------------------------------
// ⚙️ 転職（クラスチェンジ）システム
// ----------------------------------------------------
const archetypeDefinitions = [
    {
        id: "Novice",
        name: "ノービス",
        desc: "冒険にも出てないひよっこ。初期解放の基本職業。",
        checkUnlock: (status) => true,
        condDesc: "なし (初期解放)"
    },
    {
        id: "Adventurer",
        name: "冒険者",
        desc: "旅慣れた標準的な冒険者。",
        checkUnlock: (status) => {
            const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
            return params.some(p => (status[p]?.current || 0) >= 200);
        },
        condDesc: "いずれか1つのステータスが200以上"
    },
    {
        id: "Warrior",
        name: "戦士",
        desc: "剣と革鎧を装備した物理アタッカー。",
        checkUnlock: (status) => (status.STR?.current || 0) >= 300,
        condDesc: "STR >= 300"
    },
    {
        id: "Scholar",
        name: "学者",
        desc: "魔導書とインテリな眼鏡・ローブ姿。",
        checkUnlock: (status) => (status.WIS?.current || 0) >= 300,
        condDesc: "WIS >= 300"
    },
    {
        id: "Mage",
        name: "魔導士",
        desc: "魔導杖と三角帽子を被った魔法使い。",
        checkUnlock: (status) => (status.INT?.current || 0) >= 300,
        condDesc: "INT >= 300"
    },
    {
        id: "Priest",
        name: "僧侶",
        desc: "十字架付きの聖杖と白ベースの聖衣。",
        checkUnlock: (status) => (status.MND?.current || 0) >= 300,
        condDesc: "MND >= 300"
    },
    {
        id: "Bard",
        name: "吟遊詩人",
        desc: "竪琴（リラ）を抱え、軽装の詩人衣装。",
        checkUnlock: (status) => (status.CHA?.current || 0) >= 300,
        condDesc: "CHA >= 300"
    },
    {
        id: "Maker",
        name: "製作者",
        desc: "手に工具やデバイスを持ち、モノづくりを始めた開発者。",
        checkUnlock: (status) => (status.DEV?.current || 0) >= 300,
        condDesc: "DEV >= 300"
    },
    {
        id: "Knight",
        name: "騎士",
        desc: "盾と全身金属鎧を身にまとった重装騎士。",
        checkUnlock: (status) => (status.STR?.current || 0) >= 380 && (status.VIT?.current || 0) >= 380,
        condDesc: "STR >= 380 かつ VIT >= 380"
    },
    {
        id: "Paladin",
        name: "聖騎士",
        desc: "白銀の鎧と大剣を装備した神聖戦士。",
        checkUnlock: (status) => (status.STR?.current || 0) >= 380 && (status.MND?.current || 0) >= 380,
        condDesc: "STR >= 380 かつ MND >= 380"
    },
    {
        id: "Sage",
        name: "賢者",
        desc: "幾多の真理を極めた、光り輝く高位の魔導衣。",
        checkUnlock: (status) => (status.INT?.current || 0) >= 380 && (status.WIS?.current || 0) >= 380,
        condDesc: "INT >= 380 かつ WIS >= 380"
    },
    {
        id: "Engineer",
        name: "魔導技師",
        desc: "ゴーグルを掛け、歯車ツールを持った上級技師。",
        checkUnlock: (status) => (status.DEV?.current || 0) >= 380 && (status.INT?.current || 0) >= 380,
        condDesc: "DEV >= 380 かつ INT >= 380"
    },
    {
        id: "GrandMaster",
        name: "グランドマスター",
        desc: "洗練された豪華なローブと威風堂々とした佇まい。",
        checkUnlock: (status) => {
            const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
            const over400Count = params.filter(p => (status[p]?.current || 0) >= 400).length;
            return over400Count >= 3;
        },
        condDesc: "いずれか3つのステータスが400以上"
    }
];

function openArchetypeModal() {
    const modal = document.getElementById('archetype-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    renderArchetypesList();
}

function closeArchetypeModal() {
    const modal = document.getElementById('archetype-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function renderArchetypesList() {
    if (!cachedStatusData) return;
    
    const container = document.getElementById('archetypes-list-container');
    if (!container) return;
    container.innerHTML = '';
    
    const status = cachedStatusData.status || {};
    const currentArchetype = cachedStatusData.active_archetype || "Novice";
    
    archetypeDefinitions.forEach(arch => {
        const isUnlocked = arch.checkUnlock(status);
        const isActive = arch.id === currentArchetype;
        
        let cardClass = "archetype-card";
        if (isActive) cardClass += " active";
        if (!isUnlocked) cardClass += " locked";
        
        const escapedId = escapeHtml(arch.id);
        const escapedName = escapeHtml(arch.name);
        const escapedDesc = escapeHtml(arch.desc);
        const escapedCondDesc = escapeHtml(arch.condDesc);

        const buttonHtml = isActive
            ? `<button class="btn btn-primary" disabled style="background: rgba(46, 213, 115, 0.2); border-color: #2ed573; color: #2ed573; cursor: default;">装備中</button>`
            : isUnlocked
                ? `<button class="btn btn-primary" onclick="changeArchetype('${escapedId}')">転職する</button>`
                : `<button class="btn btn-primary" disabled style="background: #3a3b3c; border-color: transparent; cursor: not-allowed; color: rgba(255,255,255,0.3);">未解放</button>`;
                
        const cardHtml = `
            <div class="${cardClass}">
                <div class="archetype-icon">${isActive ? "✨" : isUnlocked ? "🔓" : "🔒"}</div>
                <div class="archetype-info">
                    <div class="archetype-name">${escapedName} <span class="archetype-id-tag">(${escapedId})</span></div>
                    <div class="archetype-desc">${escapedDesc}</div>
                    <div class="archetype-cond">条件: <span class="${isUnlocked ? 'cond-ok' : 'cond-fail'}">${escapedCondDesc}</span></div>
                </div>
                <div class="archetype-action">
                    ${buttonHtml}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}

function changeArchetype(archetypeId) {
    if (!cachedStatusData) return;
    
    const status = cachedStatusData.status || {};
    const archDef = archetypeDefinitions.find(a => a.id === archetypeId);
    if (!archDef) return;
    
    if (!archDef.checkUnlock(status)) {
        alert("解放条件を満たしていないため、転職できません。");
        return;
    }
    
    const updatedData = JSON.parse(JSON.stringify(cachedStatusData));
    updatedData.active_archetype = archetypeId;
    // 互換性のため archetypes 配列も更新
    updatedData.archetypes = [archetypeId];
    
    // 履歴追加
    if (!updatedData.history) updatedData.history = [];
    updatedData.history.push({
        "date": getTodayString(),
        "event": `Class Changed: Transformed into ${archDef.name} (${archetypeId})`,
        "status_change": {}
    });
    
    // 保存ボタンを一時的に無効化
    const saveBtn = document.querySelector('#archetypes-list-container .archetype-card.active button');
    
    saveStatusDataToFirestore(updatedData)
    .then(() => {
        alert(`${archDef.name} に転職しました！`);
        closeArchetypeModal();
        fetchStatusData();
    })
    .catch(err => {
        console.error("転職エラー:", err);
        alert("転職に失敗しました。クラウドデータベースの接続状態を確認してください。");
    });
}

// ----------------------------------------------------
// ✍️ デイリーログ自動査定・一撃インポートシステム
// ----------------------------------------------------
let lastEvaluatedLog = null;

function evaluateDailyLog(text, conditionVal, moodVal) {
    const changes = {
        STR: 0, VIT: 0, INT: 0, WIS: 0, MND: 0, CHA: 0, DEV: 0
    };
    const details = {
        STR: {}, VIT: {}, INT: {}, WIS: {}, MND: {}, CHA: {}, DEV: {}
    };
    
    const t = text.toLowerCase();
    
    // 1. DEV (開発)
    const devKeywords = ["開発", "実装", "プログラミング", "コード", "デバッグ", "テスト", "自動化", "プログラム", "設計", "wasm", "pyodide", "スクリプト", "git", "github", "インポート", "マージ", "バグ", "修正"];
    let hasDev = devKeywords.some(k => t.includes(k));
    if (hasDev) {
        changes.DEV = 5;
        details.DEV["実装・検証"] = 4;
        details.DEV["継続ボーナス"] = 1;
    }
    
    // 2. STR & VIT (身体)
    const physicalKeywords = ["筋トレ", "歩く", "徒歩", "ウォーキング", "散歩", "走る", "ランニング", "運動", "ストレッチ", "腕立て", "腹筋", "スクワット", "cpap", "シーパップ", "睡眠"];
    let hasPhys = physicalKeywords.some(k => t.includes(k));
    if (hasPhys) {
        changes.STR = 2;
        details.STR["運動鍛錬"] = 2;
        changes.VIT = 3;
        details.VIT["日常メンテナンス"] = 3;
    }
    
    // 3. INT & WIS (知能・知識)
    const intelKeywords = ["本", "読書", "読む", "勉強", "学習", "調べる", "思考", "分析", "ロードマップ", "本棚", "技術書", "就業規則", "規定", "リスク"];
    let hasIntel = intelKeywords.some(k => t.includes(k));
    if (hasIntel) {
        changes.INT = 2;
        details.INT["論理思考"] = 2;
        changes.WIS = 3;
        details.WIS["知識蓄積"] = 3;
    }
    
    // 4. MND (自己規律・損切りなど)
    const mndKeywords = ["瞑想", "損切り", "精神", "感情", "規律", "撤退基準", "冷静", "マインド", "分散基準", "セーフティ", "ルール"];
    let hasMnd = mndKeywords.some(k => t.includes(k));
    if (hasMnd) {
        changes.MND = 3;
        details.MND["自己統制規律"] = 3;
    }
    
    // 5. CHA (コミュニケーション・信頼)
    const chaKeywords = ["妻", "話した", "対話", "コミュニケーション", "家族", "相談", "感謝", "夫婦", "会話", "面談", "ミーティング"];
    let hasCha = chaKeywords.some(k => t.includes(k));
    if (hasCha) {
        changes.CHA = 4;
        details.CHA["信頼関係形成"] = 3;
        details.CHA["家庭円満結界"] = 1;
    }
    
    // 6. 気分(mood)による MND ボーナス
    const moodNum = parseInt(moodVal);
    if (moodNum === 5) {
        changes.MND += 2;
        details.MND["最高気分ボーナス"] = 2;
    } else if (moodNum === 4) {
        changes.MND += 1;
        details.MND["前向き気分ボーナス"] = 1;
    }
    
    // 7. 体調(condition)による HP 回復量
    const condNum = parseInt(conditionVal);
    let hpRecover = 0;
    if (condNum === 5) hpRecover = 50;
    else if (condNum === 4) hpRecover = 30;
    else if (condNum === 3) hpRecover = 15;
    else if (condNum === 2) hpRecover = 5;
    else if (condNum === 1) hpRecover = 0;
    
    return {
        changes,
        details,
        hpRecover
    };
}

function triggerDailyLogEvaluation() {
    const workText = document.getElementById('daily-log-work').value.trim();
    const condition = document.getElementById('daily-log-condition').value;
    const mood = document.getElementById('daily-log-mood').value;
    const nextAction = document.getElementById('daily-log-next').value.trim();
    
    if (!workText) {
        alert("「今日やったこと」を入力してください。");
        return;
    }
    
    // HPデバフ倍率の計算
    const hp = cachedStatusData.status.HP || { current: 100, max: 100 };
    const hpPct = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    let multiplier = 1.0;
    let debuffText = "";
    if (hpPct < 40) {
        multiplier = 0.5;
        debuffText = "【HP低下デバフ -50% 適用】";
    } else if (hpPct < 80) {
        multiplier = 0.8;
        debuffText = "【HP低下デバフ -20% 適用】";
    }
    
    // 簡易査定の実行
    const result = evaluateDailyLog(workText, condition, mood);
    lastEvaluatedLog = result;
    
    // UI の構築 (獲得ポイントと根拠)
    const reasonsContainer = document.getElementById('preview-reasons-container');
    reasonsContainer.innerHTML = '';
    
    // デバフ適用中なら警告表示を挿入
    if (multiplier < 1.0) {
        const warningColor = hpPct < 40 ? "var(--accent-red)" : "var(--timer-yellow)";
        reasonsContainer.insertAdjacentHTML('beforeend', `
            <div style="font-size: 0.75rem; color: ${warningColor}; font-weight: bold; text-align: center; border: 1px solid ${warningColor}; background: rgba(255, 71, 87, 0.05); padding: 6px; border-radius: 4px; margin-bottom: 8px;">
                ⚠️ ${debuffText}<br>HPが低いため、獲得努力値が減衰しています。
            </div>
        `);
    }
    
    let hasAnyPoints = false;
    const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
    
    params.forEach(p => {
        // デバフを適用した最終値を計算（端数切り捨て）
        const val = Math.floor(result.changes[p] * multiplier);
        
        // インプット入力欄の値を初期設定
        const adjustInput = document.getElementById(`adjust-${p}`);
        if (adjustInput) adjustInput.value = val;
        
        if (val > 0) {
            hasAnyPoints = true;
            const sub = [];
            Object.keys(result.details[p]).forEach(k => {
                const originalVal = result.details[p][k];
                const debuffedVal = Math.floor(originalVal * multiplier);
                sub.push(`${k}+${debuffedVal}`);
            });
            const subStr = sub.length > 0 ? ` (${sub.join(', ')})` : '';
            reasonsContainer.insertAdjacentHTML('beforeend', `
                <div style="font-size: 0.75rem; color: #fff; display: flex; justify-content: space-between;">
                    <span>● ${p} 努力値</span>
                    <span style="font-weight: bold; color: var(--accent-blue);">+${val}${subStr}</span>
                </div>
            `);
        }
    });
    
    // HP回復量の表示
    const hpAdjustInput = document.getElementById('adjust-HP-recover');
    if (hpAdjustInput) hpAdjustInput.value = result.hpRecover;
    
    if (result.hpRecover > 0) {
        reasonsContainer.insertAdjacentHTML('beforeend', `
            <div style="font-size: 0.75rem; color: #fff; display: flex; justify-content: space-between; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 4px; margin-top: 4px;">
                <span>● ❤️ HP回復量 (体調ボーナス)</span>
                <span style="font-weight: bold; color: var(--hp-green);">+${result.hpRecover} HP</span>
            </div>
        `);
    }
    
    if (!hasAnyPoints && result.hpRecover === 0) {
        reasonsContainer.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-secondary); text-align: center;">獲得努力値・回復はありません。</div>';
    }
    
    // 明日の一手のプレビュー
    if (nextAction) {
        reasonsContainer.insertAdjacentHTML('beforeend', `
            <div style="font-size: 0.75rem; color: #fff; display: flex; flex-direction: column; gap: 2px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 4px; margin-top: 4px;">
                <span style="color: var(--accent-blue); font-weight: bold;">🎯 明日の一手 (最優先クエストの自動生成)</span>
                <span style="color: var(--text-secondary); line-height: 1.3; padding-left: 10px;">「【明日の一手】${escapeHtml(nextAction)}」</span>
            </div>
        `);
    }
    
    // モーダルを開く
    document.getElementById('daily-log-preview-modal').style.display = 'flex';
}

function closeDailyLogPreviewModal() {
    document.getElementById('daily-log-preview-modal').style.display = 'none';
}

function submitDailyLogImport() {
    if (!cachedStatusData) return;
    
    const workText = document.getElementById('daily-log-work').value.trim();
    const nextAction = document.getElementById('daily-log-next').value.trim();
    
    // 手動調整された値を取得
    const params = ["STR", "VIT", "INT", "WIS", "MND", "CHA", "DEV"];
    const finalChanges = {};
    const finalDetails = {};
    
    // HPデバフ倍率の計算 (履歴表記用および内訳の計算用)
    const hp = cachedStatusData.status.HP || { current: 100, max: 100 };
    const hpPct = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    let debuffText = "";
    let multiplier = 1.0;
    if (hpPct < 40) {
        debuffText = " [HP Debuff -50% applied]";
        multiplier = 0.5;
    } else if (hpPct < 80) {
        debuffText = " [HP Debuff -20% applied]";
        multiplier = 0.8;
    }
    
    let dailyPointsTotal = 0;
    params.forEach(p => {
        const val = parseInt(document.getElementById(`adjust-${p}`).value) || 0;
        finalChanges[p] = val;
        dailyPointsTotal += val;
        
        // 内訳の再構築 (デバフ後値と比較)
        const expectedVal = Math.floor((lastEvaluatedLog ? lastEvaluatedLog.changes[p] : 0) * multiplier);
        if (lastEvaluatedLog && val === expectedVal) {
            // 内訳の各理由の値もデバフをかけたものに書き換える
            finalDetails[p] = {};
            Object.keys(lastEvaluatedLog.details[p]).forEach(reason => {
                finalDetails[p][reason] = Math.floor(lastEvaluatedLog.details[p][reason] * multiplier);
            });
        } else if (val > 0) {
            finalDetails[p] = { "手動調整": val };
        } else {
            finalDetails[p] = {};
        }
    });
    
    const hpRecover = parseInt(document.getElementById('adjust-HP-recover').value) || 0;
    
    // クローンの作成
    const updatedData = JSON.parse(JSON.stringify(cachedStatusData));
    
    // 1. 努力値の加算
    params.forEach(p => {
        updatedData.training[p] = (updatedData.training[p] || 0) + finalChanges[p];
    });
    
    // 2. HP回復
    const updatedHp = updatedData.status.HP || { current: 100, max: 100 };
    const oldHp = updatedHp.current;
    updatedHp.current = Math.min(updatedHp.max, updatedHp.current + hpRecover);
    const actualRecovered = updatedHp.current - oldHp;
    
    // 3. 履歴追加
    const today = getTodayString();
    
    // 重複した日付かチェックして reflected_dates に追加
    if (!updatedData.reflected_dates) updatedData.reflected_dates = [];
    if (!updatedData.reflected_dates.includes(today)) {
        updatedData.reflected_dates.push(today);
    }
    
    const pts = [];
    params.forEach(p => {
        if (finalChanges[p] > 0) pts.push(`${p}+${finalChanges[p]}`);
    });
    const ptsStr = pts.length > 0 ? pts.join(', ') : 'なし';
    
    const eventText = `Daily Log Reflected: ${today} (${ptsStr})${debuffText}`;
    
    if (!updatedData.history) updatedData.history = [];
    updatedData.history.push({
        "date": today,
        "event": eventText,
        "status_change": finalChanges,
        "status_change_detail": finalDetails,
        "summary": `【今日やったこと】${workText}`
    });
    
    // HP回復履歴の追加
    if (actualRecovered > 0) {
        updatedData.history.push({
            "date": today,
            "event": `HP Recovered: +${actualRecovered} HP (Condition Recovery)`,
            "status_change": {}
        });
    }
    
    // 4. 明日の一手の自動クエスト生成
    if (nextAction) {
        if (!updatedData.quests) updatedData.quests = [];
        updatedData.quests.push({
            "step": "Rank B",
            "title": `【明日の一手】${nextAction}`,
            "description": "デイリー簡易ログより自動生成された最優先任務。",
            "client": "自分自身",
            "reward": "MND +5",
            "original_title": `【明日の一手】${nextAction}`,
            "status": "pending",
            "due": "today",
            "weight": "heavy"
        });
    }
    
    // 各ステータスの100ポイント毎チケット回復判定 (status.py 1308行相当のJS移植)
    params.forEach(p => {
        const oldVal = cachedStatusData.training[p] || 0;
        const newVal = updatedData.training[p] || 0;
        const oldTickets = Math.floor(oldVal / 100);
        const newTickets = Math.floor(newVal / 100);
        const earned = newTickets - oldTickets;
        if (earned > 0) {
            if (!updatedData.tickets) updatedData.tickets = {};
            updatedData.tickets[p] = (updatedData.tickets[p] || 0) + earned;
            updatedData.history.push({
                "date": today,
                "event": `Measurement Ticket (${p}) Obtained by Training Points (Accumulated: ${newVal}pts)`,
                "status_change": {}
            });
        }
    });
    
    // 5. 保存と同期
    const importBtn = document.getElementById('preview-import-btn');
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerText = "同期中...";
    }
    
    saveStatusDataToFirestore(updatedData)
    .then(() => {
        alert("デイリーログのインポートと一撃同期が成功しました！");
        closeDailyLogPreviewModal();
        
        // フォームのリセット
        document.getElementById('daily-log-work').value = '';
        document.getElementById('daily-log-next').value = '';
        document.getElementById('daily-log-condition').value = '3';
        document.getElementById('daily-log-mood').value = '3';
        
        // UIロード
        fetchStatusData().then(() => {
            // ステータスタブに切り替える
            switchTab('status-tab');
        });
    })
    .catch(err => {
        console.error("デイリーログ同期エラー:", err);
        alert("クラウドデータベースへの同期に失敗しました。オフライン状態か接続を確認してください。");
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerText = "確定してインポート (一撃同期)";
        }
    });
}


