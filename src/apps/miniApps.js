import { FiClipboard, FiUser } from 'react-icons/fi';

export const MINI_APPS = [
  {
    id: 'quotes',
    label: 'Quotes',
    description: 'Manage quote leads, customers, and activity.',
    icon: FiClipboard,
    roles: ['admin'],
    defaultPath: '/apps/quotes/dashboard',
    navItems: [
      { path: '/apps/quotes/dashboard', label: 'Dashboard' },
      { path: '/apps/quotes/leads', label: 'Leads' },
      { path: '/apps/quotes/customers', label: 'Customers' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Manage profile and sign-in settings.',
    icon: FiUser,
    roles: ['admin', 'user'],
    defaultPath: '/apps/account',
    navItems: [
      { path: '/apps/account', label: 'Overview' },
      { path: '/apps/account/email', label: 'Email' },
      { path: '/apps/account/password', label: 'Password' },
    ],
  },
];

export function getMiniApp(appId) {
  return MINI_APPS.find((app) => app.id === appId) || null;
}

export function canAccessMiniApp(app, role) {
  if (!app) return false;
  return app.roles.includes(role);
}

export function visibleMiniAppsForRole(role) {
  return MINI_APPS.filter((app) => canAccessMiniApp(app, role));
}
