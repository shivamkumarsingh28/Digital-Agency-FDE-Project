// src/app/api/v1/ai/chat/route.ts
// OPTIONAL "gateway mode": use this when logged-in clients should see THEIR projects and invoices.
// The widget posts here (data-endpoint="/api/v1/ai/chat"); your server verifies the session cookie and
// forwards trusted identity headers to the chatbot. The browser never sees the internal secret.
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';          // your existing JWT helper

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  // Logged in -> real tenant identity. Logged out -> anonymous visitor (public knowledge only).
  const token = req.cookies.get('auth_token')?.value;
  const user = token ? verifyToken(token) : null;
  const identity = user
    ? { tenant: user.organizationId, id: user.userId, role: user.role }
    : { tenant: 'public', id: `visitor-${body.session_id ?? 'anon'}`.slice(0, 64), role: 'VISITOR' };

  const upstream = await fetch(`${process.env.AI_SERVICE_URL}/api/v1/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': identity.tenant,
      'X-User-ID': identity.id,
      'X-User-Role': identity.role,
      'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET!,
    },
    body: JSON.stringify({ message: body.message, thread_id: body.thread_id ?? null }),
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {            // pass the SSE stream through unbuffered
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
