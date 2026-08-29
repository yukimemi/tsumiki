// The one page in this app a signed-out visitor — or a crawler — can reach.
// Everything else lives behind RequireAuth, so this is also the only surface
// with anything for Google (or a parent deciding whether to sign up) to read.
// Deliberately dependency-free: no Firebase, no auth, no household context —
// it must render the same for everyone, including a bot.

import { Link } from "react-router-dom";

import type { HouseholdMember } from "../household/context";
import { CoinRanking } from "../components/CoinRanking";
import { Avatar, Badge, Card, CoinAmount, ProgressRing } from "../components/ui";
import { rankByCoins } from "./ranking";

/**
 * Sample data for the two mockups below. Not live app data — this page has
 * no backend access by design — but built from the same components and
 * color slots the real app uses, so what a visitor sees here is what the
 * app actually looks like, not a mockup drawn by hand.
 */
const SAMPLE_MEMBERS: HouseholdMember[] = [
  { uid: "1", role: "child", info: { displayName: "そら", color: "sora", emoji: "🐧" } },
  { uid: "2", role: "child", info: { displayName: "あおい", color: "wakaba", emoji: "🐢" } },
  { uid: "3", role: "child", info: { displayName: "ゆい", color: "sakura", emoji: "🐰" } },
];

const SAMPLE_RANK_ROWS = rankByCoins([
  { memberId: "1", coins: 42 },
  { memberId: "2", coins: 35 },
  { memberId: "3", coins: 12 },
]);

function TodayMockup() {
  return (
    <Card className="mx-auto max-w-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">きょうの やること</h3>
        <ProgressRing value={2} max={3} size={40} />
      </div>
      <ul className="flex flex-col gap-2">
        <li className="flex items-center justify-between rounded-lg2 border border-rule bg-panel px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-ink">
            <Avatar info={SAMPLE_MEMBERS[0].info} size="sm" />
            はをみがく
          </span>
          <Badge tone="done">できた</Badge>
        </li>
        <li className="flex items-center justify-between rounded-lg2 border border-rule bg-panel px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-ink">
            <Avatar info={SAMPLE_MEMBERS[1].info} size="sm" />
            おふろそうじ
          </span>
          <Badge tone="done">できた</Badge>
        </li>
        <li className="flex items-center justify-between rounded-lg2 border border-rule bg-panel px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-ink">
            <Avatar info={SAMPLE_MEMBERS[2].info} size="sm" />
            しゅくだい
          </span>
          <Badge tone="wait">まだ</Badge>
        </li>
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-rule pt-3">
        <span className="text-xs text-muted">きょう もらった コイン</span>
        <CoinAmount coins={8} signed size="sm" />
      </div>
    </Card>
  );
}

function RankingMockup() {
  return (
    <div className="mx-auto max-w-xs">
      <CoinRanking
        rows={SAMPLE_RANK_ROWS}
        members={SAMPLE_MEMBERS}
        currentUid={SAMPLE_MEMBERS[0].uid}
        period="week"
        onPeriod={() => {}}
      />
    </div>
  );
}

const FEATURES: readonly { emoji: string; title: string; body: string }[] = [
  {
    emoji: "✅",
    title: "やることを かぞくで きめる",
    body: "親が やることを つくり、子どもが おわったら報告。写真つきの報告にも対応(pro プラン)。",
  },
  {
    emoji: "🪙",
    title: "コインで がんばりが みえる",
    body: "承認されると コインが たまる。ためたコインは、家族で決めたレートで お金に交換できる。",
  },
  {
    emoji: "🏆",
    title: "たのしい ランキング",
    body: "だれが最下位、という見せ方は しない。いま何コインで、あと何コインで上に行けるかだけを伝える。",
  },
  {
    emoji: "💬",
    title: "コメントで おうえん",
    body: "やったことに、家族みんなで ひとことコメント。がんばりを見てもらえる場所をつくる。",
  },
  {
    emoji: "🌗",
    title: "ひる・よる・おまつり",
    body: "見た目のテーマは3種類。動きを減らす「しずかモード」もあり、好みや体調にあわせて選べる。",
  },
];

export function AboutScreen() {
  return (
    <div
      className="h-full overflow-y-auto overscroll-contain"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <main className="safe-x safe-t safe-b mx-auto flex max-w-lg flex-col gap-10 px-4 py-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="text-5xl" aria-hidden="true">
            🌱
          </span>
          <h1 className="text-2xl font-bold text-ink">つみき</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            家族の おてつだいと おこづかいを、コインで つなぐアプリ。
            やることを つくって、おわったら報告。がんばりは コインになって、
            ランキングと コメントで 家族みんなに見える。
          </p>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-center text-sm font-bold text-muted">
            じっさいの がめん
          </h2>
          <TodayMockup />
          <RankingMockup />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-center text-lg font-bold text-ink">できること</h2>
          <div className="flex flex-col gap-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {feature.emoji}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-ink">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {feature.body}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card>
            <h2 className="mb-2 text-sm font-bold text-ink">りょうきん</h2>
            <p className="text-sm leading-relaxed text-muted">
              やることは 30こまで、写真での報告なしなら 無料で使える。
              写真つきの報告や、やることの数を増やしたい家族には
              pro プランを用意している。
            </p>
          </Card>
        </section>

        <footer className="flex flex-col items-center gap-2 text-center text-xs text-muted">
          <p>
            はじめるには、家族の代表者が Google アカウントで サインインしてください。
          </p>
          <Link to="/privacy" className="underline">
            プライバシーポリシー
          </Link>
        </footer>
      </main>
    </div>
  );
}
