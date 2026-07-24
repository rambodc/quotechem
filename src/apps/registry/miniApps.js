import { FiBox, FiDollarSign, FiPackage, FiShield, FiUser } from 'react-icons/fi';

export const MINI_APPS = [
  {
    id: 'uniquem',
    label: 'Uniquem',
    description: 'Manage products, package inventory, receiving, shipping, and production.',
    icon: FiPackage,
    adminOnly: false,
    defaultVisibleForRoles: ['admin'],
    defaultPath: '/apps/uniquem/dashboard',
    navItems: [
      { path: '/apps/uniquem/dashboard', label: 'Dashboard' },
      { path: '/apps/uniquem/products', label: 'Products' },
      { path: '/apps/uniquem/inventory', label: 'Inventory' },
      { path: '/apps/uniquem/receiving', label: 'Receiving' },
      { path: '/apps/uniquem/shipping', label: 'Shipping' },
      { path: '/apps/uniquem/production', label: 'Production' },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    description: 'Create test customers and products for QuickBooks Desktop IIF export.',
    icon: FiDollarSign,
    adminOnly: false,
    defaultVisibleForRoles: ['admin'],
    defaultPath: '/apps/accounting/dashboard',
    navItems: [
      { path: '/apps/accounting/dashboard', label: 'Dashboard' },
      { path: '/apps/accounting/customers', label: 'Customers' },
      { path: '/apps/accounting/products', label: 'Products' },
      { path: '/apps/accounting/export', label: 'Export' },
    ],
  },
  {
    id: 'three-d',
    label: '3D',
    description: 'View the 3D warehouse and create saved 3D models.',
    icon: FiBox,
    adminOnly: false,
    defaultVisibleForRoles: ['admin'],
    defaultPath: '/apps/3d/viewer',
    navItems: [
      { path: '/apps/3d/viewer', label: '3D' },
      { path: '/apps/3d/creator', label: '3D Creator' },
    ],
  },
  {
    id: 'user-access',
    label: 'User Access',
    description: 'Create users and control visible mini apps.',
    icon: FiShield,
    iconImage: '/assets/portal-icons/user-access.png',
    adminOnly: true,
    defaultVisibleForRoles: ['admin'],
    defaultPath: '/apps/user-access',
    navItems: [],
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Manage profile and sign-in settings.',
    icon: FiUser,
    iconImage: '/assets/portal-icons/account.png',
    adminOnly: false,
    alwaysVisible: true,
    defaultVisibleForRoles: ['admin', 'user'],
    defaultPath: '/apps/account',
    navItems: [
      { path: '/apps/account', label: 'Overview' },
      { path: '/apps/account/password', label: 'Password' },
    ],
  },
];

export const ACCESS_MANAGED_MINI_APPS = MINI_APPS.filter((app) => !app.adminOnly && !app.alwaysVisible);

export function getMiniApp(appId) {
  return MINI_APPS.find((app) => app.id === appId) || null;
}

export function defaultMiniAppIdsForRole(role) {
  return MINI_APPS.filter((app) => app.defaultVisibleForRoles.includes(role)).map((app) => app.id);
}

function normalizeEnabledMiniApps(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : null;
}

export function canAccessMiniApp(app, role, enabledMiniApps) {
  if (!app) return false;
  if (app.alwaysVisible) return true;
  if (role === 'admin' && app.adminOnly) return true;
  if (role === 'admin' && app.defaultVisibleForRoles.includes('admin')) return true;
  if (app.adminOnly) return false;

  const explicit = normalizeEnabledMiniApps(enabledMiniApps);
  if (explicit) return explicit.includes(app.id);
  return app.defaultVisibleForRoles.includes(role);
}

export function visibleMiniAppsForUser(user) {
  const role = user?.role || 'user';
  return MINI_APPS.filter((app) => canAccessMiniApp(app, role, user?.enabledMiniApps));
}
