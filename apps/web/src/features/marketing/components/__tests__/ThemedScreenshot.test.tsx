import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({ t: (key: string) => `t:${key}` }),
}));

import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';
import {
  getPhoneScreenshot,
  getScreenshot,
  PHONE_MEDIA_QUERY,
  SCREENSHOT_SCALE,
} from '#/features/marketing/lib/screenshots';

describe('ThemedScreenshot', () => {
  it('keeps both images lazy and at high priority when priority is set', () => {
    render(<ThemedScreenshot name="board" priority />);

    const [light, dark] = screen.getAllByAltText('t:screenshots.board.alt');
    // A hidden eager image is still fetched, so neither is eager; the page's
    // head preloads the visible variant (heroPreloadLinks).
    expect(light).toHaveAttribute('loading', 'lazy');
    expect(dark).toHaveAttribute('loading', 'lazy');
    expect(light).toHaveAttribute('fetchpriority', 'high');
    expect(dark).toHaveAttribute('fetchpriority', 'high');
  });

  it('renders the light and dark image with manifest size and alt text', () => {
    render(<ThemedScreenshot name="board" />);

    const images = screen.getAllByAltText('t:screenshots.board.alt');
    expect(images).toHaveLength(2);
    const [light, dark] = images;
    const lightShot = getScreenshot('board', 'light');
    const darkShot = getScreenshot('board', 'dark');
    expect(light).toHaveAttribute('src', lightShot.src);
    expect(light).toHaveAttribute('width', String(lightShot.width));
    expect(light).toHaveAttribute('height', String(lightShot.height));
    expect(dark).toHaveAttribute('src', darkShot.src);
    expect(dark).toHaveAttribute('width', String(darkShot.width));
    expect(dark).toHaveAttribute('height', String(darkShot.height));
  });

  it('hides each image in the other theme with the dark class and loads lazily', () => {
    render(<ThemedScreenshot name="analytics" />);

    const [light, dark] = screen.getAllByAltText('t:screenshots.analytics.alt');
    expect(light).toHaveClass('dark:hidden');
    expect(dark).toHaveClass('hidden', 'dark:block');
    expect(light).toHaveAttribute('loading', 'lazy');
    expect(dark).toHaveAttribute('loading', 'lazy');
  });

  it('frames a full-screen phone capture as a narrow device below sm', () => {
    render(<ThemedScreenshot name="board" />);
    for (const img of screen.getAllByAltText('t:screenshots.board.alt')) {
      expect(img).toHaveClass('w-72', 'rounded-4xl', 'border-8', 'sm:w-full', 'sm:rounded-2xl');
    }
  });

  it('keeps the plain full-width frame on a crop, with or without a phone variant', () => {
    render(
      <>
        <ThemedScreenshot name="crop-cover-letter" />
        <ThemedScreenshot name="crop-chat-history" />
      </>,
    );
    for (const key of ['coverLetter', 'cropChatHistory']) {
      const [light] = screen.getAllByAltText(`t:screenshots.${key}.alt`);
      expect(light).toHaveClass('w-full', 'rounded-2xl', 'border');
      expect(light).not.toHaveClass('w-72', 'border-8');
    }
  });

  it('never stretches a small crop past its own CSS size (JEF-674)', () => {
    render(<ThemedScreenshot name="crop-chat-history" />);

    const [light] = screen.getAllByAltText('t:screenshots.cropChatHistory.alt');
    const shot = getScreenshot('crop-chat-history', 'light');
    expect(light).toHaveStyle({ maxWidth: `${shot.width / SCREENSHOT_SCALE}px` });
    expect(light).toHaveAttribute('width', String(shot.width));
  });

  describe('phone variants (JEF-684)', () => {
    it('offers the phone capture below sm, with its own size so nothing shifts', () => {
      const { container } = render(<ThemedScreenshot name="board" />);

      const sources = container.querySelectorAll('source');
      expect(sources).toHaveLength(2);
      (['light', 'dark'] as const).forEach((theme, i) => {
        const phone = getPhoneScreenshot('board', theme)!;
        expect(sources[i]).toHaveAttribute('media', PHONE_MEDIA_QUERY);
        expect(sources[i]).toHaveAttribute('srcset', phone.src);
        expect(sources[i]).toHaveAttribute('width', String(phone.width));
        expect(sources[i]).toHaveAttribute('height', String(phone.height));
      });
    });

    it('keeps the desktop image as the img the source falls back to', () => {
      render(<ThemedScreenshot name="board" />);

      const [light] = screen.getAllByAltText('t:screenshots.board.alt');
      expect(light).toHaveAttribute('src', getScreenshot('board', 'light').src);
    });

    it('adds no source to a screenshot without a phone variant', () => {
      const { container } = render(<ThemedScreenshot name="crop-board-header" />);

      expect(container.querySelectorAll('source')).toHaveLength(0);
    });
  });
});
