'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackActivity } from './activity';

/** The organiser's own pages are not part of anyone's history. */
const UNTRACKED = /^\/(admin|api)(\/|$)/;

/** Reports each page a signed-in viewer opens. Renders nothing. */
export function ActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || UNTRACKED.test(pathname)) return;
    trackActivity('page_view');
  }, [pathname]);

  return null;
}
