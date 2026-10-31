import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './types';

/**
 * Multi-tenant isolation (ABAC rule): a client user may only touch rows whose
 * org_id equals their own. Agency (internal) users may cross tenants.
 */
export function assertOrgAccess(user: AuthUser, orgId: string) {
  if (!user.isInternal && user.orgId !== orgId) {
    throw new ForbiddenException('Cross-tenant access denied');
  }
}

/** Returns the org filter to append to every list query. */
export function orgScope(user: AuthUser, requestedOrgId?: string): { orgId?: string } {
  if (user.isInternal) return requestedOrgId ? { orgId: requestedOrgId } : {};
  return { orgId: user.orgId };
}
