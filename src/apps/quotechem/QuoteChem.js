import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity, FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiChevronRight,
  FiCircle, FiCopy, FiDollarSign, FiDroplet, FiGitMerge, FiImage, FiMessageSquare,
  FiMic, FiPackage, FiPause, FiRefreshCw, FiRepeat, FiSend, FiShield, FiSquare,
  FiTarget, FiTool, FiTruck, FiUsers, FiVolume2, FiWind, FiX, FiXCircle, FiZap,
} from 'react-icons/fi';
import { postJson } from '../../lib/api';
import './QuoteChem.css';

export const NEEDS = [
  { id: 'production', title: 'Production Chemical Problem', detail: 'Issues in producing wells or facilities', icon: FiActivity },
  { id: 'drilling', title: 'Drilling Chemical', detail: 'Drilling fluid or wellbore challenges', icon: FiTarget },
  { id: 'completion', title: 'Completion / Stimulation', detail: 'Completion fluids or stimulation needs', icon: FiGitMerge },
  { id: 'supplier', title: 'Need an Alternative Supplier', detail: 'Source a qualified replacement', icon: FiRepeat },
  { id: 'pricing', title: 'Need Better Pricing', detail: 'Find more competitive supply options', icon: FiDollarSign },
  { id: 'exact', title: 'I Know the Product I Need', detail: 'Source a specific chemical or equivalent', icon: FiDroplet },
];

export const AREAS = [
  { id: 'wellhead', label: 'Wellhead' },
  { id: 'flowline', label: 'Flowline' },
  { id: 'separator', label: 'Separator' },
  { id: 'water', label: 'Produced water' },
  { id: 'tank', label: 'Storage tank' },
  { id: 'injection', label: 'Injection system' },
];

export const ISSUES = [
  { id: 'corrosion', title: 'Corrosion', detail: 'Metal loss, pitting, or corrosion under insulation', icon: FiShield },
  { id: 'scale', title: 'Scale', detail: 'Mineral buildup in lines or equipment', icon: FiCircle },
  { id: 'h2s', title: 'H₂S / Sulfide', detail: 'High sulfide levels or sour-system concerns', icon: FiXCircle },
  { id: 'emulsion', title: 'Emulsion', detail: 'Stable water-in-oil or oil-in-water emulsions', icon: FiDroplet },
  { id: 'wax', title: 'Paraffin / Wax', detail: 'Wax deposition or pour-point issues', icon: FiZap },
  { id: 'foaming', title: 'Foaming', detail: 'Excessive foam in systems or tanks', icon: FiWind },
  { id: 'bacteria', title: 'Bacteria (MIC)', detail: 'Microbiologically influenced corrosion', icon: FiActivity },
  { id: 'flow', title: 'Flow Assurance', detail: 'Restrictions, deposits, or unstable flow', icon: FiTool },
  { id: 'other', title: 'Other Issue', detail: 'Something else not listed here', icon: FiMessageSquare },
];

const commonTail = [
  { id: 'quantity', prompt: 'What quantity or expected usage should we plan for?', placeholder: 'For example: 4 IBCs per month or 20 drums initially' },
  { id: 'location', prompt: 'Where will the chemical need to be delivered?', placeholder: 'Country, region, or nearest city' },
  { id: 'timing', prompt: 'When do you need the first delivery?', options: ['Urgently — under 2 weeks', 'Within 30 days', 'Within 1–3 months', 'Planning / no fixed date'] },
];

