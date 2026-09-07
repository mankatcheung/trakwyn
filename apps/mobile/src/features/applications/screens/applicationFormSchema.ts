import { z } from 'zod';
import i18n from '../../../i18n';

// Built fresh on every call (rather than a module-level constant) so the
// validation messages resolve against whichever language is active when the
// form is actually submitted, not whichever was active at import time.
export function getApplicationFormSchema() {
  return z.object({
    company: z.string().min(1, i18n.t('applications:form.validation.companyRequired')),
    role: z.string().min(1, i18n.t('applications:form.validation.roleRequired')),
    status: z.enum([
      'draft',
      'applied',
      'interviewing',
      'offered',
      'accepted',
      'rejected',
      'withdrawn',
    ]),
    jobUrl: z.union([
      z.string().url(i18n.t('applications:form.validation.invalidUrl')),
      z.literal(''),
    ]),
    location: z.string(),
    salaryRange: z.string(),
    description: z.string(),
  });
}

export type ApplicationFormValues = z.infer<ReturnType<typeof getApplicationFormSchema>>;

export const EMPTY_APPLICATION_FORM_VALUES: ApplicationFormValues = {
  company: '',
  role: '',
  status: 'draft',
  jobUrl: '',
  location: '',
  salaryRange: '',
  description: '',
};
