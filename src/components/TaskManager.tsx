import { useState } from "react";
import type { JSX } from "react";

import {
  reorderTasks,
  setTaskArchived,
  softDeleteTask,
  useAllTasks,
} from "../data/tasks";
import { assigneeLabelJa, repeatLabelJa } from "../lib/taskLabels";
import {
  canMoveCategoryGroup,
  categoriesOf,
  groupTasksByCategory,
  moveCategoryGroup,
  type TaskCategoryGroup,
} from "../screens/today";
import { useAction } from "../screens/useAction";
import type { MemberInfo, Role, Task } from "../types";
import { TaskEditor } from "./TaskEditor";
import {
  Badge,
  Button,
  Card,
  CoinAmount,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Skeleton,
} from "./ui";

/**
 * The parent's list of chores: what exists, in what order, and what is put
 * away. Order is moved with ↑ / ↓ buttons rather than drag and drop — a drag
 * on a phone fights the page scroll, and a thumb finds a button every time.
 *
 * There are two of those pairs, on the row and on the group header, because
 * they move different things: a row's buttons swap it with its neighbour
 * inside its own group, and a group's move the whole block past the next one.
 * Neither can stand in for the other — see `moveCategoryGroup`.
 */

type Member = { uid: string; role: Role; info: MemberInfo };

