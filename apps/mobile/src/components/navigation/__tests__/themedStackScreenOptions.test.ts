import { themedStackScreenOptions } from '../themedStackScreenOptions';
import { darkColors, lightColors } from '../../../theme/colors';

describe('themedStackScreenOptions', () => {
  it('maps the header background and tint to the light theme', () => {
    expect(themedStackScreenOptions(lightColors)).toEqual({
      headerStyle: { backgroundColor: lightColors.surface },
      headerTintColor: lightColors.text,
    });
  });

  it('maps the header background and tint to the dark theme', () => {
    expect(themedStackScreenOptions(darkColors)).toEqual({
      headerStyle: { backgroundColor: darkColors.surface },
      headerTintColor: darkColors.text,
    });
  });
});
