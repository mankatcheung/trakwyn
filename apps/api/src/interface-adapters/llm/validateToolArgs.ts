import { ValidationError } from '#src/use-cases/errors/DomainError.js';

interface PropertySchema {
  type?: string;
  enum?: readonly string[];
  description?: string;
}

interface ObjectSchema {
  properties?: Readonly<Record<string, PropertySchema>>;
  required?: readonly string[];
}

/**
 * Checks model-supplied tool arguments against the tool's own JSON Schema and
 * returns only the declared properties (JEF-469). What is returned is what
 * gets saved in a proposal, so an invented extra field never reaches the
 * handler at confirm time.
 *
 * Deliberately small: the catalogue uses `string`, `number`, `enum` and
 * `required`, and a value that passes here is still narrowed again by the
 * handler.
 */
export function validateToolArgs(
  schema: ObjectSchema,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const out: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(properties)) {
    const value = args[key];
    if (value === undefined || value === null) continue;
    if (spec.type === 'string') {
      if (typeof value !== 'string') throw new ValidationError(`${key} must be a string`);
      if (spec.enum && !spec.enum.includes(value)) {
        throw new ValidationError(`${key} must be one of: ${spec.enum.join(', ')}`);
      }
      if (spec.description?.includes('ISO 8601') && Number.isNaN(new Date(value).getTime())) {
        throw new ValidationError(`${key} must be an ISO 8601 date`);
      }
    } else if (spec.type === 'number') {
      const n = typeof value === 'number' ? value : Number(value);
      if (typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) {
        throw new ValidationError(`${key} must be a number`);
      }
      if (!Number.isFinite(n)) throw new ValidationError(`${key} must be a number`);
    }
    out[key] = value;
  }

  for (const key of schema.required ?? []) {
    const value = out[key];
    if (value === undefined || value === '') throw new ValidationError(`${key} is required`);
  }
  return out;
}
