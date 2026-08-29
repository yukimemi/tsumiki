# tsumiki 🧱

かぞくで「やること」を積み上げる Web アプリ。やったぶんだけコインが貯まり、
貯まったら実際のおこづかいと交換する。家族全員の実施状況がタイムラインで見えて、
コメントで褒め合える。スマホから使う前提の PWA。

## できること

- **やることの登録** — くり返し（1回だけ / まいにち / まいしゅう / まいつき）、担当者、
  期限の時刻、ごほうびのコイン数を親が決める。
- **グループ分け** — やることに任意の「グループ」名を付けると、きょうの画面が
  見出しでまとまる。並び順はやること管理の ▲▼ がそのまま決めるので、
  グループ用の並べ替えは無い。全部できたグループは自動でたたまれ、
  未設定のものは「そのほか」に集まる。
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

4. Authentication → Settings → **承認済みドメイン** に、アプリを配るホスト名を足す。
   ここに無いホストからはサインインが始まらない。

あとは Google でサインインして「かぞくを つくる」を押せば使える。
許可リストのような手作業の登録は無い。

Storage のルールが Firestore を参照するので、画像を使うなら一度だけ IAM 権限が要る:

```sh
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member=serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com \
  --role=roles/firebaserules.firestoreServiceAgent
```

## App Check（自動化された乱用よけ）

サインアップが誰にでも開いているので、ルールだけでは足りない。ルールが決められるのは
「誰が書いてよいか」で、「どれだけ書いてよいか」ではないから。App Check は
reCAPTCHA v3 で「本物のブラウザで動いている、このアプリからのリクエストか」を確かめ、
スクリプトが家族を作りつづけるような使われかたを止める。

1. reCAPTCHA v3 のサイトキーを作る。許可ドメインに本番のホスト名、
   `tsumiki-preview.vercel.app`（固定プレビュー）、`localhost` を入れる。
2. Firebase コンソール → App Check → Web アプリに、そのサイトキーを登録する。
3. `VITE_FIREBASE_APPCHECK_SITE_KEY` を `.env` と Vercel の環境変数の両方に入れる。
   サイトキーは公開前提の値で、守っているのは秘密性ではなくドメインの束縛。
4. **しばらくは「適用しない」のままにする。** App Check の画面で、検証済みリクエストの
   割合が十分に上がったのを見てから、Firestore と Storage の適用を有効にする。
   いきなり適用すると、古いバンドルを掴んでいる利用者がその場で締め出される。

キーを入れなければ App Check は初期化されない。つまり手元の checkout や、設定前の
ビルドはこれまでどおり動く。

ローカルから **本番の** プロジェクトを触るとき、ふつうは何もしなくてよい。
サイトキーの許可ドメインに `localhost` が入っていれば、`pnpm dev` でも本物の
reCAPTCHA がそのまま通る。

通らない環境（別ホスト名、reCAPTCHA を出せない状況）では、デバッグトークンを使う:

1. `.env` に `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=true` と書いて `pnpm dev`。
   SDK がトークンを 1 つ作り、ブラウザのコンソールに出す。
2. その値を App Check コンソールのデバッグトークンとして登録する。
3. 同じ値を `.env` に貼り直す（`=true` を置き換える）。以降はそれが使われる。

`true` を渡したときだけ SDK は新しいトークンを作る。文字列をそのまま渡すと、
それがトークンそのものとして扱われる。この変数が読まれるのは `pnpm dev` の
ときだけで、`vite build` の出力には決して入らない。

止められないものも書いておく:

- **人が本物のブラウザで大量に作ること。** App Check が止めるのは自動化であって、
  乱用そのものではない。
- **`scripts/*`。** どちらも gcloud のアクセストークンで Firestore REST を叩くので、
  ルールも App Check も通らない。適用を有効にしても壊れない。

## 課金の守り

Firebase の Blaze プランに標準の上限は無い。公開したアプリで、気づかないうちに
請求が膨らむ経路は 3 つある — reCAPTCHA のアセスメント、Firestore の読み書き、
Storage の転送量。守りも 3 段で、外側ほど静かに、内側ほど乱暴に効く。

| 段 | しくみ | 設定値 |
| --- | --- | --- |
| 1. 気づく | 請求予算アラート（メール + Pub/Sub） | 月 ¥1,000 の 50% / 90% / 100% |
| 2. 頭打ちにする | reCAPTCHA Enterprise の 1 日あたり割り当て | 300 アセスメント / 日 |
| 3. 止める | 予算超過で請求先アカウントを外す Cloud Function | 100% で発火 |

**2 段目が効くのは reCAPTCHA の課金だけ**で、そのぶん確実に効く。1 日 300 は
月 9,000 で、無料枠 10,000 の内側に収まる（トークン TTL が 1 日なので、
おおよそ 300 端末 / 日にあたる）。上限に達するとトークンの発行が止まるので、
適用を有効にしている状態では正規の利用者も入れなくなる — 攻撃者に枠を焼かせる
DoS が成立する、ということでもある。狭めるときはそれを承知で。

