'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isSignInWithEmailLink, signInWithEmailLink, signOut } from 'firebase/auth';
import { Alert, Spinner } from '@/components/ui/primitives';
import { PENDING_EMAIL_KEY, getClientAuth, isFirebaseClientConfigured } from '@/lib/firebase/client';
import { authErrorMessage } from './authErrors';

type Step =
  | { kind: 'working' }
  | { kind: 'need-email'; error: string | null }
  | { kind: 'failed'; message: string };

/** Neither the link nor the stored address changes while the page is open. */
const noSubscription = () => () => undefined;

function readPendingEmail(): string | null {
  try {
    return window.localStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}

/** What is wrong with the opened link, if anything. Browser only. */
function linkProblem(): string | null {
  if (!isFirebaseClientConfigured()) return 'Sign-in is not configured on this deployment.';
  if (!isSignInWithEmailLink(getClientAuth(), window.location.href)) {
    return 'This is not a valid sign-in link. Ask for a new one.';
  }
  return null;
}

/** `undefined` during server rendering, before the browser can say. */
function useBrowserValue<T>(read: () => T): T | undefined {
  return useSyncExternalStore(noSubscription, read, () => undefined);
}

function forgetPendingEmail() {
  try {
    window.localStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // Nothing was stored.
  }
}

/**
 * Where the emailed link lands. Completes the sign-in with Firebase, hands
 * the ID token to the server for a session cookie, then drops the Firebase
 * session: from here on the cookie is all the app uses.
 */
export function FinishSignIn() {
  const router = useRouter();
  const emailId = useId();
  const problem = useBrowserValue(linkProblem);
  const pending = useBrowserValue(readPendingEmail);
  // `null` until something happens; until then the step follows from the link.
  const [step, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');
  // The link's code works once; React's development double-run must not spend it twice.
  const started = useRef(false);

  async function complete(address: string) {
    const auth = getClientAuth();
    try {
      const credential = await signInWithEmailLink(auth, address.trim(), window.location.href);
      const idToken = await credential.user.getIdToken();
      await signOut(auth);

      const response = await fetch('/api/account/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setStep({ kind: 'failed', message: body?.error?.message ?? 'We could not sign you in.' });
        return;
      }

      forgetPendingEmail();
      router.replace('/account');
      router.refresh();
    } catch (caught) {
      const code = (caught as { code?: unknown } | null)?.code;
      // A different address from the one the link was sent to.
      if (code === 'auth/invalid-email') {
        setStep({ kind: 'need-email', error: 'That is not the address this link was sent to.' });
        return;
      }
      setStep({ kind: 'failed', message: authErrorMessage(caught) });
    }
  }

  // Opened on the device that asked for the link: finish straight away.
  useEffect(() => {
    if (started.current || problem !== null || !pending) return;
    started.current = true;
    void complete(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, for the link it was opened with
  }, [problem, pending]);

  const current: Step =
    step ??
    (problem === undefined
      ? { kind: 'working' }
      : problem !== null
        ? { kind: 'failed', message: problem }
        : pending
          ? { kind: 'working' }
          : // Opened on another device or browser: ask, rather than trust the link alone.
            { kind: 'need-email', error: null });

  if (current.kind === 'working') {
    return (
      <p className="flex justify-center py-6 text-sm text-[color:var(--color-mist)]">
        <Spinner label="Signing you in…" />
      </p>
    );
  }

  if (current.kind === 'failed') {
    return (
      <div className="space-y-4">
        <Alert tone="error">{current.message}</Alert>
        <Link href="/account" className="btn btn-ghost w-full">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setStep({ kind: 'working' });
        void complete(email);
      }}
    >
      <p className="text-sm text-[color:var(--color-mist)]">
        This link was opened on a different device or browser. Confirm the email address it was
        sent to.
      </p>
      <div>
        <label htmlFor={emailId} className="mb-2 block text-sm font-medium text-[color:var(--color-mist)]">
          Email
        </label>
        <input
          id={emailId}
          className="field"
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </div>
      {current.error ? <Alert tone="error">{current.error}</Alert> : null}
      <button type="submit" className="btn btn-primary w-full" disabled={!email.trim()}>
        Sign in
      </button>
    </form>
  );
}
