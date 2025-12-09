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
  const [username,  setUsername]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let createdUser = null;

    try {
      const trimmedUsername = username.trim();
      if (trimmedUsername.length < 3) {
        throw new Error('Username must be at least 3 characters.');
      }
      const normalizedUsername = trimmedUsername.toLowerCase();
      const usernameRef = doc(db, 'usernames', normalizedUsername);
      const existingUsername = await getDoc(usernameRef);
      if (existingUsername.exists()) {
        throw new Error('That username is already taken. Please choose another.');
      }

      // 1) Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      createdUser = user;

      // 2) Reserve username + write profile doc atomically
      const now = serverTimestamp();
      const profileDoc = {
        uid: user.uid,
        firstName,
        lastName,
        username: trimmedUsername,
        usernameNormalized: normalizedUsername,
        email: user.email || email,
        photoURL: user.photoURL || '',
        identities: [
          { provider: 'password', subject: user.uid }
        ],
        primaryAuthUid: user.uid,
        createdAt: now,
        updatedAt: now,
      };

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(usernameRef);
        if (snap.exists()) {
          throw new Error('That username is already taken. Please choose another.');
        }
        tx.set(usernameRef, {
          uid: user.uid,
          username: trimmedUsername,
          normalized: normalizedUsername,
          createdAt: now,
        });
        tx.set(doc(db, 'users', user.uid), profileDoc, { merge: true });
      });

      // 3) Send verification email
      await sendEmailVerification(user);

      alert('Account created! Please check your email to verify your address.');
      navigate('/signin');
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
        />

        <input
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Username (unique)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Create Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
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
