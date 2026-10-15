import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const lines = (path) => read(path).trimEnd().split(/\r?\n/);

test('H1 content template matches the 18 pending works and contains no review decisions', () => {
  const source = read('review/redesign/T08_content_sample_2026-10-12.md');
  const expected = [...source.matchAll(/^\| `([^`]+)` \| ([^|]+) \|/gm)]
    .map((match) => [match[1], match[2].trim()]);
  const catalog = JSON.parse(read('review/content-review-catalog.json'));
  const works = new Map(catalog.works.map((work) => [work.id, work.title]));
  const [header, ...rows] = lines('review/redesign/templates/T11_content_review_template.csv');

  assert.equal(expected.length, 18);
  assert.equal(rows.length, 18);
  assert.deepEqual(header.split(','), [
    'workId', 'title', 'contentVersion', 'reviewer', 'reviewDate',
    'editionOrAuthoritativePage', 'locator', 'textAccurate',
    'annotationAccurate', 'backgroundAccurate', 'todayConnectionAccurate',
    'sceneTagsAccurate', 'variantNotes', 'issueAndCorrection',
    'recheckReviewer', 'decision',
  ]);

  for (const [index, line] of rows.entries()) {
    const values = line.split(',');
    assert.equal(values.length, 16, `row ${index + 1} field count`);
    assert.deepEqual(values.slice(0, 2), expected[index]);
    assert.equal(values[1], works.get(values[0]));
    assert.equal(values[2], catalog.contentVersion);
    assert.ok(values.slice(3).every((value) => value === ''), `row ${index + 1} must be unsigned`);
  }
});

test('H1 observation templates are blank and private study records stay out of Git', () => {
  assert.equal(lines('review/redesign/templates/T11_user_tasks_template.csv').length, 1);
  assert.equal(lines('review/redesign/templates/T11_daily_exposure_template.csv').length, 1);
  assert.match(read('.gitignore'), /^review\/redesign\/h1-private\/$/m);

  const protocol = read('review/redesign/T11_user_study_protocol_2026-10-15.md');
  assert.match(protocol, /H1 未开始、未签收/);
  assert.match(protocol, /6–8 名大学生/);
  assert.match(protocol, /三个\*\*不同的当地自然日\*\*/);
  assert.match(protocol, /80% 无提示完成/);
  for (let task = 1; task <= 8; task += 1) {
    assert.match(protocol, new RegExp(`C${String(task).padStart(2, '0')}`));
  }
});
