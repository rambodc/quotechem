import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Auth.css';

function normalizeUsername(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

export default function Signup() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const findAvailableUsername = async (base) => {
    let current = base;
    let count = 0;

    while (count < 20) {
      const normalized = normalizeUsername(current);
      if (normalized.length >= 3) {
        const snap = await getDocs(
          query(collection(db, 'users'), where('usernameNormalized', '==', normalized), limit(1))
        );
        if (snap.empty) return { username: current, usernameNormalized: normalized };
      }
      current = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
      count += 1;
    }

    throw new Error('Unable to reserve username right now.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    let createdUser = null;

    try {
      const cleanedFirst = firstName.trim();
      const cleanedLast = lastName.trim();
      if (!cleanedFirst || !cleanedLast) throw new Error('First and last name are required.');

      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      createdUser = credential.user;

      const base =
        normalizeUsername(`${cleanedFirst}${cleanedLast}`) ||
        normalizeUsername(email.split('@')[0] || '') ||
        'user1000';
      const usernameData = await findAvailableUsername(base);

      await setDoc(
        doc(db, 'users', createdUser.uid),
        {
          uid: createdUser.uid,
          email: createdUser.email,
          firstName: cleanedFirst,
          lastName: cleanedLast,
          username: usernameData.username,
          usernameNormalized: usernameData.usernameNormalized,
          primaryAuthUid: createdUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await sendEmailVerification(createdUser);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err?.message || 'Unable to create account.');

      if (createdUser?.uid) {
        try {
          await createdUser.delete();
        } catch {
          // Best effort cleanup only.
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" className="auth-logo" />
        <h1>Create account</h1>

        {error ? <p className="auth-error">{error}</p> : null}

        <label htmlFor="first-name">First name</label>
        <input
          id="first-name"
          type="text"
          autoComplete="given-name"
          required
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />

        <label htmlFor="last-name">Last name</label>
        <input
          id="last-name"
          type="text"
          autoComplete="family-name"
          required
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />

        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create account'}
        </button>

        <p className="auth-link" onClick={() => navigate('/signin')}>
          Already have an account
        </p>
      </form>
    </div>
  );
}
