"use client";

/**
 * Everything between opening the app and being able to read anything.
 *
 * Six screens rather than a login box, because there are genuinely six
 * different situations and collapsing them makes at least two of them look like
 * bugs. The one that matters most is `awaiting-admission`: an invited member
 * whose admin has not admitted them yet would otherwise see an empty vault and
 * conclude the app is broken.
 *
 * The gate wraps the whole app, so nothing below it ever has to ask whether the
 * key is available — if a screen is rendering, the vault is open.
 */

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  LockKeyhole,
  Printer,
  ShieldCheck,
  Vault,
} from "lucide-react";
import { useKeyVault } from "@/lib/keyvault";
import { useI18n } from "@/lib/i18n";
import { Button, Card, Field, Input } from "@/components/ui";

/** The same centred frame AppShell uses for its bare routes. */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function Crest({ icon }: { icon: React.ReactNode }) {
  return (
    <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gold text-white">
      {icon}
    </span>
  );
}

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/**
 * Wraps an async submit so every screen reports failures the same way.
 *
 * Errors from Postgres and from WebCrypto are both written to be read — "Wrong
 * PIN", "An admin has not admitted you yet" — so they are shown rather than
 * replaced with a generic failure.
 */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}

// ------------------------------------------------------------- sign in ----

function SignIn() {
  const { signIn, error: vaultError } = useKeyVault();
  const { t } = useI18n();
  const { busy, error, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Centered>
      <div className="mb-8 text-center">
        <Crest icon={<Vault className="size-7" />} />
        <h1 className="text-2xl font-semibold tracking-tight">Jewelry Vault</h1>
        <p className="mt-1 text-sm text-muted">{t("login.tagline")}</p>
      </div>

      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => signIn(email, password));
          }}
        >
          <Field label={t("login.email")}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label={t("login.password")}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Problem message={error ?? vaultError} />
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("login.signIn")}
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-muted">{t("login.noSignup")}</p>
    </Centered>
  );
}

// ------------------------------------------------- passphrase, shared ----

function PassphraseFields({
  value,
  repeat,
  onValue,
  onRepeat,
}: {
  value: string;
  repeat: string;
  onValue: (v: string) => void;
  onRepeat: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t("vault.passphrase")} hint={t("vault.passphraseHelp")}>
        <Input
          type="password"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label={t("vault.passphraseAgain")}>
        <Input
          type="password"
          value={repeat}
          onChange={(e) => onRepeat(e.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>
    </>
  );
}

/** Returns a message key when the pair is unusable, otherwise null. */
function passphraseProblem(value: string, repeat: string): "short" | "mismatch" | null {
  // Length only. Character-class rules push people towards "Password1!" —
  // short, predictable, and exactly what a wordlist attack expects.
  if (value.length < 12) return "short";
  if (value !== repeat) return "mismatch";
  return null;
}

// --------------------------------------------------------- first run ----

function CreateVault() {
  const { createVault } = useKeyVault();
  const { t } = useI18n();
  const { busy, error, setError, run } = useSubmit();
  const [familyName, setFamilyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  if (recoveryKey) return <RecoveryKeyScreen printedKey={recoveryKey} />;

  return (
    <Centered>
      <div className="mb-8 text-center">
        <Crest icon={<ShieldCheck className="size-7" />} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("vault.createTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("vault.createBody")}</p>
      </div>

      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = passphraseProblem(passphrase, repeat);
            if (problem) {
              setError(t(problem === "short" ? "vault.passphraseShort" : "vault.passphraseMismatch"));
              return;
            }
            void run(async () => {
              const { recoveryKey: printed } = await createVault(
                familyName.trim(),
                displayName.trim(),
                passphrase,
              );
              setRecoveryKey(printed);
            });
          }}
        >
          <Field label={t("vault.familyName")}>
            <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
          </Field>
          <Field label={t("vault.yourName")}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <PassphraseFields
            value={passphrase}
            repeat={repeat}
            onValue={setPassphrase}
            onRepeat={setRepeat}
          />
          <Problem message={error} />
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("vault.createCta")}
          </Button>
        </form>
      </Card>
    </Centered>
  );
}

/**
 * The recovery key, shown exactly once.
 *
 * There is no "show it again" anywhere in the app, and that is not an
 * oversight: a key the server could re-display is a key the server holds, which
 * is precisely the thing this design refuses to do. The continue button is
 * gated on a checkbox because "I'll write it down later" is how this gets lost.
 */