const productionIssueQuestions = {
  scale: [
    { id: 'scaleType', prompt: 'Do you know what type of scale you are seeing?', options: ['Calcium carbonate', 'Barium sulfate', 'Strontium sulfate', 'Mixed / other', 'Not sure'] },
    { id: 'currentTreatment', prompt: 'Are you currently treating with a scale inhibitor?', options: ['Yes, continuously', 'Yes, batch treatment', 'No current treatment', 'Not sure'] },
    { id: 'conditions', prompt: 'Share any useful operating conditions or water-analysis details.', placeholder: 'Temperature, pressure, water chemistry, deposition rate…', optional: true },
  ],
  corrosion: [
    { id: 'corrosionType', prompt: 'How is the corrosion presenting?', options: ['General metal loss', 'Pitting', 'Under-deposit corrosion', 'Corrosion under insulation', 'Not yet confirmed'] },
    { id: 'currentTreatment', prompt: 'Is a corrosion inhibitor currently being applied?', options: ['Continuous injection', 'Batch treatment', 'No treatment', 'Not sure'] },
    { id: 'conditions', prompt: 'What are the key fluid and operating conditions?', placeholder: 'Temperature, pressure, water cut, CO₂/H₂S levels…', optional: true },
  ],
  h2s: [
    { id: 'h2sLevel', prompt: 'What H₂S level or target are you working with?', placeholder: 'Current ppm and desired outlet specification' },
    { id: 'fluidType', prompt: 'Which stream needs treatment?', options: ['Crude oil', 'Natural gas', 'Produced water', 'Mixed production fluid', 'Other'] },
    { id: 'currentTreatment', prompt: 'Are you using a scavenger today?', options: ['Yes', 'No', 'Trialing options', 'Not sure'] },
  ],
  emulsion: [
    { id: 'emulsionType', prompt: 'Which emulsion are you trying to resolve?', options: ['Water in oil', 'Oil in water', 'Both / variable', 'Not sure'] },
    { id: 'currentTreatment', prompt: 'Is a demulsifier currently in use?', options: ['Yes — underperforming', 'Yes — seeking an alternative', 'No', 'Not sure'] },
    { id: 'conditions', prompt: 'Share any known fluid or separation conditions.', placeholder: 'API gravity, water cut, temperature, residence time…', optional: true },
  ],
  wax: [
    { id: 'waxLocation', prompt: 'Where is wax deposition most severe?', options: ['Downhole', 'Flowline', 'Pipeline', 'Storage', 'Multiple areas'] },
    { id: 'currentTreatment', prompt: 'How are you treating or removing it now?', options: ['Continuous chemical', 'Batch chemical', 'Hot oil / mechanical', 'No current treatment'] },
    { id: 'conditions', prompt: 'What temperatures or pour-point information are available?', placeholder: 'Operating temperature, cloud point, pour point…', optional: true },
  ],
  foaming: [
    { id: 'fluidType', prompt: 'Where is excessive foam affecting operations?', options: ['Separator', 'Produced-water system', 'Storage tank', 'Gas processing', 'Other'] },
    { id: 'currentTreatment', prompt: 'Is an antifoam or defoamer being used?', options: ['Yes — underperforming', 'Yes — seeking an alternative', 'No', 'Not sure'] },
    { id: 'conditions', prompt: 'Describe the foam and operating conditions.', placeholder: 'Persistent or transient, temperature, fluid composition…', optional: true },
  ],
  bacteria: [
    { id: 'evidence', prompt: 'What evidence of bacterial activity do you have?', options: ['Positive bacteria counts', 'MIC / pitting', 'Biofilm or plugging', 'Souring', 'Suspected only'] },
    { id: 'currentTreatment', prompt: 'What biocide program is currently used?', options: ['Continuous', 'Batch / slug', 'No current program', 'Not sure'] },
    { id: 'conditions', prompt: 'Share any sampling results or system details.', placeholder: 'Counts, organisms, water source, temperature…', optional: true },
  ],
  flow: [
    { id: 'flowProblem', prompt: 'What is restricting or destabilizing flow?', options: ['Hydrates', 'Solids / deposits', 'High viscosity', 'Pressure instability', 'Not sure'] },
    { id: 'conditions', prompt: 'Describe the operating envelope and symptoms.', placeholder: 'Temperature, pressure, fluid composition, restriction location…' },
    { id: 'currentTreatment', prompt: 'Is a flow-assurance chemical being used?', options: ['Yes — underperforming', 'Yes — seeking an alternative', 'No', 'Not sure'] },
  ],
  other: [
    { id: 'problemDescription', prompt: 'Describe the problem in your own words.', placeholder: 'What are you observing, and what outcome do you need?' },
    { id: 'conditions', prompt: 'Add any relevant operating or fluid conditions.', placeholder: 'Temperature, pressure, fluid type, specifications…', optional: true },
  ],
};

