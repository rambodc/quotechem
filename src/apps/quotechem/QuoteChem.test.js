import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuoteChem, { CATEGORY_CONFIG, NEEDS } from './QuoteChem';
import { postJson } from '../../lib/api';

jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'staff-1' } } }));
jest.mock('../../lib/api', () => ({ postJson: jest.fn(() => Promise.resolve({ conversationId: 'c-1', reply: 'Tell me more.', quickReplies: [], readyForContact: false })) }));

function renderQuoteChem() {
  return render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/*" element={<QuoteChem publicMode />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  window.scrollTo = jest.fn();
  window.localStorage.clear();
  window.sessionStorage.clear();
  postJson.mockReset();
  postJson.mockImplementation((path) => {
    if (path === 'quotechemComplete') return Promise.resolve({ requestId: 'QC-2026-10001' });
    if (path === 'quotechemAbandon') return Promise.resolve({});
    return Promise.resolve({ conversationId: 'c-1', reply: 'Tell me more.', quickReplies: [], readyForContact: false });
  });
});

describe('QuoteChem category flow', () => {
  test('defines a complete image-led category for every guided need', () => {
    expect(Object.keys(CATEGORY_CONFIG)).toEqual(NEEDS.map(({ id }) => id));
    expect(CATEGORY_CONFIG.production.items.map(({ title }) => title)).toEqual(expect.arrayContaining(['Corrosion', 'Produced-Water Treatment', 'Oxygen Scavenging', 'Other / Not sure']));
    expect(CATEGORY_CONFIG.drilling.items).toHaveLength(10);
    expect(CATEGORY_CONFIG.completion.items).toHaveLength(11);
    for (const need of ['supplier', 'pricing', 'exact']) expect(CATEGORY_CONFIG[need].items).toHaveLength(7);
  });

  test('subcategory selection opens chat and automatically submits both values once', async () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(screen.getByRole('heading', { name: /What drilling challenge/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue to technical conversation/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Fluid Loss/i }));
    expect(window.scrollTo.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByPlaceholderText('Message QuoteChem…')).toBeTruthy();
    expect(screen.getByText(/Need: Drilling Chemical/)).toBeTruthy();
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('quotechemChat', expect.objectContaining({
      context: expect.objectContaining({ needLabel: 'Drilling Chemical', subcategoryLabel: 'Fluid Loss' }),
      text: 'Need: Drilling Chemical\nCategory: Fluid Loss',
    }), { authed: true }));
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Tell me more.')).toBeTruthy();
  });

  test('the open-description path enters an empty chat without auto submission', () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Just describe what you need/i }));
    expect(screen.getByPlaceholderText('Message QuoteChem…')).toBeTruthy();
    expect(postJson).not.toHaveBeenCalled();
  });

  test('the logo clears the flow and returns to the first step', () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Return to QuoteChem home/i }));
    expect(screen.getByRole('dialog', { name: /Start a new request/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog', { name: /Start a new request/i }).querySelector('.qc-primary'));
    expect(screen.getByRole('heading', { name: /What do you need help with/i })).toBeTruthy();
  });

  test('Back from contact restores the existing in-memory conversation', async () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Fluid Loss/i }));
    expect(await screen.findByText('Tell me more.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish request' }));
    expect(screen.getByRole('heading', { name: /Where should we send/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText('Tell me more.')).toBeTruthy();
    expect(postJson.mock.calls.filter(([path]) => path === 'quotechemChat')).toHaveLength(1);
  });

  test('changing a category updates the same conversation instead of creating another', async () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Fluid Loss/i }));
    await screen.findByText('Tell me more.');
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    fireEvent.click(screen.getByRole('button', { name: /Lubricity \/ Torque/i }));
    await waitFor(() => expect(postJson.mock.calls.filter(([path]) => path === 'quotechemChat')).toHaveLength(2));
    const chatCalls = postJson.mock.calls.filter(([path]) => path === 'quotechemChat');
    const updatePayload = chatCalls[1][1];
    expect(updatePayload.conversationId).toBe(chatCalls[0][1].conversationId);
    expect(updatePayload.text).toMatch(/Requirement updated[\s\S]*Lubricity \/ Torque/);
  });

  test('restores a saved Firestore thread and exact stage after remount', async () => {
    window.localStorage.setItem('quotechem:public-sourcing-session', JSON.stringify({ version: 2, stage: 'chat', need: 'drilling', subcategory: 'fluid-loss', activeContext: { need: 'drilling', subcategory: 'fluid-loss' }, contact: {}, conversationId: 'saved-1', status: 'active' }));
    postJson.mockImplementation((path) => path === 'quotechemResume' ? Promise.resolve({
      conversation: { conversationId: 'saved-1', status: 'active', requestId: '', contact: null },
      messages: [{ messageId: 'saved-user', role: 'user', text: 'Saved field details', attachment: null, response: null }, { messageId: 'saved-ai', role: 'assistant', text: 'Saved assistant response', attachment: null, response: { quickReplies: ['Saved reply'], readyForContact: false } }],
    }) : Promise.resolve({}));
    renderQuoteChem();
    expect(await screen.findByText('Saved assistant response')).toBeTruthy();
    expect(screen.getByPlaceholderText('Message QuoteChem…')).toBeTruthy();
    expect(postJson).toHaveBeenCalledWith('quotechemResume', { conversationId: 'saved-1' }, { authed: true });
  });

  test('explicit restart abandons the active draft before opening a fresh request', async () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Fluid Loss/i }));
    await screen.findByText('Tell me more.');
    const chatCall = postJson.mock.calls.find(([path]) => path === 'quotechemChat');
    expect(screen.queryByRole('button', { name: /^Start new request$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Return to QuoteChem home/i }));
    fireEvent.click(screen.getByRole('dialog', { name: /Start a new request/i }).querySelector('.qc-primary'));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('quotechemAbandon', { conversationId: chatCall[1].conversationId }, { authed: true }));
    expect(screen.getByRole('heading', { name: /What do you need help with/i })).toBeTruthy();
  });

  test('submission ends on a minimal confirmation and Done clears the browser session', async () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Fluid Loss/i }));
    await screen.findByText('Tell me more.');
    fireEvent.click(screen.getByRole('button', { name: 'Finish request' }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Test Engineer' } });
    fireEvent.change(screen.getByLabelText(/^Company/), { target: { value: 'Field Co' } });
    fireEvent.change(screen.getByLabelText(/^Work email/), { target: { value: 'engineer@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Country \/ location/), { target: { value: 'Canada' } });
    fireEvent.click(screen.getByRole('button', { name: /Create sourcing request/i }));
    expect(await screen.findByRole('heading', { name: /Thank you/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Back/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('heading', { name: /What do you need help with/i })).toBeTruthy();
    expect(window.localStorage.getItem('quotechem:public-sourcing-session')).toBeNull();
  });

  test('tracks the visual viewport and clears keyboard state when the viewport expands', () => {
    jest.useFakeTimers();
    const viewport = new EventTarget();
    viewport.height = 800;
    viewport.offsetTop = 0;
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.localStorage.setItem('quotechem:public-sourcing-session', JSON.stringify({ version: 2, stage: 'chat', need: 'describe', subcategory: '', activeContext: { need: 'describe', subcategory: '' }, contact: {}, conversationId: '' }));
    const view = render(<MemoryRouter initialEntries={['/chat']}><Routes><Route path="/*" element={<QuoteChem publicMode />} /></Routes></MemoryRouter>);

    const composer = screen.getByPlaceholderText('Message QuoteChem…');
    expect(document.documentElement.style.getPropertyValue('--qc-viewport-height')).toBe('');
    fireEvent.focus(composer);
    viewport.height = 480;
    act(() => { viewport.dispatchEvent(new Event('resize')); jest.advanceTimersByTime(100); });
    expect(document.documentElement.classList.contains('qc-keyboard-open')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--qc-viewport-height')).toBe('480px');

    viewport.height = 800;
    act(() => { viewport.dispatchEvent(new Event('resize')); jest.advanceTimersByTime(100); });
    expect(document.documentElement.classList.contains('qc-keyboard-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--qc-viewport-height')).toBe('');

    view.unmount();
    delete window.visualViewport;
    jest.useRealTimers();
  });
});
