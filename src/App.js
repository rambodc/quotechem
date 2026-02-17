import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Home from './home/Home';
import Login from './auth/Login';
import ForgotPassword from './auth/ForgotPassword';
import Account from './account/Account';
import ChangeEmail from './account/ChangeEmail';
import ChangePassword from './account/ChangePassword';
import EditUsername from './account/EditUsername';
import PortalLayout from './layout/PortalLayout';
import Dashboard from './admin/Dashboard';
import Leads from './admin/Leads';
import Customers from './admin/Customers';
import UserHome from './user/UserHome';

export const UserContext = createContext(null);

function normalizeRole(value) {
  return String(value || '').toLowerCase() === 'admin' ? 'admin' : 'user';
}

function ProtectedRoute({ user, checking, children }) {
  if (checking) return null;
  return user ? children : <Navigate to="/signin" replace />;
}

function AdminRoute({ user, checking, role, children }) {
  if (checking) return null;
  if (!user) return <Navigate to="/signin" replace />;
  return role === 'admin' ? children : <Navigate to="/user/home" replace />;
}

function PortalRedirect({ role }) {
  return <Navigate to={role === 'admin' ? '/admin/dashboard' : '/user/home'} replace />;
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const profileUnsubRef = useRef(null);

  const normalizeUsername = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);

  const deriveUsername = (data, user) => {
    const existing = typeof data.username === 'string' ? data.username.trim() : '';
    if (existing) return existing;
    const emailPart = (user?.email || '').split('@')[0] || '';
    const candidate = normalizeUsername(emailPart || user?.uid || 'user');
    if (candidate.length >= 3) return candidate;
    return `user_${(user?.uid || '').slice(0, 6) || '000001'}`;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      setCheckingAuth(false);

      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      if (!u) {
        setAppUser(null);
        return;
      }

      try {
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          const now = serverTimestamp();
          const generatedUsername = deriveUsername({}, u);
          await setDoc(
            userRef,
            {
              uid: u.uid,
              email: u.email ?? null,
              firstName: '',
              lastName: '',
              role: 'user',
              username: generatedUsername,
              usernameNormalized: normalizeUsername(generatedUsername),
              primaryAuthUid: u.uid,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        }

        profileUnsubRef.current = onSnapshot(userRef, (profileSnap) => {
          const data = profileSnap.exists() ? profileSnap.data() || {} : {};
          const finalUsername = deriveUsername(data, u);

          setAppUser({
            id: u.uid,
            firebaseUid: u.uid,
            email: u.email ?? null,
            role: normalizeRole(data.role),
            firstName: typeof data.firstName === 'string' ? data.firstName : '',
            lastName: typeof data.lastName === 'string' ? data.lastName : '',
            username: typeof data.username === 'string' ? data.username : finalUsername,
            usernameNormalized:
              typeof data.usernameNormalized === 'string'
                ? data.usernameNormalized
                : normalizeUsername(finalUsername),
          });
        });
      } catch {
        setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null, role: 'user' });
      }
    });

    return () => {
      if (profileUnsubRef.current) profileUnsubRef.current();
      unsub();
    };
  }, []);

  const contextValue = useMemo(() => appUser, [appUser]);
  const role = normalizeRole(appUser?.role);

  return (
    <Router>
      <UserContext.Provider value={contextValue}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route
            path="/signin"
            element={firebaseUser ? <Navigate to="/portal" replace /> : <Login />}
          />
          <Route
            path="/forgot"
            element={firebaseUser ? <Navigate to="/portal" replace /> : <ForgotPassword />}
          />

          <Route
            path="/portal"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <PortalRedirect role={role} />
              </ProtectedRoute>
            }
          />
          <Route path="/account" element={<Navigate to="/portal" replace />} />
          <Route path="/account/*" element={<Navigate to="/portal" replace />} />

          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute user={firebaseUser} checking={checkingAuth} role={role}>
                <PortalLayout user={contextValue} role="admin">
                  <Dashboard />
                </PortalLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/leads"
            element={
              <AdminRoute user={firebaseUser} checking={checkingAuth} role={role}>
                <PortalLayout user={contextValue} role="admin">
                  <Leads />
                </PortalLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <AdminRoute user={firebaseUser} checking={checkingAuth} role={role}>
                <PortalLayout user={contextValue} role="admin">
                  <Customers />
                </PortalLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/account"
            element={
              <AdminRoute user={firebaseUser} checking={checkingAuth} role={role}>
                <PortalLayout user={contextValue} role="admin">
                  <Account />
                </PortalLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/account/email"
            element={
              <AdminRoute user={firebaseUser} checking={checkingAuth} role={role}>
                <PortalLayout user={contextValue} role="admin">
                  <ChangeEmail />
                </PortalLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/account/password"
            element={
              <AdminRoute user={firebaseUser} checking={checkingAuth} role={role}>
                <PortalLayout user={contextValue} role="admin">
                  <ChangePassword />
                </PortalLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/account/username"
            element={
              <AdminRoute user={firebaseUser} checking={checkingAuth} role={role}>
                <PortalLayout user={contextValue} role="admin">
                  <EditUsername />
                </PortalLayout>
              </AdminRoute>
            }
          />

          <Route
            path="/user/home"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <PortalLayout user={contextValue} role="user">
                  <UserHome />
                </PortalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/account"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <PortalLayout user={contextValue} role="user">
                  <Account />
                </PortalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/account/email"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <PortalLayout user={contextValue} role="user">
                  <ChangeEmail />
                </PortalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/account/password"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <PortalLayout user={contextValue} role="user">
                  <ChangePassword />
                </PortalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/account/username"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <PortalLayout user={contextValue} role="user">
                  <EditUsername />
                </PortalLayout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </UserContext.Provider>
    </Router>
  );
}

export default App;
