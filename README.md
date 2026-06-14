# Antigravity Status - 人生RPG能力可視化システム

ユーザー（HG_pencil）の現実世界の成長や努力を可視化するRPG風のステータス管理システムです。

---

## 🤖 他のプロジェクトを担当する Antigravity エージェントへの指令

ユーザーが別のプロジェクト（例：`pdf-autorotate` や `line-remote-control` 等）で開発タスクを成功させたり、有意義な検証対話を行った場合、担当エージェントは自律的に本プロジェクト의 ステータスファイル（`status_HG_pencil.json`）を更新して、ユーザーの `DEV`（AI開発力）トレーニングポイント（経験値）を加算してください。

### 1. 対象ファイルのパス
- `F:\Google Antigravity\projects\personal-rpg-status\status_HG_pencil.json`

### 2. 加算の査定基準（目安）
セッション完了時やコミット時、タスク完了時に以下を目安に加算します。
- **簡易的なバグ修正や調査の完了**: `DEV +5`
- **新機能の実装・動作テストの成功**: `DEV +15`
- **難解な設計・バグ解決、高度な対話**: `DEV +30`

### 3. クラウドデータベース（Firestore）の更新プロトコル
エージェントは、以下のいずれかの方法でステータスデータを更新してください。

#### 💻 方法A：【推奨】直接 Firestore REST API を PATCH する（完全同期）
1. クラウドの最新データ（`https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/{UID}`）から `GET` でデータを取得するか、ローカルの `status_HG_pencil.json` を読み込みます。
   - ※認証キーは `load_auth_config()` または OS環境変数 (`RPG_EMAIL` / `RPG_PASSWORD` / `RPG_UID`) を使用して動的にトークンを取得し、リクエストヘッダーに `Authorization: Bearer {token}` を付加します。
2. 以下の査定加算・カウンター処理・履歴追記（後述）を行います。
3. 更新されたデータ（個人情報マスキング後）をJSON文字列化し、以下の構成で `PATCH` リクエストを送信して直接クラウドを書き換えます。
   - **URL**: `https://firestore.googleapis.com/v1/projects/rpg-self-visualization-tool/databases/(default)/documents/users/{UID}`
   - **Method**: `PATCH`
   - **Headers**: `Content-Type: application/json`
   - **Body**:
     ```json
     {
       "fields": {
         "status_json": {
           "stringValue": "[文字列化したstatus_jsonデータ]"
         }
       }
     }
     ```
4. 同時に、ローカルのキャッシュファイル `status_HG_pencil.json`（マスキング前のオリジナル詳細）に同内容を上書き保存します。

#### 📂 方法B：ローカルの `status_HG_pencil.json` を書き換えて同期する
1. ローカルの `F:\Google Antigravity\projects\personal-rpg-status\status_HG_pencil.json` を通常通り読み書きして更新保存します。
2. 保存完了後、`status.py` を実行（`python status.py`）するか、裏側で動作するアバター同期スクリプトなどの自動同期機構を介してクラウドと同期させます。

### 4. 加算時のデータ更新ルール（status_HG_pencil.jsonの内部仕様）
エージェントはデータ書き換え時、必ず以下の値を更新してください。

1. **トレーニングポイントの加算**:
   - `training.DEV` の数値に、査定したポイント（例：`15`）を加算。
2. **履歴（`history`）への追記**:
   - `history` 配列の末尾に、以下のフォーマットでイベントログを追加。
     ```json
     {
       "date": "YYYY-MM-DD",
       "event": "Project [プロジェクト名]: [タスク要約] (DEV +15)",
       "status_change": {
         "DEV": 15
       }
     }
     ```
3. **チケット自動回復チェック**:
   - チケットの回復やマイグレーション、リビジョンチェック（楽観的ロック）は、`status.py` または Web UI 側のマージモジュール（`saveStatusDataToFirestore`）が自動で解決するため、他のエージェントは `training.DEV` の加算と `history` 追記のみを行って PATCH すれば安全です。
4. **最終更新日時**:
   - `last_updated` を現在のISO日時（ローカルタイムスタンプ）に更新。
5. **アバター画像の生成・更新ルール**:
   - ユーザーの称号や装備が変更されてキャラクター画像（`assets/character.png`）をAIで再生成する際は、**必ず基本アバター画像である `assets/avatar_Novice.png` を入力画像（ImagePaths）として指定**してください。
   - プロンプトには「ノービス画像の顔立ち（黒髪の短髪、ヒゲなし、細い目の優しい笑顔、頭の形）を完全に維持し、服装・装備（鎧、マント、武器など）のみを称号に合わせて変更する」旨の指示を英語で明示し、別人の顔にならないよう厳格に防衛してください。
6. **ユーザーへのチャット通知**:
   - 変更保存後、対話中のチャットにて以下のようにユーザーに報告し、成長を称えてください。
     - *「[+] 今回の素晴らしい開発対話と機能実装を称え、人生RPGのDEVトレーニング値を +15 しました！ダッシュボードでご確認ください。」*