const generalQuestions = {
  drilling: [
    { id: 'application', prompt: 'What drilling-fluid or wellbore challenge should we solve?', options: ['Fluid loss', 'Shale inhibition', 'Lubricity / torque', 'Lost circulation', 'Foam control', 'Other'] },
    { id: 'conditions', prompt: 'Describe the mud system and operating conditions.', placeholder: 'Water/oil based, temperature, density, formation details…' },
    { id: 'currentProduct', prompt: 'Are you using a product today?', placeholder: 'Product name, dosage, or “none”', optional: true },
  ],
  completion: [
    { id: 'application', prompt: 'Which completion or stimulation application is this for?', options: ['Completion brine', 'Acid stimulation', 'Hydraulic fracturing', 'Fluid-loss control', 'Surfactant / flowback aid', 'Other'] },
    { id: 'conditions', prompt: 'What performance requirements or conditions matter most?', placeholder: 'Temperature, pressure, salinity, compatibility, formation…' },
    { id: 'currentProduct', prompt: 'Is there a current product or specification to match?', placeholder: 'Product, active chemistry, specification, or “not yet”', optional: true },
  ],
  supplier: [
    { id: 'product', prompt: 'Which product or chemical family needs an alternative supplier?', placeholder: 'Product name, chemistry, or application' },
    { id: 'reason', prompt: 'What is driving the supplier change?', options: ['Availability / lead time', 'Quality or performance', 'Commercial terms', 'Regional supply', 'Supplier diversification', 'Other'] },
    { id: 'specification', prompt: 'What must an alternative match?', placeholder: 'Specification, active content, approvals, packaging…' },
  ],
  pricing: [
    { id: 'product', prompt: 'Which product do you want priced more competitively?', placeholder: 'Product name, chemistry, or application' },
    { id: 'currentProduct', prompt: 'Share current dosage, packaging, or price context if available.', placeholder: 'Optional commercial or technical context', optional: true },
    { id: 'specification', prompt: 'Are there specifications an equivalent must meet?', placeholder: 'Active content, performance target, approvals…', optional: true },
  ],
  exact: [
    { id: 'product', prompt: 'What exact product or chemistry do you need?', placeholder: 'Trade name, chemical name, CAS, or specification' },
    { id: 'application', prompt: 'What application will it be used for?', placeholder: 'Describe the process, fluid, or treatment point' },
    { id: 'specification', prompt: 'List any required grade, concentration, or packaging.', placeholder: 'Technical specification and packaging requirements', optional: true },
  ],
  describe: [
    { id: 'problemDescription', prompt: 'Tell me what you need help with.', placeholder: 'Describe the field problem, product, or sourcing requirement' },
    { id: 'application', prompt: 'Where or how will this chemistry be used?', placeholder: 'Application, system, fluid, or treatment point' },
    { id: 'currentProduct', prompt: 'Is a chemical currently being used?', placeholder: 'Product, dosage, performance, or “no”', optional: true },
  ],
};

export function buildQuestions(need, issue) {
  const base = need === 'production'
    ? (productionIssueQuestions[issue] || productionIssueQuestions.other)
    : (generalQuestions[need] || generalQuestions.describe);
  return [...base, ...commonTail];
}

function titleFor(items, id) {
  return items.find((item) => item.id === id)?.title || items.find((item) => item.id === id)?.label || id;
}

