import { buildQuestions, ISSUES, NEEDS } from './QuoteChem';

describe('QuoteChem conversation definitions', () => {
  test('offers every planned entry path', () => {
    expect(NEEDS.map((need) => need.id)).toEqual(['production', 'drilling', 'completion', 'supplier', 'pricing', 'exact']);
  });

  test('offers the full production issue set', () => {
    expect(ISSUES.map((issue) => issue.id)).toEqual(['corrosion', 'scale', 'h2s', 'emulsion', 'wax', 'foaming', 'bacteria', 'flow', 'other']);
  });

  test('gives scale a tailored qualification sequence and common logistics', () => {
    const ids = buildQuestions('production', 'scale').map((question) => question.id);
    expect(ids).toEqual(expect.arrayContaining(['scaleType', 'currentTreatment', 'conditions', 'quantity', 'location', 'timing']));
  });

  test.each(['drilling', 'completion', 'supplier', 'pricing', 'exact', 'describe'])('%s reaches logistics qualification', (need) => {
    const ids = buildQuestions(need).map((question) => question.id);
    expect(ids.slice(-3)).toEqual(['quantity', 'location', 'timing']);
  });
});
