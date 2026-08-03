"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Fingerprint, Share, Vault } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * First-run setup.
 *
 * The Home Screen step is not decoration: on iOS, Safari only delivers Web Push
 * to an installed PWA, so skipping it silently disables every reminder for that
 * person. Making it an explicit step is the cheapest fix.
 */
const STEPS = [
  {
    icon: Fingerprint,
    title: "Secure this device",
    body: "Require Face ID, Touch ID, or your device PIN each time the vault is opened.",
    cta: "Enable device lock",
  },
  {
    icon: Share,
    title: "Add to your Home Screen",
    body: "On iPhone: tap Share, then “Add to Home Screen.” This is required for notifications to work at all on iOS.",
    cta: "I've added it",
  },
  {
    icon: Bell,
    title: "Turn on reminders",
    body: "Get notified when an item is due back, when it becomes overdue, and before a family event.",
    cta: "Allow notifications",
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [done, setDone] = useState<number[]>([]);

  const allDone = done.length === STEPS.length;

  return (
    <>
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gold text-white">
          <Vault className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p className="mt-1 text-sm text-muted">Three quick steps and you&apos;re set up.</p>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const complete = done.includes(i);
          return (
            <Card key={step.title} className={cn("p-4", complete && "border-ok/40 bg-ok/5")}>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    complete ? "bg-ok text-white" : "bg-gold-soft text-gold-deep",
                  )}
                >
                  {complete ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.body}</p>
                  {!complete ? (
                    <Button
                      size="sm"
                      variant="primary"
                      className="mt-3"
                      onClick={() => setDone((d) => [...d, i])}
                    >
                      {step.cta}
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Button
        variant={allDone ? "primary" : "secondary"}
        className="mt-6 w-full"
        onClick={() => router.push("/")}
      >
        {allDone ? "Open the vault" : "Skip for now"}
      </Button>
    </>
  );
}
