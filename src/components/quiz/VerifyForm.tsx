'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isValidTicketId, normalizeTicketInput } from '@/lib/quiz/ticket';
import { Alert } from '@/components/ui/primitives';

/** Manual ticket lookup for anyone who cannot scan the QR code. */
export function VerifyForm() {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTicketInput(value);

    if (!isValidTicketId(normalized)) {
      setError('Ticket references look like EG-2026-8F3K92.');
      return;
    }

    setError(null);
    router.push(`/verify/${normalized}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-[color:var(--color-mist)]">
          Ticket reference
        </label>
        <input
          id={inputId}
          className="field font-mono uppercase"
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder="EG-2026-8F3K92"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
      </div>

      {error ? (
        <div id={`${inputId}-error`}>
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary w-full">
        Verify ticket
      </button>
    </form>
  );
}
