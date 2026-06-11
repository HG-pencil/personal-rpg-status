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
const userDocRef = db.collection('users').doc('kingo');

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
    fetchStatusData();
    
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

// Firebase Firestore からデータをフェッチ
function fetchStatusData() {
    return userDocRef.get()
        .then(doc => {
            if (!doc.exists) {
                throw new Error('クラウド上にデータが見つかりませんでした');
            }
            const data = JSON.parse(doc.data().status_json);
            cachedStatusData = data; // キャッシュに保持
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
    const archetypes = data.archetypes || [];
    
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
    document.getElementById('archetype-value').innerText = archetypes.length > 0 ? archetypes.join(', ') : '(None)';
    
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
}

function renderItems(data) {
    const itemsContainer = document.getElementById('items-container');
    if (!itemsContainer) return;
    itemsContainer.innerHTML = '';
    
    const tickets = data.tickets || {};
    
    // 1. 測定チケットの表示
    if (tickets.measurement !== undefined) {
        const ticketHtml = `
            <div class="item-card">
                <div class="item-icon">🎫</div>
                <div class="item-info">
                    <div class="item-name">測定チケット</div>
                    <div class="item-desc">能力値の測定（ランクゲート試験）に挑戦するためのチケット。</div>
                </div>
                <div class="item-count">x${tickets.measurement}</div>
            </div>
        `;
        itemsContainer.insertAdjacentHTML('beforeend', ticketHtml);
    }
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
    const tickets = data.tickets || { measurement: 0 };
    if (tickets.measurement > 0) {
        advisories.push({
            type: "success",
            text: `🎫 **昇段試験（測定）の案内**<br>現在、測定チケットを ${tickets.measurement} 枚所持しています。頭が十分に回り、コンディションが良いタイミングで「ゲート試験」タブを開き、次のゲート試験に挑戦してください！`
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

        const itemHtml = `
            <div class="param-item">
                <div class="param-name-container">
                    <span class="param-short">${paramNames[p].short}</span>
                    <span class="param-full">${paramNames[p].full}</span>
                </div>
                <div class="param-bar-wrapper">
                    <div class="param-bar-bg">
                        <div class="param-fill-current" id="fill-cur-${p}" style="width: 0%;"></div>
                        <div class="param-fill-peak-gap" id="fill-peak-${p}" style="width: 0%;"></div>
                    </div>
                </div>
                <div class="param-values">
                    <span class="val-current">${currDisplay}</span>
                    <span class="val-peak">Peak: ${peak} | T: ${training[p] || 0}</span>
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
    const tickets = cachedStatusData.tickets || { measurement: 0 };
    const measurementTickets = tickets.measurement || 0;
    
    const container = document.getElementById('test-list-container');
    if (!container) return;
    container.innerHTML = ''; // クリア
    
    // チケットが不足している場合
    if (measurementTickets <= 0) {
        // チケット不足警告と回復ミッションセクションを表示
        container.innerHTML = `
            <div class="item-card" style="border-color: var(--accent-red-dim); background: rgba(255, 71, 87, 0.02); padding: 16px; text-align: center; display: block; width: 100%; margin-bottom: 15px;">
                <div style="font-size: 1.8rem; margin-bottom: 4px;">🎫 ❌</div>
                <div style="font-weight: bold; font-size: 0.9rem; color: #ffffff; margin-bottom: 4px;">測定チケットが不足しています</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4;">
                    通常のゲート試験を受けるにはチケットが必要です。<br>
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
                    const cardHtml = `
                        <div class="test-select-card" style="border-color: rgba(0, 210, 255, 0.25);">
                            <div class="test-card-left">
                                <div class="test-card-title" style="color: var(--accent-blue);">【追試】${test.question.split('\n')[0].replace('【', '').replace('】', '')}</div>
                                <div class="test-card-meta" style="margin-top: 4px;">
                                    <span>難易度: <span class="meta-diff" style="color: var(--accent-blue);">${test.difficulty}</span></span>
                                    <span>制限時間: <span class="meta-time">${timeMin} 分</span></span>
                                </div>
                            </div>
                            <button class="btn btn-primary" onclick="startTest('${test.id}')">ミッション開始</button>
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
            let availableCount = 0;
            
            allTests.forEach(test => {
                const param = test.param;
                const targetGate = test.target_gate;
                const pData = status[param] || { current: 100 };
                const currVal = pData.current;
                
                // 次の壁とテストのターゲットゲートが一致しているか判定 (通常試験のみ)
                if (!test.is_training && getNextGate(currVal) === targetGate) {
                    availableCount++;
                    const timeMin = test.time_limit_seconds / 60;
                    
                    const cardHtml = `
                        <div class="test-select-card">
                            <div class="test-card-left">
                                <div class="test-card-title">${param} -> ${targetGate} ゲート試験</div>
                                <div class="test-card-meta">
                                    <span>難易度: <span class="meta-diff">${test.difficulty}</span></span>
                                    <span>制限時間: <span class="meta-time">${timeMin} 分</span></span>
                                </div>
                            </div>
                            <button class="btn btn-primary" onclick="startTest('${test.id}')">試験開始</button>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', cardHtml);
                }
            });
            
            if (availableCount === 0) {
                container.innerHTML = '<div class="advisory-item-web">現在、あなたの次の能力上限値に適合するゲート試験が定義されていません。</div>';
            }
        })
        .catch(err => {
            console.error(err);
            container.innerHTML = '<div class="advisory-item-web warning">試験データの読み込みに失敗しました。</div>';
        });
}

