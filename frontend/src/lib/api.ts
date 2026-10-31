export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export type Role = 'SYSTEM_ADMIN' | 'ACCOUNT_MANAGER' | 'SPECIALIST' | 'CLIENT_ADMIN' | 'CLIENT_REVIEWER';
export interface Me { userId: string; orgId: string; email: string; roles: Role[]; isInternal: boolean; fullName?: string; orgName?: string }
export interface Org { id: string; name: string }
export interface Project { id: string; orgId: string; title: string; status: string; budget: string; startDate: string | null; org?: Org }
export type DStatus = 'DRAFT' | 'IN_INTERNAL_REVIEW' | 'PENDING_CLIENT_APPROVAL' | 'APPROVED' | 'REVISION_REQUESTED';
export interface Deliverable { id: string; title: string; approvalStatus: DStatus; feedback: string | null; dueDate: string | null }
export interface Asset { id: string; fileName: string; version: number; fileSize: number; visibility: 'INTERNAL' | 'CLIENT' }
export interface Invoice { id: string; amount: string; status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE'; dueDate: string; org?: Org; project?: { title: string } | null }

export const TOKEN_KEY = 'saiam_token';
export const USER_KEY = 'saiam_user';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ? [].concat(body.message).join(', ') : res.statusText);
  }
  return res.json();
}

export const hasRole = (me: Me | null, ...roles: Role[]) => !!me && me.roles.some((r) => roles.includes(r));
export const money = (v: string | number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'USD' }).format(Number(v));

/** Mirrors the backend state machine so the UI only offers valid actions (backend remains the authority). */
export const ACTIONS: Record<DStatus, { to: DStatus; label: string; roles: Role[]; needsFeedback?: boolean }[]> = {
  DRAFT: [{ to: 'IN_INTERNAL_REVIEW', label: 'Send to internal review', roles: ['SYSTEM_ADMIN', 'ACCOUNT_MANAGER', 'SPECIALIST'] }],
  IN_INTERNAL_REVIEW: [
    { to: 'PENDING_CLIENT_APPROVAL', label: 'Send to client', roles: ['SYSTEM_ADMIN', 'ACCOUNT_MANAGER'] },
    { to: 'DRAFT', label: 'Back to draft', roles: ['SYSTEM_ADMIN', 'ACCOUNT_MANAGER', 'SPECIALIST'] },
  ],
  PENDING_CLIENT_APPROVAL: [
    { to: 'APPROVED', label: 'Approve', roles: ['CLIENT_ADMIN'] },
    { to: 'REVISION_REQUESTED', label: 'Request changes', roles: ['CLIENT_ADMIN', 'CLIENT_REVIEWER'], needsFeedback: true },
  ],
  REVISION_REQUESTED: [{ to: 'IN_INTERNAL_REVIEW', label: 'Start revision', roles: ['SYSTEM_ADMIN', 'ACCOUNT_MANAGER', 'SPECIALIST'] }],
  APPROVED: [],
};
export const STATUS_LABEL: Record<DStatus, string> = {
  DRAFT: 'Draft', IN_INTERNAL_REVIEW: 'In internal review', PENDING_CLIENT_APPROVAL: 'Waiting for client',
  APPROVED: 'Approved', REVISION_REQUESTED: 'Changes requested',
};
