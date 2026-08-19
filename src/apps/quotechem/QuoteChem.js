import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity, FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiChevronRight,
  FiCircle, FiCopy, FiDollarSign, FiDroplet, FiFileText, FiGitMerge, FiImage,
  FiMessageSquare, FiRepeat, FiSend, FiShield,
  FiTarget, FiTool, FiWind, FiX, FiXCircle, FiZap,
} from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { postJson } from '../../lib/api';
import { auth } from '../../firebase';
import './QuoteChem.css';

export const NEEDS = [
  { id: 'production', title: 'Production Chemical Problem', detail: 'Issues in producing wells or facilities', icon: FiActivity },
  { id: 'drilling', title: 'Drilling Chemical', detail: 'Drilling fluid or wellbore challenges', icon: FiTarget },
  { id: 'completion', title: 'Completion / Stimulation', detail: 'Completion fluids or stimulation needs', icon: FiGitMerge },
  { id: 'supplier', title: 'Need an Alternative Supplier', detail: 'Source a qualified replacement', icon: FiRepeat },
  { id: 'pricing', title: 'Need Better Pricing', detail: 'Find more competitive supply options', icon: FiDollarSign },
  { id: 'exact', title: 'I Know the Product I Need', detail: 'Source a specific chemical or equivalent', icon: FiDroplet },
];

const item = (id, title, detail, icon = FiDroplet) => ({ id, title, detail, icon });
const commercialFamilies = [
  item('production-chemicals', 'Production Chemicals', 'Chemistry for producing wells and facilities', FiActivity),
  item('drilling-chemicals', 'Drilling Chemicals', 'Drilling-fluid and wellbore additives', FiTarget),
  item('completion-chemicals', 'Completion Chemicals', 'Completion-fluid and well-delivery chemistry', FiGitMerge),
  item('stimulation-chemicals', 'Stimulation Chemicals', 'Acidizing and hydraulic-fracturing chemistry', FiZap),
  item('water-treatment', 'Water Treatment', 'Produced, process, and injection-water chemistry', FiDroplet),
  item('flow-assurance', 'Pipeline / Flow Assurance', 'Pipeline integrity, deposits, and flow reliability', FiTool),
  item('other', 'Other Specialty Oilfield Chemistry', 'A product family not listed here', FiMessageSquare),
];

