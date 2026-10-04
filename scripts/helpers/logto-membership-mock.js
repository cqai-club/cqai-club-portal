/* eslint-disable @typescript-eslint/no-require-imports -- Isolated integration-test service */
const http = require('node:http');
const assert = require('node:assert/strict');

async function startMembershipMock(memberIds = ['ci-member', 'ci-editor']) {
  const members = new Set(memberIds);
  let available = true;
  const server = http.createServer(async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
    if (request.url === '/oidc/token') {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.authorization, `Basic ${Buffer.from('membership-smoke:membership-secret').toString('base64')}`);
      return send(200, { access_token: 'membership-token', expires_in: 3600 });
    }
    if (request.headers.authorization !== 'Bearer membership-token') return send(401, {});
    if (!available) return send(503, {});
    const match = /^\/api\/users\/([^/]+)\/organizations$/.exec(request.url);
    if (match && request.method === 'GET') return send(200, members.has(match[1]) ? [{ id: 'rar9vrcnuavh', name: '创新会员' }] : []);
    return send(404, {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    env: { LOGTO_ENDPOINT: `http://127.0.0.1:${server.address().port}`, LOGTO_M2M_CLIENT_ID: 'membership-smoke', LOGTO_M2M_CLIENT_SECRET: 'membership-secret' },
    members,
    setAvailable(value) { available = value; },
    close() { return new Promise(resolve => server.close(resolve)); },
  };
}
module.exports = { startMembershipMock };
