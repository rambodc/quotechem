import test from 'node:test';
import assert from 'node:assert/strict';
import { __testables } from './publicQuoteChat.js';
import { __emailTestables } from './email.js';

test('temporary password validation accepts six characters', () => {
  assert.equal(__testables.isValidTemporaryPassword('123456'), true);
});

test('temporary password validation rejects shorter values', () => {
  assert.equal(__testables.isValidTemporaryPassword('12345'), false);
});

test('managed mini app normalization includes access-managed apps only', () => {
  assert.deepEqual(__testables.normalizeMiniAppIds(['quotes', 'drilling-fluids-report', 'drilling-programs', 'account']), [
    'quotes',
    'drilling-fluids-report',
    'drilling-programs',
  ]);
});

test('mud program extraction page builder creates overview and section pages', () => {
  const pages = __testables.buildMudProgramPagesFromExtraction({
    overview: {
      programTitle: 'North Pad Mud Program',
      wellName: 'Well 12-34',
      sourceSummary: 'Extracted source summary.',
    },
    sections: [
      {
        id: 'surface',
        name: 'Surface Hole',
        topDepth: '0 m',
        bottomDepth: '650 m',
      },
    ],
  });

  assert.equal(pages.length, 2);
  assert.equal(pages[0].type, 'overview');
  assert.equal(pages[0].data.executiveSummary, 'Extracted source summary.');
  assert.equal(pages[1].type, 'section');
  assert.equal(pages[1].title, 'Surface Hole');
});

test('mud program PDF validation only accepts application PDFs', () => {
  assert.equal(__testables.isPdfContentType('application/pdf'), true);
  assert.equal(__testables.isPdfContentType('image/png'), false);
});

test('QuoteChem email templates render invite links', () => {
  const rendered = __emailTestables.buildTemplatedEmail({
    templateId: 'userInvite',
    data: {
      inviterName: 'Rambod',
      inviteUrl: 'https://quotechem.com/invite/token',
    },
  });

  assert.equal(rendered.subject, 'Finish your QuoteChem registration');
  assert.match(rendered.text, /https:\/\/quotechem\.com\/invite\/token/);
  assert.match(rendered.html, /Finish registration/);
});
