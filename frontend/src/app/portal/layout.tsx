'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, hasRole, Me, TOKEN_KEY, USER_KEY } from '@/lib/api';
import { MeContext } from '@/lib/auth';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(USER_KEY);
    if (!cached) return router.replace('/login');
    setMe(JSON.parse(cached));
    api<Me>('/auth/me').catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); router.replace('/login'); });
  }, [router]);

  if (!me) return <p className="p-8 text-sm">Loading your portal…</p>;
  const canSeeInvoices = hasRole(me, 'SYSTEM_ADMIN', 'ACCOUNT_MANAGER', 'CLIENT_ADMIN');
  const link = (href: string, label: string) => (
    <Link href={href} className={`rounded-md px-3 py-1.5 text-sm font-medium ${path === href ? 'bg-saffron text-indigo' : 'text-white/90 hover:bg-white/10'}`}>{label}</Link>
  );

  return (
    <MeContext.Provider value={me}>
      <header className="bg-indigo">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-display text-lg font-bold text-white">Saiam</span>
          <nav className="flex gap-1">{link('/portal', 'Projects')}{canSeeInvoices && link('/portal/invoices', 'Invoices')}</nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-white/80">
            <span>{me.fullName ?? me.email} · {me.orgName}</span>
            <button className="btn btn-ghost !py-1" onClick={() => { localStorage.clear(); router.push('/login'); }}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </MeContext.Provider>
  );
}
