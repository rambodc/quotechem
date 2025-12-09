// src/More.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import styles from './More.module.css';
import {
  FaFileAlt,
  FaCogs,
  FaPaintBrush,
  FaSignOutAlt,
  FaChevronRight,
  FaPlus,
  FaUserPlus,
  FaUserCog,
  FaImages,
  FaLayerGroup,
  FaHistory,
} from 'react-icons/fa';

export default function More() {
  const navigate = useNavigate();

  const onLogout = async () => {
    await signOut(auth);
    navigate('/signin');
  };

  const Item = ({ icon: Icon, label, onClick, color = '#111827', className = '' }) => (
    <div className={`${styles.item} ${className}`.trim()}>
      <button onClick={onClick} className={styles.button}>
        <span className={styles.buttonLabel}>
          {Icon ? <Icon size={20} color={color} /> : null}
          <span className={styles.buttonText}>{label}</span>
        </span>
        <span className={styles.chevron} aria-hidden>
          <FaChevronRight />
        </span>
      </button>
    </div>
  );

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div className={styles.pageShell}>
        <div className={styles.pageInner}>
          <h1 style={{ margin: '0 0 20px', textAlign: 'center' }}>More</h1>

          <div className={styles.list}>
            <Item icon={FaUserCog} color="#111827" label="Account" onClick={() => navigate('/account')} />
            <Item icon={FaHistory} color="#0ea5e9" label="Purchase History" onClick={() => navigate('/history')} />
            <Item icon={FaPaintBrush} color="#ec4899" label="Become an Artist" onClick={() => navigate('/become-artist')} />
            <Item icon={FaFileAlt} color="#0ea5e9" label="Terms" onClick={() => navigate('/terms')} />
            <Item icon={FaCogs} color="#6366f1" label="Services" onClick={() => navigate('/services')} />
            <Item icon={FaImages} color="#0ea5e9" label="My" onClick={() => navigate('/albums')} />
            <Item icon={FaLayerGroup} color="#10b981" label="Create Album" onClick={() => navigate('/create-album')} />
            <Item icon={FaUserPlus} color="#2563eb" label="Create Artist" onClick={() => navigate('/create-artists')} />
            <Item icon={FaPlus} color="#111827" label="Create Drop" onClick={() => navigate('/create-drop')} />
            <Item icon={FaSignOutAlt} color="#ef4444" label="Logout" onClick={onLogout} className={styles.itemSpacing} />
          </div>
        </div>
      </div>

      {/* No sidebar */}
    </div>
  );
}
