import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({ t: (key: string) => `t:${key}` }),
}));

import { ThemedScreenshot } from '#/components/marketing/ThemedScreenshot';
import { getScreenshot } from '#/lib/screenshots';

describe('ThemedScreenshot', () => {
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
});
