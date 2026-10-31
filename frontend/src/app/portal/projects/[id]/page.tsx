'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { ACTIONS, api, Asset, Deliverable, hasRole, Project, STATUS_LABEL } from '@/lib/api';
import { useMe } from '@/lib/auth';

function DeliverableCard({ d, reload }: { d: Deliverable; reload: () => void }) {
  const me = useMe();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [feedback, setFeedback] = useState('');
  const [msg, setMsg] = useState('');
  const canUpload = hasRole(me, 'SYSTEM_ADMIN', 'ACCOUNT_MANAGER', 'SPECIALIST');
  const actions = ACTIONS[d.approvalStatus].filter((a) => me?.roles.some((r) => a.roles.includes(r)));

  const loadAssets = useCallback(() => api<Asset[]>(`/deliverables/${d.id}/assets`).then(setAssets).catch(() => setAssets([])), [d.id]);
  useEffect(() => { loadAssets(); }, [loadAssets]);

  async function move(to: string, needsFeedback?: boolean) {
    if (needsFeedback && !feedback.trim()) return setMsg('Describe the changes you need before sending.');
    try {
      await api(`/deliverables/${d.id}/transition`, { method: 'PATCH', body: JSON.stringify({ to, feedback: feedback || undefined }) });
      setFeedback(''); setMsg(''); reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setMsg('Uploading…');
      const { uploadUrl } = await api<{ uploadUrl: string }>(`/deliverables/${d.id}/assets/upload-url`, {
        method: 'POST', body: JSON.stringify({ fileName: file.name, fileSize: file.size, visibility: 'CLIENT' }),
      });
      const put = await fetch(uploadUrl, { method: 'PUT', body: file });
      if (!put.ok) throw new Error('Storage rejected the upload');
      setMsg('Uploaded as a new version.'); loadAssets();
    } catch (err) { setMsg((err as Error).message); }
    e.target.value = '';
  }

  async function download(id: string) {
    const { url } = await api<{ url: string }>(`/assets/${id}/download-url`);
    window.open(url, '_blank', 'noopener');
  }

  return (
    <li className="space-y-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{d.title}</h3>
        <span className="rounded-full bg-mist px-3 py-1 text-sm font-medium">{STATUS_LABEL[d.approvalStatus]}</span>
      </div>
      {d.feedback && d.approvalStatus === 'REVISION_REQUESTED' && <p className="rounded-md bg-amber-50 p-3 text-sm"><strong>Requested changes:</strong> {d.feedback}</p>}
      <div>
        <p className="text-sm font-medium">Files</p>
        {!assets ? <p className="text-sm">Loading files…</p> : assets.length === 0 ? <p className="text-sm text-slate2/70">No files uploaded yet.</p> : (
          <ul className="mt-1 space-y-1 text-sm">
            {assets.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <span>v{a.version} · {a.fileName}</span>
                <button className="text-indigo underline" onClick={() => download(a.id)}>Download</button>
              </li>
            ))}
          </ul>
        )}
        {canUpload && <label className="mt-2 block text-sm">Upload a new version <input type="file" onChange={upload} className="mt-1 block text-sm" /></label>}
      </div>
      {actions.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          {actions.some((a) => a.needsFeedback) && <textarea className="field" rows={2} placeholder="What should change? (required to request changes)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />}
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => <button key={a.to} className={`btn ${a.to === 'APPROVED' ? 'btn-accent' : 'btn-ghost'}`} onClick={() => move(a.to, a.needsFeedback)}>{a.label}</button>)}
          </div>
        </div>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </li>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<Deliverable[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const canCreate = hasRole(me, 'SYSTEM_ADMIN', 'ACCOUNT_MANAGER');

  const load = useCallback(() => {
    api<Project>(`/projects/${id}`).then(setProject).catch((e) => setError(e.message));
    api<Deliverable[]>(`/projects/${id}/deliverables`).then(setItems).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    await api(`/projects/${id}/deliverables`, { method: 'POST', body: JSON.stringify({ title }) });
    setTitle(''); load();
  }

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  return (
    <div className="space-y-6">
      <Link href="/portal" className="text-sm text-indigo underline">All projects</Link>
      <h1 className="text-3xl font-bold text-indigo">{project?.title ?? 'Loading…'}</h1>
      {items && items.length === 0 && <p className="rounded-lg border border-dashed border-line p-6 text-sm">Nothing to review yet. Deliverables appear here once the team sends them to you.</p>}
      <ul className="space-y-4">{items?.map((d) => <DeliverableCard key={d.id} d={d} reload={load} />)}</ul>
      {canCreate && (
        <form onSubmit={add} className="flex gap-3 rounded-xl border border-line bg-white p-5">
          <input className="field" required placeholder="New deliverable title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary whitespace-nowrap">Add deliverable</button>
        </form>
      )}
    </div>
  );
}
