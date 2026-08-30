import { useId } from "react";
import type { JSX } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { createTask, updateTask } from "../data/tasks";
import type { TaskDraft, TaskPatch } from "../data/tasks";
import { WEEKDAY_LABELS_JA } from "../lib/date";
import { UNFILED_LABEL } from "../screens/today";
import { useAction } from "../screens/useAction";
import type { MemberInfo, RepeatRule, RepeatType, Role, Task } from "../types";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  Sheet,
  Spinner,
  Textarea,
  Toggle,
} from "./ui";
import type { SegmentedOption } from "./ui";

/**
 * Create or edit one task. The sheet is the only place a repeat rule is
 * written, so the rule is validated here rather than trusted downstream: a
 * weekly task with no weekday would simply never appear on any day.
 */

/** A baker's dozen still fits three thumb-sized rows without scrolling. */
const EMOJI_CHOICES: readonly string[] = [
  "🧹",
  "🍽️",
  "🪥",
  "👕",
  "📚",
  "✏️",
  "🌱",
  "🐶",
  "🧽",
  "🚮",
  "🧱",
  "⭐",
  "💪",
];

const MAX_COIN = 999;

/** A week has 7 days; more than that is just "まいにち" already. */
const MAX_WEEKLY_COUNT = 7;

/** A month has at most 31 days, same reasoning as `MAX_WEEKLY_COUNT`. */
const MAX_MONTHLY_COUNT = 31;

const MONTH_DAYS: readonly number[] = Array.from(
  { length: 31 },
  (_, index) => index + 1,
);

/** きまった ペースの もの。 */
const REPEAT_CADENCE_OPTIONS: readonly SegmentedOption<RepeatType>[] = [
  { value: "daily", label: "まいにち" },
  { value: "weekly", label: "まいしゅう" },
  { value: "monthly", label: "まいつき" },
];

/** 1回だけ、または期間内なら何日にやってもいい残り。 */
const REPEAT_OTHER_OPTIONS: readonly SegmentedOption<RepeatType>[] = [
  { value: "once", label: "1かいだけ" },
  { value: "weeklyCount", label: "しゅうに○かい" },
  { value: "monthlyCount", label: "つきに○かい" },
];

/** Schema lives next to its form, per the project's convention. */
const schema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "なまえを いれてね")
      .max(40, "なまえは 40もじまでに してね"),
    emoji: z.string().min(1, "えもじを えらんでね"),
    category: z
      .string()
      .trim()
      .max(20, "グループは 20もじまでに してね")
      // The unfiled group already shows this name, so letting a parent type
      // it would put the same header on two sections.
      .refine(
        (value) => value !== UNFILED_LABEL,
        `「${UNFILED_LABEL}」は グループが ないときの なまえだよ`,
      ),
    coin: z
      .number()
      .int("コインは せいすうで いれてね")
      .min(0, "コインは 0いじょうです")
      .max(MAX_COIN, `コインは ${MAX_COIN}までです`),
    needsApproval: z.boolean(),
    needsPhoto: z.boolean(),
    assigneeIds: z.array(z.string()),
    repeatType: z.enum([
      "once",
      "daily",
      "weekly",
      "monthly",
      "weeklyCount",
      "monthlyCount",
    ]),
    weekdays: z.array(z.number().int().min(0).max(6)),
    monthDays: z.array(z.number().int().min(1).max(31)),
    periodCount: z.number().int().min(1, "1いじょうに してね"),
    dueTime: z
      .string()
      .refine(
        (value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
        "じかんの かきかたが ちがいます",
      ),
    note: z.string().max(200, "メモは 200もじまでに してね"),
  })
  .superRefine((values, ctx) => {
    if (values.repeatType === "weekly" && values.weekdays.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["weekdays"],
        message: "ようびを えらんでね",
      });
    }
    if (values.repeatType === "monthly" && values.monthDays.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["monthDays"],
        message: "ひづけを えらんでね",
      });
    }
    if (
      values.repeatType === "weeklyCount" &&
      values.periodCount > MAX_WEEKLY_COUNT
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["periodCount"],
        message: `しゅうは ${MAX_WEEKLY_COUNT}かいまでです`,
      });
    }
    if (
      values.repeatType === "monthlyCount" &&
      values.periodCount > MAX_MONTHLY_COUNT
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["periodCount"],
        message: `つきは ${MAX_MONTHLY_COUNT}かいまでです`,
      });
    }
  });

