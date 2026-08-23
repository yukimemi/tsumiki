// Shown to a signed-in user who belongs to no family yet.
//
// There are exactly two ways out of here: make a family, or be invited to one.
// Both are on screen at once, because a child arriving from a parent's invite
// and a parent arriving first cannot be told apart from the outside.

import { useState } from "react";
import type { JSX } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useAuth } from "../auth/context";
import { ColorPicker, EmojiPicker } from "../components/MemberIdentity";
import { Avatar, Badge, Button, Card, Field, Input } from "../components/ui";
import { createHousehold } from "../data/households";
import { MEMBER_COLORS } from "../types";
import type { MemberColor, MemberInfo } from "../types";
import { useAction } from "./useAction";

// Kept beside the form, not in a shared schema module: these limits are this
// form's business and nothing else reads them.
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "かぞくの なまえを いれてね")
    .max(30, "30もじ までに してね"),
  displayName: z
    .string()
    .trim()
    .min(1, "あなたの なまえを いれてね")
    .max(20, "20もじ までに してね"),
});

type FormValues = z.infer<typeof schema>;

/** A building block: the same emoji a claimed member starts with. */
const DEFAULT_EMOJI = "🧱";

export function OnboardingScreen(): JSX.Element {
  const { user, signOutUser } = useAuth();
  const action = useAction();

  // The pickers are always valid, so they stay out of the resolver and keep
  // their own state; only the two text fields need validation.
  const [color, setColor] = useState<MemberColor>(MEMBER_COLORS[0]);
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", displayName: user?.displayName ?? "" },
  });

  // useWatch subscribes to one field; the form's own `watch()` cannot be
  // memoized safely and would opt this whole screen out of compilation.
  const typedName = useWatch({ control, name: "displayName" });

  // This screen renders inside the auth gate, so `user` is there in practice.
  // Narrowing beats asserting: a null here must not take the page down.
  if (!user) {
    return (
      <div className="space-y-4 px-3 py-4">
        <Card>
          <p className="text-[15px] text-ink">
            サインインしてから もういちど ひらいてね。
          </p>
        </Card>
      </div>
    );
  }

  const preview: MemberInfo = {
    displayName: typedName.trim() || "あなた",
    email: user.email ?? undefined,
    photoURL: user.photoURL ?? undefined,
    color,
    emoji,
  };

  const submit = handleSubmit((values) => {
    // No navigation on success. HouseholdProvider is subscribed to the
    // households this uid belongs to, so the new document arrives on its own
    // and the router replaces this screen with /today.
    void action.run(async () => {
      await createHousehold(user, values.name, {
        displayName: values.displayName.trim(),
        color,
        emoji,
      });
    });
  });

  const copyEmail = (): void => {
    const email = user.email;
    if (!email) return;
    // Absent outside a secure context, and it can reject when the page is not
    // focused. Neither is worth a message: the address is on screen already.
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(email).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  return (
    <div className="space-y-4 px-3 py-4">
      <header className="px-1">
        <h1 className="text-xl font-bold text-ink">ようこそ</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          まずは かぞくを つくるか、さそって もらうのを まとう。
        </p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-bold text-ink">かぞくを つくる</h2>

        <form onSubmit={submit} className="space-y-4">
          <Field label="かぞくの なまえ" error={errors.name?.message}>
            <Input
              placeholder="やまだけ"
              autoComplete="off"
              {...register("name")}
            />
          </Field>

          <div className="flex items-start gap-4">
            <div className="flex flex-none flex-col items-center gap-1">
              <Avatar info={preview} size="lg" />
              <span className="max-w-[5rem] truncate text-xs text-muted">
                {preview.displayName}
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <Field label="あなたの なまえ" error={errors.displayName?.message}>
                <Input
                  placeholder="おかあさん"
                  autoComplete="off"
                  {...register("displayName")}
                />
              </Field>

              <Field label="いろ" group>
                <ColorPicker
                  value={color}
                  onChange={setColor}
                  name="onboarding-color"
                />
              </Field>

              <Field label="えもじ" group>
                <EmojiPicker value={emoji} onChange={setEmoji} />
              </Field>
            </div>
          </div>

          {user.photoURL ? (
            <p className="text-sm text-muted">
              Google の しゃしんが あるときは、しゃしんが でるよ。
            </p>
          ) : null}

          {action.error ? (
            <p role="alert">
              <Badge tone="late">{action.error}</Badge>
            </p>
          ) : null}

          <Button type="submit" size="lg" block disabled={action.busy}>
            かぞくを つくる
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-bold text-ink">しょうたいを まつ</h2>
        <p className="mb-3 text-sm leading-relaxed text-muted">
          かぞくの だれかが、この メールアドレスを さそうと、つぎに サインイン
          した ときに かぞくに はいれるよ。おなじ アドレスで さそって もらってね。
        </p>

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-card bg-sunk px-3 py-2 font-mono text-sm text-ink">
            {user.email ?? "メールアドレスが ありません"}
          </code>
          <Button variant="ghost" onClick={copyEmail} disabled={!user.email}>
            コピー
          </Button>
        </div>
        {copied ? (
          <p role="status" className="mt-1 text-sm text-muted">
            コピー しました
          </p>
        ) : null}

        <div className="mt-4">
          <Button variant="ghost" block onClick={() => void signOutUser()}>
            さいどきこみ
          </Button>
          <p className="mt-1 text-sm text-muted">
            さそって もらったあと、もういちど サインインすると かぞくに はいるよ。
          </p>
        </div>
      </Card>
    </div>
  );
}