function Progress({ stage }) {
  const steps = ['Need', 'Problem', 'Conversation', 'Details'];
  const active = stage === 'need' ? 0 : stage === 'problem' ? 1 : stage === 'chat' ? 2 : 3;
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

function EquipmentMap({ selected, onSelect }) {
  return (
    <div className="qc-equipment" aria-label="Production system area selector">
      <div className="qc-skyline" aria-hidden="true"><span /><span /><span /></div>
      <div className="qc-pipe qc-pipe-main" aria-hidden="true" />
      <div className="qc-vessel qc-separator" aria-hidden="true" />
      <div className="qc-vessel qc-tank" aria-hidden="true" />
      <div className="qc-well" aria-hidden="true" />
      {AREAS.map((area) => (
        <button key={area.id} type="button" className={`qc-hotspot ${area.id} ${selected === area.id ? 'selected' : ''}`} onClick={() => onSelect(area.id)}>
          <span>+</span>{area.label}
        </button>
      ))}
    </div>
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

function ProblemStage({ area, issue, onArea, onIssue, onContinue }) {
  return (
    <div className="qc-stage qc-problem">
      <div className="qc-section-heading"><span>Production system</span><h1>Where is the problem occurring?</h1><p>Select a system area, then choose the issue that best matches the situation.</p></div>
      <EquipmentMap selected={area} onSelect={onArea} />
      <h2 className="qc-subheading">What issue are you facing?</h2>
      <div className="qc-issue-grid">
        {ISSUES.map(({ id, title, detail, icon: Icon }) => (
          <button type="button" key={id} className={`qc-issue ${issue === id ? 'selected' : ''}`} onClick={() => onIssue(id)}>
            <Icon /><span><strong>{title}</strong><small>{detail}</small></span><FiChevronRight />
          </button>
        ))}
      </div>
      <button type="button" className="qc-primary qc-continue" disabled={!area || !issue} onClick={onContinue}>Continue to technical questions <FiArrowRight /></button>
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

function MessageActions({ message, speakingId, onSpeak }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.text); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch {}
  };
  return (
    <div className="qc-message-actions">
      <button type="button" onClick={copy} aria-label="Copy response"><FiCopy /> {copied ? 'Copied' : 'Copy'}</button>
      <button type="button" onClick={() => onSpeak(message)} title="AI-generated voice" aria-label={speakingId === message.id ? 'Stop AI-generated voice' : 'Play AI-generated voice'}>
        {speakingId === message.id ? <FiPause /> : <FiVolume2 />} {speakingId === message.id ? 'Stop' : 'Listen'}
      </button>
    </div>
  );
}

function ChatStage({ need, area, issue, onFinish }) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [lastAttempt, setLastAttempt] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState('');
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingCanceledRef = useRef(false);
  const audioRef = useRef(null);
  const messageNumberRef = useRef(0);
  const context = useMemo(() => ({
    needLabel: need === 'describe' ? 'Open requirement' : titleFor(NEEDS, need),
    areaLabel: area ? titleFor(AREAS, area) : '',
    issueLabel: issue ? titleFor(ISSUES, issue) : '',
  }), [area, issue, need]);

  const nextId = (prefix) => `${prefix}-${Date.now()}-${messageNumberRef.current += 1}`;

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncViewport = () => document.documentElement.style.setProperty('--qc-chat-vh', `${viewport?.height || window.innerHeight}px`);
    syncViewport();
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    return () => {
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      document.documentElement.style.removeProperty('--qc-chat-vh');
    };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [messages, pending, error]);
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = '0px';
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
  }, [draft]);
  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
    audioRef.current?.pause?.();
  }, []);

  const requestReply = async (nextMessages, image) => {
    setPending(true); setError(''); setQuickReplies([]);
    const attempt = { messages: nextMessages, image };
    setLastAttempt(attempt);
    try {
      const result = await postJson('quotechemChat', {
        context,
        messages: nextMessages.map(({ role, text }) => ({ role, text })),
        image: image ? { dataUrl: image.dataUrl, name: image.name } : null,
      }, { authed: true });
      setMessages((current) => [...current, { id: nextId('assistant'), role: 'assistant', text: result.reply }]);
      setQuickReplies(Array.isArray(result.quickReplies) ? result.quickReplies : []);
      setReady(Boolean(result.readyForContact));
      setLastAttempt(null);
    } catch (reason) {
      setError(reason?.message || 'The assistant could not respond.');
    } finally { setPending(false); }
  };

  const send = async (textValue = draft) => {
    const text = String(textValue || '').trim();
    if (pending || (!text && !attachment)) return;
    const userMessage = { id: nextId('user'), role: 'user', text: text || 'Please review the attached image.', image: attachment };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages); setDraft(''); setAttachment(null); setReady(false);
    await requestReply(nextMessages, userMessage.image);
  };

  const submitText = (event) => {
    event.preventDefault();
    send();
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return setError('Choose a JPEG, PNG, WebP, or GIF image.');
    if (file.size > 8 * 1024 * 1024) return setError('Images must be 8 MB or smaller.');
    try { setAttachment({ name: file.name, type: file.type, dataUrl: await readAsDataUrl(file) }); setError(''); } catch (reason) { setError(reason.message); }
  };

  const finishRecording = (cancel = false) => {
    recordingCanceledRef.current = cancel;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setError('Voice recording is not supported in this browser.');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => window.MediaRecorder.isTypeSupported?.(type));
      const recorder = new window.MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      const chunks = [];
      recorderRef.current = recorder;
      recordingCanceledRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingCanceledRef.current) return;
        const blob = new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] });
        setTranscribing(true);
        try {
          const audioDataUrl = await readAsDataUrl(blob);
          const result = await postJson('quotechemTranscribe', { audioDataUrl }, { authed: true });
          setDraft((current) => current ? `${current.trim()} ${result.transcript}` : result.transcript);
          window.setTimeout(() => textareaRef.current?.focus(), 0);
        } catch (reason) { setError(reason?.message || 'Unable to transcribe the recording.'); }
        finally { setTranscribing(false); }
      };
      recorder.start(); setRecording(true); setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((seconds) => {
        if (seconds >= 44) { window.setTimeout(() => finishRecording(false), 0); return 45; }
        return seconds + 1;
      }), 1000);
    } catch { setError('Microphone access was denied. You can continue by typing.'); }
  };

  const speak = async (message) => {
    if (speakingId === message.id) { audioRef.current?.pause(); setSpeakingId(''); return; }
    audioRef.current?.pause(); setSpeakingId(message.id); setError('');
    try {
      const result = await postJson('quotechemSpeak', { text: message.text }, { authed: true });
      const audio = new Audio(result.audioDataUrl);
      audioRef.current = audio;
      audio.onended = () => setSpeakingId('');
      audio.onerror = () => { setSpeakingId(''); setError('Unable to play this spoken response.'); };
      await audio.play();
    } catch (reason) { setSpeakingId(''); setError(reason?.message || 'Unable to generate speech.'); }
  };

  const onComposerKeyDown = (event) => {
    const mobile = window.matchMedia?.('(max-width: 680px)').matches;
    if (event.key === 'Enter' && !event.shiftKey && !mobile) { event.preventDefault(); send(); }
  };

  return (
    <div className="qc-stage qc-chat-stage">
      <div className="qc-chat-heading"><div><span>AI technical sourcing assistant</span><h1>Let’s qualify your requirement</h1></div><div className="qc-live"><i /> AI connected</div></div>
      <div className="qc-context"><strong>{context.needLabel}</strong>{context.areaLabel ? <><FiChevronRight /><span>{context.areaLabel}</span></> : null}{context.issueLabel ? <><FiChevronRight /><span>{context.issueLabel}</span></> : null}</div>
      <div className="qc-chat-shell">
      <div className="qc-chat" aria-live="polite">
        {!messages.length ? <div className="qc-chat-welcome"><div className="qc-ai-mark"><FiDroplet /></div><h2>What should we know?</h2><p>Describe the requirement, operating conditions, current treatment, or attach a field image. I’ll ask only the next useful question.</p></div> : null}
        {messages.map((message) => <div className={`qc-message-row ${message.role}`} key={message.id}>
          <div className="qc-message-avatar">{message.role === 'assistant' ? <FiDroplet /> : 'You'}</div>
          <div className="qc-message-body">{message.image ? <img src={message.image.dataUrl} alt={`Attached ${message.image.name}`} /> : null}<div className="qc-message-text">{message.text}</div>{message.role === 'assistant' ? <MessageActions message={message} speakingId={speakingId} onSpeak={speak} /> : null}</div>
        </div>)}
        {pending ? <div className="qc-message-row assistant"><div className="qc-message-avatar"><FiDroplet /></div><div className="qc-typing" aria-label="Assistant is thinking"><i /><i /><i /></div></div> : null}
        {error ? <div className="qc-chat-error" role="alert"><FiXCircle /><span>{error}</span>{lastAttempt && !pending ? <button type="button" onClick={() => requestReply(lastAttempt.messages, lastAttempt.image)}>Retry</button> : null}</div> : null}
        <div ref={endRef} />
      </div>
      <div className="qc-composer-zone">
          {quickReplies.length ? <div className="qc-quick-replies">{quickReplies.map((option) => <button type="button" key={option} disabled={pending} onClick={() => send(option)}>{option}</button>)}</div> : null}
          {ready ? <button type="button" className="qc-ready-banner" onClick={onFinish}><FiCheckCircle /><span><strong>Enough information to begin</strong><small>Continue to contact details</small></span><FiArrowRight /></button> : null}
          {attachment ? <div className="qc-attachment-preview"><img src={attachment.dataUrl} alt="Attachment preview" /><span><strong>{attachment.name}</strong><small>Image ready to send</small></span><button type="button" onClick={() => setAttachment(null)} aria-label="Remove image"><FiX /></button></div> : null}
          {recording ? <div className="qc-recording"><i /><strong>Recording {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</strong><button type="button" onClick={() => finishRecording(true)}><FiX /> Cancel</button><button type="button" onClick={() => finishRecording(false)}><FiSquare /> Stop</button></div> : null}
          <form onSubmit={submitText} className="qc-message-form">
            <button type="button" className="qc-composer-tool" onClick={() => fileRef.current?.click()} disabled={pending || recording} aria-label="Attach image"><FiImage /></button>
            <input ref={fileRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseFile} />
            <label className="sr-only" htmlFor="qc-message">Message</label>
            <textarea ref={textareaRef} id="qc-message" rows="1" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} placeholder={transcribing ? 'Transcribing…' : 'Message QuoteChem…'} disabled={pending || recording || transcribing} />
            <button type="button" className={`qc-composer-tool ${recording ? 'active' : ''}`} onClick={startRecording} disabled={pending || recording || transcribing} aria-label="Record voice message"><FiMic /></button>
            <button type="submit" className="qc-send" disabled={pending || recording || transcribing || (!draft.trim() && !attachment)} aria-label="Send message"><FiSend /></button>
          </form>
          <div className="qc-composer-meta"><span>AI can make mistakes. Verify critical technical information.</span><button type="button" onClick={onFinish}>Finish request</button></div>
        </div>
      </div>
    </div>
  );
}

