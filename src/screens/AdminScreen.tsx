// Cross-household overview, reachable only by the addresses in
// `src/lib/admin.ts`. Deliberately thin: it lists what `households` itself
// holds (name, plan, task count, member count, created date) and nothing a
// member wrote — no entries, no comments, no photos. `firestore.rules`
// `isAdmin()` only grants read on the `households` collection, so there is
// no query this screen could add that would reach further; the boundary is
// enforced server-side, not just left out of the UI.

import { Link } from "react-router-dom";
import type { JSX } from "react";

import { useAuth } from "../auth/context";
import { Badge, Card, EmptyState, Skeleton } from "../components/ui";
import { useAllHouseholdsForAdmin } from "../data/admin";
import { isAdminEmail } from "../lib/admin";
import { dateKeyOf, formatDateJa } from "../lib/date";
import type { Household } from "../types";

function HouseholdRow({ household }: { household: Household }): JSX.Element {
  const memberCount = household.memberIds.length;
  const isPro = household.plan === "pro";

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-ink">{household.name}</p>
        <Badge tone={isPro ? "coin" : "neutral"}>
          {isPro ? "pro" : "free"}
        </Badge>
      </div>
      <p className="text-xs text-muted">
        {memberCount}にん ・ やること {household.taskCount ?? 0}こ
        {household.createdAt
          ? ` ・ ${formatDateJa(dateKeyOf(household.createdAt.toDate()))} 登録`
          : ""}
      </p>
      <p className="font-mono text-xs text-muted">{household.id}</p>
    </Card>
  );
}

export function AdminScreen(): JSX.Element {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const households = useAllHouseholdsForAdmin(isAdmin);

  if (!isAdmin) {
    return (
      <div className="px-3 py-4">
        <EmptyState title="ここには はいれません" emoji="🔒" />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">かぞく いちらん（かんり）</h1>
        <Link to="/" className="text-sm text-self underline">
          もどる
        </Link>
      </div>

      {households.loading ? (
        <Skeleton rows={4} />
      ) : households.data.length === 0 ? (
        <EmptyState title="まだ かぞくが ありません" />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">{households.data.length} かぞく</p>
          {households.data
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "ja"))
            .map((household) => (
              <HouseholdRow key={household.id} household={household} />
            ))}
        </div>
      )}
    </div>
  );
}
