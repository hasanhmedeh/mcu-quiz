'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost min-h-0 px-4 py-2 text-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/account/session', { method: 'DELETE' }).catch(() => null);
        router.refresh();
      }}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
