import { graphql } from '#/graphql/generated';

/** The one document the app shell owns: the avatar shown on the Settings entry. */
export const AVATAR_QUERY = graphql(`
  query AccountAvatar {
    me {
      avatarUrl
    }
  }
`);
