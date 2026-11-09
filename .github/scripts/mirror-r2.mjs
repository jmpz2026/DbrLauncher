// Copies the modpack to the Cloudflare R2 bucket served by the `dbr-assets` Worker
// (worker/ in this branch). The launcher downloads from there first, so a GitHub block on the
// player's IP (raw.githubusercontent 403/429) no longer breaks the sync.
//
// Runs after mirror-assets.mjs in mirror-assets.yml. Layout in the bucket:
//   f/<sha1>                         every file of the manifests, named by content (immutable)
//   p/<sha1old>-<sha1new>.dbrpatch    delta patches, copied from the `assets-files` release
//   m/<name>.json                     manifests, forge json and news; uploaded LAST, so an R2
//                                     manifest never points to a sha1 that is not uploaded yet
//   m/<name>.json.sig                 ECDSA P-256 / SHA-256 signature (DER, base64) of the exact
//                                     bytes above. The
//                                     launcher rejects an R2 meta file without a valid signature,
//                                     so a leaked R2 key cannot serve a fake manifest
//   state/orphans.json               first day each object stopped being referenced (not served)
//
// Orphans are deleted 7 days after they leave every manifest: a player in the middle of a sync
// with the old manifest still finds the file.
//
// Needs the aws CLI (preinstalled on ubuntu-latest), gh with GH_TOKEN, and the env vars
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE and
// MANIFEST_SIGN_KEY (ECDSA P-256 private key, PKCS#8 PEM). P-256 and not Ed25519 because
// Android only verifies Ed25519 from API 33 and the mobile launcher supports API 26.
// If any of them is missing it prints a warning and exits 0: the release mirror keeps working.
//
// Free-tier guard: the run aborts before writing anything if the bucket would pass 8 GB
// (free: 10 GB) or the run would need more than 5000 writes (free: 1M per month).

import { execFileSync } from 'child_process'
import { createHash, createPrivateKey, sign } from 'crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const TAG = 'assets-files'
const MANIFESTS = ['manifest.json', 'manifest-lite.json', 'manifest-experimental.json']
const META = [...MANIFESTS, 'forge-1.7.10.json', 'news.json']
const BRANCH_PREFIX = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/assets\//
const ORPHAN_GRACE_MS = 7 * 24 * 3600 * 1000
const IMMUTABLE = 'public, max-age=31536000, immutable'
const SHORT = 'public, max-age=60'
const MAX_BUCKET_BYTES = 8 * 1024 ** 3
const MAX_WRITES_PER_RUN = 5000

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE, MANIFEST_SIGN_KEY } =
  process.env
if (
  !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE || !MANIFEST_SIGN_KEY
) {
  console.log('::warning::R2 secrets missing, skipping the R2 mirror')
  process.exit(0)
}
const signKey = createPrivateKey(MANIFEST_SIGN_KEY)

const ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
const awsEnv = {
  ...process.env,
  AWS_ACCESS_KEY_ID: R2_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: R2_SECRET_ACCESS_KEY,
  AWS_DEFAULT_REGION: 'auto',
  // aws CLI >= 2.23 sends CRC checksums by default; R2 only needs them when required.
  AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
  AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required'
}
const aws = (...args) =>
  execFileSync('aws', [...args, '--endpoint-url', ENDPOINT], {
    encoding: 'utf-8',
    env: awsEnv,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit']
  })
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })

function put(key, file, cacheControl, contentType) {
  aws('s3api', 'put-object', '--bucket', R2_BUCKET, '--key', key, '--body', file,
    '--cache-control', cacheControl, '--content-type', contentType)
}

// 1) What the manifests want: sha1 -> path inside the branch.
const wanted = new Map()
for (const name of MANIFESTS) {
  if (!existsSync(name)) continue
  const m = JSON.parse(readFileSync(name, 'utf-8'))
  for (const f of [...(m.files ?? []), ...(m.androidFiles ?? [])]) {
    if (!f.sha1 || !BRANCH_PREFIX.test(f.url)) continue
    const rel = f.url.replace(BRANCH_PREFIX, '').split('/').map(decodeURIComponent).join('/')
    wanted.set(f.sha1.toLowerCase(), rel)
  }
}
console.log(`${wanted.size} distinct files in the manifests`)

// 2) What the bucket has: key -> LastModified.
const existing = new Map()
const listed = JSON.parse(
  aws('s3api', 'list-objects-v2', '--bucket', R2_BUCKET, '--output', 'json') || '{}'
)
let bucketBytes = 0
for (const o of listed.Contents ?? []) {
  existing.set(o.Key, o.LastModified)
  bucketBytes += o.Size ?? 0
}
console.log(`${existing.size} objects in the bucket, ${(bucketBytes / 1024 ** 2).toFixed(0)} MB`)

