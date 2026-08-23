# tsumiki 設計

かぞくで「やること」を積み上げるアプリ。やったぶんだけコインが貯まり、貯まったら
おこづかいと交換する。家族全員の実施状況がタイムラインで見え、コメントで褒め合える。

- 認証: Google サインインのみ。メール招待で家族に加わる。
- 承認: タスクごとに「親の承認が要るか」を設定する。要らないタスクは完了した瞬間に
  コインが入る。要るタスクは `pending` になり、親が承認した時点でコインが入る。
- ホスティング: Vercel 本番 (`hnd1`)。Firebase は Auth / Firestore / Storage のみ。
  `firebase.json` は `firebase deploy --only firestore:rules,storage` を通すために残す。

## 1. Firestore データモデル

すべてトップレベルのフラットコレクション。子データは subcollection ではなく
`householdId` の FK を持つ。これは `where("householdId","==",id)` 一本で引けて、
セキュリティルール側も `get(/households/$(householdId))` 一回で判定できるため。

```
config/access                      { allowedEmails: string[], adminEmails: string[] }
config/accessGrants                { grants: { email: string, householdId: string }[] }
users/{uid}                        プロフィール（サインインのたびに merge 更新）
households/{householdId}           かぞく。メンバーシップと RBAC の親ドキュメント
tasks/{taskId}                     やること定義（くり返しルールを持つ）
entries/{entryId}                  実績 1 回ぶん。id = `${taskId}__${memberId}__${dateKey}`
comments/{commentId}               実績へのコメント / 返信
ledger/{ledgerId}                  コイン台帳。追記のみ（update / delete 禁止）
balances/{householdId}__{memberId} 残高キャッシュ。台帳と同じ writeBatch で increment
payouts/{payoutId}                 おこづかい交換の申請と結果
```

`entries` の ID を `taskId__memberId__dateKey` に固定しているのは、同じ人が同じ日に
同じタスクを二重計上できないようにするため（`setDoc` が上書きになる）。

台帳が唯一の真実で、`balances` はその集計キャッシュ。ズレたら
`scripts/recalc-balances.ts` で台帳から作り直せる。

### 役割 (Role)

`owner` | `parent` | `child`

| できること | owner | parent | child |
| --- | --- | --- | --- |
| かぞくの削除・名前変更・レート変更 | ○ | - | - |
| メンバー招待 / 役割変更 / 除名 | ○ | ○ | - |
| タスクの作成・編集・削除 | ○ | ○ | - |
| 承認待ちの承認 / 却下 | ○ | ○ | - |
| コインの手動加算・減算 | ○ | ○ | - |
| おこづかい交換の実行 | ○ | ○ | - |
| 自分のタスクを完了にする | ○ | ○ | ○ |
| 実績にコメント / 返信 | ○ | ○ | ○ |
| おこづかい交換を申請する | ○ | ○ | ○ |

`owner` は `parent` の権限をすべて含む。判定は `src/lib/roles.ts` に集約する。

### 招待フロー（kakeizu 方式をそのまま踏襲）

1. 親が `inviteByEmail(householdId, email, role)` を呼ぶ。
   - `households/{id}.invitedEmails` に email を追加、`pendingRoles[encodeEmailKey(email)]` に役割を保存
   - `config/access.allowedEmails` に email を追加、`config/accessGrants.grants` に
     `{email, householdId}` を記録（どの家族が誰に許可を出したかの逆引き）
2. 招待された人が Google サインインすると `claimEmailInvites(user)` が走り、
   `invitedEmails` に自分の verified email がある household を探して、自分の uid を
   `memberIds` / `memberRoles` / `memberInfo` に書き込み、`invitedEmails` から自分を消す。
   これはルールの `isClaiming()` が許可する唯一の非メンバー書き込み。
3. 除名時は `removeAccessGrant` が、他の household からも許可が出ていない場合に限り
   `allowedEmails` から取り除く。

`pendingRoles` のキーは Firestore のマップキーに `.` が使えないため
`encodeEmailKey(email)` = `email.replace(/\./g, "%2E")` で符号化する。

## 2. 型定義（`src/types.ts` が唯一の定義元）

