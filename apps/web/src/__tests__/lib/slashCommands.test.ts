import { describe, it, expect } from 'vitest';
import en from '#/i18n/en.json';
import { SLASH_COMMANDS, filterSlashCommands } from '#/lib/editor/slashCommands';

const labelOf = (item: { labelKey: string }) => (en as Record<string, string>)[item.labelKey];
const ids = (query: string) => filterSlashCommands(SLASH_COMMANDS, query, labelOf).map((i) => i.id);

describe('slash commands (JEF-575)', () => {
  it('lists the blocks the ticket asks for, in order, with unique ids', () => {
    expect(SLASH_COMMANDS.map((c) => c.id)).toEqual([
      'heading1',
      'heading2',
      'heading3',
      'bulletList',
      'orderedList',
      'blockquote',
      'rule',
      'table',
    ]);
    expect(new Set(SLASH_COMMANDS.map((c) => c.id)).size).toBe(SLASH_COMMANDS.length);
  });

  it('has an English label for every command', () => {
    for (const item of SLASH_COMMANDS) expect(labelOf(item), item.id).toBeTruthy();
  });

  it('returns everything for an empty or blank query', () => {
    expect(ids('')).toHaveLength(SLASH_COMMANDS.length);
    expect(ids('   ')).toHaveLength(SLASH_COMMANDS.length);
  });

  it('matches the label, ignoring case', () => {
    expect(ids('QUO')).toEqual(['blockquote']);
    expect(ids('numbered')).toEqual(['orderedList']);
  });

  it('matches keywords and ids', () => {
    expect(ids('h2')).toEqual(['heading2']);
    expect(ids('hr')).toEqual(['rule']);
    expect(ids('ul')).toEqual(['bulletList']);
  });

  it('keeps list order when several match', () => {
    expect(ids('heading')).toEqual(['heading1', 'heading2', 'heading3']);
    expect(ids('list')).toEqual(['bulletList', 'orderedList']);
  });

  it('returns nothing for a query that matches no command', () => {
    expect(ids('zzz')).toEqual([]);
  });

  it('matches the label the reader sees, not only the English one', () => {
    const zh = (item: { id: string }) => (item.id === 'rule' ? '分隔線' : item.id);
    expect(filterSlashCommands(SLASH_COMMANDS, '分隔', zh).map((i) => i.id)).toEqual(['rule']);
  });
});
