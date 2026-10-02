import { afterEach, describe, expect, it, vi } from 'vitest';
import { jobBoardOf, parserHealthProperties } from './health';
import { parseJobPage } from './index';
import { linkedInSduiFixture } from './__fixtures__/linkedin-sdui.fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.title = '';
});

function visit(url: string, html: string): void {
  document.body.innerHTML = html;
  vi.stubGlobal('location', new URL(url));
}

describe('jobBoardOf', () => {
  it.each([
    ['www.linkedin.com', 'linkedin'],
    ['uk.indeed.com', 'indeed'],
    ['boards.greenhouse.io', 'greenhouse'],
    ['jobs.lever.co', 'lever'],
    ['acme.wd5.myworkdayjobs.com', 'workday'],
    ['acme.workday.com', 'workday'],
    ['www.glassdoor.com', 'glassdoor'],
  ])('names %s as %s', (hostname, board) => {
    expect(jobBoardOf(hostname)).toBe(board);
  });

  it('does not match a lookalike host', () => {
    expect(jobBoardOf('notlinkedin.com')).toBe('other');
    expect(jobBoardOf('linkedin.com.evil.example')).toBe('other');
  });
});

describe('parseJobPage', () => {
  it('reports a healthy parse by the site parser', () => {
    visit('https://www.linkedin.com/jobs/view/4444415532/', linkedInSduiFixture);

    const { jobData, parserHealth } = parseJobPage();

    expect(jobData?.company).toBe('Monument');
    expect(parserHealth).toEqual({
      board: 'linkedin',
      onJobPage: true,
      parser: 'linkedin',
      siteParserFailed: false,
      missingFields: [],
    });
    expect(parserHealthProperties(parserHealth)).toBeNull();
  });

  it('flags a board whose own parser found nothing, though generic filled in', () => {
    visit('https://www.linkedin.com/jobs/view/1/', '<h1>Staff Engineer</h1>');

    const { jobData, parserHealth } = parseJobPage();

    expect(jobData?.role).toBe('Staff Engineer');
    expect(parserHealthProperties(parserHealth)).toEqual({
      board: 'linkedin',
      parser: 'generic',
      site_parser_failed: true,
      missing_fields: ['description'],
    });
  });

  it('flags a page no parser could read', () => {
    visit('https://uk.indeed.com/viewjob?jk=1', '<div>nothing here</div>');

    const { jobData, parserHealth } = parseJobPage();

    expect(jobData).toBeNull();
    expect(parserHealthProperties(parserHealth)).toEqual({
      board: 'indeed',
      parser: 'none',
      site_parser_failed: true,
      missing_fields: ['company', 'role', 'description'],
    });
  });

  it.each([
    [
      'https://www.linkedin.com/jobs/search/?keywords=engineer',
      'a LinkedIn search with no job open',
    ],
    ['https://uk.indeed.com/jobs?q=engineer', 'an Indeed search with no job open'],
  ])('does not flag %s (%s)', (url) => {
    visit(url, '<div>nothing here</div>');

    const { parserHealth } = parseJobPage();

    expect(parserHealth).toMatchObject({ onJobPage: false, siteParserFailed: true });
    expect(parserHealthProperties(parserHealth)).toBeNull();
  });

  it('flags a job selected in a search split pane that the parser cannot read', () => {
    visit('https://uk.indeed.com/jobs?q=engineer&vjk=abc123', '<div>nothing here</div>');

    expect(parserHealthProperties(parseJobPage().parserHealth)).toMatchObject({
      board: 'indeed',
      site_parser_failed: true,
    });
  });

  it('does not flag a generic board for a missing description alone', () => {
    visit('https://jobs.lever.co/acme/1', '<h1>Staff Engineer</h1>');

    const { parserHealth } = parseJobPage();

    expect(parserHealth).toMatchObject({ board: 'lever', parser: 'generic' });
    expect(parserHealthProperties(parserHealth)).toBeNull();
  });

  it('reports no page content or hostname', () => {
    visit('https://acme.wd5.myworkdayjobs.com/careers/job/1', '<div>nothing here</div>');

    const properties = parserHealthProperties(parseJobPage().parserHealth);

    expect(JSON.stringify(properties)).not.toMatch(/acme|myworkdayjobs/);
    expect(properties?.board).toBe('workday');
  });
});

describe('parserHealthProperties', () => {
  it('ignores pages that are not on a known board', () => {
    expect(
      parserHealthProperties({
        board: 'other',
        onJobPage: true,
        parser: 'none',
        siteParserFailed: false,
        missingFields: ['company', 'role', 'description'],
      }),
    ).toBeNull();
  });
});
