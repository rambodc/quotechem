import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const ROLE = {
  PLATFORM_ADMIN: 'platform_admin',
  SHOW_OWNER: 'show_owner',
  SHOW_ADMIN: 'show_admin',
  SHOW_EDITOR: 'show_editor',
  SHOW_VIEWER: 'show_viewer',
  PROVIDER_MANAGER: 'provider_manager',
  PROVIDER_WORKER: 'provider_worker',
  PROVIDER_FINANCE: 'provider_finance',
};

export function usePlatformAdmin(uid) {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setIsPlatformAdmin(false);
      setLoading(false);
      return undefined;
    }

    const ref = doc(db, 'platformAdmins', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setIsPlatformAdmin(snap.exists());
        setLoading(false);
      },
      () => {
        setIsPlatformAdmin(false);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid]);

  return { isPlatformAdmin, loading };
}

export function useShowMembership(showId, uid) {
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showId || !uid) {
      setRole('');
      setLoading(false);
      return undefined;
    }

    const ref = doc(db, 'shows', showId, 'members', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() || {} : {};
        setRole(data.role || '');
        setLoading(false);
      },
      () => {
        setRole('');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [showId, uid]);

  return { role, loading };
}

export function canManageShowJobs({ isPlatformAdmin, memberRole }) {
  if (isPlatformAdmin) return true;
  return memberRole === ROLE.SHOW_OWNER || memberRole === ROLE.SHOW_ADMIN;
}