export const CATEGORY_CONFIG = {
  production: { image: '/assets/quotechem/category-production.jpg', alt: 'Oilfield production facility with wellhead and process equipment', eyebrow: 'Production operations', title: 'What production challenge are you solving?', description: 'Choose the closest application so our technical assistant starts with the right operating context.', items: [
    item('corrosion', 'Corrosion', 'Metal loss, pitting, or integrity concerns', FiShield), item('scale', 'Scale', 'Mineral deposits in wells, lines, or equipment', FiCircle), item('h2s', 'H₂S / Sulfide', 'Sour-fluid treatment and sulfide control', FiXCircle), item('emulsion', 'Emulsion / Separation', 'Oil-water separation and demulsification', FiDroplet), item('wax', 'Paraffin / Wax', 'Deposition, cloud point, or pour-point issues', FiZap), item('foaming', 'Foaming', 'Excessive foam in process systems or tanks', FiWind), item('bacteria', 'Bacteria / MIC', 'Microbial control and influenced corrosion', FiActivity), item('hydrates', 'Flow Assurance / Hydrates', 'Restrictions, hydrates, or unstable flow', FiTool), item('produced-water', 'Produced-Water Treatment', 'Oil removal, clarification, and water quality', FiDroplet), item('oxygen', 'Oxygen Scavenging', 'Dissolved-oxygen control and corrosion protection', FiShield), item('other', 'Other / Not sure', 'Describe the challenge and we will guide you', FiMessageSquare),
  ]},
  drilling: { image: '/assets/quotechem/category-drilling.jpg', alt: 'Active land drilling rig at dawn', eyebrow: 'Drilling operations', title: 'What drilling challenge are you solving?', description: 'Select the drilling-fluid or wellbore performance area that best matches the requirement.', items: [
    item('fluid-loss', 'Fluid Loss', 'Control filtrate invasion and fluid losses'), item('shale-inhibition', 'Shale Inhibition', 'Improve wellbore stability and clay control'), item('lubricity', 'Lubricity / Torque', 'Reduce friction, torque, and drag'), item('lost-circulation', 'Lost Circulation', 'Bridge or seal thief zones'), item('rheology', 'Rheology / Viscosity', 'Build and maintain the required fluid profile'), item('emulsifiers', 'Emulsifiers / Wetting Agents', 'Stabilize invert systems and oil-wet solids'), item('defoaming', 'Defoaming', 'Control entrained air and surface foam'), item('corrosion-h2s', 'Corrosion / H₂S Control', 'Protect equipment and manage sour conditions'), item('detergents', 'Detergents / Surfactants', 'Cleaning, water wetting, and interfacial control'), item('other', 'Other / Not sure', 'Describe the challenge and we will guide you', FiMessageSquare),
  ]},
  completion: { image: '/assets/quotechem/category-completion.jpg', alt: 'Oilfield completion and stimulation equipment on a well pad', eyebrow: 'Completion and stimulation', title: 'Which completion or stimulation application?', description: 'Choose the application where chemistry, compatibility, or performance support is needed.', items: [
    item('completion-brines', 'Completion Brines', 'Clear brines, density, and compatibility'), item('acidizing', 'Acidizing', 'Acid systems, inhibitors, and additives'), item('hydraulic-fracturing', 'Hydraulic Fracturing', 'Frac-fluid performance and compatibility'), item('friction-reducers', 'Friction Reducers', 'Reduce pumping friction and pressure'), item('fluid-loss', 'Fluid-Loss Additives', 'Control leakoff during completion work'), item('surfactants', 'Surfactants / Flowback Aids', 'Improve cleanup, recovery, and flowback'), item('clay-stabilizers', 'Clay Stabilizers', 'Reduce swelling and fines migration'), item('scale-corrosion', 'Scale / Corrosion Control', 'Protect completion fluids and equipment'), item('diverters', 'Diverters', 'Improve treatment placement and coverage'), item('breakers', 'Breakers / Crosslinkers', 'Control fluid structure and cleanup'), item('other', 'Other / Not sure', 'Describe the application and we will guide you', FiMessageSquare),
  ]},
  supplier: { image: '/assets/quotechem/category-supplier.jpg', alt: 'Specialty chemical totes in an industrial logistics facility', eyebrow: 'Alternative supplier', title: 'Which chemical family needs a new supplier?', description: 'Choose the closest family. We will use the conversation to understand the product, specification, and reason for changing supply.', items: commercialFamilies },
  pricing: { image: '/assets/quotechem/category-pricing.jpg', alt: 'Organized oilfield chemical supply and logistics yard', eyebrow: 'Competitive pricing', title: 'Which chemical family should we price?', description: 'Select the product family, then share the technical and commercial details that matter.', items: commercialFamilies },
  exact: { image: '/assets/quotechem/category-exact.jpg', alt: 'Specialty chemical sample and laboratory equipment', eyebrow: 'Exact product sourcing', title: 'What type of product do you know you need?', description: 'Choose the closest chemical family, then provide the trade name, chemistry, CAS number, or specification in chat.', items: commercialFamilies },
};

function titleFor(items, id) {
  return items.find((item) => item.id === id)?.title || items.find((item) => item.id === id)?.label || id;
}

function Progress({ stage }) {
  const steps = ['Need', 'Problem', 'Conversation', 'Details'];
  const active = stage === 'need' ? 0 : stage === 'category' ? 1 : stage === 'chat' ? 2 : 3;
  if (stage === 'complete') return null;
  return (
    <ol className="qc-progress" aria-label="Sourcing request progress">
      {steps.map((label, index) => (
        <li key={label} className={index < active ? 'done' : index === active ? 'active' : ''}>
          <span>{index < active ? <FiCheck /> : index + 1}</span><small>{label}</small>
        </li>
      ))}
    </ol>
  );
}

function NeedStage({ onChoose }) {
  return (
    <div className="qc-stage qc-home">
      <section className="qc-hero">
        <p className="qc-kicker">Global oilfield chemical sourcing</p>
        <h1>Solving oilfield chemical challenges. <em>Globally.</em></h1>
        <p>Tell us your problem or need. QuoteChem will help define the right chemistry, supplier, and value.</p>
      </section>
      <section className="qc-choices" aria-labelledby="need-heading">
        <div className="qc-section-heading"><span>Start a sourcing request</span><h2 id="need-heading">What do you need help with?</h2><p>Choose the option that best describes your needs.</p></div>
        <div className="qc-card-grid">
          {NEEDS.map(({ id, title, detail, icon: Icon }) => (
            <button key={id} type="button" className="qc-choice-card" onClick={() => onChoose(id)}>
              <Icon aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><FiChevronRight className="qc-chevron" />
            </button>
          ))}
        </div>
        <div className="qc-or"><span>or</span></div>
        <button type="button" className="qc-describe" onClick={() => onChoose('describe')}>
          <FiMessageSquare /><span><strong>Just describe what you need</strong><small>Start a guided technical conversation</small></span><FiArrowRight />
        </button>
      </section>
    </div>
  );
}