function startTest(testId) {
    if (!cachedStatusData) return;
    
    const isTrainingTask = testId.startsWith("TRAIN-");
    const tickets = cachedStatusData.tickets || { measurement: 0 };
    if (!isTrainingTask && (tickets.measurement || 0) <= 0) {
        alert("測定チケットがありません！");
        return;
    }

    fetch('status_tests.json')
        .then(res => res.json())
        .then(allTests => {
            const test = allTests.find(t => t.id === testId);
            if (!test) {
                alert("指定された試験が見つかりません。");
                return;
            }
            
            activeTest = test;
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
                    submitBtn.innerText = "解答を提出する";
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
    
    // チケット消費
    const currTickets = updatedData.tickets?.measurement || 0;
    if (currTickets > 0) {
        updatedData.tickets.measurement = currTickets - 1;
    }
    
    const elapsed = testSecondsTotal - testSecondsRemaining;
    const elapsedMin = roundNumber(elapsed / 60, 1);
    const statusStr = isTimeout ? "TIMEOUT" : "COMPLETED";
    
    // 履歴追加
    if (!updatedData.history) updatedData.history = [];
    updatedData.history.push({
        "date": getTodayString(),
        "event": `Exam Answer Submitted: ${activeTest.id} (${statusStr} in ${elapsedMin}m)`,
        "status_change": {}
    });
    
    // 保留中の解答を追加
    if (!updatedData.pending_answers) updatedData.pending_answers = [];
    updatedData.pending_answers.push({
        "test_id": activeTest.id,
        "param": activeTest.param,
        "target_gate": activeTest.target_gate,
        "answer": answerText,
        "elapsed_seconds": elapsed,
        "timeout": isTimeout,
        "submitted_at": new Date().toISOString()
    });
    
    updatedData.last_updated = new Date().toISOString();
    
    // Firestore へ同期
    userDocRef.update({
        status_json: JSON.stringify(updatedData)
    })
    .then(() => {
        // 通常試験完了時の表示を初期状態に戻す
        document.querySelector('#test-complete-view .complete-icon').innerText = "📝";
        document.querySelector('#test-complete-view .complete-title').innerText = "解答提出完了";
        document.querySelector('#test-complete-view .complete-desc').innerText = "解答がクラウドに保存されました！";
        
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
            const copyText = `${activeTest.param} ${activeTest.target_gate} の試験を提出しました。採点をお願いします！`;
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
    const confirmAbandon = confirm("本当に試験を諦めますか？チケットは消費され、今回の試験は「不合格（タイムアウト）」扱いとなります。");
    if (!confirmAbandon) return;
    
    if (testTimerInterval) clearInterval(testTimerInterval);
    
    const updatedData = JSON.parse(JSON.stringify(cachedStatusData));
    
    // チケット消費
    const currTickets = updatedData.tickets?.measurement || 0;
    if (currTickets > 0) {
        updatedData.tickets.measurement = currTickets - 1;
    }
    
    const elapsed = testSecondsTotal - testSecondsRemaining;
    const elapsedMin = roundNumber(elapsed / 60, 1);
    
    // 履歴追加
    if (!updatedData.history) updatedData.history = [];
    updatedData.history.push({
        "date": getTodayString(),
        "event": `Exam Abandoned: ${activeTest.id} (TIMEOUT in ${elapsedMin}m)`,
        "status_change": {}
    });
    
    // 不合格の保留データ追加
    if (!updatedData.pending_answers) updatedData.pending_answers = [];
    updatedData.pending_answers.push({
        "test_id": activeTest.id,
        "param": activeTest.param,
        "target_gate": activeTest.target_gate,
        "answer": "[試験中止] ユーザーにより試験が自己中断されました。",
        "elapsed_seconds": elapsed,
        "timeout": true,
        "submitted_at": new Date().toISOString()
    });
    
    updatedData.last_updated = new Date().toISOString();
    
    // Firestore へ同期
    userDocRef.update({
        status_json: JSON.stringify(updatedData)
    })
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
                if (!updatedData.tickets) updatedData.tickets = { measurement: 0 };
                updatedData.tickets.measurement = 1;
                
                // 履歴追加
                if (!updatedData.history) updatedData.history = [];
                updatedData.history.push({
                    "date": getTodayString(),
                    "event": "Training Passed: Python FizzBuzz Execution (Auto Judged)",
                    "status_change": {}
                });
                
                updatedData.last_updated = new Date().toISOString();
                
                // Firestore 同期
                userDocRef.update({
                    status_json: JSON.stringify(updatedData)
                })
                .then(() => {
                    document.querySelector('#test-complete-view .complete-icon').innerText = "🎉";
                    document.querySelector('#test-complete-view .complete-title').innerText = "追試ミッション合格！";
                    document.querySelector('#test-complete-view .complete-desc').innerText = "テスト判定をパスしました！";
                    
                    const descSubs = document.querySelectorAll('#test-complete-view .complete-desc-sub');
                    if (descSubs.length >= 3) {
                        descSubs[0].innerText = "📋 おめでとうございます！コードの出力が期待されるFizzBuzzと完全に一致しました。";
                        descSubs[0].style.color = "var(--hp-green)";
                        descSubs[1].style.display = "block";
                        descSubs[1].innerText = "測定チケットが1枚回復しました！ステータス画面で確認してください。";
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
    }
}
