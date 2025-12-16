// src/App.js
import React, { useEffect, useState, useRef, createContext } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, functions } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// Public pages
import LandingPage from './landing/LandingPage';
import Login from './auth/Login';
import Signup from './auth/Signup';
import ForgotPassword from './auth/ForgotPassword';
import Artists from './artists/Artists';
import ArtistList from './artists/artistList';

// Protected pages
import Home from './home/Home';
import DropDetail from './drop/DropDetail';
import CreateArtist from './create-artist/create-artist';
import CreateDrop from './create-drop/CreateDrop';
import BecomeArtist from './become-artist/BecomeArtist';
import AlbumList from './albums/AlbumList';
import AlbumDetail from './albums/AlbumDetail';
import CreateAlbum from './create-album/CreateAlbum';
import History from './history/History';
import More from './more/More';
import Terms from './terms/Terms';
import Services from './services/Services';
import Account from './account';
import ChangeEmail from './account/ChangeEmail';
import ChangePassword from './account/ChangePassword';
import EditUsername from './account/EditUsername';

// Route guard
import ProtectedRoute from './ProtectedRoute';

// App-wide user context (used by Home, etc.)
export const UserContext = createContext(null);

function AppRoutes({ user }) {
  return (
    <>
      <ScrollRestoration />
      <Routes>
        {/* Public */}
        <Route path="/" element={user ? <Navigate to="/home" /> : <LandingPage />} />
        <Route path="/signin" element={!user ? <Login /> : <Navigate to="/home" />} />
        <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/home" />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/artist/:artistUid" element={<Artists />} />

        {/* Protected */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/artists"
          element={
            <ProtectedRoute>
              <ArtistList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchased"
          element={
            <ProtectedRoute>
              <AlbumList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/set/:albumId"
          element={
            <ProtectedRoute>
              <AlbumDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-artists"
          element={
            <ProtectedRoute>
              <CreateArtist />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-album"
          element={
            <ProtectedRoute>
              <CreateAlbum />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-drop"
          element={
            <ProtectedRoute>
              <CreateDrop />
            </ProtectedRoute>
          }
        />
        <Route
          path="/become-artist"
          element={
            <ProtectedRoute>
              <BecomeArtist />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drop/:dropId"
          element={
            <ProtectedRoute>
              <DropDetail />
            </ProtectedRoute>
          }
        />
        {/* More + subpages */}
        <Route
          path="/more"
          element={
            <ProtectedRoute>
              <More />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />
        <Route
          path="/username"
          element={
            <ProtectedRoute>
              <EditUsername />
            </ProtectedRoute>
          }
        />
        <Route
          path="/terms"
          element={
            <ProtectedRoute>
              <Terms />
            </ProtectedRoute>
          }
        />
        <Route
          path="/services"
          element={
            <ProtectedRoute>
              <Services />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account/email"
          element={
            <ProtectedRoute>
              <ChangeEmail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account/password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to={user ? '/home' : '/'} />} />
      </Routes>
    </>
  );
}

function ScrollRestoration() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);      // raw Firebase Auth user
  const [appUser, setAppUser] = useState(null);                // canonical /users/{uid} doc
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const ensureStripeCustomerPromiseRef = useRef(null);
  const profileUnsubRef = useRef(null);

  const normalizeUsername = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);

  const deriveUsername = (data, user) => {
    const existing = typeof data.username === 'string' && data.username.trim();
    if (existing) return existing.trim();
    const emailPart = (user?.email || '').split('@')[0] || '';
    const candidate = normalizeUsername(emailPart || user?.uid || 'user');
    if (candidate && candidate.length >= 3) return candidate;
    return `user_${(user?.uid || '').slice(0, 6) || Math.floor(Math.random() * 9999)}`;
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
        let userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          const now = serverTimestamp();
          await setDoc(userRef, {
            uid: u.uid,
            email: u.email ?? null,
            firstName: '',
            lastName: '',
            primaryAuthUid: u.uid,
            createdAt: now,
            updatedAt: now,
          }, { merge: true });
          userSnap = await getDoc(userRef);
        }

        profileUnsubRef.current = onSnapshot(
          userRef,
          async (snap) => {
            let data = snap.exists() ? snap.data() || {} : {};
            const updates = {};

            const ensuredFirst = typeof data.firstName === 'string' ? data.firstName : '';
            const ensuredLast = typeof data.lastName === 'string' ? data.lastName : '';
            if (ensuredFirst !== data.firstName) updates.firstName = ensuredFirst;
            if (ensuredLast !== data.lastName) updates.lastName = ensuredLast;

            const existingUsername = typeof data.username === 'string' ? data.username.trim() : '';
            let finalUsername = existingUsername;
            if (!existingUsername) {
              const generated = deriveUsername(data, u);
              finalUsername = generated;
              updates.username = generated;
              updates.usernameNormalized = normalizeUsername(generated);
            } else if (!data.usernameNormalized) {
              updates.usernameNormalized = normalizeUsername(existingUsername);
            }

            if (Object.keys(updates).length) {
              const now = serverTimestamp();
              updates.updatedAt = now;
              try {
                await setDoc(userRef, updates, { merge: true });
                data = { ...data, ...updates };
              } catch (writeErr) {
                console.error('Failed to normalize user profile:', writeErr);
              }
            }

            const finalData = {
              ...data,
              firstName: typeof data.firstName === 'string' ? data.firstName : '',
              lastName: typeof data.lastName === 'string' ? data.lastName : '',
              username: finalUsername || existingUsername,
              usernameNormalized:
                typeof data.usernameNormalized === 'string'
                  ? data.usernameNormalized
                  : normalizeUsername(finalUsername || existingUsername || ''),
            };

            setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null, ...finalData });
            setCheckingProfile(false);
          },
          (err) => {
            console.error('Failed to load app user profile:', err);
            setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null });
            setCheckingProfile(false);
          }
        );
      } catch (err) {
        console.error('Failed to load app user profile:', err);
        setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null });
        setCheckingProfile(false);
      }
    });

    return () => {
      if (profileUnsubRef.current) profileUnsubRef.current();
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!appUser?.id) return;
    if (appUser?.stripeCustomerId) return;

    if (ensureStripeCustomerPromiseRef.current) return;

    const ensureCallable = httpsCallable(functions, 'ensureStripeCustomer');
    const payload = {
      email: appUser.email || '',
      name: `${appUser.firstName || ''} ${appUser.lastName || ''}`.trim(),
    };

    ensureStripeCustomerPromiseRef.current = ensureCallable(payload)
      .then((result) => {
        const stripeCustomerId = result?.data?.stripeCustomerId;
        if (stripeCustomerId) {
          setAppUser((prev) =>
            prev ? { ...prev, stripeCustomerId } : prev
          );
        }
      })
      .catch((err) => {
        console.error('Failed to ensure Stripe customer:', err);
      })
      .finally(() => {
        ensureStripeCustomerPromiseRef.current = null;
      });
  }, [appUser, setAppUser]);

  if (checkingAuth || checkingProfile) return null; // could render a loader if you prefer

  return (
    <Router>
      <UserContext.Provider value={appUser}>
        <AppRoutes user={firebaseUser} />
      </UserContext.Provider>
    </Router>
  );
}

export default App;
