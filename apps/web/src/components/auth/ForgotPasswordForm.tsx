"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { ApiError, authApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// Password reset in three steps, each checked by the server
// (apps/api lib/auth/password-reset.ts):
//
//   email     a 6-digit code is emailed if the address has an account
//   code      the code is traded for a one-time reset token
//   password  the token sets the new password and signs this browser in
//
// The first step says the same thing whether or not the address has an
// account, so this page can't be used to find out who is registered.

type Step = "email" | "code" | "password" | "done";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

const inputClass = "h-11 w-full rounded-2xl border border-ink/12 bg-white px-4 text-sm outline-none transition focus:border-primary/50";

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many attempts. Wait a few minutes, then try again.";
    return error.message;
  }
  return fallback;
}

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const headings: Record<Step, { icon: React.ElementType; title: string; subtitle: React.ReactNode }> = {
    email: { icon: KeyRound, title: "Reset your password", subtitle: "Enter the email you sign in with. We'll send you a 6-digit code." },
    code: {
      icon: Mail,
      title: "Check your email",
      subtitle: (
        <>
          If <span className="font-medium text-ink">{email}</span> has an account, a code is on its way. It expires in 10 minutes.
        </>
      ),
    },
    password: { icon: ShieldCheck, title: "Choose a new password", subtitle: "Use at least 8 characters. You'll be signed out everywhere else." },
    done: { icon: Check, title: "Password updated", subtitle: "You're signed in. Taking you to your dashboard…" },
  };
  const { icon: Icon, title, subtitle } = headings[step];

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-[420px] border-t-2 border-primary pt-7">
        <StepDots step={step} />
        <span
          className={cn(
            "mt-6 grid size-12 place-items-center rounded-2xl",
            step === "done" ? "bg-[#0a7a3c]/10 text-[#0a7a3c]" : "bg-primary/10 text-primary",
          )}
          aria-hidden
        >
          <Icon size={22} />
        </span>
        <h1 className="display mt-5 text-[34px] leading-tight sm:text-[40px]">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/60">{subtitle}</p>

        <div className="mt-8">
          {step === "email" && (
            <EmailStep
              email={email}
              setEmail={setEmail}
              pending={pending}
              onSubmit={async () => {
                setError(null);
                setPending(true);
                try {
                  await authApi.requestPasswordReset(email.trim());
                  setStep("code");
                } catch (caught) {
                  setError(messageOf(caught, "We couldn't send the code. Check your connection and try again."));
                } finally {
                  setPending(false);
                }
              }}
            />
          )}

          {step === "code" && (
            <CodeStep
              pending={pending}
              onResend={async () => {
                setError(null);
                try {
                  await authApi.requestPasswordReset(email.trim());
                } catch (caught) {
                  setError(messageOf(caught, "We couldn't send a new code. Try again in a moment."));
                }
              }}
              onChangeEmail={() => {
                setError(null);
                setStep("email");
              }}
              onSubmit={async (code) => {
                setError(null);
                setPending(true);
                try {
                  const { resetToken: token } = await authApi.verifyPasswordReset(email.trim(), code);
                  setResetToken(token);
                  setStep("password");
                  return true;
                } catch (caught) {
                  setError(messageOf(caught, "We couldn't check that code. Try again."));
                  return false;
                } finally {
                  setPending(false);
                }
              }}
            />
          )}

          {step === "password" && (
            <PasswordStep
              pending={pending}
              onSubmit={async (password) => {
                setError(null);
                setPending(true);
                try {
                  await authApi.completePasswordReset(resetToken, password);
                  setStep("done");
                  window.setTimeout(() => window.location.assign("/dashboard"), 1800);
                } catch (caught) {
                  setError(messageOf(caught, "We couldn't update your password. Try again."));
                  if (caught instanceof ApiError && caught.code === "INVALID_RESET_CODE") setStep("email");
                } finally {
                  setPending(false);
                }
              }}
            />
          )}

          {step === "done" && (
            <Button href="/dashboard" className="w-full">
              Go to your dashboard
            </Button>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-2xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
              {error}
            </p>
          )}
        </div>

        {step !== "done" && (
          <p className="mt-8 text-[13px] text-ink/60">
            <Link href="/login" className="inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-2 hover:underline">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </p>
        )}
      </div>
    </Container>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["email", "code", "password"];
  const current = step === "done" ? order.length : order.indexOf(step);
  return (
    <ol className="flex items-center gap-2" aria-label={`Step ${Math.min(current + 1, 3)} of 3`}>
      {order.map((name, index) => (
        <li
          key={name}
          className={cn("h-1.5 rounded-full transition-all duration-300", index < current ? "w-6 bg-primary" : index === current ? "w-10 bg-primary" : "w-6 bg-ink/12")}
        />
      ))}
    </ol>
  );
}

function EmailStep({ email, setEmail, pending, onSubmit }: { email: string; setEmail: (value: string) => void; pending: boolean; onSubmit: () => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink/70">Email</span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </label>
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Sending code…" : "Send code"}
      </Button>
      <p className="text-[12px] leading-relaxed text-ink/60">
        Signed up with Google or GitHub? You don&apos;t need a password: use the same button on the sign-in page.
      </p>
    </form>
  );
}

