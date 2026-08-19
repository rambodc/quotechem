import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './auth/Login';
import ForgotPassword from './auth/ForgotPassword';
import InviteRegister from './auth/InviteRegister';
import Account from './account/Account';
import ChangePassword from './account/ChangePassword';
import PortalLayout from './layout/PortalLayout';
import AppLauncher from './apps/launcher';
import { canAccessMiniApp, getMiniApp } from './apps/registry/miniApps';
import Uniquem from './apps/uniquem';
import ThreeD from './apps/three-d';
import UserAccess from './admin/UserAccess';
import QuoteChem from './apps/quotechem';
import QuoteChemInbox from './apps/quotechem/QuoteChemInbox';

export const UserContext = createContext(null);

function normalizeRole(value) {
  return String(value || '').toLowerCase() === 'admin' ? 'admin' : 'user';
}

function cachedProfileKey(uid) {
  return `quotechem:user-profile:${uid}`;
}

function readCachedProfile(uid) {
  try {
    const raw = window.localStorage.getItem(cachedProfileKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(uid, profile) {
  try {
    window.localStorage.setItem(cachedProfileKey(uid), JSON.stringify(profile));
  } catch {}
}

function buildAppUser(firebaseUser, data = {}, extra = {}) {
  return {
    id: firebaseUser.uid,
    firebaseUid: firebaseUser.uid,
    email: firebaseUser.email ?? data.email ?? null,
    role: normalizeRole(data.role),
    firstName: typeof data.firstName === 'string' ? data.firstName : '',
    lastName: typeof data.lastName === 'string' ? data.lastName : '',
    profilePhotoUrl: typeof data.profilePhotoUrl === 'string' ? data.profilePhotoUrl : '',
    profilePhotoThumbUrl: typeof data.profilePhotoThumbUrl === 'string' ? data.profilePhotoThumbUrl : '',
    profilePhotoPath: typeof data.profilePhotoPath === 'string' ? data.profilePhotoPath : '',
    profilePhotoThumbPath: typeof data.profilePhotoThumbPath === 'string' ? data.profilePhotoThumbPath : '',
    enabledMiniApps: Array.isArray(data.enabledMiniApps) ? data.enabledMiniApps : null,
    ...extra,
  };
}

function ProtectedRoute({ user, checking, children }) {
  if (checking) return null;
  return user ? children : <Navigate to="/signin" replace />;
}

function MiniAppRoute({ user, checking, appId, appPath, standalone = false, children }) {
  if (checking) return null;
  if (!user) return <Navigate to="/signin" replace />;

  const app = getMiniApp(appId);
  if (!canAccessMiniApp(app, user.role, user.enabledMiniApps)) return <Navigate to="/portal" replace />;

  if (!appPath && !children) return <Navigate to={app.defaultPath} replace />;

  if (standalone) return children;

  return (
    <PortalLayout user={user} app={app}>
      {children}
    </PortalLayout>
  );
}

function App() {
  const [appUser, setAppUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const profileUnsubRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      if (!u) {
        setAppUser(null);
        setCheckingAuth(false);
        return;
      }

      if (u.isAnonymous) {
        setAppUser(null);
        setCheckingAuth(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          const now = serverTimestamp();
          await setDoc(
            userRef,
            {
              uid: u.uid,
              email: u.email ?? null,
              firstName: '',
              lastName: '',
              role: 'user',
              primaryAuthUid: u.uid,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        }

        profileUnsubRef.current = onSnapshot(userRef, (profileSnap) => {
          const data = profileSnap.exists() ? profileSnap.data() || {} : {};

          const nextUser = buildAppUser(u, data);
          writeCachedProfile(u.uid, nextUser);
          setAppUser(nextUser);
          setCheckingAuth(false);
        }, () => {
          const cached = readCachedProfile(u.uid);
          if (cached) {
            setAppUser(buildAppUser(u, cached, { offlineProfile: true }));
          } else {
            setAppUser(buildAppUser(u));
          }
          setCheckingAuth(false);
        });
      } catch {
        const cached = readCachedProfile(u.uid);
        if (cached) {
          setAppUser(buildAppUser(u, cached, { offlineProfile: true }));
        } else {
          setAppUser(buildAppUser(u));
        }
        setCheckingAuth(false);
      }
    });

    return () => {
      if (profileUnsubRef.current) profileUnsubRef.current();
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const contextValue = useMemo(() => appUser, [appUser]);

  return (
    <Router>
      <UserContext.Provider value={contextValue}>
        <Routes>
          <Route path="/operations" element={<Navigate to="/" replace />} />
          <Route path="/chemicals/*" element={<Navigate to="/" replace />} />
          <Route path="/technology" element={<Navigate to="/" replace />} />
          <Route path="/health-safety" element={<Navigate to="/" replace />} />
          <Route path="/careers" element={<Navigate to="/" replace />} />
          <Route path="/locations" element={<Navigate to="/" replace />} />
          <Route path="/contact-us" element={<Navigate to="/" replace />} />
          <Route path="/invite/:token" element={appUser ? <Navigate to="/portal" replace /> : <InviteRegister />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route
            path="/signin"
            element={appUser ? <Navigate to="/portal" replace /> : <Login />}
          />
          <Route
            path="/signup"
            element={<Navigate to={appUser ? '/portal' : '/signin'} replace />}
          />
          <Route
            path="/forgot"
            element={appUser ? <Navigate to="/portal" replace /> : <ForgotPassword />}
          />

          <Route
            path="/portal"
            element={
              <ProtectedRoute user={contextValue} checking={checkingAuth}>
                <PortalLayout user={contextValue}>
                  <AppLauncher user={contextValue} />
                </PortalLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/account" element={<Navigate to="/portal" replace />} />
          <Route path="/account/*" element={<Navigate to="/portal" replace />} />

          <Route
            path="/apps/quotechem"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="quotechem" appPath="sourcing">
                <QuoteChemInbox />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/uniquem"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="uniquem" appPath="overview">
                <Navigate to="/apps/uniquem/dashboard" replace />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/uniquem/dashboard"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="uniquem" appPath="dashboard">
                <Uniquem page="dashboard" />
              </MiniAppRoute>
            }
          />
          <Route path="/*" element={<QuoteChem key="quotechem-public" publicMode />} />
          <Route
            path="/apps/uniquem/items"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="uniquem" appPath="items">
                <Uniquem page="items" />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/uniquem/assembly"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="uniquem" appPath="assembly">
                <Uniquem page="assembly" />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/uniquem/inventory"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="uniquem" appPath="inventory">
                <Uniquem page="inventory" />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/3d"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="three-d" appPath="overview">
                <Navigate to="/apps/3d/viewer" replace />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/3d/viewer"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="three-d" appPath="viewer">
                <ThreeD page="viewer" />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/3d/creator"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="three-d" appPath="creator">
                <ThreeD page="creator" />
              </MiniAppRoute>
            }
          />

          <Route
            path="/apps/user-access"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="user-access" appPath="overview">
                <UserAccess />
              </MiniAppRoute>
            }
          />

          <Route
            path="/apps/account"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="account" appPath="overview">
                <Account />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/account/password"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} appId="account" appPath="password">
                <ChangePassword />
              </MiniAppRoute>
            }
          />

          <Route path="/admin/*" element={<Navigate to="/portal" replace />} />
          <Route path="/user/*" element={<Navigate to="/portal" replace />} />
          <Route path="/apps/*" element={<Navigate to="/portal" replace />} />

        </Routes>
      </UserContext.Provider>
    </Router>
  );
}

export default App;