function ContactStage({ values, onChange, onSubmit }) {
  const [errors, setErrors] = useState({});
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Enter your name.';
    if (!values.company.trim()) next.company = 'Enter your company.';
    if (!/^\S+@\S+\.\S+$/.test(values.email)) next.email = 'Enter a valid work email.';
    if (!values.country.trim()) next.country = 'Enter a country or location.';
    setErrors(next);
    if (!Object.keys(next).length) onSubmit();
  };
  return (
    <div className="qc-stage qc-contact">
      <div className="qc-section-heading"><span>Final step</span><h1>Where should we send our findings?</h1><p>No account or password is required. Contact details remain in this browser prototype and are not submitted.</p></div>
      <form onSubmit={submit} noValidate>
        {[['name', 'Name', 'Your full name', true], ['company', 'Company', 'Company name', true], ['email', 'Work email', 'name@company.com', true], ['phone', 'Phone number', 'Optional', false], ['country', 'Country / location', 'Country or operating region', true]].map(([key, label, placeholder, required]) => (
          <label key={key}>{label}{required ? <span> *</span> : null}<input type={key === 'email' ? 'email' : 'text'} value={values[key]} onChange={(event) => onChange(key, event.target.value)} placeholder={placeholder} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} />{errors[key] ? <small id={`${key}-error`} className="qc-error">{errors[key]}</small> : null}</label>
        ))}
        <button type="submit" className="qc-primary">Create demo request <FiArrowRight /></button>
      </form>
      <p className="qc-privacy"><FiShield /> Prototype mode: nothing entered here leaves this browser session.</p>
    </div>
  );
}