type FormValues = z.output<typeof schema>;

type Member = { uid: string; role: Role; info: MemberInfo };

function ascending(a: number, b: number): number {
  return a - b;
}

function toggleNumber(list: number[], value: number): number[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value].sort(ascending);
}

function toggleId(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function clampCoin(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_COIN, Math.max(0, Math.round(value)));
}

function clampCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, Math.round(value)));
}

/**
 * react-hook-form types an error on an array of primitives as a merged
 * shape, so the root message is not reachable through `.message` alone.
 */
function messageOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "message" in error) {
    return typeof error.message === "string" ? error.message : undefined;
  }
  return undefined;
}

/**
 * Custom emoji input takes free text but the field is one emoji, not a
 * caption — `Intl.Segmenter` finds the first grapheme cluster so a pasted
 * skin-tone/ZWJ sequence (👨‍👩‍👧, 👍🏽) survives instead of being cut mid-codepoint.
 */
function firstGrapheme(value: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const [first] = segmenter.segment(value);
  return first?.segment ?? "";
}

function valuesOf(task: Task | null): FormValues {
  const repeat: RepeatRule = task?.repeat ?? { type: "daily" };
  return {
    title: task?.title ?? "",
    emoji: task?.emoji ?? "🧱",
    category: task?.category ?? "",
    // A chore worth nothing is never what a parent means to create.
    coin: task?.coin ?? 1,
    // The safe default: coins arrive once a parent has looked.
    needsApproval: task?.needsApproval ?? true,
    needsPhoto: task?.needsPhoto ?? false,
    assigneeIds: task?.assigneeIds ?? [],
    repeatType: repeat.type,
    weekdays:
      repeat.type === "weekly" ? [...repeat.weekdays].sort(ascending) : [],
    monthDays: repeat.type === "monthly" ? [...repeat.days].sort(ascending) : [],
    periodCount:
      repeat.type === "weeklyCount" || repeat.type === "monthlyCount"
        ? repeat.count
        : 1,
    dueTime: task?.dueTime ?? "",
    note: task?.note ?? "",
  };
}

function repeatOf(values: FormValues): RepeatRule {
  switch (values.repeatType) {
    case "weekly":
      return { type: "weekly", weekdays: [...values.weekdays].sort(ascending) };
    case "monthly":
      return { type: "monthly", days: [...values.monthDays].sort(ascending) };
    case "weeklyCount":
      return { type: "weeklyCount", count: values.periodCount };
    case "monthlyCount":
      return { type: "monthlyCount", count: values.periodCount };
    default:
      return { type: values.repeatType };
  }
}

function draftOf(values: FormValues, members: Member[]): TaskDraft {
  const known = new Set(members.map((member) => member.uid));
  return {
    title: values.title.trim(),
    emoji: values.emoji,
    category: values.category.trim(),
    coin: values.coin,
    needsApproval: values.needsApproval,
    needsPhoto: values.needsPhoto,
    // Someone who has left the household must not keep owning a chore.
    assigneeIds: values.assigneeIds.filter((uid) => known.has(uid)),
    repeat: repeatOf(values),
    dueTime: values.dueTime,
    note: values.note.trim(),
  };
}

const PICKER_CELL = [
  "grid min-h-tap place-items-center rounded-card border text-sm font-bold tabular-nums transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
].join(" ");

function cellLook(selected: boolean): string {
  return selected
    ? "border-self bg-self text-paper"
    : "border-rule bg-sunk text-muted";
}

