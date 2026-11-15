import { builder } from '#src/http/schema/builder.js';

export const ParsedJobDescriptionRef = builder.objectRef<{
  company: string | null;
  role: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  postingText: string | null;
}>('ParsedJobDescription');

ParsedJobDescriptionRef.implement({
  fields: (t) => ({
    company: t.exposeString('company', { nullable: true }),
    role: t.exposeString('role', { nullable: true }),
    location: t.exposeString('location', { nullable: true }),
    salary: t.exposeString('salary', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    postingText: t.exposeString('postingText', {
      nullable: true,
      description: "The posting as written, for the application's postingText field.",
    }),
  }),
});
