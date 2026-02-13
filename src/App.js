import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import AppShell from './layout/AppShell';
import Home from './home/Home';
import More from './more/More';
import Account from './account/Account';
import ChangeEmail from './account/ChangeEmail';
import ChangePassword from './account/ChangePassword';
import EditUsername from './account/EditUsername';
import Login from './auth/Login';
import Signup from './auth/Signup';
import ForgotPassword from './auth/ForgotPassword';

export const UserContext = createContext(null);

function ProtectedRoute({ user, checking, children }) {
  if (checking) return null;
  return user ? children : <Navigate to="/signin" replace />;
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(true);
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
        setCheckingProfile(false);
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

        profileUnsubRef.current = onSnapshot(
          userRef,
          async (profileSnap) => {
            let data = profileSnap.exists() ? profileSnap.data() || {} : {};
            const updates = {};

            const finalUsername = deriveUsername(data, u);
            if (!data.username) updates.username = finalUsername;
            if (!data.usernameNormalized) {
              updates.usernameNormalized = normalizeUsername(finalUsername);
            }
            if (Object.keys(updates).length) {
              updates.updatedAt = serverTimestamp();
              await setDoc(userRef, updates, { merge: true });
              data = { ...data, ...updates };
            }

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
            setCheckingProfile(false);
          },
          () => {
            setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null });
            setCheckingProfile(false);
          }
        );
      } catch {
        setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null });
        setCheckingProfile(false);
      }
    });

    return () => {
      if (profileUnsubRef.current) profileUnsubRef.current();
      unsub();
    };
  }, []);

  const checking = checkingAuth || checkingProfile;
  const contextValue = useMemo(() => appUser, [appUser]);

  return (
    <Router>
      <UserContext.Provider value={contextValue}>
        <Routes>
          <Route path="/" element={<AppShell user={contextValue} />}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="more" element={<More />} />
            <Route
              path="account"
              element={
                <ProtectedRoute user={firebaseUser} checking={checking}>
                  <Account />
                </ProtectedRoute>
              }
            />
            <Route
              path="account/email"
              element={
                <ProtectedRoute user={firebaseUser} checking={checking}>
                  <ChangeEmail />
                </ProtectedRoute>
              }
            />
            <Route
              path="account/password"
              element={
                <ProtectedRoute user={firebaseUser} checking={checking}>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />
            <Route
              path="account/username"
              element={
                <ProtectedRoute user={firebaseUser} checking={checking}>
                  <EditUsername />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="/signin" element={!firebaseUser ? <Login /> : <Navigate to="/more" replace />} />
          <Route path="/signup" element={!firebaseUser ? <Signup /> : <Navigate to="/more" replace />} />
          <Route path="/forgot" element={!firebaseUser ? <ForgotPassword /> : <Navigate to="/more" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </UserContext.Provider>
    </Router>
  );
}

export default App;
