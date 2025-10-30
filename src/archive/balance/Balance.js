// src/balance/Balance.js
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import styles from './Balance.module.css';

export default function Balance() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('transactions');

  const tabs = useMemo(
    () => [
      { id: 'buy-offers', label: 'Buy Offers' },
      { id: 'my-offers', label: 'My Offers' },
      { id: 'transactions', label: 'Transactions' }
    ],
    []
  );

  const transactions = useMemo(
    () => [
      {
        id: 'tx-1',
        title: 'Purchased',
        meta: 'Payment Received',
        amount: '+33.32 XRP',
        usd: '$18.40',
        type: 'received'
      },
      {
        id: 'tx-2',
        title: 'Digital Drop Sold',
        meta: 'Payment Received',
        amount: '+33.32 XRP',
        usd: '$18.40',
        type: 'received'
      },
      {
        id: 'tx-3',
        title: 'Digital Drop Purchased',
        meta: 'Payment Sent',
        amount: '-33.32 XRP',
        usd: '$18.40',
        type: 'sent'
      }
    ],
    []
  );

  const myOffers = useMemo(
    () => [
      {
        id: 'my-offer-1',
        title: 'Title',
        description: 'Description',
        mediaType: 'Type: Moment Video',
        creator: {
          name: 'Donny Hellmaker',
          status: 'Verified',
          avatar: 'https://via.placeholder.com/44?text=D'
        },
        amountUsd: '50.5 USD',
        amountXrp: '22.3 XRP',
        expiresIn: 'Expires in 24 hours'
      }
    ],
    []
  );

  const buyOffers = useMemo(
    () => [
      {
        id: 'buy-offer-1',
        title: 'Title',
        description: 'Description',
        mediaType: 'Type: Moment Video',
        creator: {
          name: 'Donny Hellmaker',
          status: 'Verified',
          avatar: 'https://via.placeholder.com/44?text=D'
        },
        amountUsd: '50.5 USD',
        amountXrp: '22.3 XRP',
        expiresIn: 'Expires in 24 hours'
      }
    ],
    []
  );

  const offerMediaPlaceholder = 'https://via.placeholder.com/80?text=NFT';

  const renderTransactions = () => (
    <div className={styles.transactionList}>
      {transactions.map((tx) => (
        <div key={tx.id} className={styles.transactionRow}>
          <div className={styles.transactionInfo}>
            <span className={styles.transactionTitle}>{tx.title}</span>
            <span className={styles.transactionMeta}>{tx.meta}</span>
          </div>
          <div
            className={`${styles.transactionAmount} ${
              tx.type === 'received' ? styles.transactionAmountPositive : styles.transactionAmountNegative
            }`}
          >
            <span>{tx.amount}</span>
            <small>{tx.usd}</small>
          </div>
        </div>
      ))}
    </div>
  );

  const renderOffers = (offers, isBuyOffer = false) => (
    <div className={styles.offersGrid}>
      {offers.map((offer) => (
        <article key={offer.id} className={styles.offerCard}>
          <header className={styles.offerHeader}>
            <img src={offerMediaPlaceholder} alt="Offer media" className={styles.offerMedia} />
            <div className={styles.offerMeta}>
              <strong>{offer.title}</strong>
              <span>{offer.description}</span>
              <span>{offer.mediaType}</span>
            </div>
          </header>

          <div className={styles.offerCreator}>
            <img src={offer.creator.avatar} alt={offer.creator.name} className={styles.offerAvatar} />
            <div>
              <strong>{offer.creator.name}</strong>
              <div>{offer.creator.status}</div>
            </div>
          </div>

          <div>
            <h3 className={styles.offerSectionTitle}>{isBuyOffer ? 'Buy Offer' : 'My Offer'}</h3>
          </div>

          <div className={styles.offerActionRow}>
            <div className={styles.offerAmount}>
              {offer.amountUsd}
              <span>{offer.amountXrp}</span>
            </div>
            {isBuyOffer ? (
              <>
                <button type="button" className={`${styles.offerButton} ${styles.offerButtonPrimary}`}>
                  Accept
                </button>
                <button type="button" className={styles.offerButton}>
                  Reject
                </button>
              </>
            ) : (
              <button type="button" className={styles.offerButton}>
                Cancel Offer
              </button>
            )}
          </div>

          <footer className={styles.offerFooter}>{offer.expiresIn}</footer>
        </article>
      ))}
    </div>
  );

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div className={styles.pageShell}>
        <section className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Available Balance</span>
          <p className={styles.summaryValue}>44 XRP</p>
          <p className={styles.summaryUsd}>120.23 USD</p>
          <button type="button" className={styles.addFundsButton} onClick={() => navigate('/fund')}>
            Add Fund
          </button>
        </section>

        <nav className={styles.tabs} aria-label="Balance tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className={styles.tabPanel}>
          {activeTab === 'transactions' && renderTransactions()}
          {activeTab === 'my-offers' && renderOffers(myOffers)}
          {activeTab === 'buy-offers' && renderOffers(buyOffers, true)}
        </section>
      </div>
    </div>
  );
}
