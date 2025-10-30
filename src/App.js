// src/App.js
import React, { useEffect, useState, createContext } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Public pages
import LandingPage from './landing/LandingPage';
import Login from './auth/Login';
import Signup from './auth/Signup';
import ForgotPassword from './auth/ForgotPassword';
import Artists from './artists/Artists';
import ArtistList from './artists/artistList';

// Protected pages
import Home from './home/Home';
import DropList from './drop/dropList';
import DropDetail from './drop/DropDetail';
import CreateArtist from './create-artist/create-artist';
import CreateDrop from './create-drop/CreateDrop';
import BecomeArtist from './become-artist/BecomeArtist';
import AlbumList from './albums/AlbumList';
import AlbumDetail from './albums/AlbumDetail';
import CreateAlbum from './create-album/CreateAlbum';
import More from './more/More';
import Terms from './terms/Terms';
import Services from './services/Services';
import Account from './account';
import ChangeEmail from './account/ChangeEmail';
import ChangePassword from './account/ChangePassword';

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
          path="/drops"
          element={
            <ProtectedRoute>
              <DropList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/albums"
          element={
            <ProtectedRoute>
              <AlbumList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/album/:albumId"
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
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      setCheckingAuth(false);

      if (!u) {
        setAppUser(null);
        setCheckingProfile(false);
        return;
      }

      try {
        // Load canonical user at /users/{auth.uid}
        const userRef = doc(db, 'users', u.uid);
        let userSnap = await getDoc(userRef);

        // If missing, initialize a minimal profile
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

        const data = userSnap.exists() ? userSnap.data() : {};
        setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null, ...data });
      } catch (err) {
        console.error('Failed to load app user profile:', err);
        setAppUser({ id: u.uid, firebaseUid: u.uid, email: u.email ?? null });
      } finally {
        setCheckingProfile(false);
      }
    });

    return () => unsub();
  }, []);

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
