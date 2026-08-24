# tsumiki 🧱

かぞくで「やること」を積み上げる Web アプリ。やったぶんだけコインが貯まり、
貯まったら実際のおこづかいと交換する。家族全員の実施状況がタイムラインで見えて、
コメントで褒め合える。スマホから使う前提の PWA。

## できること

- **やることの登録** — くり返し（1回だけ / まいにち / まいしゅう / まいつき）、担当者、
  期限の時刻、ごほうびのコイン数を親が決める。
- **実績の記録** — タップで完了。同じ人が同じ日に同じタスクを二重計上できないよう、
  実績のドキュメント ID を `taskId__memberId__日付` に固定してある。
- **承認はタスクごと** — 「歯みがき＝親の承認あり」「お風呂そうじ＝即コイン」のように
  タスク単位で選べる。承認が要るものは `しょうにんまち` に入り、親が承認した時点で
  コインが動く。
- **かぞくで見える化** — みんなのタイムライン、今日の達成数、カレンダー、連続達成日数、
  週間グラフ。
- **コイン獲得ランキング** — こんしゅう / こんげつ / ずっと の 3 期間。同点は同順位、
  0 コインの人も並ぶ。表示するのは「あと n コインで おいつくよ」だけで、
  最下位も、トップとの差も出さない。「ずっと」は累計獲得コインなので、
  おこづかいに交換しても順位は下がらない。
- **コメントと返信** — 実績ごとにスレッド。ワンタップのスタンプ（🎉 / 👏 / すごいね …）
  もあるので、字がまだ書けない子でも褒め合える。
- **コイン → おこづかい** — 1 コイン = n 円のレートを家族ごとに設定。子が交換を申請し、
  親が「しはらった」を押すと台帳に記録される。累計獲得コインは減らないので、
  使っても「これまでに n コイン あつめた」は残る。
- **みため** — ひる / よる / おまつり の 3 テーマ。演出は独立したスイッチで弱められ、
  OS の «視差効果を減らす» 設定でも完全に止まる。

## 技術スタック

| 領域 | 使うもの |
| --- | --- |
| ビルド | Vite 8 + React 19 + TypeScript 6 |
| スタイル | Tailwind CSS 3（色はすべて CSS カスタムプロパティのスロット経由） |
| データ | Firebase Auth（Google のみ）/ Cloud Firestore / Cloud Storage |
| フォーム | react-hook-form + zod |
| PWA | vite-plugin-pwa（Workbox, autoUpdate） |
| テスト | Vitest |
| 本番 | Vercel（`hnd1`）。Firebase はルールとデータのみ |

状態管理ライブラリは入れていない。Firestore が状態そのもので、`onSnapshot` を包んだ
`useXxx()` フックが React に流し込む。詳しい設計は [`docs/DESIGN.md`](docs/DESIGN.md)。

## セットアップ

```sh
pnpm install
cp .env.example .env    # Firebase コンソールの Web アプリ設定を貼る
pnpm dev
```

Firebase 側でやること:

1. Authentication で **Google** プロバイダを有効にする。
2. Firestore を本番モードで作成する。
3. ルールとインデックスを配る。

   ```sh
   pnpm rules:deploy                                   # REST 経由（gcloud のトークンを使う）
   firebase deploy --only firestore:indexes            # 複合インデックス
   ```

4. **最初のひとりだけ** は手で許可リストに載せる。ルールが `config/access` を
   見てから書き込みを許すので、ここだけは鶏と卵になる。

   ```
   config/access
     allowedEmails: ["あなたの@gmail.com"]
     adminEmails:   ["あなたの@gmail.com"]
   ```

   これ以降は、アプリから家族を招待するたびに自動で追加される。

Storage のルールが Firestore を参照するので、画像を使うなら一度だけ IAM 権限が要る:

```sh
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member=serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com \
  --role=roles/firebaserules.firestoreServiceAgent
```

## エミュレータで動かす