function CategoryStage({ need, subcategory, onSelect }) {
  const category = CATEGORY_CONFIG[need];
  if (!category) return null;
  return (
    <div className="qc-stage qc-category">
      <section className="qc-category-hero">
        <img src={category.image} alt={category.alt} />
        <div><span>{category.eyebrow}</span><h1>{category.title}</h1><p>{category.description}</p></div>
      </section>
      <div className="qc-issue-grid" role="list" aria-label={`${category.eyebrow} choices`}>
        {category.items.map(({ id, title, detail, icon: Icon }) => (
          <button type="button" key={id} className={`qc-issue ${subcategory === id ? 'selected' : ''}`} onClick={() => onSelect(id)}>
            <Icon /><span><strong>{title}</strong><small>{detail}</small></span><FiChevronRight />
          </button>
        ))}
      </div>
    </div>
  );
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read this file.'));
    reader.readAsDataURL(file);
  });
}

function scrollPageToTop() {
  window.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  document.scrollingElement?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
}

function MessageActions({ message }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.text); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch {}
  };
  return (
    <div className="qc-message-actions">
      <button type="button" onClick={copy} aria-label="Copy response"><FiCopy /> {copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

async function ensurePublicIdentity() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}

function ChatStage({ need, subcategory, legacyArea = '', legacyIssue = '', conversationId, onConversation, onFinish, publicMode = false, messages, setMessages, quickReplies, setQuickReplies, ready, setReady, queuedMessage, onQueuedSent }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [lastAttempt, setLastAttempt] = useState(null);
  const chatRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const messageNumberRef = useRef(0);
  const composerFocusedRef = useRef(false);
  const syncViewportRef = useRef(() => {});
  const syncViewportNowRef = useRef(() => {});
  const blurTimerRef = useRef(null);
  const viewportTimerRef = useRef(null);
  const viewportPollRef = useRef(null);
  const viewportBaselineRef = useRef(0);
  const autoStartedRef = useRef('');
  const context = useMemo(() => ({
    needLabel: need === 'describe' ? 'Open requirement' : titleFor(NEEDS, need),
    subcategoryLabel: subcategory ? titleFor(CATEGORY_CONFIG[need]?.items || [], subcategory) : '',
    ...(legacyArea ? { areaLabel: legacyArea } : {}),
    ...(legacyIssue ? { issueLabel: legacyIssue } : {}),
  }), [legacyArea, legacyIssue, need, subcategory]);

  const nextId = (prefix) => `${prefix}-${Date.now()}-${messageNumberRef.current += 1}`;

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const visibleHeight = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight);
      if (!composerFocusedRef.current) viewportBaselineRef.current = visibleHeight;
      else viewportBaselineRef.current = Math.max(viewportBaselineRef.current, visibleHeight);
      const keyboardOpen = composerFocusedRef.current && viewportBaselineRef.current - visibleHeight > 120;
      if (keyboardOpen) {
        document.documentElement.style.setProperty('--qc-viewport-height', `${visibleHeight}px`);
        document.documentElement.style.setProperty('--qc-viewport-top', `${Math.round(viewport?.offsetTop || 0)}px`);
      } else {
        document.documentElement.style.removeProperty('--qc-viewport-height');
        document.documentElement.style.removeProperty('--qc-viewport-top');
      }
      document.documentElement.classList.toggle('qc-keyboard-open', keyboardOpen);
    };
    const scheduleViewportSync = () => {
      window.clearTimeout(viewportTimerRef.current);
      viewportTimerRef.current = window.setTimeout(syncViewport, 100);
    };
    syncViewportNowRef.current = syncViewport;
    syncViewportRef.current = scheduleViewportSync;
    const previousRootBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = '#061321';
    document.body.style.backgroundColor = '#061321';
    scrollPageToTop();
    syncViewport();
    viewport?.addEventListener('resize', scheduleViewportSync);
    viewport?.addEventListener('scroll', scheduleViewportSync);
    window.addEventListener('resize', scheduleViewportSync);
    window.addEventListener('orientationchange', scheduleViewportSync);
    return () => {
      viewport?.removeEventListener('resize', scheduleViewportSync);
      viewport?.removeEventListener('scroll', scheduleViewportSync);
      window.removeEventListener('resize', scheduleViewportSync);
      window.removeEventListener('orientationchange', scheduleViewportSync);
      window.clearTimeout(blurTimerRef.current);
      window.clearTimeout(viewportTimerRef.current);
      window.clearInterval(viewportPollRef.current);
      document.documentElement.style.removeProperty('--qc-keyboard-height');
      document.documentElement.style.removeProperty('--qc-keyboard-top');
      document.documentElement.style.removeProperty('--qc-viewport-height');
      document.documentElement.style.removeProperty('--qc-viewport-top');
      document.documentElement.classList.remove('qc-composer-focused');
      document.documentElement.classList.remove('qc-keyboard-open');
      document.documentElement.style.backgroundColor = previousRootBackground;
      document.body.style.backgroundColor = previousBodyBackground;
    };
  }, []);

  useEffect(() => {
    const thread = chatRef.current;
    if (!thread) return;
    thread.scrollTo?.({ top: thread.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, error]);
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = '0px';
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
  }, [draft]);
  const requestReply = async (userMessage) => {
    setPending(true); setError(''); setQuickReplies([]);
    const attempt = { userMessage };
    setLastAttempt(attempt);
    try {
      if (publicMode) await ensurePublicIdentity();
      const result = await postJson('quotechemChat', {
        context,
        conversationId: userMessage.conversationId,
        messageId: userMessage.id,
        text: userMessage.text,
        attachment: userMessage.attachment ? { dataUrl: userMessage.attachment.dataUrl, name: userMessage.attachment.name } : null,
      }, { authed: true });
      if (!conversationId) onConversation(result.conversationId);
      setMessages((current) => current.some((item) => item.id === (result.assistantMessageId || `${userMessage.id}-assistant`)) ? current : [...current, { id: result.assistantMessageId || `${userMessage.id}-assistant`, role: 'assistant', text: result.reply, attachmentAcknowledged: result.attachmentAcknowledged, attachmentSummary: result.attachmentSummary, attachmentKind: userMessage.attachment?.kind }]);
      setQuickReplies(Array.isArray(result.quickReplies) ? result.quickReplies : []);
      setReady(Boolean(result.readyForContact));
      setLastAttempt(null);
    } catch (reason) {
      setError(reason?.message || 'The assistant could not respond.');
    } finally { setPending(false); }
  };

  const send = async (textValue = draft, { includeSelection = true, messageId = '' } = {}) => {
    const text = String(textValue || '').trim();
    if (pending || (!text && !attachment)) return;
    const targetConversationId = conversationId || window.crypto?.randomUUID?.() || nextId('conversation');
    if (!conversationId) onConversation(targetConversationId);
    const selection = includeSelection && !messages.length && context.subcategoryLabel ? `${context.needLabel} — ${context.subcategoryLabel}` : '';
    const requestText = text || `Please review the attached ${attachment?.kind || 'file'}.`;
    const userMessage = { id: messageId || nextId('user'), role: 'user', text: [selection, requestText].filter(Boolean).join('\n\n'), attachment, conversationId: targetConversationId };
    setMessages((current) => current.some((item) => item.id === userMessage.id) ? current : [...current, userMessage]); setDraft(''); setAttachment(null); setReady(false);
    await requestReply(userMessage);
    onQueuedSent?.(userMessage.id);
  };

  useEffect(() => {
    if (!queuedMessage?.id || autoStartedRef.current === queuedMessage.id) return;
    autoStartedRef.current = queuedMessage.id;
    send(queuedMessage.text, { includeSelection: false, messageId: queuedMessage.id });
    // Queued guided and context-change messages are idempotent by message ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedMessage?.id]);

  const submitText = (event) => {
    event.preventDefault();
    send();
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(file.type)) return setError('Choose a JPEG, PNG, WebP, GIF, or PDF file.');
    if (file.size > 10 * 1024 * 1024) return setError('Attachments must be 10 MB or smaller.');
    try { setAttachment({ name: file.name, type: file.type, size: file.size, kind: file.type === 'application/pdf' ? 'pdf' : 'image', dataUrl: await readAsDataUrl(file) }); setError(''); } catch (reason) { setError(reason.message); }
  };

  const onComposerKeyDown = (event) => {
    const mobile = window.matchMedia?.('(max-width: 680px)').matches;
    if (event.key === 'Enter' && !event.shiftKey && !mobile) { event.preventDefault(); send(); }
  };

  const onComposerFocus = () => {
    window.clearTimeout(blurTimerRef.current);
    composerFocusedRef.current = true;
    document.documentElement.classList.add('qc-composer-focused');
    syncViewportRef.current();
    window.clearInterval(viewportPollRef.current);
    viewportPollRef.current = window.setInterval(() => syncViewportNowRef.current(), 200);
  };

  const onComposerBlur = () => {
    composerFocusedRef.current = false;
    window.clearInterval(viewportPollRef.current);
    blurTimerRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove('qc-composer-focused');
      document.documentElement.classList.remove('qc-keyboard-open');
      syncViewportRef.current();
      scrollPageToTop();
    }, 250);
  };

  return (
    <div className="qc-stage qc-chat-stage">
      <div className="qc-chat-heading"><div className="qc-live"><i /> AI connected</div></div>
      <div className="qc-chat-shell">
      <div ref={chatRef} className="qc-chat" aria-live="polite">
        {!messages.length ? <div className="qc-chat-welcome"><div className="qc-ai-mark"><FiDroplet /></div><h2>What should we know?</h2><p>Describe the requirement or attach a useful field photo, product label, SDS/TDS, water analysis, or lab report. I’ll ask no more than three focused questions.</p></div> : null}
        {messages.map((message) => <div className={`qc-message-row ${message.role}`} key={message.id}>
          <div className="qc-message-avatar">{message.role === 'assistant' ? <FiDroplet /> : 'You'}</div>
          <div className="qc-message-body">{message.attachment ? (message.attachment.kind === 'pdf' || !message.attachment.dataUrl ? <div className="qc-file-card">{message.attachment.kind === 'pdf' ? <FiFileText /> : <FiImage />}<span>{message.attachment.name}</span></div> : <img src={message.attachment.dataUrl} alt={`Attached ${message.attachment.name}`} />) : null}<div className="qc-message-text">{message.text}</div>{message.attachmentAcknowledged ? <div className="qc-analysis-proof"><FiCheckCircle /><div><strong>{message.attachmentKind === 'pdf' ? 'PDF reviewed' : 'Image analyzed'}</strong><span>{message.attachmentSummary}</span></div></div> : null}{message.role === 'assistant' ? <MessageActions message={message} /> : null}</div>
        </div>)}
        {pending ? <div className="qc-message-row assistant"><div className="qc-message-avatar"><FiDroplet /></div><div className="qc-typing" aria-label="Assistant is thinking"><i /><i /><i /></div></div> : null}
        {error ? <div className="qc-chat-error" role="alert"><FiXCircle /><span>{error}</span>{lastAttempt && !pending ? <button type="button" onClick={() => requestReply(lastAttempt.userMessage)}>Retry</button> : null}</div> : null}
      </div>
      <div className="qc-composer-zone">
          {quickReplies.length ? <div className="qc-quick-replies">{quickReplies.map((option) => <button type="button" key={option} disabled={pending} onClick={() => send(option)}>{option}</button>)}</div> : null}
          {ready ? <button type="button" className="qc-ready-banner" onClick={onFinish}><FiCheckCircle /><span><strong>Enough information to begin</strong><small>Continue to contact details</small></span><FiArrowRight /></button> : null}
          {attachment ? <div className="qc-attachment-preview">{attachment.kind === 'pdf' ? <FiFileText /> : <img src={attachment.dataUrl} alt="Attachment preview" />}<span><strong>{attachment.name}</strong><small>{(attachment.size / 1024 / 1024).toFixed(1)} MB · ready to save and analyze</small></span><button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment"><FiX /></button></div> : null}
          <form onSubmit={submitText} className="qc-message-form">
            <button type="button" className="qc-composer-tool" onClick={() => fileRef.current?.click()} disabled={pending} aria-label="Attach image or PDF"><FiImage /></button>
            <input ref={fileRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={chooseFile} />
            <label className="sr-only" htmlFor="qc-message">Message</label>
            <textarea ref={textareaRef} id="qc-message" rows="1" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} onFocus={onComposerFocus} onBlur={onComposerBlur} placeholder="Message QuoteChem…" disabled={pending} />
            <button type="submit" className="qc-send" disabled={pending || (!draft.trim() && !attachment)} aria-label="Send message"><FiSend /></button>
          </form>
          <div className="qc-composer-meta"><span>Messages and uploads are saved securely for QuoteChem staff review.</span><button type="button" disabled={!conversationId} onClick={onFinish}>Finish request</button></div>
        </div>
      </div>
    </div>
  );
}