function CodeStep({
  pending,
  onSubmit,
  onResend,
  onChangeEmail,
}: {
  pending: boolean;
  onSubmit: (code: string) => Promise<boolean>;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const submit = async (values: string[]) => {
    const code = values.join("");
    if (code.length !== CODE_LENGTH || pending) return;
    const ok = await onSubmit(code);
    if (!ok) {
      setDigits(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
    }
  };

  // Typing, pasting the whole code, or the phone's autofill all land here.
  const fill = (from: number, raw: string) => {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) return;
    const next = [...digits];
    for (let i = 0; i < incoming.length && from + i < CODE_LENGTH; i++) next[from + i] = incoming[i]!;
    setDigits(next);
    const last = Math.min(from + incoming.length, CODE_LENGTH - 1);
    inputs.current[last]?.focus();
    if (next.every(Boolean)) void submit(next);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(digits);
      }}
      className="flex flex-col gap-5"
    >
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink/70">6-digit code</legend>
        <div className="flex justify-between gap-2" onPaste={(event) => {
          event.preventDefault();
          fill(0, event.clipboardData.getData("text"));
        }}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputs.current[index] = element;
              }}
              value={digit}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${index + 1}`}
              maxLength={CODE_LENGTH}
              disabled={pending}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "");
                if (!value) {
                  const next = [...digits];
                  next[index] = "";
                  setDigits(next);
                  return;
                }
                // Typing over a filled box adds a second digit; keep the new one.
                fill(index, digit && value.length === 2 ? value.slice(-1) : value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !digits[index] && index > 0) {
                  const next = [...digits];
                  next[index - 1] = "";
                  setDigits(next);
                  inputs.current[index - 1]?.focus();
                } else if (event.key === "ArrowLeft" && index > 0) {
                  inputs.current[index - 1]?.focus();
                } else if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
                  inputs.current[index + 1]?.focus();
                }
              }}
              className={cn(
                "h-14 w-full min-w-0 rounded-2xl border bg-white text-center font-mono text-2xl font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60",
                digit ? "border-primary/40" : "border-ink/12",
              )}
            />
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending || digits.some((digit) => !digit)} className="w-full">
        {pending ? "Checking…" : "Verify code"}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink/60">
        {cooldown > 0 ? (
          <span className="min-h-11 content-center" aria-live="polite">
            {resent ? "New code sent. " : ""}Resend in {cooldown}s
          </span>
        ) : (
          <button
            type="button"
            className="min-h-11 text-primary underline-offset-2 hover:underline"
            onClick={async () => {
              await onResend();
              setResent(true);
              setCooldown(RESEND_SECONDS);
              setDigits(Array(CODE_LENGTH).fill(""));
              inputs.current[0]?.focus();
            }}
          >
            Send a new code
          </button>
        )}
        <button type="button" onClick={onChangeEmail} className="min-h-11 underline-offset-2 hover:text-ink hover:underline">
          Use a different email
        </button>
      </div>
      <p className="-mt-2 text-[12px] leading-relaxed text-ink/60">Can&apos;t see it? Check your spam or promotions folder.</p>
    </form>
  );
}

function strengthOf(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (password.length < 8) return { score: 0, label: "At least 8 characters" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length >= 12 && kinds >= 3) return { score: 3, label: "Strong" };
  if (kinds >= 2) return { score: 2, label: "Good" };
  return { score: 1, label: "Weak: mix letters, numbers or symbols" };
}

function PasswordStep({ pending, onSubmit }: { pending: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const strength = strengthOf(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 8 && password === confirm;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(password);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-new-password" className="text-[13px] font-medium text-ink/70">New password</label>
        <span className="relative">
          <input
            id="reset-new-password"
            aria-describedby="reset-strength"
            type={visible ? "text" : "password"}
            required
            autoFocus
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(inputClass, "pr-12")}
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setVisible((shown) => !shown)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink/50 hover:text-ink"
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
        <span className="mt-1 flex items-center gap-2" aria-live="polite">
          <span className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3].map((level) => (
              <span
                key={level}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  strength.score >= level ? (strength.score === 1 ? "bg-coral" : strength.score === 2 ? "bg-amber-500" : "bg-[#0a7a3c]") : "bg-ink/10",
                )}
              />
            ))}
          </span>
          <span id="reset-strength" className="text-[12px] text-ink/60">{strength.label}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-confirm-password" className="text-[13px] font-medium text-ink/70">Confirm new password</label>
        <input
          id="reset-confirm-password"
          aria-describedby={mismatch ? "reset-mismatch" : undefined}
          type={visible ? "text" : "password"}
          required
          maxLength={72}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={mismatch}
          className={cn(inputClass, mismatch && "border-coral/60 focus:border-coral")}
          placeholder="Type it again"
        />
        {mismatch && <span id="reset-mismatch" className="text-[12px] text-[#c2412f]">The passwords don&apos;t match.</span>}
      </div>

      <Button type="submit" disabled={pending || !ready} className="mt-1 w-full">
        {pending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
