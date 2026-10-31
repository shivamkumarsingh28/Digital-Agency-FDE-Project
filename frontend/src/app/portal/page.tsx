'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api, hasRole, money, Org, Project } from '@/lib/api';
import { useMe } from '@/lib/auth';

export default function ProjectsPage() {
  const me = useMe();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ orgId: '', title: '', budget: '' });
  const canCreate = hasRole(me, 'SYSTEM_ADMIN', 'ACCOUNT_MANAGER');

  const load = () => api<Project[]>('/projects').then(setProjects).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    if (canCreate) api<Org[]>('/organizations').then((o) => { setOrgs(o.filter((x: any) => !x.isAgency)); });
  }, [canCreate]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/projects', { method: 'POST', body: JSON.stringify({ orgId: form.orgId, title: form.title, budget: Number(form.budget || 0) }) });
      setForm({ orgId: '', title: '', budget: '' });
      load();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-indigo">Your projects</h1>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!projects ? <p className="text-sm">Loading projects…</p> : projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-sm">No projects yet. Your account manager will add one when work begins.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/portal/projects/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-mist">
                <span><span className="block font-semibold">{p.title}</span>{me?.isInternal && <span className="text-sm text-slate2/70">{p.org?.name}</span>}</span>
                <span className="text-sm"><span className="rounded-full bg-mist px-2.5 py-0.5 font-medium">{p.status.toLowerCase()}</span>{me?.isInternal && <span className="ml-3">{money(p.budget)}</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canCreate && (
        <form onSubmit={create} className="grid gap-3 rounded-xl border border-line bg-white p-5 sm:grid-cols-4">
          <h2 className="text-lg font-semibold sm:col-span-4">Create a project</h2>
          <select className="field" required value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })} aria-label="Client">
            <option value="">Choose client</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <input className="field" required placeholder="Project title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="field" type="number" min="0" placeholder="Budget (USD)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          <button className="btn btn-primary">Create project</button>
        </form>
      )}
    </div>
  );
}