// Patches to mirror: same set as the release (mirror-assets.mjs already pruned it), only those
// whose target is still wanted.
const tmp = join(tmpdir(), 'mirror-r2')
mkdirSync(tmp, { recursive: true })
const releasePatches = gh('release', 'view', TAG, '--json', 'assets', '--jq', '.assets[].name')
  .split('\n')
  .filter((n) => {
    const m = /^[0-9a-f]{40}-([0-9a-f]{40})\.dbrpatch$/.exec(n)
    return m && wanted.has(m[1])
  })

// Free-tier guard, before any write.
let newBytes = 0
let writes = META.length * 2 + 1 // meta files + signatures + state
for (const [sha1, rel] of wanted) {
  if (existing.has(`f/${sha1}`) || !existsSync(rel)) continue
  newBytes += statSync(rel).size
  writes++
}
writes += releasePatches.filter((n) => !existing.has(`p/${n}`)).length
if (bucketBytes + newBytes > MAX_BUCKET_BYTES || writes > MAX_WRITES_PER_RUN) {
  console.log(
    `::error::free-tier guard: bucket would hold ${((bucketBytes + newBytes) / 1024 ** 3).toFixed(2)} GB ` +
      `(max ${MAX_BUCKET_BYTES / 1024 ** 3}) with ${writes} writes (max ${MAX_WRITES_PER_RUN}). Nothing uploaded.`
  )
  process.exit(1)
}

// 3) Files, verified against their sha1 before upload.
let uploaded = 0
for (const [sha1, rel] of wanted) {
  const key = `f/${sha1}`
  if (existing.has(key)) continue
  if (!existsSync(rel)) {
    console.log(`::warning::missing in the branch: ${rel}`)
    continue
  }
  const got = createHash('sha1').update(readFileSync(rel)).digest('hex')
  if (got !== sha1) {
    console.log(`::warning::sha1 does not match the manifest, not uploaded: ${rel}`)
    continue
  }
  put(key, rel, IMMUTABLE, 'application/octet-stream')
  console.log(`  uploaded ${key}  ${rel}`)
  uploaded++
}

// 4) Patches.
const wantedPatches = new Set(releasePatches.map((n) => `p/${n}`))
let patches = 0
for (const name of releasePatches) {
  const key = `p/${name}`
  if (existing.has(key)) continue
  gh('release', 'download', TAG, '-p', name, '-D', tmp, '--clobber')
  put(key, join(tmp, name), IMMUTABLE, 'application/octet-stream')
  console.log(`  uploaded ${key}`)
  patches++
}

// 5) Meta files LAST: from here on the R2 manifests point to uploaded files only.
for (const name of META) {
  if (!existsSync(name)) continue
  // Signature first. In the short gap a launcher may read new signature + old file: the check
  // fails and it falls back to raw for that one request.
  const sigFile = join(tmp, `${name}.sig`)
  writeFileSync(sigFile, sign('sha256', readFileSync(name), signKey).toString('base64'))
  put(`m/${name}.sig`, sigFile, SHORT, 'text/plain; charset=utf-8')
  put(`m/${name}`, name, SHORT, 'application/json; charset=utf-8')
}
console.log(`  uploaded m/ (${META.filter((n) => existsSync(n)).join(', ')})`)

// 6) Orphans with a 7-day grace period, tracked in state/orphans.json.
const STATE_KEY = 'state/orphans.json'
let orphans = {}
if (existing.has(STATE_KEY)) {
  const file = join(tmp, 'orphans.json')
  aws('s3api', 'get-object', '--bucket', R2_BUCKET, '--key', STATE_KEY, file)
  try {
    orphans = JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    orphans = {}
  }
}
const now = Date.now()
const nextOrphans = {}
let removed = 0
for (const key of existing.keys()) {
  const isFile = key.startsWith('f/') && !wanted.has(key.slice(2))
  const isPatch = key.startsWith('p/') && !wantedPatches.has(key)
  if (!isFile && !isPatch) continue
  const since = orphans[key] ?? new Date(now).toISOString()
  if (now - Date.parse(since) >= ORPHAN_GRACE_MS) {
    aws('s3api', 'delete-object', '--bucket', R2_BUCKET, '--key', key)
    console.log(`  deleted orphan ${key} (since ${since})`)
    removed++
  } else {
    nextOrphans[key] = since
  }
}
const stateFile = join(tmp, 'orphans-next.json')
writeFileSync(stateFile, JSON.stringify(nextOrphans, null, 2))
put(STATE_KEY, stateFile, 'no-store', 'application/json')

// 7) Public check through the Worker: one file and one manifest must answer 200.
const sample = [...wanted.keys()][0]
for (const path of [sample && `f/${sample}`, 'm/manifest.json', 'm/manifest.json.sig'].filter(Boolean)) {
  const url = `${R2_PUBLIC_BASE.replace(/\/$/, '')}/${path}`
  const res = await fetch(url, { method: 'HEAD' })
  if (res.status !== 200) {
    console.log(`::error::public check failed: ${url} -> ${res.status}`)
    process.exit(1)
  }
}

console.log(
  `Done: ${uploaded} files, ${patches} patches, ${removed} orphans deleted, ` +
    `${Object.keys(nextOrphans).length} orphans waiting, ${wanted.size} files total`
)
