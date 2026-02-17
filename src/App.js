import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Home2 from './home/Home2';
import Login from './auth/Login';
import ForgotPassword from './auth/ForgotPassword';
import More from './more/More';
import Account from './account/Account';
import ChangeEmail from './account/ChangeEmail';
import ChangePassword from './account/ChangePassword';
import EditUsername from './account/EditUsername';
import AdminLayout from './layout/AdminLayout';

export const UserContext = createContext(null);

function ProtectedRoute({ user, checking, children }) {
  if (checking) return null;
  return user ? children : <Navigate to="/signin" replace />;
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
        setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null });
      }
    });

    return () => {
      if (profileUnsubRef.current) profileUnsubRef.current();
      unsub();
    };
  }, []);

  const contextValue = useMemo(() => appUser, [appUser]);

  return (
    <Router>
      <UserContext.Provider value={contextValue}>
        <Routes>
          <Route path="/" element={<Home2 />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/home2" element={<Navigate to="/" replace />} />
          <Route
            path="/signin"
            element={firebaseUser ? <Navigate to="/more" replace /> : <Login />}
          />
          <Route
            path="/forgot"
            element={firebaseUser ? <Navigate to="/more" replace /> : <ForgotPassword />}
          />

          <Route
            path="/more"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <AdminLayout user={contextValue}>
                  <More />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <AdminLayout user={contextValue}>
                  <Account />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/account/email"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <AdminLayout user={contextValue}>
                  <ChangeEmail />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/account/password"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <AdminLayout user={contextValue}>
                  <ChangePassword />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/account/username"
            element={
              <ProtectedRoute user={firebaseUser} checking={checkingAuth}>
                <AdminLayout user={contextValue}>
                  <EditUsername />
                </AdminLayout>
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
