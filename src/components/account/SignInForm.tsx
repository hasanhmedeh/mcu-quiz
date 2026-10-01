'use client';

import { useId, useState } from 'react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { Alert, Spinner } from '@/components/ui/primitives';
import { PENDING_EMAIL_KEY, getClientAuth, isFirebaseClientConfigured } from '@/lib/firebase/client';
import { authErrorMessage } from './authErrors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email in, sign-in link out. There is no password and no separate sign-up:
 * opening the link creates the account the first time.
 */
export function SignInForm() {
  const emailId = useId();
  const configured = isFirebaseClientConfigured();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError('That does not look like an email address.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await sendSignInLinkToEmail(getClientAuth(), address, {
        url: `${window.location.origin}/account/finish`,
        handleCodeInApp: true,
      });
      // So the link opened on this device does not have to ask again.
      try {
        window.localStorage.setItem(PENDING_EMAIL_KEY, address);
      } catch {
        // Private mode: the finish page will ask for the address instead.
      }
      setSentTo(address);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Check your inbox">
          We sent a sign-in link to <strong className="text-white">{sentTo}</strong>. Open it on
          this device to sign in. It may take a minute, and can land in spam.
        </Alert>
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {!configured ? (
        <Alert tone="warning" title="Not configured">
          The NEXT_PUBLIC_FIREBASE_* settings are missing on this deployment, so sign-in is
          disabled.
        </Alert>
      ) : null}

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
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={sending || !configured}
        />
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <button type="submit" className="btn btn-primary w-full" disabled={sending || !configured}>
        {sending ? <Spinner label="Sending link…" /> : 'Email me a sign-in link'}
      </button>
      <p className="text-center text-xs text-[color:var(--color-mist)]">
        New here? The same link creates your account. No password needed.
      </p>
      <p className="text-center text-xs text-[color:var(--color-mist)]/80">
        While you are signed in, the organiser can see your activity here: pages you visit,
        titles you mark, trailers you play and your exams.
      </p>
    </form>
  );
}
