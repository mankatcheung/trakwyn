import { beforeEach, describe, expect, it } from 'vitest';
import { resetColdStartForTesting } from '#src/infrastructure/observability/coldStart.js';
import { incomingSpanAttributes } from '#src/infrastructure/observability/incomingSpanAttributes.js';

const MOBILE_UA = 'TrakwynMobile/1.2.3 (Pixel 8; Android 14)';

describe('incomingSpanAttributes', () => {
  beforeEach(() => {
    resetColdStartForTesting();
  });

  it('merges the cold-start flag with the mobile client identity', () => {
    expect(
      incomingSpanAttributes({ url: '/graphql', headers: { 'user-agent': MOBILE_UA } }),
    ).toMatchObject({
      'faas.coldstart': true,
      'app.client.name': 'trakwyn-mobile',
      'app.client.version': '1.2.3',
      'device.model.name': 'Pixel 8',
      'os.name': 'Android',
      'os.version': '14',
    });
  });

  it('still flags warm requests from other clients', () => {
    incomingSpanAttributes({ url: '/graphql', headers: {} });

    expect(incomingSpanAttributes({ url: '/graphql', headers: {} })).toEqual({
      'faas.coldstart': false,
    });
  });

  it('leaves the startup probe without a cold-start flag but still identifies the client', () => {
    expect(
      incomingSpanAttributes({ url: '/health', headers: { 'user-agent': MOBILE_UA } }),
    ).toEqual({
      'app.client.name': 'trakwyn-mobile',
      'app.client.version': '1.2.3',
      'device.model.name': 'Pixel 8',
      'os.name': 'Android',
      'os.version': '14',
    });
  });
});
