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
assert.equal((remoteDeploy.match(/url_redirects_to[^\n]*\/apply\//g) || []).length, 2, 'candidate and production must check the authenticated application redirect');
assert.equal((remoteDeploy.match(/url_redirects_to[^\n]*\/collect\//g) || []).length, 2, 'candidate and production must check the authenticated project redirect');
assert.doesNotMatch(remoteDeploy, /url_contains[^\n]*\/apply\//, 'removed public application HTML must not block deployment');
assert.match(workflow, /secrets\.LOGTO_M2M_CLIENT_SECRET/, 'production must consume GitHub management credentials');
assert.match(remoteDeploy, /project_endpoints_are_healthy/, 'candidate and production checks must cover public project endpoints');
assert.match(remoteDeploy, /\$storage_directory:\/app\/storage:ro/, 'candidate must read existing project covers without mutating storage');
assert.equal(
  (remoteDeploy.match(/--env CQAI_STORAGE_ROOT=\/app\/storage/g) || []).length,
  2,
  'candidate and production containers must resolve uploads through the mounted storage path'
);
assert.match(nginxConfig, /client_max_body_size\s+6m;/, 'nginx must admit valid project covers up to the application limit');
assert.equal(
  nginxConfig.split('location ~ ^/api/v1/activities/[^/]+/recap/?$').length - 1,
  2,
  'HTTPS and loopback proxy blocks must give recap uploads their own limit'
);
assert.equal(
  (nginxConfig.match(/client_max_body_size\s+31m;/g) || []).length,
  2,
  'recap proxy blocks must admit six 5 MiB images plus multipart framing'
);
assert.match(dockerIgnore, /^\.next$/m, 'Docker builds must exclude local Next.js artifacts');
assert.match(dockerIgnore, /^storage$/m, 'Docker builds must exclude local uploaded content');
assert.match(dockerIgnore, /^\*\.tsbuildinfo$/m, 'Docker builds must exclude local TypeScript caches');
assert.match(workflow, /project-cover-proxy-probe\.bin/, 'production verification must probe the public proxy upload limit');
assert.match(workflow, /deploy\/check-mcp-endpoints\.py[^]*incoming\/check-mcp-endpoints-\$DEPLOY_SHA\.py/, 'deployment must upload the MCP verifier');
assert.match(workflow, /remote-deploy-\$DEPLOY_SHA\.sh[^\n]*check-mcp-endpoints-\$DEPLOY_SHA\.py/, 'remote deployment must receive the uploaded MCP verifier');
assert.match(workflow, /--export-expectations[^]*--expected-file "\$RUNNER_TEMP\/mcp-public-expectations\.json"/, 'the public verifier must compare discovery against runtime public configuration');
assert.match(workflow, /python3 deploy\/check-mcp-endpoints\.py https:\/\/cqaiclub\.asia/, 'Actions must exercise the public MCP endpoint with the shared verifier');
assert.equal((remoteDeploy.match(/python3 "\$mcp_gate_script"[^\n]*--env-file "\$environment_file"/g) || []).length, 2, 'candidate and production must verify MCP discovery and anonymous authentication');
assert.ok(remoteDeploy.indexOf('Candidate MCP verification failed') < remoteDeploy.indexOf('cutover_started=true'), 'MCP candidate checks must precede cutover');
assert.ok(remoteDeploy.indexOf('Production MCP verification failed') < remoteDeploy.indexOf('cutover_started=false\ntrap - EXIT'), 'production MCP checks must remain within rollback protection');
assert.match(remoteDeploy, /for required_file in[^\n]*"\$mcp_gate_script"/, 'missing verifier must stop deployment before changing the current release');
assert.equal(
  (workflow.match(/bs=1048576 count=5/g) || []).length,
  2,
  'preflight and post-deploy probes must cover the full 5 MiB application limit'
);
assert.equal(
  (workflow.match(/--form "cover=/g) || []).length,
  2,
  'preflight and post-deploy cover probes must use the multipart cover field'
);
assert.equal(
  (workflow.match(/--form "images=/g) || []).length,
  2,
  'recap proxy probes must use the multipart image field'
);
assert.equal(
  (workflow.match(/--request PUT/g) || []).length,
  4,
  'all cover and recap proxy probes must use the implemented PUT methods'
);
assert.match(workflow, /cover_proxy_status[^]*'401'/, 'the proxy probe must reach the protected application route');
assert.equal(
  (workflow.match(/bs=1048576 count=7/g) || []).length,
  2,
  'preflight and post-deploy probes must exceed the old 6 MiB recap proxy limit'
);
assert.equal(
  (workflow.match(/--header 'Origin: https:\/\/cqaiclub\.asia'/g) || []).length,
  2,
  'recap probes must include the same-origin header expected by the write route'
);
assert.match(workflow, /recap_proxy_status[^]*'401'/, 'the recap proxy probe must reach the protected application route');
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
const legacyDeployBase = path.join(tempDirectory, 'old-call-deploy-base');
const probeSha = 'a'.repeat(40);
const oldDeployCall = spawnSync('bash', [path.join(projectRoot, 'deploy/remote-deploy.sh'), probeSha, `ghcr.io/cqai-club/portal:${probeSha}`, 'test-user', resourceGate], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: { ...process.env, CQAI_DEPLOY_BASE: legacyDeployBase }
});
assert.equal(oldDeployCall.status, 4, 'an old four-argument call must fail before running deployment commands');
assert.match(oldDeployCall.stdout, /MCP verifier path is required/, 'old callers must receive an actionable migration error');
assert.equal(fs.existsSync(legacyDeployBase), false, 'old callers must not create deployment directories or change the current release');
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
const managementSyncTest = spawnSync('python3', ['-c', String.raw`
import io, json, pathlib, runpy, sys, tempfile, urllib.error
from unittest.mock import patch
module = runpy.run_path('deploy/sync-management-env.py')
payload = {'LOGTO_M2M_CLIENT_ID':'test-client','LOGTO_M2M_CLIENT_SECRET':'test-secret'}
with tempfile.TemporaryDirectory() as root:
    env = pathlib.Path(root)/'app.env'
    backup = pathlib.Path(root)/'backup.env'
    original = '# keep comments\nLOGTO_ENDPOINT=https://auth.example\nOTHER_CONFIG=preserved\nLOGTO_M2M_CLIENT_ID=old-id\nLOGTO_M2M_CLIENT_SECRET=old-secret\n'
    env.write_text(original)
    env.chmod(0o660)
    sys.argv = ['sync', str(env), str(backup)]
    sys.stdin = io.StringIO(json.dumps(payload))
    def response(request, timeout):
        if request.full_url.endswith('/oidc/token'):
            assert request.headers['Authorization'].startswith('Basic ')
            return io.BytesIO(b'{"access_token":"mock-token"}')
        assert request.headers['Authorization'] == 'Bearer mock-token'
        return io.BytesIO(b'{"id":"rar9vrcnuavh"}')
    with patch('urllib.request.urlopen', side_effect=response): module['main']()
    assert backup.read_text() == original
    assert backup.stat().st_mode & 0o777 == 0o600
    assert env.stat().st_mode & 0o777 == 0o660
    assert 'OTHER_CONFIG=preserved' in env.read_text()
    assert env.read_text().count('LOGTO_M2M_CLIENT_SECRET=') == 1
    assert 'LOGTO_M2M_CLIENT_SECRET=test-secret' in env.read_text()
    current = env.read_text()
    sys.stdin = io.StringIO(json.dumps(payload))
    with patch('urllib.request.urlopen', side_effect=urllib.error.HTTPError('https://auth.example',401,'rejected',{},None)):
        try: module['main']()
        except urllib.error.HTTPError: pass
        else: raise AssertionError('invalid credentials must fail')
    assert env.read_text() == current
    sys.stdin = io.StringIO(json.dumps({**payload, 'LOGTO_M2M_CLIENT_SECRET':'bad\ninjection=1'}))
    try: module['main']()
    except ValueError: pass
    else: raise AssertionError('credential injection must fail')
    assert env.read_text() == current
`], { cwd: projectRoot, encoding: 'utf8' });
assert.equal(managementSyncTest.status, 0, `management env synchronization should preserve configuration and reject unsafe credentials: ${managementSyncTest.stderr}`);
const mcpDeploymentTest = spawnSync('python3', ['scripts/mcp-deployment-test.py'], { cwd: projectRoot, encoding: 'utf8' });
assert.equal(mcpDeploymentTest.status, 0, `MCP endpoint gate must pass valid HTTP and reject invalid metadata/authentication: ${mcpDeploymentTest.stderr}${mcpDeploymentTest.stdout}`);
console.log('Deployment safety checks passed.');
