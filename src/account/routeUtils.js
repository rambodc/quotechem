export function accountBaseForRole(role) {
  return role === 'admin' ? '/admin/account' : '/user/account';
}