function ContactStage({ values, onChange, onSubmit }) {
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Enter your name.';
    if (!values.company.trim()) next.company = 'Enter your company.';
    if (!/^\S+@\S+\.\S+$/.test(values.email)) next.email = 'Enter a valid work email.';
    if (!values.country.trim()) next.country = 'Enter a country or location.';
    setErrors(next);
    if (!Object.keys(next).length) {
      setSubmitting(true); setSubmitError('');
      try { await onSubmit(); } catch (reason) { setSubmitError(reason?.message || 'Unable to save this request.'); }
      finally { setSubmitting(false); }
    }
  };
  return (
    <div className="qc-stage qc-contact">
      <div className="qc-section-heading"><span>Final step</span><h1>Where should we send our findings?</h1><p>No account or password is required. These details will be saved with the conversation for QuoteChem staff follow-up.</p></div>
      <form onSubmit={submit} noValidate>
        {[['name', 'Name', 'Your full name', true], ['company', 'Company', 'Company name', true], ['email', 'Work email', 'name@company.com', true], ['phone', 'Phone number', 'Optional', false], ['country', 'Country / location', 'Country or operating region', true]].map(([key, label, placeholder, required]) => (
          <label key={key}>{label}{required ? <span> *</span> : null}<input type={key === 'email' ? 'email' : 'text'} value={values[key]} onChange={(event) => onChange(key, event.target.value)} placeholder={placeholder} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} />{errors[key] ? <small id={`${key}-error`} className="qc-error">{errors[key]}</small> : null}</label>
        ))}
        {submitError ? <p className="qc-error" role="alert">{submitError}</p> : null}
        <button type="submit" className="qc-primary" disabled={submitting}>{submitting ? 'Saving request…' : 'Create sourcing request'} <FiArrowRight /></button>
      </form>
      <p className="qc-privacy"><FiShield /> Saved securely for authorized QuoteChem staff review.</p>
    </div>
  );
}

