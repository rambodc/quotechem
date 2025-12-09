import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, serverTimestamp, getDoc, runTransaction } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Auth.css';

// Using Firebase Auth UID as the canonical user document ID.

function Signup() {
  const isPortrait = typeof window !== 'undefined'
    ? window.matchMedia('(orientation: portrait)').matches
    : false;
  const bgUrl = `${process.env.PUBLIC_URL}/assets/${isPortrait ? 'auth-portrait.png' : 'auth-landscape.png'}`;

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const navigate = useNavigate();

  const normalizeUsername = (value) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
  };

  const buildBaseUsername = () => {
    const baseFromName = normalizeUsername(`${firstName.trim()}${lastName.trim()}` || '');
    if (baseFromName.length >= 3) return baseFromName;
    const emailPrefix = normalizeUsername(email.split('@')[0] || '');
    if (emailPrefix.length >= 3) return emailPrefix;
    return `user${Math.floor(Math.random() * 9000) + 1000}`;
  };

  const findAvailableUsername = async (base) => {
    let attempt = 0;
    let candidate = base || 'user';

    while (attempt < 20) {
      const normalized = normalizeUsername(candidate);
      if (normalized.length >= 3) {
        const ref = doc(db, 'usernames', normalized);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          return { username: candidate, normalized };
        }
      }
      candidate = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
      attempt += 1;
    }
    throw new Error('Unable to generate a username right now. Please try again.');
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let createdUser = null;

    try {
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      if (!trimmedFirst || !trimmedLast) {
        throw new Error('Please enter your first and last name.');
      }

      // 1) Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      createdUser = user;

      // 2) Build profile doc and reserve an auto-generated username atomically
      const now = serverTimestamp();
      const profileDocBase = {
        uid: user.uid,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        email: user.email || email,
        photoURL: user.photoURL || '',
        identities: [
          { provider: 'password', subject: user.uid }
        ],
        primaryAuthUid: user.uid,
        createdAt: now,
        updatedAt: now,
      };

      const baseUsername = buildBaseUsername();
      const { username: autoUsername, normalized } = await findAvailableUsername(baseUsername);

      await runTransaction(db, async (tx) => {
        const unameRef = doc(db, 'usernames', normalized);
        const unameSnap = await tx.get(unameRef);
        if (unameSnap.exists()) {
          throw new Error('That username is already taken. Please choose another.');
        }
        tx.set(unameRef, {
          uid: user.uid,
          username: autoUsername,
          normalized,
          createdAt: now,
          updatedAt: now,
        });
        tx.set(
          doc(db, 'users', user.uid),
          {
            ...profileDocBase,
            username: autoUsername,
            usernameNormalized: normalized,
          },
          { merge: true }
        );
      });

      // 3) Send verification email
      await sendEmailVerification(user);

      navigate('/username', { state: { fromSignup: true } });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Signup failed');
      if (createdUser?.uid) {
        try {
          await createdUser.delete();
        } catch {
          // Best-effort cleanup only
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-container"
      style={{
        backgroundImage: `url(${bgUrl})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <form className="auth-box" onSubmit={handleSignup}>
        <h1>Razzberry</h1>
        <h2>Create Account</h2>

        {error && <p className="error">{error}</p>}

        <input
          type="text"
          placeholder="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          autoComplete="given-name"
          name="firstName"
        />

        <input
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          autoComplete="family-name"
          name="lastName"
        />

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          name="email"
        />

        <input
          type="password"
          placeholder="Create Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          name="newPassword"
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Sign Up'}
        </button>

        <p className="link" onClick={() => navigate('/signin')}>
          Already have an account? Log in
        </p>
      </form>
    </div>
  );
}

export default Signup;
