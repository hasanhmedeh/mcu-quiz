'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, PageShell, SectionLabel, Spinner } from '@/components/ui/primitives';

interface ApiError {
  error?: { code?: string; message?: string };
}

/**
 * Credentials are posted to the server and compared there against
 * ADMIN_USERNAME / ADMIN_PASSWORD. Nothing about them exists in this bundle —
 * this component only knows how to ask.
 */
export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const usernameId = useId();
  const passwordId = useId();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null;
        setError(body?.error?.message ?? 'Incorrect username or password.');
        setPassword('');
        setSubmitting(false);
        return;
      }

      // The session cookie is set by the response; re-render the server
      // component so the dashboard takes over.
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-sm">
        <div className="panel panel-glow fade-up p-7">
          <SectionLabel>Restricted</SectionLabel>
          <h1 className="display mt-3 text-2xl font-black text-white">Organiser sign-in</h1>
          <p className="mt-2 mb-6 text-sm text-[color:var(--color-mist)]">
            This dashboard is for whoever is running the screening.
          </p>

          {!configured ? (
            <Alert tone="warning" className="mb-5" title="Not configured">
              ADMIN_USERNAME and ADMIN_PASSWORD are not set on this deployment, so sign-in is
              disabled.
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor={usernameId}
                className="mb-2 block text-sm font-medium text-[color:var(--color-mist)]"
              >
                Username
              </label>
              <input
                id={usernameId}
                className="field"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={submitting || !configured}
              />
            </div>

            <div>
              <label
                htmlFor={passwordId}
                className="mb-2 block text-sm font-medium text-[color:var(--color-mist)]"
              >
                Password
              </label>
              <input
                id={passwordId}
                className="field"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={submitting || !configured}
              />
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting || !configured}
            >
              {submitting ? <Spinner label="Signing in…" /> : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </PageShell>
  );
}
