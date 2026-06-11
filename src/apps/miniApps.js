import { FiClipboard, FiDroplet, FiShield, FiUser } from 'react-icons/fi';

export const MINI_APPS = [
  {
    id: 'quotes',
    label: 'Quotes',
    description: 'Manage quote leads, customers, and activity.',
    icon: FiClipboard,
    adminOnly: false,
    defaultVisibleForRoles: ['admin'],
    defaultPath: '/apps/quotes',
    navItems: [
      { path: '/apps/quotes/dashboard', label: 'Dashboard' },
      { path: '/apps/quotes/leads', label: 'Leads' },
      { path: '/apps/quotes/customers', label: 'Customers' },
    ],
  },
  {
    id: 'drilling-fluids-report',
    label: 'Testing Offline',
    description: 'Offline-capable testing workspace for field report workflows.',
    icon: FiDroplet,
    adminOnly: false,
    defaultVisibleForRoles: ['admin'],
    defaultPath: '/apps/drilling-fluids-report',
    navItems: [],
  },
  {
    id: 'user-access',
    label: 'User Access',
    description: 'Create users and control visible mini apps.',
    icon: FiShield,
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
    adminOnly: false,
    alwaysVisible: true,
    defaultVisibleForRoles: ['admin', 'user'],
    defaultPath: '/apps/account',
    navItems: [
      { path: '/apps/account', label: 'Overview' },
      { path: '/apps/account/email', label: 'Email' },
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
