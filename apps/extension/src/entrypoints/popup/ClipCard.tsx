import { useState } from 'react';
import type { JobData } from '../../lib/parsers/types';

interface ClipCardProps {
  jobData: JobData;
  /** The AI supplied part of this clip, so it is a suggestion the user confirms. */
  aiSuggested: boolean;
  /** Offer "Re-read with AI": the built-in parser left out a field a clip needs. */
  canReread: boolean;
  rereading: boolean;
  onReread: () => void;
  onSave: (jobData: JobData) => void;
}

/** The clip, read-only as parsed, or editable when the AI filled it in (JEF-420). */
export function ClipCard({
  jobData,
  aiSuggested,
  canReread,
  rereading,
  onReread,
  onSave,
}: ClipCardProps) {
  const [draft, setDraft] = useState(jobData);
  const clip = aiSuggested ? draft : jobData;
  const canSave = clip.company.trim() !== '' && clip.role.trim() !== '';
  const edit =
    (field: 'company' | 'role' | 'location') => (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft({ ...draft, [field]: e.target.value });

  return (
    <div className="job-card">
      <div className="job-source">{jobData.source ?? 'Job posting'}</div>
      {aiSuggested ? (
        <>
          <p className="muted">Read by AI. Check these before you save.</p>
          <div className="field">
            <label htmlFor="clip-role">Role</label>
            <input id="clip-role" value={draft.role} onChange={edit('role')} />
          </div>
          <div className="field">
            <label htmlFor="clip-company">Company</label>
            <input id="clip-company" value={draft.company} onChange={edit('company')} />
          </div>
          <div className="field">
            <label htmlFor="clip-location">Location</label>
            <input id="clip-location" value={draft.location ?? ''} onChange={edit('location')} />
          </div>
        </>
      ) : (
        <>
          <h2 className="job-role">{jobData.role}</h2>
          <p className="job-company">{jobData.company}</p>
          {jobData.location && <p className="job-location">📍 {jobData.location}</p>}
        </>
      )}
      {clip.description && <p className="job-description">{clip.description.slice(0, 200)}…</p>}
      <button
        onClick={() => onSave(clip)}
        disabled={!canSave || rereading}
        className="btn btn-primary btn-full"
      >
        Save as Application
      </button>
      {canReread && (
        <button onClick={onReread} disabled={rereading} className="btn btn-ghost btn-full">
          {rereading ? 'Reading…' : 'Re-read with AI'}
        </button>
      )}
    </div>
  );
}
