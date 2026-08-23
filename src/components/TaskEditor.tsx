import { useId } from "react";
import type { JSX } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { createTask, updateTask } from "../data/tasks";
import type { TaskDraft, TaskPatch } from "../data/tasks";
import { WEEKDAY_LABELS_JA } from "../lib/date";
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

/** A dozen is what fits two thumb-sized rows without scrolling. */
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
];

const MAX_COIN = 999;

const MONTH_DAYS: readonly number[] = Array.from(
  { length: 31 },
  (_, index) => index + 1,
);

const REPEAT_OPTIONS: readonly SegmentedOption<RepeatType>[] = [
  { value: "once", label: "1かいだけ" },
  { value: "daily", label: "まいにち" },
  { value: "weekly", label: "まいしゅう" },
  { value: "monthly", label: "まいつき" },
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
    coin: z
      .number()
      .int("コインは せいすうで いれてね")
      .min(0, "コインは 0いじょうです")
      .max(MAX_COIN, `コインは ${MAX_COIN}までです`),
    needsApproval: z.boolean(),
    needsPhoto: z.boolean(),
    assigneeIds: z.array(z.string()),
    repeatType: z.enum(["once", "daily", "weekly", "monthly"]),
    weekdays: z.array(z.number().int().min(0).max(6)),
    monthDays: z.array(z.number().int().min(1).max(31)),
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

function valuesOf(task: Task | null): FormValues {
  const repeat: RepeatRule = task?.repeat ?? { type: "daily" };
  return {
    title: task?.title ?? "",
    emoji: task?.emoji ?? "🧱",
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
    default:
      return { type: values.repeatType };
  }
}

function draftOf(values: FormValues, members: Member[]): TaskDraft {
  const known = new Set(members.map((member) => member.uid));
  return {
    title: values.title.trim(),
    emoji: values.emoji,
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
  onClose(): void;
}): JSX.Element {
  const { open, task, householdId, actorUid, members, coinYen, onClose } = props;
  const action = useAction();
  // The submit button sits in the pinned footer, outside the <form>; the
  // button's `form` attribute is what connects the two.
  const formId = useId();

  const close = () => {
    action.clear();
    onClose();
  };

  const submit = async (values: FormValues) => {
    const draft = draftOf(values, members);
    const ok = await action.run(async () => {
      if (task) {
        // Empty means "stop having one", which the data layer turns into a
        // field deletion; a draft's "" would merely be dropped from the patch.
        const patch: TaskPatch = {
          ...draft,
          dueTime: draft.dueTime || null,
          note: draft.note || null,
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
          {action.error ? (
            <p className="text-sm font-bold text-late">{action.error}</p>
          ) : null}
          <div className="flex gap-3">
            <Button variant="ghost" block onClick={close} disabled={action.busy}>
              やめる
            </Button>
            <Button type="submit" form={formId} block disabled={action.busy}>
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
  onSubmit(values: FormValues): Promise<void>;
}): JSX.Element {
  const { formId, task, members, coinYen } = props;
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
        render={({ field }) => (
          <Field label="えもじ" error={messageOf(errors.emoji)} group>
            <div className="flex flex-wrap gap-2">
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
            </div>
          </Field>
        )}
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
              checked={field.value}
              onChange={field.onChange}
              label="しゃしんを とる"
              hint="やったあとの しゃしんが しょうこに なります"
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
            <SegmentedControl
              value={field.value}
              options={REPEAT_OPTIONS}
              onChange={field.onChange}
              label="くりかえし"
              className="w-full"
            />
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
