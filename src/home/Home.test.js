import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Home from './Home';

function mockJsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

function sessionPayload(overrides = {}) {
  return {
    ok: true,
    sessionId: 'session-1',
    session: {
      messages: [{ id: 'seed', role: 'assistant', content: 'Hello from QuoteChem', inputMode: 'text', actions: [] }],
      completed: false,
      rfqId: '',
      emailStatus: 'not_attempted',
      latestExtractedState: { confirm: false },
      missingRequired: [],
      readyToFinalize: false,
      lastFinalizedExtracted: {},
      ...overrides,
    },
  };
}

describe('Home assistant input modes', () => {
  beforeEach(() => {
    process.env.REACT_APP_QUOTECHEM_API_BASE = 'https://api.example.test';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('renders textarea for text mode', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse(sessionPayload()));

    render(<Home />);

    expect(await screen.findByPlaceholderText('Type what you need...')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeTruthy();
  });

  test('renders action buttons when assistant responds with action mode', async () => {
    global.fetch
      .mockResolvedValueOnce(mockJsonResponse(sessionPayload()))
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          assistant: {
            reply: 'Ready to send your confirmation to buyer@example.com?',
            inputMode: 'action',
            actions: [
              { label: 'Yes', value: 'Yes' },
              { label: 'No', value: 'No' },
            ],
          },
          state: {
            extracted: { email: 'buyer@example.com', confirm: false },
            missingRequired: [],
            readyToFinalize: true,
            confirmed: false,
            emailStatus: 'not_attempted',
            rfqId: '',
          },
          completed: false,
          rfqId: '',
        })
      );

    render(<Home />);

    const input = await screen.findByPlaceholderText('Type what you need...');
    fireEvent.change(input, { target: { value: 'I need caustic soda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('button', { name: 'Yes' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Type what you need...')).not.toBeTruthy();
  });

  test('clicking action button sends action value as message', async () => {
    global.fetch
      .mockResolvedValueOnce(mockJsonResponse(sessionPayload()))
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          assistant: {
            reply: 'Ready to send your confirmation email?',
            inputMode: 'action',
            actions: [
              { label: 'Yes', value: 'Yes' },
              { label: 'No', value: 'No' },
            ],
          },
          state: {
            extracted: { confirm: false },
            missingRequired: [],
            readyToFinalize: true,
            confirmed: false,
            emailStatus: 'not_attempted',
            rfqId: '',
          },
          completed: false,
          rfqId: '',
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          assistant: {
            reply: 'Confirmed. Your request is submitted and your confirmation email was sent.',
            inputMode: 'text',
            actions: [],
          },
          state: {
            extracted: { confirm: true },
            missingRequired: [],
            readyToFinalize: true,
            confirmed: true,
            emailStatus: 'sent',
            rfqId: 'rfq-1',
          },
          completed: true,
          rfqId: 'rfq-1',
        })
      );

    render(<Home />);

    const input = await screen.findByPlaceholderText('Type what you need...');
    fireEvent.change(input, { target: { value: 'Need sodium hydroxide' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const yesButton = await screen.findByRole('button', { name: 'Yes' });
    fireEvent.click(yesButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    const thirdRequest = JSON.parse(global.fetch.mock.calls[2][1].body);
    expect(thirdRequest.message).toBe('Yes');
  });

  test('falls back to text input when action payload is invalid', async () => {
    global.fetch
      .mockResolvedValueOnce(mockJsonResponse(sessionPayload()))
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          assistant: {
            reply: 'Ready to proceed?',
            inputMode: 'action',
            actions: [{ label: 'Only one option', value: 'Only one option' }],
          },
          state: {
            extracted: { confirm: false },
            missingRequired: [],
            readyToFinalize: true,
            confirmed: false,
            emailStatus: 'not_attempted',
            rfqId: '',
          },
          completed: false,
          rfqId: '',
        })
      );

    render(<Home />);

    const input = await screen.findByPlaceholderText('Type what you need...');
    fireEvent.change(input, { target: { value: 'Need citric acid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByPlaceholderText('Type what you need...')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Only one option' })).not.toBeTruthy();
  });

  test('disables action buttons while loading', async () => {
    let resolveThird;
    const thirdPromise = new Promise((resolve) => {
      resolveThird = resolve;
    });

    global.fetch
      .mockResolvedValueOnce(mockJsonResponse(sessionPayload()))
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          assistant: {
            reply: 'Ready to send your confirmation email?',
            inputMode: 'action',
            actions: [
              { label: 'Yes', value: 'Yes' },
              { label: 'No', value: 'No' },
            ],
          },
          state: {
            extracted: { confirm: false },
            missingRequired: [],
            readyToFinalize: true,
            confirmed: false,
            emailStatus: 'not_attempted',
            rfqId: '',
          },
          completed: false,
          rfqId: '',
        })
      )
      .mockReturnValueOnce(thirdPromise);

    render(<Home />);

    const input = await screen.findByPlaceholderText('Type what you need...');
    fireEvent.change(input, { target: { value: 'Need sulfuric acid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const yesButton = await screen.findByRole('button', { name: 'Yes' });
    fireEvent.click(yesButton);

    await waitFor(() => expect(yesButton.disabled).toBe(true));
    resolveThird(
      mockJsonResponse({
        ok: true,
        assistant: {
          reply: 'Confirmed.',
          inputMode: 'text',
          actions: [],
        },
        state: {
          extracted: { confirm: true },
          missingRequired: [],
          readyToFinalize: true,
          confirmed: true,
          emailStatus: 'sent',
          rfqId: 'rfq-2',
        },
        completed: true,
        rfqId: 'rfq-2',
      })
    );
  });
});