export function TaskManager(props: {
  householdId: string;
  actorUid: string;
  members: Member[];
  coinYen: number;
  plan: "free" | "pro";
  taskCount: number;
}): JSX.Element {
  const { householdId, actorUid, members, coinYen, plan, taskCount } = props;
  const tasks = useAllTasks(householdId);
  const action = useAction();

  // `null` means the editor is closed; `{ task: null }` means it is open for a
  // new task. Both facts in one value keeps them from disagreeing.
  const [editing, setEditing] = useState<{ task: Task | null } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const all = tasks.data;
  const active = all.filter((task) => !task.archived);
  const archived = all.filter((task) => task.archived);
  const activeGroups = groupTasksByCategory(active);
  const archivedGroups = groupTasksByCategory(archived);

  /**
   * Swap two rows inside `list`, then send every id in its new order:
   * positions are rewritten from scratch, so rows outside `list` (other
   * groups, archived rows) have to travel along too or they would collide
   * with the rewritten numbers.
   *
   * `list` is always a single category's group, not the flat active/archived
   * array — swapping across a category boundary would shuffle `order`
   * without touching either task's category, so the group a swapped task
   * renders under would not change and the button would look like it did
   * nothing.
   */
  const swap = (list: Task[], index: number, delta: number) => {
    const other = list[index + delta];
    const moving = list[index];
    if (!other) return;
    const ids = all.map((task) =>
      task.id === moving.id
        ? other.id
        : task.id === other.id
          ? moving.id
          : task.id,
    );
    void action.run(() => reorderTasks(ids));
  };

  /** Move a whole category past its neighbour, header buttons only. */
  const moveGroup = (
    groups: TaskCategoryGroup[],
    index: number,
    delta: number,
  ) => {
    const ids = moveCategoryGroup(all, groups, index, delta);
    if (!ids) return;
    void action.run(() => reorderTasks(ids));
  };

  const setArchived = (task: Task, archivedNext: boolean) => {
    void action.run(() => setTaskArchived(task.id, archivedNext));
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const ok = await action.run(() => softDeleteTask(deleting.id, householdId));
    if (ok) setDeleting(null);
  };

  const createButton = (
    <Button onClick={() => setEditing({ task: null })}>
      <span aria-hidden="true">＋</span>
      あたらしく つくる
    </Button>
  );

  const groupMove = (groups: TaskCategoryGroup[], index: number) => {
    const up = canMoveCategoryGroup(groups, index, -1);
    const down = canMoveCategoryGroup(groups, index, 1);
    // 「そのほか」 never moves, and a lone group has nowhere to go: no buttons
    // at all reads better than a pair that is always grey.
    if (!up && !down) return null;
    const { label } = groups[index];
    return (
      <span className="ml-auto flex flex-none gap-1">
        <IconButton
          label={`${label} の グループを うえに うごかす`}
          disabled={action.busy || !up}
          onClick={() => moveGroup(groups, index, -1)}
        >
          ↑
        </IconButton>
        <IconButton
          label={`${label} の グループを したに うごかす`}
          disabled={action.busy || !down}
          onClick={() => moveGroup(groups, index, 1)}
        >
          ↓
        </IconButton>
      </span>
    );
  };

  const row = (task: Task, list: Task[], index: number) => (
    <Card key={task.id} className="space-y-2">
      <div className="flex items-start gap-3">
        <span className="flex-none text-3xl" aria-hidden="true">
          {task.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-base font-bold text-ink">
              {task.title}
            </span>
            {task.needsApproval ? (
              <Badge tone="wait">しょうにん あり</Badge>
            ) : null}
          </div>

          <p className="mt-0.5 text-sm text-muted">
            {repeatLabelJa(task.repeat)}
            {task.dueTime ? ` ・ ${task.dueTime}まで` : ""}
          </p>
          <p className="text-sm text-muted">
            やるひと: {assigneeLabelJa(task, members)}
          </p>
        </div>

        <CoinAmount
          coins={task.coin}
          yen={coinYen > 0 ? task.coin * coinYen : undefined}
          size="sm"
          className="flex-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={() => setEditing({ task })}
          disabled={action.busy}
        >
          なおす
        </Button>
        <Button
          variant="ghost"
          onClick={() => setArchived(task, !task.archived)}
          disabled={action.busy}
        >
          {task.archived ? "もどす" : "しまう"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDeleting(task)}
          disabled={action.busy}
        >
          けす
        </Button>

        <span className="ml-auto flex flex-none gap-1">
          <IconButton
            label={`${task.title} を うえに うごかす`}
            disabled={action.busy || index === 0}
            onClick={() => swap(list, index, -1)}
          >
            ↑
          </IconButton>
          <IconButton
            label={`${task.title} を したに うごかす`}
            disabled={action.busy || index === list.length - 1}
            onClick={() => swap(list, index, 1)}
          >
            ↓
          </IconButton>
        </span>
      </div>
    </Card>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold text-ink">
          いまの やること
        </h2>
        {all.length > 0 ? createButton : null}
      </div>

      {action.error ? (
        <p className="text-sm font-bold text-late">{action.error}</p>
      ) : null}
      {tasks.error ? (
        <p className="text-sm font-bold text-late">
          やることを よみこめませんでした
        </p>
      ) : null}

      {tasks.loading && all.length === 0 ? (
        <Skeleton rows={3} />
      ) : all.length === 0 ? (
        <EmptyState
          title="まだ やることが ありません"
          hint="いえの おてつだいを ひとつ つくってみよう"
          emoji="🧱"
          action={createButton}
        />
      ) : (
        <>
          {active.length > 0 ? (
            <div className="space-y-4">
              {activeGroups.map((group, groupIndex) => (
                <div key={group.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-muted">
                      <span className="truncate">{group.label}</span>
                      <Badge>{group.tasks.length}</Badge>
                    </h3>
                    {groupMove(activeGroups, groupIndex)}
                  </div>
                  {group.tasks.map((task, index) =>
                    row(task, group.tasks, index),
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              いまの やることは ありません
            </p>
          )}

          {archived.length > 0 ? (
            <div className="space-y-2">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived(!showArchived)}
                className="flex min-h-tap w-full items-center gap-2 rounded-card px-1 text-left text-base font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                <span className="flex-1">しまって ある やること</span>
                <Badge>{archived.length}</Badge>
                <span aria-hidden="true" className="text-muted">
                  {showArchived ? "▲" : "▼"}
                </span>
              </button>
              {showArchived ? (
                <div className="space-y-4">
                  {archivedGroups.map((group, groupIndex) => (
                    <div key={group.key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="min-w-0 truncate text-sm font-bold text-muted">
                          {group.label}
                        </h4>
                        {groupMove(archivedGroups, groupIndex)}
                      </div>
                      {group.tasks.map((task, index) =>
                        row(task, group.tasks, index),
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <TaskEditor
        categories={categoriesOf(all)}
        open={editing !== null}
        task={editing?.task ?? null}
        householdId={householdId}
        actorUid={actorUid}
        members={members}
        coinYen={coinYen}
        plan={plan}
        taskCount={taskCount}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `${deleting.title} を けしますか` : "けしますか"}
        message="これから この やることは でてきません。いままでの きろくと コインは のこります。"
        confirmLabel="けす"
        tone="danger"
        busy={action.busy}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