```ts
export type Role = "owner" | "parent" | "child";

export type MemberColor =
  | "sakura" | "sora" | "wakaba" | "yamabuki" | "fuji" | "kohaku";

export type MemberInfo = {
  displayName: string;
  email?: string;
  photoURL?: string;
  color: MemberColor;
  emoji: string;
};

export type RepeatRule =
  | { type: "once" }
  | { type: "daily" }
  | { type: "weekly"; weekdays: number[] }  // 0=日 .. 6=土
  | { type: "monthly"; days: number[] };    // 1..31

export type Household = {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  memberRoles: Record<string, Role>;
  memberInfo: Record<string, MemberInfo>;
  invitedEmails?: string[];
  pendingRoles?: Record<string, Role>;   // key = encodeEmailKey(email)
  coinYen: number;                       // 1 コイン = coinYen 円
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Task = {
  id: string;
  householdId: string;
  title: string;
  note?: string;
  emoji: string;
  coin: number;
  needsApproval: boolean;
  assigneeIds: string[];                 // [] = かぞくの誰でも
  repeat: RepeatRule;
  dueTime?: string;                      // "HH:mm"
  order: number;
  archived: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp | null;
};

export type EntryStatus = "pending" | "approved" | "rejected";

export type Entry = {
  id: string;                            // `${taskId}__${memberId}__${dateKey}`
  householdId: string;
  taskId: string;
  taskTitle: string;                     // 完了時点のスナップショット
  taskEmoji: string;                     // 同上
  memberId: string;
  dateKey: string;                       // "YYYY-MM-DD" (Asia/Tokyo)
  status: EntryStatus;
  coin: number;                          // 完了時点の報酬スナップショット
  note?: string;
  completedAt: Timestamp;
  decidedBy?: string;
  decidedAt?: Timestamp;
  rejectReason?: string;
  commentCount: number;
  lastCommentAt?: Timestamp;
};

export type Comment = {
  id: string;
  householdId: string;
  entryId: string;
  authorId: string;
  text: string;
  stamp?: string;                        // 絵文字ひとつ
  replyToId?: string;
  createdAt: Timestamp;
  deletedAt?: Timestamp | null;
};

export type LedgerReason = "task" | "bonus" | "adjust" | "payout";

export type LedgerEntry = {
  id: string;
  householdId: string;
  memberId: string;
  delta: number;                         // コイン増減
  reason: LedgerReason;
  entryId?: string;
  payoutId?: string;
  note?: string;
  actorId: string;
  createdAt: Timestamp;
};

export type Balance = {
  id: string;                            // `${householdId}__${memberId}`
  householdId: string;
  memberId: string;
  coins: number;                         // 現在残高
  earned: number;                        // 累計獲得（減らない）
  updatedAt: Timestamp;
};

export type PayoutStatus = "requested" | "paid" | "rejected";

export type Payout = {
  id: string;
  householdId: string;
  memberId: string;
  coins: number;
  yen: number;                           // 申請時の coinYen で確定
  status: PayoutStatus;
  note?: string;
  requestedAt: Timestamp;
  decidedBy?: string;
  decidedAt?: Timestamp;
};
```

## 3. 書き込みフロー（すべて `writeBatch`）

- **完了** `completeTask(task, memberId, dateKey, actor)`
  - `status = task.needsApproval ? "pending" : "approved"`
  - entry を `setDoc`
  - `approved` のときだけ ledger に `+coin / reason:"task"` を追記し、
    balance を `increment(coin)`（`coins` と `earned` の両方）
- **承認** `approveEntry(entry, actor)`: `status:"pending"` のときだけ実行。
  entry を `approved` にし、ledger 追記 + balance increment。
- **却下** `rejectEntry(entry, actor, reason)`: `pending` → `rejected`。コインは動かない。
- **取り消し** `undoEntry(entry, actor)`: entry を削除。`approved` だった場合は
  ledger に `-coin / reason:"adjust"` を追記し balance を減算（台帳には履歴が残る）。
- **手動調整** `adjustCoins(householdId, memberId, delta, note, actor)`:
  ledger `reason:"bonus"|"adjust"` + balance increment。
- **交換申請** `requestPayout`: `payouts` に `requested` を作るだけ。コインはまだ動かない。
- **交換実行** `payPayout`: `status:"paid"` にし、ledger に `-coins / reason:"payout"`、
  balance の `coins` のみ減算（`earned` は減らさない）。

