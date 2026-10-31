'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api, hasRole, Invoice, money, Org } from '@/lib/api';
import { useMe } from '@/lib/auth';

export default function InvoicesPage() {
  const me = useMe();
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ orgId: '', amount: '', dueDate: '' });
  const manager = hasRole(me, 'SYSTEM_ADMIN', 'ACCOUNT_MANAGER');

  const load = () => api<Invoice[]>('/invoices').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); if (manager) api<(Org & { isAgency: boolean })[]>('/organizations').then((o) => setOrgs(o.filter((x) => !x.isAgency))); }, [manager]);

  const act = (id: string, what: 'send' | 'pay') => api(`/invoices/${id}/${what}`, { method: 'POST' }).then(load).catch((e) => setError(e.message));

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/invoices', { method: 'POST', body: JSON.stringify({ orgId: form.orgId, amount: Number(form.amount), dueDate: form.dueDate }) });
      setForm({ orgId: '', amount: '', dueDate: '' }); load();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-indigo">Invoices</h1>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!rows ? <p className="text-sm">Loading invoices…</p> : rows.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-sm">No invoices yet.</p> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-mist"><tr><th className="p-3">Client</th><th className="p-3">Project</th><th className="p-3">Amount</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="p-3">{r.org?.name}</td><td className="p-3">{r.project?.title ?? '—'}</td>
                  <td className="p-3">{money(r.amount)}</td><td className="p-3">{r.dueDate}</td><td className="p-3">{r.status.toLowerCase()}</td>
                  <td className="p-3 text-right">
                    {manager && r.status === 'DRAFT' && <button className="btn btn-ghost" onClick={() => act(r.id, 'send')}>Send invoice</button>}
                    {hasRole(me, 'CLIENT_ADMIN') && (r.status === 'SENT' || r.status === 'OVERDUE') && <button className="btn btn-accent" onClick={() => act(r.id, 'pay')}>Pay now</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {manager && (
        <form onSubmit={create} className="grid gap-3 rounded-xl border border-line bg-white p-5 sm:grid-cols-4">
          <h2 className="text-lg font-semibold sm:col-span-4">Create an invoice</h2>
          <select className="field" required value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })} aria-label="Client">
            <option value="">Choose client</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <input className="field" type="number" min="1" required placeholder="Amount (USD)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="field" type="date" required aria-label="Due date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <button className="btn btn-primary">Save draft</button>
        </form>
      )}
    </div>
  );
}