Java が要る（`scoop install temurin-lts-jre` など）。

```sh
firebase emulators:start --only auth,firestore --project demo-tsumiki
```

`.env` に `VITE_USE_EMULATOR=true` を入れると、アプリが `127.0.0.1` のエミュレータに
つながる。ポートは `firebase.json` の `emulators` と `src/lib/firebase.ts` の定数を
そろえてある。エミュレータは空なので、許可リストだけ先に入れておく:

```sh
curl -X PATCH "http://127.0.0.1:8085/v1/projects/demo-tsumiki/databases/(default)/documents/config/access" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"allowedEmails":{"arrayValue":{"values":[{"stringValue":"you@example.com"}]}},"adminEmails":{"arrayValue":{"values":[{"stringValue":"you@example.com"}]}}}}'
```

## かぞくの入りかた

1. 親が せってい → かぞくの ひと → **かぞくを さそう** で Google のメールアドレスを入れる。
2. アプリが `households/{id}.invitedEmails` と `config/access.allowedEmails` の両方に
   そのアドレスを足す。
3. 招待された人が **同じアドレス** でサインインすると、その瞬間に自分を `memberIds` に
   書き込んで家族に加わる。これはルール上、非メンバーに許された唯一の書き込み
   (`isClaiming()`) で、自分の uid ぶんしか触れない。

## 役割

| | おや(かんりにん) | おや | こども |
| --- | --- | --- | --- |
| かぞくの削除・名前・レート変更 | ○ | - | - |
| 招待 / 役割変更 / 除名 | ○ | ○ | - |
| やることの作成・編集・削除 | ○ | ○ | - |
| 承認 / 却下、コインの手動増減、支払い | ○ | ○ | - |
| 自分のやることを完了にする | ○ | ○ | ○ |
| コメント・返信、交換の申請 | ○ | ○ | ○ |

親は子のかわりに完了をつけられる（スマホをまだ持たない子のため）。

## データの持ちかた

トップレベルのフラットなコレクションだけを使い、子データは `householdId` の FK を持つ。
`where("householdId","==",id)` 一本で引けて、ルール側も家族ドキュメント 1 回の `get()` で
判定できる。

```
config/access, config/accessGrants   許可リストとその逆引き
users/{uid}                          プロフィール
households/{id}                      メンバーシップと役割
tasks/{id}                           やること定義
entries/{id}                         実績（id = taskId__memberId__日付）
comments/{id}                        実績へのコメント
ledger/{id}                          コイン台帳（追記のみ）
balances/{householdId__memberId}     残高キャッシュ
payouts/{id}                         おこづかい交換
```

台帳が唯一の真実で、`balances` はその集計キャッシュ。ズレたら台帳から作り直せる:

```sh
pnpm exec tsx scripts/recalc-balances.ts <householdId> --dry-run
```

## 開発メモ

```sh
pnpm dev          # 開発サーバ（LAN / Tailscale からも見える）
pnpm build        # tsc -b && vite build
pnpm lint
pnpm test
```

- Firestore を触ってよいのは `src/data/*` だけ。画面から `firebase/firestore` を
  import しない。
- **クエリはルールが読むフィールドを必ず絞る。** Firestore は `list` のルールを
  クエリの条件に対して評価するので、ルールが `resource.data.householdId` を見るなら
  クエリにも `where("householdId","==",…)` が要る。無いと結果が空でも拒否される。
- 色は意味が固定されたスロット経由でだけ使う（`--coin` はコイン、`--done` は完了、
  `--wait` は承認待ち、`--late` は期限切れ、`--self` は自分）。`:root` の外に生の
  hex / rgba を書かない。
- 影とグローは `calc(Npx * var(--glow))` で書く。`--glow` を 0 にすれば昼テーマになる。
- 演出を足したら、`data-motion="calm"` と `prefers-reduced-motion` の両方で止まること、
  止めた結果が画面に残らないことを確かめる。