function CompleteStage({ requestId, onRestart }) {
  const steps = [
    ['Request Received', FiCheckCircle, 'complete'], ['Technical Review', FiTool], ['Supplier Sourcing', FiUsers], ['Options Being Prepared', FiPackage], ['QuoteChem Follow-Up', FiTruck],
  ];
  return (
    <div className="qc-stage qc-complete">
      <div className="qc-success-icon"><FiCheck /></div><p className="qc-kicker">Request {requestId}</p><h1>We’re on it.</h1><p className="qc-lead">Your demo request is ready for the QuoteChem sourcing workflow.</p>
      <div className="qc-timeline">{steps.map(([label, Icon, status], index) => <div key={label} className={status || ''}><span><Icon /></span><p><strong>{label}</strong><small>{index === 0 ? 'Completed in this prototype' : 'Next step in the future workflow'}</small></p></div>)}</div>
      <div className="qc-demo-notice"><FiShield /><div><strong>Design prototype only</strong><p>The AI conversation was processed securely, but no request or contact information was saved or sent to the sourcing team.</p></div></div>
      <button type="button" className="qc-primary" onClick={onRestart}><FiRefreshCw /> Start another request</button>
    </div>
  );
}

function makeRequestId() {
  return `QC-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
}

export default function QuoteChem() {
  const [stage, setStage] = useState('need');
  const [need, setNeed] = useState('');
  const [area, setArea] = useState('');
  const [issue, setIssue] = useState('');
  const [contact, setContact] = useState({ name: '', company: '', email: '', phone: '', country: '' });
  const [requestId, setRequestId] = useState('');

  const chooseNeed = (id) => { setNeed(id); setStage(id === 'production' ? 'problem' : 'chat'); };
  const goBack = () => {
    if (stage === 'problem') setStage('need');
    else if (stage === 'chat') setStage(need === 'production' ? 'problem' : 'need');
    else if (stage === 'contact') setStage('chat');
  };
  const restart = () => { setStage('need'); setNeed(''); setArea(''); setIssue(''); setContact({ name: '', company: '', email: '', phone: '', country: '' }); setRequestId(''); };
  const complete = () => { setRequestId(makeRequestId()); setStage('complete'); };

  return (
    <div className="quotechem-app">
      <header className="qc-app-header"><div className="qc-wordmark">Quote<span>Chem</span><small>Global Oilfield Chemical Sourcing</small></div>{stage !== 'need' && stage !== 'complete' ? <button type="button" onClick={goBack}><FiArrowLeft /> Back</button> : <span />}{stage !== 'need' ? <button type="button" onClick={restart}><FiRefreshCw /> Start over</button> : <span />}</header>
      <div className="qc-content"><Progress stage={stage} />
        {stage === 'need' ? <NeedStage onChoose={chooseNeed} /> : null}
        {stage === 'problem' ? <ProblemStage area={area} issue={issue} onArea={setArea} onIssue={setIssue} onContinue={() => setStage('chat')} /> : null}
        {stage === 'chat' ? <ChatStage need={need} area={area} issue={issue} onFinish={() => setStage('contact')} /> : null}
        {stage === 'contact' ? <ContactStage values={contact} onChange={(key, value) => setContact((prev) => ({ ...prev, [key]: value }))} onSubmit={complete} /> : null}
        {stage === 'complete' ? <CompleteStage requestId={requestId} onRestart={restart} /> : null}
      </div>
      <footer className="qc-footer"><FiShield /> Secure AI prototype <span>•</span> Conversation history is not saved</footer>
    </div>
  );
}
