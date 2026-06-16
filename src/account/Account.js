import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { FiChevronRight, FiKey, FiLogOut, FiUpload } from 'react-icons/fi';
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

function resizeImageToSquare(file, size) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Unable to prepare image.'));
        return;
      }

      const sourceSize = Math.min(image.width, image.height);
      const sourceX = (image.width - sourceSize) / 2;
      const sourceY = (image.height - sourceSize) / 2;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Unable to resize image.'));
        },
        'image/jpeg',
        0.88
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to load image.'));
    };

    image.src = url;
  });
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
      const uid = auth.currentUser.uid;
      const avatarPath = `profilePhotos/${uid}/avatar-200.jpg`;
      const thumbPath = `profilePhotos/${uid}/avatar-50.jpg`;
      const [avatarBlob, thumbBlob] = await Promise.all([resizeImageToSquare(file, 200), resizeImageToSquare(file, 50)]);
      const avatarRef = storageRef(storage, avatarPath);
      const thumbRef = storageRef(storage, thumbPath);

      await Promise.all([
        uploadBytes(avatarRef, avatarBlob, { contentType: 'image/jpeg' }),
        uploadBytes(thumbRef, thumbBlob, { contentType: 'image/jpeg' }),
      ]);
      const [avatarUrl, thumbUrl] = await Promise.all([getDownloadURL(avatarRef), getDownloadURL(thumbRef)]);
      await setDoc(
        doc(db, 'users', uid),
        {
          profilePhotoUrl: avatarUrl,
          profilePhotoPath: avatarPath,
          profilePhotoThumbUrl: thumbUrl,
          profilePhotoThumbPath: thumbPath,
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
