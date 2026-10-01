'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EmptyState } from './parts';
import { LocalTime } from '@/components/ui/LocalTime';
import type { AdminAccountRow } from '@/lib/admin/accounts';

/** Every signed-up viewer, searchable by email; each row opens their profile. */
export function AccountsTable({ accounts, totalTitles }: { accounts: AdminAccountRow[]; totalTitles: number }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const rows = needle ? accounts.filter((account) => account.email.includes(needle)) : accounts;

  return (
    <div>
      <label htmlFor="account-search" className="sr-only">
        Search by email
      </label>
      <input
        id="account-search"
        className="field"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by email"
        autoComplete="off"
      />

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={accounts.length === 0 ? 'No one has signed up yet' : 'No matches'}
            body={
              accounts.length === 0
                ? 'Accounts appear here once someone signs in at /account.'
                : 'No account email contains that text.'
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="panel mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <caption className="sr-only">Signed-up viewers</caption>
              <thead>
                <tr className="border-b border-[rgba(143,208,255,0.16)] text-[0.6875rem] uppercase tracking-[0.14em] text-[color:var(--color-mist)]">
                  <th scope="col" className="px-4 py-3 font-medium">Email</th>
                  <th scope="col" className="px-4 py-3 font-medium">Exams</th>
                  <th scope="col" className="px-4 py-3 font-medium">Best score</th>
                  <th scope="col" className="px-4 py-3 font-medium">Watched</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last active</th>
                  <th scope="col" className="px-4 py-3 font-medium">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => (
                  <tr key={account.uid} className="border-b border-[rgba(143,208,255,0.08)] last:border-0 hover:bg-[rgba(143,208,255,0.04)]">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/users/${account.uid}`} className="font-semibold text-white underline-offset-2 hover:underline">
                        {account.email}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[color:var(--color-mist)]">
                      {account.examCount === 0 ? '—' : `${account.completedExams} done · ${account.examCount} total`}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {account.bestScore === null ? (
                        <span className="text-[color:var(--color-mist)]">—</span>
                      ) : (
                        <span className={account.passed ? 'text-[#6ef2b0]' : 'text-[color:var(--color-ember-soft)]'}>
                          {account.bestScore}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[color:var(--color-mist)]">
                      {account.watchedCount} / {totalTitles}
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--color-mist)]"><LocalTime iso={account.lastActiveAt ?? account.lastSignInAt} /></td>
                    <td className="px-4 py-2.5 text-[color:var(--color-mist)]"><LocalTime iso={account.createdAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="mt-4 grid gap-3 md:hidden">
            {rows.map((account) => (
              <li key={account.uid}>
                <Link href={`/admin/users/${account.uid}`} className="panel block p-4">
                  <p className="truncate font-semibold text-white">{account.email}</p>
                  <p className="mt-1 text-xs text-[color:var(--color-mist)]">
                    {account.examCount} exam{account.examCount === 1 ? '' : 's'}
                    {account.bestScore === null ? '' : ` · best ${account.bestScore}`} · {account.watchedCount} watched
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--color-mist)]">
                    Last active <LocalTime iso={account.lastActiveAt ?? account.lastSignInAt} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