## 4. 画面構成

ボトムナビ 5 枚（スマホ前提、`env(safe-area-inset-bottom)` を確保）。

| path | 名前 | 中身 |
| --- | --- | --- |
| `/` | きょう | 自分の今日のタスク。タップで完了、長押しで取り消し。承認待ちバッジ。 |
| `/family` | みんな | かぞくの実績タイムライン。コメント / 返信 / スタンプ。 |
| `/coins` | コイン | 残高・台帳・おこづかい交換。親には承認待ちキューが出る。 |
| `/records` | きろく | カレンダー、連続達成（ストリーク）、週次・メンバー別の集計。 |
| `/settings` | せってい | かぞく設定、メンバー招待、タスク管理、テーマ、演出の強さ。 |

未所属のユーザーには `/onboarding`（かぞくを作る or 招待を待つ）を出す。

## 5. デザイン言語

yaiba の構造を借りる。色は CSS カスタムプロパティのスロットで定義し、意味を固定する。
値は差し替えてよいが意味は変えない。

| スロット | 意味（これ以外に使わない） |
| --- | --- |
| `--coin` | コインに関するものだけ |
| `--done` | 完了した実績だけ |
| `--wait` | 承認待ちだけ |
| `--late` | 期限を過ぎたものだけ |
| `--self` | 自分・フォーカス・カーソル |

テーマは 1 軸 3 値（独立トグルにしない）。`document.documentElement.dataset.theme`。

- `hiru` — 明るい昼。既定。`--glow: 0`
- `yoru` — 暗い夜。`--glow: 1`
- `matsuri` — 夜 + 演出全部盛り。`--glow: 1.4`

演出の強さは色と直交する別の軸 `data-motion`（`full` | `calm`）で持つ。

- `--fx` は演出の倍率。`hiru`/`yoru` で 1、`matsuri` で 2、`data-motion="calm"` で 0。
- `prefers-reduced-motion: reduce` は `--fx: 0` を強制し、すべての `@keyframes` を
  `animation: none !important` で止める。止めた結果、画面に何も残らないこと。

影とグローは必ず `calc(Npx * var(--glow))` で書く。`:root` の外に生の rgba / hex を
書かない（スロットを差し替えたときに取り残されるため）。

### 演出カタログ

| 名前 | いつ | 何が起きる | 長さ |
| --- | --- | --- | --- |
| `stack` | タスク完了 | 行に積み木がカタンと乗る。下から突き上げて着地。 | 320ms |
| `coinfly` | コイン獲得 | コインが行から残高バッジへ弧を描いて飛ぶ。 | 700ms |
| `wish` | 完了したが承認待ち | 🙏 と「おねがい！」が `--wait` 色で行から浮き上がり、上へ抜けて消える。コインは飛ばさない（まだ稼いでいないため）。 | 820ms |
| `burst` | 完了（matsuri のみ） | 全画面の放射状ショックウェーブ。 | 420ms |
| `combo` | 連続完了 | 1600ms 以内の連続完了数を数えて大きく表示。2 連から出る。 | - |
| `quake` | 取り消し / 却下 | シェル全体が 240ms 揺れる。 | 240ms |
| `pop` | 承認された | 承認待ちバッジが弾けて `--done` に変わる。 | 260ms |

## 6. 実装規約

- Firestore へのアクセスは `src/data/*.ts` にだけ書く。画面から `firebase/firestore` を
  直接 import しない。
- 購読は `onSnapshot` を包んだ `useXxx()` フックで、`{ data, loading, error }` を返す。
- 楽観的ローカル書き込みで依存する購読が競合しないよう、
  `snap.metadata.hasPendingWrites` のスナップショットは読み飛ばす。
- 書き込み前に `clean()` で `undefined` / 空文字を落とす。消したいフィールドは
  `deleteField()` を使う。
- zod スキーマはフォームの隣に置く（中央集約しない）。
- Context は `*Context.ts`（context と hook）と `*Provider.tsx`（実装）に分ける。
  React Fast Refresh のため。
- ユーザーが読む文字列は日本語。コード内コメント・コミット・PR は英語。
