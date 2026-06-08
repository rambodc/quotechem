import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import ChatPage from './home/Home';
import CatalogHome from './home/CatalogHome';
import ProductPage from './home/ProductPage';
import Login from './auth/Login';
import Signup from './auth/Signup';
import ForgotPassword from './auth/ForgotPassword';
import Account from './account/Account';
import ChangeEmail from './account/ChangeEmail';
import ChangePassword from './account/ChangePassword';
import PortalLayout from './layout/PortalLayout';
import AppLauncher from './apps/AppLauncher';
import { canAccessMiniApp, getMiniApp } from './apps/miniApps';
import Dashboard from './admin/Dashboard';
import Leads from './admin/Leads';
import Customers from './admin/Customers';

export const UserContext = createContext(null);

function normalizeRole(value) {
  return String(value || '').toLowerCase() === 'admin' ? 'admin' : 'user';
}

function ProtectedRoute({ user, checking, children }) {
  if (checking) return null;
  return user ? children : <Navigate to="/signin" replace />;
}

function MiniAppRoute({ user, checking, role, appId, appPath, children }) {
  if (checking) return null;
  if (!user) return <Navigate to="/signin" replace />;

  const app = getMiniApp(appId);
  if (!canAccessMiniApp(app, role)) return <Navigate to="/portal" replace />;

  if (!appPath) return <Navigate to={app.defaultPath} replace />;

  return (
    <PortalLayout user={user} app={app}>
      {children}
    </PortalLayout>
  );
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const profileUnsubRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);

      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      if (!u) {
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

          setAppUser({
            id: u.uid,
            firebaseUid: u.uid,
            email: u.email ?? null,
            role: normalizeRole(data.role),
            firstName: typeof data.firstName === 'string' ? data.firstName : '',
            lastName: typeof data.lastName === 'string' ? data.lastName : '',
          });
          setCheckingAuth(false);
        });
      } catch {
        setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null, role: 'user' });
        setCheckingAuth(false);
      }
    });

    return () => {
      if (profileUnsubRef.current) profileUnsubRef.current();
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const contextValue = useMemo(() => appUser, [appUser]);
  const role = normalizeRole(appUser?.role);

  return (
    <Router>
      <UserContext.Provider value={contextValue}>
        <Routes>
          <Route path="/" element={<CatalogHome />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chemicals/:slug" element={<ProductPage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route
            path="/signin"
            element={firebaseUser ? <Navigate to="/portal" replace /> : <Login />}
          />
          <Route
            path="/signup"
            element={firebaseUser ? <Navigate to="/portal" replace /> : <Signup />}
          />
          <Route
            path="/forgot"
            element={firebaseUser ? <Navigate to="/portal" replace /> : <ForgotPassword />}
          />

          <Route
            path="/portal"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <PortalLayout user={contextValue}>
                  <AppLauncher role={role} />
                </PortalLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/account" element={<Navigate to="/portal" replace />} />
          <Route path="/account/*" element={<Navigate to="/portal" replace />} />

          <Route
            path="/apps/quotes"
            element={
              <MiniAppRoute user={firebaseUser} checking={checkingAuth} role={role} appId="quotes" />
            }
          />
          <Route
            path="/apps/quotes/dashboard"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} role={role} appId="quotes" appPath="dashboard">
                <Dashboard />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/quotes/leads"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} role={role} appId="quotes" appPath="leads">
                <Leads />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/quotes/customers"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} role={role} appId="quotes" appPath="customers">
                <Customers />
              </MiniAppRoute>
            }
          />

          <Route
            path="/apps/account"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} role={role} appId="account" appPath="overview">
                <Account />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/account/email"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} role={role} appId="account" appPath="email">
                <ChangeEmail />
              </MiniAppRoute>
            }
          />
          <Route
            path="/apps/account/password"
            element={
              <MiniAppRoute user={contextValue} checking={checkingAuth} role={role} appId="account" appPath="password">
                <ChangePassword />
              </MiniAppRoute>
            }
          />

          <Route path="/admin/*" element={<Navigate to="/portal" replace />} />
          <Route path="/user/*" element={<Navigate to="/portal" replace />} />
          <Route path="/apps/*" element={<Navigate to="/portal" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </UserContext.Provider>
    </Router>
  );
}

export default App;
