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
let currentUserId = localStorage.getItem('rpg_user_id') || 'HG_pencil';
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
        
        // 新規ユーザー時のドキュメント自動生成チェック
        initializeUserDocumentIfNotExist(user.uid).then(() => {
            // ステータスデータのロード
            fetchStatusData();
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

// 楽観的ロックを用いたFirestore保存処理
function saveStatusDataToFirestore(updatedData) {
    if (!updatedData) return Promise.reject("データがありません");
    
    if (!originalBaseData && cachedStatusData) {
        originalBaseData = JSON.parse(JSON.stringify(cachedStatusData));
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
                // ローカルのキャッシュとベースラインにはマスキング前のデータを保持
                cachedStatusData = finalData;
                originalBaseData = JSON.parse(JSON.stringify(finalData));
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
                throw new Error('クラウド上にデータが見つかりませんでした');
            }
            let data = JSON.parse(doc.data().status_json);
            data = migrateStatusData(data); // クライアントサイド・マイグレーションの実行
            cachedStatusData = data; // キャッシュに保持
            originalBaseData = JSON.parse(JSON.stringify(data)); // ベースラインの保存
            updateUI(data);
            initRadarChart(data);
            return data;
        })
        .catch(error => {
            console.error('データのフェッチエラー:', error);
            document.getElementById('build-score').innerText = 'データ読み込み失敗';
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
    
    // 3. AI開発力（DEV）ビルド提案
    if (status.DEV && status.DEV.current < 200) {
        advisories.push({
            type: "build",
            text: `💡 **ビルド提案（職業特性強化）**<br>現在のAI開発力 (DEV: ${status.DEV.current}) は見習いランクです。まずは 200 ゲート（日常利用）の昇段試験への挑戦を推奨します。ITパスポート等で培った基礎力にAI操作知識をプラスしましょう。`
        });
    }
    
    // 4. 測定チケットの案内
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
        advisories.push({
            type: "success",
            text: `🎫 **昇段試験（測定）の案内**<br>現在、測定チケットを合計 ${totalTickets} 枚所持しています。頭が十分に回り、コンディションが良いタイミングで「ゲート試験」タブを開き、次のゲート試験に挑戦してください！`
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
    
    // チケットが完全に不足している場合（専用もallも全て0）
    if (totalTickets <= 0) {
        // チケット不足警告と回復ミッションセクションを表示
        container.innerHTML = `
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
        
        fetch('status_tests.json')
            .then(res => {
                if (!res.ok) throw new Error('試験データの取得失敗');
                return res.json();
            })
            .then(allTests => {
                const trainingTasks = allTests.filter(t => t.is_training);
                if (trainingTasks.length === 0) {
                    container.insertAdjacentHTML('beforeend', '<div class="advisory-item-web">現在、有効な回復ミッションはありません。</div>');
                    return;
                }
                
                trainingTasks.forEach(test => {
                    const timeMin = test.time_limit_seconds / 60;
                    const escapedId = escapeHtml(test.id);
                    const escapedTitle = escapeHtml(test.question.split('\n')[0].replace('【', '').replace('】', ''));
                    const escapedDiff = escapeHtml(test.difficulty);
                    const escapedTime = escapeHtml(String(timeMin));
                    const cardHtml = `
                        <div class="test-select-card" style="border-color: rgba(0, 210, 255, 0.25);">
                            <div class="test-card-left">
                                <div class="test-card-title" style="color: var(--accent-blue);">【追試】${escapedTitle}</div>
                                <div class="test-card-meta" style="margin-top: 4px;">
                                    <span>難易度: <span class="meta-diff" style="color: var(--accent-blue);">${escapedDiff}</span></span>
                                    <span>制限時間: <span class="meta-time">${escapedTime} 分</span></span>
                                </div>
                            </div>
                            <button class="btn btn-primary" onclick="startTest('${escapedId}')">ミッション開始</button>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', cardHtml);
                });
            })
            .catch(err => {
                console.error(err);
                container.insertAdjacentHTML('beforeend', '<div class="advisory-item-web warning">ミッションデータの読み込みに失敗しました。</div>');
            });
        return;
    }
    
    // 全試験問題のリストを取得 (静的ファイルからロード)
    fetch('status_tests.json')
        .then(res => {
            if (!res.ok) throw new Error('試験データの取得失敗');
            return res.json();
        })
        .then(allTests => {
            let gateTests = [];
            let measurementTests = [];
            
            allTests.forEach(test => {
                if (test.is_training) return;
                const param = test.param;
                const targetGate = test.target_gate;
                const pData = status[param] || { current: 100 };
                const currVal = pData.current;
                
                if (getNextGate(currVal) === targetGate) {
                    test.test_type = 'gate';
                    gateTests.push(test);
                } else if (targetGate <= currVal) {
                    test.test_type = 'measurement';
                    measurementTests.push(test);
                }
            });
            
            let html = '';
            
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
                    
                    const hasSpecific = tickets[param] && tickets[param] > 0;
                    const hasAll = tickets.all && tickets.all > 0;
                    const hasTicket = hasSpecific || hasAll;
                    
                    const ticketStatusHtml = hasTicket 
                        ? `<span class="meta-time" style="color: var(--hp-green); font-weight:bold;">挑戦可能</span>` 
                        : `<span class="meta-diff" style="color: var(--accent-red);">チケット不足</span>`;
                    
                    const escapedId = escapeHtml(test.id);
                    const escapedParam = escapeHtml(param);
                    const escapedGate = escapeHtml(String(targetGate));
                    const escapedDiff = escapeHtml(test.difficulty);
                    const escapedTime = escapeHtml(String(timeMin));
                    
                    html += `
                        <div class="test-select-card" style="${!hasTicket ? 'opacity: 0.6; border-color: rgba(255,255,255,0.02);' : ''}">
                            <div class="test-card-left">
                                <div class="test-card-title">${escapedParam} -> ${escapedGate} ゲート試験</div>
                                <div class="test-card-meta">
                                    <span>難易度: <span class="meta-diff">${escapedDiff}</span></span>
                                    <span>制限時間: <span class="meta-time">${escapedTime} 分</span></span>
                                    <span>状態: ${ticketStatusHtml}</span>
                                </div>
                            </div>
                            <button class="btn btn-primary" ${!hasTicket ? 'disabled style="background: #3a3b3c; border-color: transparent; cursor: not-allowed;"' : ''} onclick="startTest('${escapedId}')">試験開始</button>
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
                    
                    const escapedId = escapeHtml(test.id);
                    const escapedParam = escapeHtml(param);
                    const escapedGate = escapeHtml(String(targetGate));
                    const escapedDiff = escapeHtml(test.difficulty);
                    const escapedTime = escapeHtml(String(timeMin));
                    
                    html += `
                        <div class="test-select-card">
                            <div class="test-card-left">
                                <div class="test-card-title">${escapedParam} -> ${escapedGate} レベル測定</div>
                                <div class="test-card-meta">
                                    <span>難易度: <span class="meta-diff" style="color: var(--accent-blue);">${escapedDiff}</span></span>
                                    <span>制限時間: <span class="meta-time">${escapedTime} 分</span></span>
                                    <span>状態: <span class="meta-time" style="color: var(--hp-green); font-weight:bold;">挑戦可能 (フリー)</span></span>
                                </div>
                            </div>
                            <button class="btn btn-primary" style="background: var(--accent-blue); border-color: var(--accent-blue);" onclick="startTest('${escapedId}')">測定開始</button>
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

function startTest(testId) {
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
            const isMeasurement = !test.is_training && targetGate <= currVal;
            
            // チケットの有無チェック (追試ミッションおよび実力測定試験でない場合)
            if (!isTrainingTask && !isMeasurement) {
                const tickets = cachedStatusData.tickets || {};
                const hasSpecific = tickets[param] && tickets[param] > 0;
                const hasAll = tickets.all && tickets.all > 0;
                if (!hasSpecific && !hasAll) {
                    alert(`測定チケット（${param}）または測定チケット（all）が不足しています！`);
                    return;
                }
            }
            
            activeTest = { ...test, test_type: isMeasurement ? 'measurement' : 'gate' };
            testSecondsTotal = test.time_limit_seconds;
            testSecondsRemaining = testSecondsTotal;
            
            // UI表示の切り替え
            switchTestView('test-active-view');
            
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
            
            // タイマーのカウントダウン開始 (1秒ごと)
            if (testTimerInterval) clearInterval(testTimerInterval);
            testTimerInterval = setInterval(countdownTick, 1000);
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

// 通常の試験提出 (Firestoreへの書き込み)
function submitTestAnswer(isTimeout = false) {
    if (testTimerInterval) clearInterval(testTimerInterval);
    
    const textarea = document.getElementById('test-answer-input');
    if (textarea) textarea.disabled = true;
    
    const answerText = textarea ? textarea.value : '';
    
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
    
    const elapsed = testSecondsTotal - testSecondsRemaining;
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
        "answer": answerText,
        "elapsed_seconds": elapsed,
        "timeout": isTimeout,
        "submitted_at": new Date().toISOString()
    });
    
    updatedData.last_updated = new Date().toISOString();
    
    // Firestore へ同期
    saveStatusDataToFirestore(updatedData)
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
    
    const elapsed = testSecondsTotal - testSecondsRemaining;
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
        
        // 出力キャプチャのセットアップ
        pyo.runPython(`
            import sys
            import io
            sys.stdout = io.StringIO()
            sys.stderr = io.StringIO()
        `);
        
        try {
            // 非同期実行
            await pyo.runPythonAsync(code);
            
            const stdout = pyo.runPython("sys.stdout.getvalue()");
            const stderr = pyo.runPython("sys.stderr.getvalue()");
            
            if (submitBtn) submitBtn.disabled = false;
            
            // 期待される FizzBuzz 出力 (1〜30)
            const expectedLines = [
                "1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz",
                "11", "Fizz", "13", "14", "FizzBuzz", "16", "17", "Fizz", "19", "Buzz",
                "Fizz", "22", "23", "Fizz", "Buzz", "26", "Fizz", "28", "29", "FizzBuzz"
            ];
            
            const actualLines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l);
            const passed = JSON.stringify(actualLines) === JSON.stringify(expectedLines);
            
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
                    "event": "Training Passed: Python FizzBuzz Execution (Auto Judged)",
                    "status_change": {}
                });
                
                // Firestore 同期
                saveStatusDataToFirestore(updatedData)
                .then(() => {
                    document.querySelector('#test-complete-view .complete-icon').innerText = "🎉";
                    document.querySelector('#test-complete-view .complete-title').innerText = "追試ミッション合格！";
                    document.querySelector('#test-complete-view .complete-desc').innerText = "テスト判定をパスしました！";
                    
                    const descSubs = document.querySelectorAll('#test-complete-view .complete-desc-sub');
                    if (descSubs.length >= 3) {
                        descSubs[0].innerText = "📋 おめでとうございます！コードの出力が期待されるFizzBuzzと完全に一致しました。";
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
                
                let diffText = "【出力結果の不一致】\n期待される出力と実際の出力が一致しません。\n\n";
                diffText += `[期待される出力 (1～30のFizzBuzz)]\n${expectedLines.slice(0, 5).join('\n')}...\n\n`;
                diffText += `[実際の出力]\n${stdout.substring(0, 200) || '(出力なし)'}\n`;
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
        (tabId === 'quest-tab' && btn.innerText.includes('今月のクエスト')) ||
        (tabId === 'items-tab' && btn.innerText.includes('アイテム')) ||
        (tabId === 'chart-tab' && btn.innerText.includes('レーダーチャート')) ||
        (tabId === 'advisory-tab' && btn.innerText.includes('GMアドバイス')) ||
        (tabId === 'test-tab' && btn.innerText.includes('ゲート試験'))
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

function renderAchievementsAndWords() {
    if (!cachedStatusData) return;
    
    const unlocked = cachedStatusData.unlocked_achievements || [];
    const ownedWords = cachedStatusData.title_parts || [];
    
    // 1. アチーブメント（実績）の描画
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
                    const cardClass = isUnlocked ? "badge-card unlocked" : "badge-card";
                    
                    const escapedName = escapeHtml(ach.name);
                    const escapedDesc = escapeHtml(ach.desc);
                    const escapedRewardWords = ach.reward_words.map(w => `「${escapeHtml(w)}」`).join(' ');
                    
                    const rewardWordsText = isUnlocked 
                        ? `<div style="font-size: 0.65rem; color: var(--timer-yellow); font-weight: bold; margin-top: 4px;">🎁 解放単語: ${escapedRewardWords}</div>` 
                        : `<div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 4px;">🔒 報酬: ???</div>`;
                    
                    const badgeHtml = `
                        <div class="${cardClass}" title="${isUnlocked ? '解除済み' : '未解除'}">
                            <div class="badge-icon">${icon}</div>
                            <div class="badge-info">
                                <div class="badge-name">${escapedName}</div>
                                <div class="badge-desc">${escapedDesc}</div>
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
        
    // 2. 称号スロットの描画
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
    
    // 3. 称号プレビューの描画
    const previewEl = document.getElementById('title-preview-text');
    if (previewEl) {
        if (currentBuildTitleParts.length > 0) {
            previewEl.innerText = `『 ${currentBuildTitleParts.join('')} 』`;
        } else {
            previewEl.innerText = "(称号未設定)";
        }
    }
    
    // 4. 所持単語パーツチップスの描画
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
    const localUsers = JSON.parse(localStorage.getItem('rpg_user_list') || '[]');
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
    localStorage.setItem('rpg_user_id', currentUserId);
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
        const localUsers = JSON.parse(localStorage.getItem('rpg_user_list') || '[]');
        if (!localUsers.includes(newUserId)) {
            localUsers.push(newUserId);
            localStorage.setItem('rpg_user_list', JSON.stringify(localUsers));
        }
        
        // ドロップダウン再構築
        renderUserSelector();
        
        // ユーザー切り替え
        currentUserId = newUserId;
        localStorage.setItem('rpg_user_id', currentUserId);
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
    
    quests.forEach(q => {
        const isCompleted = q.status === 'completed';
        if (isCompleted) {
            completedCount++;
        }
        
        const clientText = escapeHtml(q.client || "冒険者ギルド");
        const rewardText = escapeHtml(q.reward || "EXP +100");
        const escapedTitle = escapeHtml(q.title || "");
        const escapedDesc = q.description ? escapeHtml(q.description) : "";
        const escapedStep = escapeHtml(q.step || "");
        
        const questHtml = `
            <div class="quest-card ${isCompleted ? 'completed' : ''}">
                <div class="quest-card-header">
                    <span class="quest-card-client">FROM: ${clientText}</span>
                    <span class="quest-card-rank">${escapedStep}</span>
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