**3 段目は最後の手段で、発動するとアプリは止まる。** かぞくのアプリなので、
止まるほうが青天井の請求より良い、という判断でそうしてある。実装は
[`functions/billing-guard`](functions/billing-guard/)。

### 止まったあとの戻しかた

原因を先に潰すこと。漏れたままつなぎ直しても、メーターが回り直すだけ。

```sh
gcloud billing projects link tsumiki-app-23086 --billing-account=<ACCOUNT_ID>
```

### billing-guard のデプロイ

ソースはリポジトリにあるが、デプロイは手で打つ。年に一度触るかどうかのものに
CI を用意しても、腐るだけなので。

**配信経路の IAM を先に入れること。** これが無いとデプロイは成功するのに
メッセージが 1 通も届かない — 関数は存在するのに動かない、いちばん質の悪い壊れ方を
する。`gcloud functions deploy` は 3 つのうち 1 つを警告として出すが、止まりはしない。

```sh
# Pub/Sub が push 用の OIDC トークンを作れるようにする
gcloud projects add-iam-policy-binding tsumiki-app-23086 \
  --member="serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" --condition=None

# Eventarc が関数を呼べるようにする（Cloud Run サービスの IAM は既定で空）
gcloud run services add-iam-policy-binding billing-guard \
  --region=asia-northeast1 --project=tsumiki-app-23086 \
  --member="serviceAccount:billing-guard@tsumiki-app-23086.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding tsumiki-app-23086 \
  --member="serviceAccount:billing-guard@tsumiki-app-23086.iam.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver" --condition=None
```

そのうえでデプロイする:

```sh
gcloud functions deploy billing-guard --gen2 \
  --runtime=nodejs22 --region=asia-northeast1 \
  --source=functions/billing-guard --entry-point=stopBilling \
  --trigger-topic=billing-alerts \
  --service-account=billing-guard@tsumiki-app-23086.iam.gserviceaccount.com \
  --set-env-vars=TARGET_PROJECT_ID=tsumiki-app-23086 \
  --project=tsumiki-app-23086
```

### デプロイしたら必ず撃つ

止める側の経路は本番を落とさずには試せない。試せるのは「予算未満なら何もしない」
ほうだけで、それでも**メッセージが届いているか**は分かる。そこが壊れる場所なので、
毎回やること。

```sh
gcloud pubsub topics publish billing-alerts --project=tsumiki-app-23086 \
  --message='{"budgetDisplayName":"test","costAmount":12.0,"budgetAmount":1000.0,"currencyCode":"JPY"}'

gcloud logging read 'resource.labels.service_name="billing-guard"' \
  --project=tsumiki-app-23086 --limit=5 --freshness=5m \
  --format="value(timestamp, textPayload)"
```

`[billing-guard] 12/1000 JPY — under budget` が出れば、予算 → Pub/Sub →
Eventarc → Cloud Run → 関数の判断、までひととおり通っている。何も出なければ
届いていない。上の IAM を疑うこと。

サービスアカウント `billing-guard` に付いているのは、プロジェクトに対する
`roles/billing.projectManager` だけ。よくある手順書は請求先アカウント全体に
`roles/billing.admin` を付けるが、それだと他のプロジェクトまで触れてしまう。
外すのに必要なのは前者で足りる。

## エミュレータで動かす

Java が要る（`scoop install temurin-lts-jre` など）。

```sh
firebase emulators:start --only auth,firestore --project demo-tsumiki
```

`.env` に `VITE_USE_EMULATOR=true` を入れると、アプリが `127.0.0.1` のエミュレータに
つながる。ポートは `firebase.json` の `emulators` と `src/lib/firebase.ts` の定数を
そろえてある。エミュレータは空のまま使える — サインインして かぞくを つくれば、
その場でデータが生える。

## かぞくの入りかた

かぞくを つくるのは、サインインして なまえを 入れるだけ。あとから人を足すには:

1. 親が せってい → かぞくの ひと → **かぞくを さそう** で Google のメールアドレスを入れる。
2. アプリが `households/{id}.invitedEmails` にそのアドレスを足す。
3. 招待された人が **同じアドレス** でサインインすると、その瞬間に自分を `memberIds` に
   書き込んで家族に加わる。これはルール上、非メンバーに許された唯一の書き込み
   (`isClaiming()`) で、自分の uid ぶんしか触れない。

家族の外から見えるものは無い。ルールが読むのは家族ドキュメント 1 枚だけで、そこに
載っていない人は、どの家族のどのデータにも届かない。

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
users/{uid}                          プロフィール（本人だけが読める）
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