function RecoveryKeyScreen({ printedKey }: { printedKey: string }) {
  const { refresh } = useKeyVault();
  const { t } = useI18n();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <Centered>
      <div className="mb-6 text-center">
        <Crest icon={<KeyRound className="size-7" />} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("vault.recoveryTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("vault.recoveryBody")}</p>
      </div>

      <Card className="p-5">
        {/* print:* classes so the printed page is just the key, no chrome. */}
        <p className="select-all break-words rounded-lg bg-gold-soft px-4 py-4 text-center font-mono text-lg font-semibold tracking-wider text-gold-deep print:bg-white print:text-black">
          {printedKey}
        </p>

        <div className="mt-3 flex gap-2 print:hidden">
          <Button
            className="flex-1"
            onClick={() => {
              void navigator.clipboard?.writeText(printedKey).then(() => setCopied(true));
            }}
          >
            {copied ? t("vault.recoveryCopied") : t("vault.recoveryCopy")}
          </Button>
          <Button className="flex-1" onClick={() => window.print()}>
            <Printer className="size-4 shrink-0" />
            {t("vault.recoveryPrint")}
          </Button>
        </div>

        <p className="mt-4 text-sm text-muted print:hidden">{t("vault.recoveryWhere")}</p>

        <label className="mt-4 flex items-start gap-2 text-sm print:hidden">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-[var(--gold)]"
          />
          <span>{t("vault.recoveryConfirm")}</span>
        </label>

        <Button
          variant="primary"
          className="mt-4 w-full print:hidden"
          disabled={!confirmed}
          onClick={() => void refresh()}
        >
          {t("vault.recoveryContinue")}
        </Button>
      </Card>
    </Centered>
  );
}

// ------------------------------------------------- invited member paths ----

function Enrol() {
  const { enrol } = useKeyVault();
  const { t } = useI18n();
  const { busy, error, setError, run } = useSubmit();
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");

  return (
    <Centered>
      <div className="mb-8 text-center">
        <Crest icon={<KeyRound className="size-7" />} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("vault.enrolTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("vault.enrolBody")}</p>
      </div>

      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = passphraseProblem(passphrase, repeat);
            if (problem) {
              setError(t(problem === "short" ? "vault.passphraseShort" : "vault.passphraseMismatch"));
              return;
            }
            void run(() => enrol(passphrase));
          }}
        >
          <PassphraseFields
            value={passphrase}
            repeat={repeat}
            onValue={setPassphrase}
            onRepeat={setRepeat}
          />
          <Problem message={error} />
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("vault.enrolCta")}
          </Button>
        </form>
      </Card>
    </Centered>
  );
}

function AwaitingAdmission() {
  const { refresh, signOut } = useKeyVault();
  const { t } = useI18n();

  return (
    <Centered>
      <div className="mb-8 text-center">
        <Crest icon={<Loader2 className="size-7 animate-spin" />} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("vault.awaitingTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("vault.awaitingBody")}</p>
      </div>
      <Card className="space-y-2 p-5">
        <Button variant="primary" className="w-full" onClick={() => void refresh()}>
          {t("vault.awaitingRefresh")}
        </Button>
        <Button className="w-full" onClick={() => void signOut()}>
          {t("vault.signOut")}
        </Button>
      </Card>
    </Centered>
  );
}

// -------------------------------------------------------------- unlock ----

type UnlockMode = "pin" | "passphrase" | "recovery";

function Unlock() {
  const { localDevice, unlockByPin, unlockByPassphrase, unlockByRecoveryKey, signOut } =
    useKeyVault();
  const { t } = useI18n();
  const { busy, error, run } = useSubmit();

  // `localDevice`, never `devices`. A member with a PIN on their phone has an
  // enrolment listed while sitting at a laptop that has never made one — the
  // device secret does not travel. Offering a PIN there is not just a dead end:
  // each attempt is charged against the phone's counter, so five tries on the
  // laptop would lock the phone out for fifteen minutes.
  const [mode, setMode] = useState<UnlockMode>(localDevice ? "pin" : "passphrase");
  const [pin, setPin] = useState("");
  const [secret, setSecret] = useState("");

  const device = localDevice;

  return (
    <Centered>
      <div className="mb-8 text-center">
        <Crest icon={<LockKeyhole className="size-7" />} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("vault.unlockTitle")}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "pin" ? t("vault.unlockBody") : t("login.tagline")}
        </p>
      </div>

      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "pin" && device) void run(() => unlockByPin(device.id, pin));
            else if (mode === "passphrase") void run(() => unlockByPassphrase(secret));
            else void run(() => unlockByRecoveryKey(secret));
          }}
        >
          {mode === "pin" ? (
            <Field label={t("vault.pinPrompt")}>
              <Input
                // A numeric keypad on a phone, and no autocomplete offering to
                // remember six digits that unlock a jewelry vault.
                inputMode="numeric"
                autoComplete="off"
                pattern="\d{6}"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center font-mono text-2xl tracking-[0.4em]"
                required
                autoFocus
              />
            </Field>
          ) : (
            <Field label={mode === "passphrase" ? t("vault.passphrase") : t("vault.recoveryPrompt")}>
              <Input
                type={mode === "passphrase" ? "password" : "text"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete={mode === "passphrase" ? "current-password" : "off"}
                className={mode === "recovery" ? "font-mono" : undefined}
                required
                autoFocus
              />
            </Field>
          )}

          <Problem message={error} />

          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("vault.unlockCta")}
          </Button>
        </form>

        <div className="mt-4 space-y-1 text-center text-sm">
          {mode !== "pin" && localDevice ? (
            <button type="button" className="text-gold-deep underline" onClick={() => setMode("pin")}>
              {t("vault.usePin")}
            </button>
          ) : null}
          {mode !== "passphrase" ? (
            <button
              type="button"
              className="block w-full text-gold-deep underline"
              onClick={() => setMode("passphrase")}
            >
              {t("vault.usePassphrase")}
            </button>
          ) : null}
          {mode !== "recovery" ? (
            <button
              type="button"
              className="block w-full text-muted underline"
              onClick={() => setMode("recovery")}
            >
              {t("vault.useRecovery")}
            </button>
          ) : null}
        </div>
      </Card>

      <button
        type="button"
        className="mt-6 block w-full text-center text-xs text-muted underline"
        onClick={() => void signOut()}
      >
        {t("vault.signOut")}
      </button>
    </Centered>
  );
}

