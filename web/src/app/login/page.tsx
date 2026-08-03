"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Vault } from "lucide-react";
import { useVault } from "@/lib/store";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { state } = useVault();
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
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gold text-white">
          <Vault className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{state.settings.familyName}</h1>
        <p className="mt-1 text-sm text-muted">Private family vault — invite only</p>
      </div>

      <Card className="p-5">
        <form onSubmit={signIn} className="space-y-3">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full">
            Sign in
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button className="w-full" onClick={() => router.push("/")}>
          <Fingerprint className="size-4" />
          Unlock with biometrics
        </Button>
      </Card>

      <p className="mt-6 text-center text-xs text-muted">
        There is no sign-up. An admin invites you by email, and you set your own password from that
        link.
      </p>
    </>
  );
}
