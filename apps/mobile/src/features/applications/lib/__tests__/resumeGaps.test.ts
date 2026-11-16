import { appendToDescription, roleGapKey } from '../resumeGaps';

describe('resumeGaps helpers', () => {
  it('keys a role gap the way the API stores it', () => {
    expect(roleGapKey('w1')).toBe('role:w1');
  });

  it('starts a description with the bullet', () => {
    expect(appendToDescription(null, 'Cut load time by 30%')).toBe('- Cut load time by 30%');
  });

  it('adds the bullet on its own line after what is there', () => {
    expect(appendToDescription('- Built the API  \n', 'Led a team of 5')).toBe(
      '- Built the API\n- Led a team of 5',
    );
  });

  it('does not double a bullet marker the user typed', () => {
    expect(appendToDescription(null, '• Saved $10k')).toBe('- Saved $10k');
    expect(appendToDescription(null, '* Saved $10k')).toBe('- Saved $10k');
  });
});