function CompleteStage({ onDone }) {
  return <main className="quotechem-app qc-public qc-complete-only"><div className="qc-stage qc-complete">
    <div className="qc-success-icon"><FiCheck /></div><h1>Thank you.</h1>
    <p className="qc-lead">The QuoteChem team has received your request and will contact you by email.</p>
    <button type="button" className="qc-primary" onClick={onDone}>Done</button>
  </div></main>;
}

const PUBLIC_SESSION_KEY = 'quotechem:public-sourcing-session';
const SESSION_VERSION = 2;
const EMPTY_CONTACT = { name: '', company: '', email: '', phone: '', country: '' };
const ROUTES = { need: '/', category: '/request/category', chat: '/chat', contact: '/request/contact', complete: '/request/complete' };
const PATH_STAGES = Object.fromEntries(Object.entries(ROUTES).map(([stageName, path]) => [path, stageName]));

function readPublicSession() {
  try { const value = JSON.parse(window.localStorage.getItem(PUBLIC_SESSION_KEY) || 'null'); return value?.version === SESSION_VERSION ? value : null; } catch { return null; }
}

function freshId(prefix) {
  return window.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function contextFor(need, subcategory) {
  return { needLabel: need === 'describe' ? 'Open requirement' : titleFor(NEEDS, need), subcategoryLabel: subcategory ? titleFor(CATEGORY_CONFIG[need]?.items || [], subcategory) : '' };
}

function restoredMessages(items = []) {
  return items.map((message) => ({
    id: message.messageId, role: message.role, text: message.text, attachment: message.attachment,
    attachmentAcknowledged: Boolean(message.response?.attachmentAcknowledged), attachmentSummary: message.response?.attachmentSummary || '',
    attachmentKind: message.attachment?.kind,
  }));
}

export default function QuoteChem({ publicMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const restored = useMemo(() => publicMode ? readPublicSession() : null, [publicMode]);
  const initialStage = PATH_STAGES[location.pathname] || restored?.stage || 'need';
  const [stage, setStage] = useState(initialStage);
  const [need, setNeed] = useState(restored?.need || '');
  const [subcategory, setSubcategory] = useState(restored?.subcategory || '');
  const [activeContext, setActiveContext] = useState(restored?.activeContext || { need: restored?.need || '', subcategory: restored?.subcategory || '' });
  const [contact, setContact] = useState(restored?.contact || EMPTY_CONTACT);
  const [requestId, setRequestId] = useState(restored?.requestId || '');
  const [status, setStatus] = useState(restored?.status || '');
  const [conversationId, setConversationId] = useState(restored?.conversationId || '');
  const [messages, setMessages] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [ready, setReady] = useState(false);
  const [queuedMessage, setQueuedMessage] = useState(restored?.queuedMessage || null);
  const [restoring, setRestoring] = useState(Boolean(restored?.conversationId));
  const [confirmRestart, setConfirmRestart] = useState(false);
  const initializedRef = useRef(false);
  const knownPath = Boolean(PATH_STAGES[location.pathname]);

  const go = (nextStage, options = {}) => {
    scrollPageToTop(); setStage(nextStage); navigate(ROUTES[nextStage], options);
  };

  useEffect(() => {
    if (!knownPath) { navigate('/', { replace: true }); return; }
    const routeStage = PATH_STAGES[location.pathname];
    if (status === 'submitted' && routeStage !== 'complete') { setStage('complete'); navigate(ROUTES.complete, { replace: true }); return; }
    setStage(routeStage);
  }, [knownPath, location.pathname, navigate, status]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const initialize = async () => {
      if (!publicMode) { setRestoring(false); return; }
      if (!restored) {
        setRestoring(false);
        if (location.pathname !== '/') navigate('/', { replace: true });
        return;
      }
      if (!restored.conversationId) {
        setRestoring(false);
        if (location.pathname === '/') navigate(ROUTES[restored.stage] || '/', { replace: true });
        return;
      }
      try {
        await ensurePublicIdentity();
        const result = await postJson('quotechemResume', { conversationId: restored.conversationId }, { authed: true });
        if (result.conversation.status === 'abandoned') throw new Error('Conversation is no longer active.');
        const loadedMessages = restoredMessages(result.messages);
        const lastAssistant = [...(result.messages || [])].reverse().find((message) => message.role === 'assistant');
        setMessages(loadedMessages);
        setQuickReplies(lastAssistant?.response?.quickReplies || []);
        setReady(Boolean(lastAssistant?.response?.readyForContact || result.conversation.status === 'ready'));
        setStatus(result.conversation.status);
        setRequestId(result.conversation.requestId || restored.requestId || '');
        if (result.conversation.contact) setContact(result.conversation.contact);
        const queuedUser = restored.queuedMessage && (result.messages || []).find((message) => message.messageId === restored.queuedMessage.id);
        if (queuedUser?.assistantMessageId && (result.messages || []).some((message) => message.messageId === queuedUser.assistantMessageId)) setQueuedMessage(null);
        const targetStage = result.conversation.status === 'submitted' ? 'complete' : restored.stage;
        setStage(targetStage);
        const targetRoute = ROUTES[targetStage] || '/';
        if (location.pathname !== targetRoute) navigate(targetRoute, { replace: true });
      } catch {
        window.localStorage.removeItem(PUBLIC_SESSION_KEY);
        setConversationId(''); setMessages([]); setNeed(''); setSubcategory(''); setStatus(''); setStage('need');
        navigate('/', { replace: true });
      } finally { setRestoring(false); }
    };
    initialize();
  }, [location.pathname, navigate, publicMode, restored]);

  useEffect(() => {
    if (!publicMode || restoring) return;
    if (stage === 'need' && !need && !conversationId && !requestId) {
      window.localStorage.removeItem(PUBLIC_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(PUBLIC_SESSION_KEY, JSON.stringify({
      version: SESSION_VERSION, stage, need, subcategory, activeContext, contact, requestId, status, conversationId, queuedMessage, updatedAt: new Date().toISOString(),
    }));
  }, [activeContext, contact, conversationId, need, publicMode, queuedMessage, requestId, restoring, stage, status, subcategory]);

  const openChat = (nextNeed, nextSubcategory) => {
    setNeed(nextNeed); setSubcategory(nextSubcategory);
    const nextContext = { need: nextNeed, subcategory: nextSubcategory };
    if (conversationId) {
      if (activeContext.need !== nextNeed || activeContext.subcategory !== nextSubcategory) {
        const labels = contextFor(nextNeed, nextSubcategory);
        setQueuedMessage({ id: freshId('context-update'), text: `Requirement updated\nNeed: ${labels.needLabel}${labels.subcategoryLabel ? `\nCategory: ${labels.subcategoryLabel}` : ''}` });
      }
    } else if (nextNeed !== 'describe') {
      const id = freshId('conversation'); const labels = contextFor(nextNeed, nextSubcategory);
      setConversationId(id);
      setQueuedMessage({ id: `${id}-guided`, text: `Need: ${labels.needLabel}\nCategory: ${labels.subcategoryLabel}` });
    }
    setActiveContext(nextContext); go('chat');
  };

  const chooseNeed = (id) => {
    if (id === 'describe') openChat(id, '');
    else { setNeed(id); setSubcategory(''); go('category'); }
  };

  const goBack = () => {
    if (stage === 'category') go('need');
    else if (stage === 'chat') go(need === 'describe' ? 'need' : 'category');
    else if (stage === 'contact') go('chat');
  };

  const clearSession = ({ abandon = false } = {}) => {
    const oldConversationId = conversationId;
    window.localStorage.removeItem(PUBLIC_SESSION_KEY);
    setStage('need'); setNeed(''); setSubcategory(''); setActiveContext({ need: '', subcategory: '' }); setContact(EMPTY_CONTACT);
    setRequestId(''); setStatus(''); setConversationId(''); setMessages([]); setQuickReplies([]); setReady(false); setQueuedMessage(null); setConfirmRestart(false);
    navigate('/', { replace: true }); scrollPageToTop();
    if (abandon && oldConversationId) postJson('quotechemAbandon', { conversationId: oldConversationId }, { authed: true }).catch(() => {});
  };

  const requestRestart = () => {
    if (conversationId || need) setConfirmRestart(true);
    else go('need');
  };

  const complete = async () => {
    if (publicMode) await ensurePublicIdentity();
    const result = await postJson('quotechemComplete', { conversationId, contact }, { authed: true });
    setRequestId(result.requestId); setStatus('submitted'); go('complete', { replace: true });
  };

  if (restoring) return <main className="quotechem-app qc-public qc-session-loading">Restoring your request…</main>;
  if (stage === 'complete') return <CompleteStage onDone={() => clearSession()} />;

  return <div className={`quotechem-app ${publicMode ? 'qc-public' : ''} ${stage === 'chat' ? 'qc-is-chat' : ''}`}>
    <header className="qc-app-header">
      {stage !== 'need' ? <button type="button" className="qc-header-back" onClick={goBack}><FiArrowLeft /> Back</button> : <span />}
      {(conversationId || need) ? <button type="button" className="qc-start-new" onClick={requestRestart}>Start new request</button> : <span />}
      <button type="button" className="qc-brand-home" onClick={requestRestart} aria-label="Return to QuoteChem home"><span className="qc-wordmark"><img src="/assets/quotechem-logo.png" alt="" /><span className="qc-wordmark-text">Quote<b>Chem</b><small>Global Oilfield Chemical Sourcing</small></span></span></button>
    </header>
    <div className="qc-content"><Progress stage={stage} />
      {stage === 'need' ? <NeedStage onChoose={chooseNeed} /> : null}
      {stage === 'category' ? <CategoryStage need={need} subcategory={subcategory} onSelect={(id) => openChat(need, id)} /> : null}
      {stage === 'chat' ? <ChatStage need={need} subcategory={subcategory} conversationId={conversationId} onConversation={(id) => { setConversationId(id); setActiveContext({ need, subcategory }); }} onFinish={() => conversationId && go('contact')} publicMode={publicMode} messages={messages} setMessages={setMessages} quickReplies={quickReplies} setQuickReplies={setQuickReplies} ready={ready} setReady={setReady} queuedMessage={queuedMessage} onQueuedSent={() => setQueuedMessage(null)} /> : null}
      {stage === 'contact' ? <ContactStage values={contact} onChange={(key, value) => setContact((previous) => ({ ...previous, [key]: value }))} onSubmit={complete} /> : null}
    </div>
    <footer className="qc-footer"><FiShield /> Secure AI sourcing <span>•</span> Conversations and uploads are saved for staff review</footer>
    {confirmRestart ? <div className="qc-restart-backdrop" role="presentation"><section className="qc-restart-dialog" role="dialog" aria-modal="true" aria-labelledby="qc-restart-title"><h2 id="qc-restart-title">Start a new request?</h2><p>Your current conversation will remain available to the QuoteChem team as an abandoned draft.</p><div><button type="button" onClick={() => setConfirmRestart(false)}>Keep current request</button><button type="button" className="qc-primary" onClick={() => clearSession({ abandon: true })}>Start new request</button></div></section></div> : null}
  </div>;
}
