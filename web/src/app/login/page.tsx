"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Vault } from "lucide-react";
import { useVault } from "@/lib/store";
import { LANG_LABEL, useI18n, type Lang } from "@/lib/i18n";
import { Button, Card, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { state } = useVault();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Auth is stubbed until Supabase Auth is wired in. The screen exists now so
  // the invite-only framing and the biometric affordance are visible in review.
  function signIn(e: React.FormEvent) {
    e.preventDefault();
    router.push("/");
  }

  return (
    <>
      {/*
        Language is offered before sign-in: someone who reads only Tamil should
        never have to get past an English login screen to find the switch.
      */}
      <div className="mb-6 flex justify-center gap-1 rounded-lg border border-border bg-surface p-1">
        {(Object.keys(LANG_LABEL) as Lang[]).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              lang === code ? "bg-gold-soft text-gold-deep" : "text-muted hover:text-text",
            )}
          >
            {LANG_LABEL[code]}
          </button>
        ))}
      </div>

      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gold text-white">
          <Vault className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{state.settings.familyName}</h1>
        <p className="mt-1 text-sm text-muted">{t("login.tagline")}</p>
      </div>

      <Card className="p-5">
        <form onSubmit={signIn} className="space-y-3">
          <Field label={t("login.email")}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <Field label={t("login.password")}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full">
            {t("login.signIn")}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">{t("login.or")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button className="w-full" onClick={() => router.push("/")}>
          <Fingerprint className="size-4 shrink-0" />
          {t("login.biometrics")}
        </Button>
      </Card>

      <p className="mt-6 text-center text-xs text-muted">{t("login.noSignup")}</p>
    </>
  );
}