export function TaskEditor(props: {
  open: boolean;
  task: Task | null;
  householdId: string;
  actorUid: string;
  members: Member[];
  coinYen: number;
  /** Names already in use, offered so groups are picked rather than retyped. */
  categories: string[];
  plan: "free" | "pro";
  taskCount: number;
  onClose(): void;
}): JSX.Element {
  const {
    open,
    task,
    householdId,
    actorUid,
    members,
    coinYen,
    categories,
    plan,
    taskCount,
    onClose,
  } = props;
  const action = useAction();
  // The submit button sits in the pinned footer, outside the `<form>`; the
  // button's `form` attribute is what connects the two.
  const formId = useId();

  // Checked before the write, in friendly Japanese, rather than letting the
  // rules reject it: firestore.rules enforces the same 30-task free cap
  // (`isPro(hh) || taskCount < 30`), but a rejected write reads as a bug to
  // a child, not a plan limit.
  const atCap = !task && plan !== "pro" && taskCount >= 30;

  const close = () => {
    action.clear();
    onClose();
  };

  const submit = async (values: FormValues) => {
    if (atCap) return;
    const draft = draftOf(values, members);
    const ok = await action.run(async () => {
      if (task) {
        // Empty means "stop having one", which the data layer turns into a
        // field deletion; a draft's "" would merely be dropped from the patch.
        const patch: TaskPatch = {
          ...draft,
          dueTime: draft.dueTime || null,
          note: draft.note || null,
          category: draft.category || null,
        };
        await updateTask(task.id, patch);
      } else {
        await createTask(householdId, actorUid, draft);
      }
    });
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={task ? "やることを なおす" : "あたらしい やること"}
      footer={
        <div className="space-y-2">
          {atCap ? (
            <p className="text-sm font-bold text-late">
              いまは 30こまで つくれます。おうちの ひとに きいてみてね
            </p>
          ) : action.error ? (
            <p className="text-sm font-bold text-late">{action.error}</p>
          ) : null}
          <div className="flex gap-3">
            <Button variant="ghost" block onClick={close} disabled={action.busy}>
              やめる
            </Button>
            <Button
              type="submit"
              form={formId}
              block
              disabled={action.busy || atCap}
            >
              {action.busy ? <Spinner size="sm" /> : task ? "なおす" : "つくる"}
            </Button>
          </div>
        </div>
      }
    >
      {/*
        Mounting the form only while the sheet is up, keyed by which task it is
        for, is what resets the fields on every open: a fresh mount reads
        `defaultValues` once. The `values` option would instead re-sync on
        every Firestore snapshot and wipe what the parent was typing, and an
        effect calling `reset` would trip react-hooks' set-state-in-effect.
      */}
      {open ? (
        <TaskForm
          key={task?.id ?? "new"}
          formId={formId}
          task={task}
          members={members}
          coinYen={coinYen}
          categories={categories}
          plan={plan}
          onSubmit={submit}
        />
      ) : null}
    </Sheet>
  );
}

