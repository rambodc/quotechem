import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { FiChevronRight, FiKey, FiLogOut, FiMail, FiUpload } from 'react-icons/fi';
import { UserContext } from '../App';
import { accountBaseForRole } from './routeUtils';
import { auth, db, storage } from '../firebase';
import './Account.css';

function AccountAction({ icon: Icon, title, onClick }) {
  return (
    <button type="button" className="account-action" onClick={onClick}>
      <span className="account-action-left">
        <Icon size={18} />
        <span>{title}</span>
      </span>
      <FiChevronRight size={18} />
    </button>
  );
}

export default function Account() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);
  const base = useMemo(() => accountBaseForRole(appUser?.role), [appUser?.role]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const initials = useMemo(() => {
    const name = `${appUser?.firstName || ''} ${appUser?.lastName || ''}`.trim();
    const source = name || appUser?.email || 'QC';
    return source
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'QC';
  }, [appUser]);

  const uploadProfilePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setError('');
    setStatus('');
    setUploading(true);

    try {
      const path = `profilePhotos/${auth.currentUser.uid}/avatar`;
      const imageRef = storageRef(storage, path);
      await uploadBytes(imageRef, file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(imageRef);
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        {
          profilePhotoUrl: url,
          profilePhotoPath: path,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setStatus('Profile photo updated.');
    } catch (err) {
      setError(err?.message || 'Unable to upload profile photo.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const onLogout = async () => {
    await signOut(auth);
    navigate('/', { replace: true });
  };

  return (
    <section className="account-page">
      <header>
        <h2>Account</h2>
        <p>Update identity and sign-in credentials.</p>
      </header>

      <article className="account-profile-card">
        <div className="account-avatar">
          {appUser?.profilePhotoUrl ? <img src={appUser.profilePhotoUrl} alt="" /> : <span>{initials}</span>}
        </div>
        <div>
          <h3>{appUser?.email || 'Authenticated user'}</h3>
          <p>Upload a profile photo for your platform account.</p>
          {error ? <p className="account-error">{error}</p> : null}
          {status ? <p className="account-success">{status}</p> : null}
        </div>
        <label className="account-upload">
          <FiUpload size={16} />
          <span>{uploading ? 'Uploading...' : 'Upload photo'}</span>
          <input type="file" accept="image/*" disabled={uploading} onChange={uploadProfilePhoto} />
        </label>
      </article>

      <div className="account-list">
        <AccountAction icon={FiMail} title="Change email" onClick={() => navigate(`${base}/email`)} />
        <AccountAction
          icon={FiKey}
          title="Change password"
          onClick={() => navigate(`${base}/password`)}
        />
        <AccountAction icon={FiLogOut} title="Logout" onClick={onLogout} />
      </div>
    </section>
  );
}
