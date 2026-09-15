const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(projectRoot, '.github/workflows/deploy.yml'), 'utf8');
const remoteDeploy = fs.readFileSync(path.join(projectRoot, 'deploy/remote-deploy.sh'), 'utf8');
const nginxConfig = fs.readFileSync(path.join(projectRoot, 'deploy/nginx-club.conf'), 'utf8');
const dockerIgnore = fs.readFileSync(path.join(projectRoot, '.dockerignore'), 'utf8');
const resourceGate = path.join(projectRoot, 'deploy/check-resource-gates.sh');

assert.match(workflow, /packages: write/, 'deployment must be allowed to publish an image');
assert.match(workflow, /docker\/build-push-action@v6/, 'deployment must build the image on the CI runner');
assert.match(workflow, /push: true/, 'deployment must publish the tested image');
assert.doesNotMatch(workflow, /release\.tgz/, 'deployment must not upload a source archive');
assert.match(remoteDeploy, /docker pull "\$image_name"/, 'production must pull the immutable image');
assert.doesNotMatch(remoteDeploy, /docker build/, 'production must not build the image');
assert.match(remoteDeploy, /storage\/uploads\/projects/, 'deployment must provision persistent project cover storage');
assert.match(remoteDeploy, /Candidate database migration failed/, 'candidate database must migrate before smoke tests');
assert.match(remoteDeploy, /project_endpoints_are_healthy/, 'candidate and production checks must cover public project endpoints');
assert.match(remoteDeploy, /\$storage_directory:\/app\/storage:ro/, 'candidate must read existing project covers without mutating storage');
assert.equal(
  (remoteDeploy.match(/--env CQAI_STORAGE_ROOT=\/app\/storage/g) || []).length,
  2,
  'candidate and production containers must resolve uploads through the mounted storage path'
);
assert.match(nginxConfig, /client_max_body_size\s+6m;/, 'nginx must admit valid project covers up to the application limit');
assert.match(dockerIgnore, /^\.next$/m, 'Docker builds must exclude local Next.js artifacts');
assert.match(dockerIgnore, /^storage$/m, 'Docker builds must exclude local uploaded content');
assert.match(dockerIgnore, /^\*\.tsbuildinfo$/m, 'Docker builds must exclude local TypeScript caches');
assert.match(workflow, /project-cover-proxy-probe\.bin/, 'production verification must probe the public proxy upload limit');
assert.equal(
  (workflow.match(/bs=1048576 count=5/g) || []).length,
  2,
  'preflight and post-deploy probes must cover the full 5 MiB application limit'
);
assert.match(workflow, /cover_proxy_status[^]*'401'/, 'the proxy probe must reach the protected application route');
assert.ok(
  workflow.indexOf('Preflight public proxy upload capacity') < workflow.indexOf('Deploy with rollback protection'),
  'proxy upload capacity must be checked before cutover'
);
assert.equal(
  (remoteDeploy.match(/bash "\$resource_gate_script" "\$deploy_base"/g) || []).length,
  2,
  'resource gates must run before the image pull and before cutover'
);

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-deploy-safety-'));
const meminfoFile = path.join(tempDirectory, 'meminfo');
fs.writeFileSync(meminfoFile, 'MemAvailable: 2097152 kB\n', { mode: 0o600 });

const runGate = overrides => spawnSync('bash', [resourceGate, tempDirectory], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    CQAI_MEMINFO_FILE: meminfoFile,
    CQAI_MIN_DISK_AVAILABLE_KIB: '0',
    CQAI_MAX_DISK_USAGE_PERCENT: '101',
    CQAI_MAX_INODE_USAGE_PERCENT: '101',
    CQAI_MIN_MEMORY_AVAILABLE_KIB: '0',
    ...overrides
  }
});

const passingGate = runGate({});
assert.equal(passingGate.status, 0, `permissive resource gate should pass: ${passingGate.stderr}${passingGate.stdout}`);

const failingGate = runGate({ CQAI_MIN_MEMORY_AVAILABLE_KIB: '2097153' });
assert.equal(failingGate.status, 10, 'insufficient memory must stop deployment with exit code 10');
assert.match(failingGate.stdout, /available memory/, 'failed gate should explain the rejected resource');

fs.rmSync(tempDirectory, { recursive: true, force: true });
console.log('Deployment safety checks passed.');
