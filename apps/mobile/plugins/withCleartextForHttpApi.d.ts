import type { ConfigPlugin } from 'expo/config-plugins';

declare const withCleartextForHttpApi: ConfigPlugin & {
  /** True when the API URL the build was given cannot be reached over TLS. */
  apiUrlNeedsCleartext(apiUrl: unknown): boolean;
};

export = withCleartextForHttpApi;
