import { UserRole } from '@/types';

/**
 * Business permissions are deliberately capability-based.  A screen should ask
 * for the thing it needs instead of duplicating a list of roles in every UI.
 */
export type Permission =
  | 'analytics.view'
  | 'business-settings.manage'
  | 'costs.view'
  | 'inventory.manage'
  | 'purchases.view'
  | 'purchases.manage'
  | 'stock-history.view'
  | 'stock-history.export';

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  owner: [
    'analytics.view',
    'business-settings.manage',
    'costs.view',
    'inventory.manage',
    'purchases.view',
    'purchases.manage',
    'stock-history.view',
    'stock-history.export',
  ],
  manager: [
    'business-settings.manage',
    'costs.view',
    'inventory.manage',
    'purchases.view',
    'purchases.manage',
    'stock-history.view',
    'stock-history.export',
  ],
  cashier: [
    'stock-history.view',
  ],
  auditor: [
    'costs.view',
    'purchases.view',
    'stock-history.view',
    'stock-history.export',
  ],
};

export const hasPermission = (role: UserRole | null | undefined, permission: Permission) =>
  Boolean(role && rolePermissions[role]?.includes(permission));

export const canViewFinancialData = (role: UserRole | null | undefined) =>
  hasPermission(role, 'costs.view');

export const canManagePurchases = (role: UserRole | null | undefined) =>
  hasPermission(role, 'purchases.manage');

