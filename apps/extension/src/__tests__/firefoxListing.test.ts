import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../manifest';
import { listingSection } from './support/listingSection';

/**
 * Holds the AMO listing copy (`store/firefox-listing.md`, JEF-423) to the
 * Developer Hub's limits and to the Firefox manifest.
 */

const listing = readFileSync(
  join(import.meta.dirname, '..', '..', 'store', 'firefox-listing.md'),
  'utf8',
);
const section = (heading: string): string => listingSection(listing, heading);

const NAME_MAX = 50;
const SUMMARY_MAX = 250;

interface FirefoxManifest {
  permissions?: string[];
  browser_specific_settings: { gecko: { data_collection_permissions: { required: string[] } } };
}

const manifest = buildManifest({ browser: 'firefox', command: 'build' }) as FirefoxManifest;

describe('Firefox listing copy', () => {
  it('fits the Developer Hub limits', () => {
    expect(section('### Name').length).toBeLessThanOrEqual(NAME_MAX);
    expect(section('### Summary').length).toBeLessThanOrEqual(SUMMARY_MAX);
  });

  it('does not list job-board names in the metadata', () => {
    // Same rule as the Web Store's (JEF-418): keyword spam is a rejection.
    const metadata = `${section('### Name')}\n${section('### Summary')}\n${section('### Description')}`;

    expect(metadata).not.toMatch(/linkedin|indeed|glassdoor|greenhouse|lever|workday/i);
  });

  it('gives the contact and policy details', () => {
    expect(section('### Support email')).toBe('contact@trakwyn.com');
    expect(section('### Privacy policy URL')).toBe('https://www.trakwyn.com/privacy');
  });

  it.each(manifest.permissions ?? [])('justifies the %s permission', (permission) => {
    expect(section(`#### \`${permission}\``)).not.toBe('');
  });

  it('declares the data categories the manifest does', () => {
    const declaration = section('### Data collection declaration');

    for (const category of manifest.browser_specific_settings.gecko.data_collection_permissions
      .required) {
      expect(declaration).toContain(`\`${category}\``);
    }
  });

  it('discloses that Keep me signed in keeps the refresh token on the device', () => {
    expect(section('#### `storage`')).toMatch(/Keep me signed in/);
    expect(section('### Description')).toMatch(/Keep me signed in/);
  });
});