function TaskForm(props: {
  formId: string;
  task: Task | null;
  members: Member[];
  coinYen: number;
  categories: string[];
  plan: "free" | "pro";
  onSubmit(values: FormValues): Promise<void>;
}): JSX.Element {
  const { formId, task, members, coinYen, categories, plan } = props;
  const categoryListId = useId();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(task),
  });

  // `useWatch` rather than `watch`: the latter returns a fresh function every
  // render, which the React Compiler refuses to memoize.
  const repeatType = useWatch({ control, name: "repeatType" });

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(props.onSubmit)}
      className="space-y-5"
      noValidate
    >
      {/*
        A free-text box with a datalist rather than a picker over a managed
        list of categories: a family runs a handful of these, and the whole
        point of grouping is lost if filing a chore first means opening a
        second screen to invent a group. The suggestions are what keep
        「おてつだい」 from quietly becoming two groups.
      */}
      <Field
        label="グループ（なくても いいよ）"
        hint="おなじ なまえの やることが まとまって でるよ"
        error={errors.category?.message}
      >
        <Input
          {...register("category")}
          list={categoryListId}
          placeholder="おてつだい"
          autoComplete="off"
          maxLength={20}
        />
        <datalist id={categoryListId}>
          {categories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      <Field label="なまえ" error={errors.title?.message}>
        <Input
          {...register("title")}
          maxLength={40}
          placeholder="れい: おふろそうじ"
          autoComplete="off"
        />
      </Field>

      <Controller
        control={control}
        name="emoji"
        render={({ field }) => {
          const isCustom = field.value !== "" && !EMOJI_CHOICES.includes(field.value);
          return (
            <Field label="えもじ" error={messageOf(errors.emoji)} group>
              <div className="flex flex-wrap items-center gap-2">
                {EMOJI_CHOICES.map((emoji) => (
                  <Chip
                    key={emoji}
                    tone="self"
                    selected={field.value === emoji}
                    onClick={() => field.onChange(emoji)}
                    className="text-2xl"
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </Chip>
                ))}
                <Input
                  value={isCustom ? field.value : ""}
                  onChange={(e) => field.onChange(firstGrapheme(e.target.value))}
                  placeholder="ほかの えもじ"
                  aria-label="ほかの えもじを にゅうりょく"
                  className={`w-24 text-center text-2xl${isCustom ? " border-current" : ""}`}
                />
              </div>
            </Field>
          );
        }}
      />

      <Controller
        control={control}
        name="needsApproval"
        render={({ field }) => (
          <Card className="bg-sunk">
            <Toggle
              checked={field.value}
              onChange={field.onChange}
              label="おやの しょうにんが いる"
              hint="しょうにんされてから コインが もらえます"
            />
          </Card>
        )}
      />

      <Controller
        control={control}
        name="needsPhoto"
        render={({ field }) => (
          <Card className="bg-sunk">
            <Toggle
              checked={plan === "pro" && field.value}
              onChange={field.onChange}
              disabled={plan !== "pro"}
              label="しゃしんを とる"
              hint={
                plan === "pro"
                  ? "やったあとの しゃしんが しょうこに なります"
                  : "pro プランで つかえます"
              }
            />
          </Card>
        )}
      />

      <Controller
        control={control}
        name="coin"
        render={({ field }) => (
          <Field label="コイン" error={messageOf(errors.coin)} group>
            <div className="flex items-center gap-2">
              <IconButton
                label="コインを へらす"
                tone="coin"
                disabled={field.value <= 0}
                onClick={() => field.onChange(clampCoin(field.value - 1))}
              >
                −
              </IconButton>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_COIN}
                step={1}
                aria-label="コインの かず"
                value={field.value}
                onBlur={field.onBlur}
                onChange={(event) =>
                  field.onChange(clampCoin(Number(event.target.value)))
                }
                className="w-20 text-center tabular-nums"
              />
              <IconButton
                label="コインを ふやす"
                tone="coin"
                disabled={field.value >= MAX_COIN}
                onClick={() => field.onChange(clampCoin(field.value + 1))}
              >
                ＋
              </IconButton>
              {coinYen > 0 ? (
                <span className="text-sm font-bold tabular-nums text-muted">
                  {field.value * coinYen}円
                </span>
              ) : null}
            </div>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="assigneeIds"
        render={({ field }) => (
          <Field
            label="だれが やる"
            hint="えらばなければ みんなの やることに なります"
            group
          >
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <Chip
                  key={member.uid}
                  tone="self"
                  selected={field.value.includes(member.uid)}
                  onClick={() =>
                    field.onChange(toggleId(field.value, member.uid))
                  }
                  className="pl-1"
                >
                  <Avatar info={member.info} size="sm" />
                  <span className="max-w-[8rem] truncate">
                    {member.info.displayName}
                  </span>
                </Chip>
              ))}
            </div>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="repeatType"
        render={({ field }) => (
          <Field label="くりかえし" group>
            {/* Six options no longer fit one non-scrolling row (the
                original four did). Splitting into "きまった ペース"
                (daily/weekly/monthly — a fixed day) and the rest
                (once, and the two period-quota types — any day, just a
                count) keeps each row at three pills, and the split reads
                as a real distinction rather than an arbitrary line break. */}
            <div className="space-y-1" role="group" aria-label="くりかえし">
              <SegmentedControl
                value={field.value}
                options={REPEAT_CADENCE_OPTIONS}
                onChange={field.onChange}
                label="くりかえし（きまった ペース）"
                name="repeat-cadence"
                className="w-full"
              />
              <SegmentedControl
                value={field.value}
                options={REPEAT_OTHER_OPTIONS}
                onChange={field.onChange}
                label="くりかえし（そのほか）"
                name="repeat-other"
                className="w-full"
              />
            </div>
          </Field>
        )}
      />

      {repeatType === "weekly" ? (
        <Controller
          control={control}
          name="weekdays"
          render={({ field }) => (
            <Field label="どの ようび" error={messageOf(errors.weekdays)} group>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS_JA.map((label, weekday) => {
                  const selected = field.value.includes(weekday);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        field.onChange(toggleNumber(field.value, weekday))
                      }
                      className={`${PICKER_CELL} ${cellLook(selected)}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        />
      ) : null}

      {repeatType === "monthly" ? (
        <Controller
          control={control}
          name="monthDays"
          render={({ field }) => (
            <Field label="どの ひ" error={messageOf(errors.monthDays)} group>
              <div className="grid grid-cols-7 gap-1">
                {MONTH_DAYS.map((day) => {
                  const selected = field.value.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${day}日`}
                      onClick={() =>
                        field.onChange(toggleNumber(field.value, day))
                      }
                      className={`${PICKER_CELL} ${cellLook(selected)}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        />
      ) : null}

      {repeatType === "weeklyCount" || repeatType === "monthlyCount" ? (
        <Controller
          control={control}
          name="periodCount"
          render={({ field }) => {
            const max =
              repeatType === "weeklyCount" ? MAX_WEEKLY_COUNT : MAX_MONTHLY_COUNT;
            const unit = repeatType === "weeklyCount" ? "しゅう" : "つき";
            return (
              <Field
                label="なんかい"
                hint={`いつやってもいいけど、1${unit}に これだけ できたら おわり`}
                error={messageOf(errors.periodCount)}
                group
              >
                <div className="flex items-center gap-2">
                  <IconButton
                    label="かいすうを へらす"
                    disabled={field.value <= 1}
                    onClick={() => field.onChange(clampCount(field.value - 1, max))}
                  >
                    −
                  </IconButton>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={max}
                    step={1}
                    aria-label="かいすう"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(clampCount(Number(event.target.value), max))
                    }
                    className="w-20 text-center tabular-nums"
                  />
                  <IconButton
                    label="かいすうを ふやす"
                    disabled={field.value >= max}
                    onClick={() => field.onChange(clampCount(field.value + 1, max))}
                  >
                    ＋
                  </IconButton>
                  <span className="text-sm font-bold tabular-nums text-muted">
                    かい / {unit}
                  </span>
                </div>
              </Field>
            );
          }}
        />
      ) : null}

      <Field
        label="じかん"
        hint="このじかんを すぎると おくれている ひょうじに なります"
        error={errors.dueTime?.message}
      >
        <Input type="time" {...register("dueTime")} className="w-40" />
      </Field>

      <Field label="メモ" error={errors.note?.message}>
        <Textarea
          {...register("note")}
          rows={2}
          placeholder="やりかたの コツなど"
        />
      </Field>

      {task ? (
        <p className="rounded-card border border-rule bg-sunk p-3 text-sm leading-relaxed text-muted">
          コインを かえても、いままでの きろくは そのときの コインの ままです。
        </p>
      ) : null}
    </form>
  );
}