// ---------------------------------------------------------- PIN set-up ----

/** Only weak in the way people are actually weak: runs and repeats. */
function pinIsGuessable(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const ascending = "0123456789";
  const descending = "9876543210";
  return ascending.includes(pin) || descending.includes(pin);
}

function PinSetup({ onDone }: { onDone: () => void }) {
  const { addPin } = useKeyVault();
  const { t } = useI18n();
  const { busy, error, setError, run } = useSubmit();
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [label, setLabel] = useState("");

  return (
    <Centered>
      <div className="mb-8 text-center">
        <Crest icon={<LockKeyhole className="size-7" />} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("vault.pinTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("vault.pinBody")}</p>
      </div>

      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin !== repeat) return setError(t("vault.pinMismatch"));
            if (pinIsGuessable(pin)) return setError(t("vault.pinWeak"));
            void run(async () => {
              await addPin(pin, label.trim());
              onDone();
            });
          }}
        >
          <Field label={t("vault.pinDeviceName")}>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("vault.pinDeviceNamePlaceholder")}
            />
          </Field>
          <Field label={t("vault.pinPrompt")}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-mono text-2xl tracking-[0.4em]"
              required
            />
          </Field>
          <Field label={t("vault.pinAgain")}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-mono text-2xl tracking-[0.4em]"
              required
            />
          </Field>
          <Problem message={error} />
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={busy || pin.length !== 6}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("vault.pinCta")}
          </Button>
          <Button type="button" className="w-full" onClick={onDone}>
            {t("vault.pinSkip")}
          </Button>
        </form>
      </Card>
    </Centered>
  );
}

// ---------------------------------------------------------------- gate ----

export function VaultGate({ children }: { children: React.ReactNode }) {
  const { status, localDevice } = useKeyVault();
  const { t } = useI18n();
  const [pinOffered, setPinOffered] = useState(false);

  switch (status) {
    case "loading":
      return (
        <Centered>
          <p className="flex items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" />
            {t("vault.loading")}
          </p>
        </Centered>
      );
    case "signed-out":
      return <SignIn />;
    case "no-family":
      return <CreateVault />;
    case "needs-enrolment":
      return <Enrol />;
    case "awaiting-admission":
      return <AwaitingAdmission />;
    case "locked":
      return <Unlock />;
    case "unlocked":
      // Offered once per session, right after the first passphrase unlock on a
      // device. Asking before the vault is open would mean asking somebody to
      // choose a PIN for something they have not seen yet.
      //
      // Keyed on this browser's own enrolment, not on whether the member has
      // one anywhere. Having set a PIN on a phone is no reason for a laptop to
      // stop offering one — they are separate secrets and each device needs its
      // own.
      if (!localDevice && !pinOffered) {
        return <PinSetup onDone={() => setPinOffered(true)} />;
      }
      return <>{children}</>;
  }
}
