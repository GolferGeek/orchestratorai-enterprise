import {
  businessOutline,
  keyOutline,
  peopleOutline,
  shieldOutline,
} from 'ionicons/icons';

export interface AdminModuleRoute {
  label: string;
  path: string;
  apiPrefix: string;
  permission: string;
  description: string;
  icon: string;
}

// Copied from the legacy AdminShell management section and adapted to
// unified in-app routes.
export const adminModuleRoutes: AdminModuleRoute[] = [
  {
    label: 'Organizations',
    path: '/app/admin/organizations',
    apiPrefix: '/admin/organizations',
    permission: 'admin:settings',
    description: 'Manage organizations and tenant-level administration.',
    icon: businessOutline,
  },
  {
    label: 'Users',
    path: '/app/admin/users',
    apiPrefix: '/auth/admin/users',
    permission: 'admin:users',
    description: 'Manage users, access, and account administration.',
    icon: peopleOutline,
  },
  {
    label: 'Roles',
    path: '/app/admin/roles',
    apiPrefix: '/rbac/roles',
    permission: 'admin:roles',
    description: 'View roles, permissions, and RBAC assignments.',
    icon: shieldOutline,
  },
  {
    label: 'Entitlements',
    path: '/app/admin/entitlements',
    apiPrefix: '/auth/entitlements',
    permission: 'admin:settings',
    description: 'Grant or revoke platform capability access per organization.',
    icon: keyOutline,
  },
];
