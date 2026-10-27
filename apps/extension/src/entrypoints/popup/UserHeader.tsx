import { useState } from 'react';
import type { CurrentUser } from '../../lib/api';
import { displayName, hasDistinctName, initials } from '../../lib/user';

interface Props {
  /** Null until the API answers, when no user was cached this session (JEF-457). */
  user: CurrentUser | null;
  onSignOut: () => void;
}

export function UserHeader({ user, onSignOut }: Props) {
  if (!user) {
    return (
      <div className="header-row" aria-busy="true" aria-label="Loading your account">
        <span className="user-avatar skeleton" aria-hidden="true" />
        <div className="user-info" aria-hidden="true">
          <span className="skeleton skeleton-text" />
        </div>
        <button onClick={onSignOut} className="btn-text logout">
          Sign out
        </button>
      </div>
    );
  }
  return <SignedInHeader user={user} onSignOut={onSignOut} />;
}

function SignedInHeader({ user, onSignOut }: Props & { user: CurrentUser }) {
  // The avatar is a signed URL that can expire while the popup is open, so
  // fall back to initials rather than showing a broken image.
  const [avatarFailed, setAvatarFailed] = useState(false);
  const name = displayName(user);

  return (
    <div className="header-row">
      {user.avatarUrl && !avatarFailed ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="user-avatar"
          onError={() => setAvatarFailed(true)}
        />
      ) : (
        <span className="user-avatar user-initials" aria-hidden="true">
          {initials(user)}
        </span>
      )}
      <div className="user-info">
        <span className="user-name" title={name}>
          {name}
        </span>
        {hasDistinctName(user) && (
          <span className="user-email" title={user.email}>
            {user.email}
          </span>
        )}
      </div>
      <button onClick={onSignOut} className="btn-text logout">
        Sign out
      </button>
    </div>
  );
}
