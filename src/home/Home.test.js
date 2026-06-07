import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
