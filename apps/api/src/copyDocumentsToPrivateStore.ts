/**
 * One-off: moves documents from the public Blob store to the private one
 * (JEF-51). The logic and its guarantees are in
 * `infrastructure/storage/copyDocumentsToPrivateStore.ts`; the runbook is in
 * `infra/vercel/README.md`, "Moving documents to the private store".
 *
 *   pnpm blob:copy-documents                      # dry run: report only
 *   pnpm blob:copy-documents --apply              # copy, keep the public copies
 *   pnpm blob:copy-documents --apply --delete-public   # then remove the verified public copies
 *
 * Needs both tokens in the environment. Delete this file, its package.json
 * script and its `dependencyRule.test.ts` root entry once the rollout is done.
 */
import 'dotenv/config';
import { ENV } from '#src/infrastructure/config/constants.js';
import { copyDocumentsToPrivateStore } from '#src/infrastructure/storage/copyDocumentsToPrivateStore.js';
import { vercelBlobStoreClient } from '#src/infrastructure/storage/vercelBlobStoreClient.js';

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => !['--apply', '--delete-public'].includes(arg));
if (unknown.length > 0) {
  console.error(`unknown argument: ${unknown.join(' ')} (expected --apply, --delete-public)`);
  process.exit(2);
}
const apply = args.has('--apply');
const deleteFromSource = args.has('--delete-public');
if (deleteFromSource && !apply) {
  console.error('--delete-public needs --apply: a dry run deletes nothing');
  process.exit(2);
}

const publicToken = process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN];
const privateToken = process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN];
if (!publicToken || !privateToken) {
  console.error(
    `${ENV.BLOB_PUBLIC_READ_WRITE_TOKEN} and ${ENV.BLOB_PRIVATE_READ_WRITE_TOKEN} must both be set`,
  );
  process.exit(2);
}

console.log(`mode: ${apply ? 'apply' : 'dry run'}${deleteFromSource ? ' + delete public' : ''}`);

const report = await copyDocumentsToPrivateStore({
  source: vercelBlobStoreClient(publicToken, 'public'),
  target: vercelBlobStoreClient(privateToken, 'private'),
  deleteFromSource,
  dryRun: !apply,
  log: console.log,
});

const { failures, ...counts } = report;
console.log(JSON.stringify({ ...counts, failed: failures.length }, null, 2));
if (failures.length > 0) {
  console.error(`${failures.length} failure(s):`);
  for (const { pathname, reason } of failures) console.error(`  ${pathname}: ${reason}`);
  process.exit(1);
}
