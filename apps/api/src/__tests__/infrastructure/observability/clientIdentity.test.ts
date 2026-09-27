import { describe, expect, it } from 'vitest';
import { clientIdentitySpanAttributes } from '#src/infrastructure/observability/clientIdentity.js';

const withUserAgent = (userAgent: string) => ({ headers: { 'user-agent': userAgent } });

describe('clientIdentitySpanAttributes', () => {
  it("records the mobile app's version, device model and OS", () => {
    expect(
      clientIdentitySpanAttributes(withUserAgent('TrakwynMobile/1.2.3 (iPhone 15 Pro; iOS 17.4)')),
    ).toEqual({
      'app.client.name': 'trakwyn-mobile',
      'app.client.version': '1.2.3',
      'device.model.name': 'iPhone 15 Pro',
      'os.name': 'iOS',
      'os.version': '17.4',
    });
  });

  it('leaves off the parts the app sent empty rather than recording ""', () => {
    expect(clientIdentitySpanAttributes(withUserAgent('TrakwynMobile/1.2.3 (; android)'))).toEqual({
      'app.client.name': 'trakwyn-mobile',
      'app.client.version': '1.2.3',
      'os.name': 'android',
    });
  });

  it('adds nothing for a browser User-Agent', () => {
    expect(
      clientIdentitySpanAttributes(
        withUserAgent(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Safari/604.1',
        ),
      ),
    ).toEqual({});
  });

  it('adds nothing when the request has no User-Agent', () => {
    expect(clientIdentitySpanAttributes({ headers: {} })).toEqual({});
  });
});
