export enum RoleName {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  ACCOUNT_MANAGER = 'ACCOUNT_MANAGER',
  SPECIALIST = 'SPECIALIST',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  CLIENT_REVIEWER = 'CLIENT_REVIEWER',
}

export interface AuthUser {
  userId: string;
  orgId: string;
  email: string;
  roles: RoleName[];
  isInternal: boolean; // belongs to the agency organization
}
