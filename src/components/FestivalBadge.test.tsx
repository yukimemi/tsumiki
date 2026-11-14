import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TodayRow } from "../screens/today";
import type { Entry, Task } from "../types";
import { ApprovalQueue } from "./ApprovalQueue";
import { EntryCard } from "./EntryCard";
import { TaskRow } from "./TaskRow";
import { CoinAmount, FestivalBadge } from "./ui";

const baseTask: Task = {
  id: "t1",
  householdId: "h1",
  title: "おふろそうじ",
  emoji: "🛁",
  coin: 10,
  needsApproval: false,
  assigneeIds: [],
  repeat: { type: "daily" },
  order: 0,
  archived: false,
  createdBy: "u1",
};

const festivalEntry: Entry = {
  id: "t1__kid__2026-08-23",
  householdId: "h1",
  taskId: "t1",
  taskTitle: "おふろそうじ",
  taskEmoji: "🛁",
  memberId: "kid",
  dateKey: "2026-08-23",
  status: "pending",
  coin: 30,
  baseCoin: 10,
  festivalMultiplier: 3,
  completedAt: { toMillis: () => Date.now() } as Entry["completedAt"],
  commentCount: 0,
};

describe("FestivalBadge & CoinAmount", () => {
  it("renders the multiplier explicitly on FestivalBadge and hides when multiplier < 2", () => {
    expect(renderToStaticMarkup(<FestivalBadge multiplier={1} />)).toBe("");

    const html = renderToStaticMarkup(<FestivalBadge multiplier={3} />);
    expect(html).toContain("🎉");
    expect(html).toContain("お祭り ×3");
    expect(html).toContain("tsu-festival-badge");
  });

  it("renders both struck-through original and multiplied amounts on FestivalBadge when passed", () => {
    const html = renderToStaticMarkup(
      <FestivalBadge multiplier={4} baseCoins={10} coins={40} />,
    );
    expect(html).toContain("お祭り ×4");
    expect(html).toContain("<s");
    expect(html).toContain(">10</s>");
    expect(html).toContain("40 コイン");
  });

  it("renders struck-through original amount and multiplied amount in CoinAmount when baseCoins differs", () => {
    const html = renderToStaticMarkup(
      <CoinAmount coins={30} baseCoins={10} yen={300} />,
    );
    expect(html).toContain(">10</s>");
    expect(html).toContain("→");
    expect(html).toContain(">30</span>");
    expect(html).toContain("コイン");
    expect(html).toContain("およそ 300円");
  });

  it("renders ordinary single amount in CoinAmount when not in festival", () => {
    const html = renderToStaticMarkup(<CoinAmount coins={10} />);
    expect(html).not.toContain("</s>");
    expect(html).toContain(">10</span>");
  });
});

describe("Festival display across kid/parent surfaces", () => {
  it("marks a festival TaskRow with 🎉 お祭り ×3 and struck-through 10 → 30 コイン", () => {
    const row: TodayRow = {
      task: baseTask,
      entries: [],
      entry: null,
      state: "todo",
      baseCoin: 10,
      effectiveCoin: 30,
      festivalMultiplier: 3,
    };

    const html = renderToStaticMarkup(
      <TaskRow
        row={row}
        coinYen={1}
        canUndo={false}
        onComplete={() => {}}
        onUndo={() => {}}
        onOpenDetail={() => {}}
        onOpenComments={() => {}}
      />,
    );

    expect(html).toContain("お祭り ×3");
    expect(html).toContain(">10</s>");
    expect(html).toContain(">30</span>");
    expect(html).toContain("コイン");
  });

  it("marks a festival EntryCard with the multiplier badge and both base and multiplied amounts", () => {
    const html = renderToStaticMarkup(
      <EntryCard
        entry={festivalEntry}
        member={{
          uid: "kid",
          role: "child",
          info: { displayName: "たろう", emoji: "🐶", color: "sora" },
        }}
        coinYen={1}
        canDecide={false}
        onOpenComments={() => {}}
      />,
    );

    expect(html).toContain("お祭り ×3");
    expect(html).toContain(">10</s>");
    expect(html).toContain(">30</span>");
  });

  it("marks a festival entry in ApprovalQueue with the multiplier badge and both amounts", () => {
    const html = renderToStaticMarkup(
      <ApprovalQueue
        entries={[festivalEntry]}
        members={[
          {
            uid: "kid",
            role: "child",
            info: { displayName: "たろう", emoji: "🐶", color: "sora" },
          },
        ]}
        coinYen={1}
        onApprove={() => {}}
        onReject={() => {}}
        onOpenComments={() => {}}
      />,
    );

    expect(html).toContain("お祭り ×3");
    expect(html).toContain(">10</s>");
    expect(html).toContain(">30</span>");
  });
});
