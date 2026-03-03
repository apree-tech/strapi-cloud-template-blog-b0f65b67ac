const fs = require('fs');
const path = require('path');
const https = require('https');

const REMOTE_URL = 'https://renowned-connection-c3889a992a.strapiapp.com';
const REMOTE_EMAIL = 'a.randd@genspt.com';
const REMOTE_PASSWORD = 'HsnXTp3i36Wewab5';

const LOCAL_API = 'http://localhost:3005';
const LOCAL_EMAIL = 'admin@example.com';
const LOCAL_PASSWORD = '12345678aA';

const DATA_DIR = path.join(__dirname, '..', '.tmp', 'remote-data');

async function remoteAdminLogin() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: REMOTE_EMAIL, password: REMOTE_PASSWORD });
    const req = https.request(`${REMOTE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data?.token);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function remoteAdminFetch(urlPath, jwt) {
  return new Promise((resolve, reject) => {
    const url = `${REMOTE_URL}${urlPath}`;
    const req = https.get(url, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse failed: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
  });
}

async function localAdminLogin() {
  const res = await fetch(`${LOCAL_API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOCAL_EMAIL, password: LOCAL_PASSWORD }),
  });
  const data = await res.json();
  return data.data?.token;
}

async function localAdminFetch(urlPath, jwt, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${LOCAL_API}${urlPath}`, options);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  console.log('=== Sync Accounts with Password Hashes ===\n');

  // 1. Login remote
  console.log('1. Logging into remote admin...');
  const remoteJWT = await remoteAdminLogin();
  if (!remoteJWT) { console.error('Remote login failed'); process.exit(1); }
  console.log('   OK\n');

  // 2. Fetch accounts from Content Manager API
  console.log('2. Fetching accounts from remote Content Manager...');
  const accountsRes = await remoteAdminFetch(
    '/content-manager/collection-types/api::account.account?page=1&pageSize=100',
    remoteJWT
  );
  const remoteAccounts = accountsRes.results || [];
  console.log(`   Found ${remoteAccounts.length} accounts\n`);

  for (const a of remoteAccounts) {
    const hasHash = a.password && a.password.startsWith('$2');
    console.log(`   - ${a.name}: role=${a.role}, password=${hasHash ? 'HASH' : (a.password ? 'PLAIN' : 'MISSING')}, isAdmin=${a.isAdmin}`);
  }

  // Save
  fs.writeFileSync(path.join(DATA_DIR, 'accounts-with-hashes.json'), JSON.stringify(remoteAccounts, null, 2));
  console.log('\n   Saved to accounts-with-hashes.json\n');

  // 3. Login local
  console.log('3. Logging into local admin...');
  const localJWT = await localAdminLogin();
  if (!localJWT) { console.error('Local login failed'); process.exit(1); }
  console.log('   OK\n');

  // 4. Check existing local accounts
  const localRes = await localAdminFetch(
    '/content-manager/collection-types/api::account.account?page=1&pageSize=100',
    localJWT
  );
  const localAccounts = localRes.results || [];
  const localByName = {};
  for (const a of localAccounts) localByName[a.name] = a;
  console.log(`   Local accounts: ${localAccounts.length}\n`);

  // 5. Create/update accounts
  console.log('4. Creating/updating accounts...');
  const accountMap = {};

  for (const ra of remoteAccounts) {
    const existing = localByName[ra.name];
    if (existing) {
      console.log(`   "${ra.name}" exists (${existing.documentId})`);
      accountMap[ra.documentId] = existing.documentId;

      // Update with hash
      if (ra.password) {
        const upd = await localAdminFetch(
          `/content-manager/collection-types/api::account.account/${existing.documentId}`,
          localJWT, 'PUT',
          { name: ra.name, role: ra.role, password: ra.password, isAdmin: ra.isAdmin }
        );
        console.log(`     -> Updated`);
      }
    } else {
      const payload = {
        name: ra.name,
        role: ra.role || 'user',
        password: ra.password || `temp_${Date.now()}`,
        isAdmin: ra.isAdmin || false,
      };
      const createRes = await localAdminFetch(
        '/content-manager/collection-types/api::account.account',
        localJWT, 'POST', payload
      );
      const created = createRes.data || createRes;
      if (created.documentId) {
        console.log(`   Created "${ra.name}" (${created.documentId})`);
        accountMap[ra.documentId] = created.documentId;
      } else {
        console.log(`   Failed "${ra.name}": ${JSON.stringify(createRes).substring(0, 300)}`);
      }
    }
  }

  console.log(`\n   Account mapping: ${Object.keys(accountMap).length}\n`);

  // 6. Link reports to accounts
  console.log('5. Linking reports to accounts...');
  const reports = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'reports.json'), 'utf-8'));

  // Get local reports
  let allLocal = [];
  let page = 1;
  while (true) {
    const res = await localAdminFetch(
      `/content-manager/collection-types/api::report.report?page=${page}&pageSize=100&populate=accounts`,
      localJWT
    );
    allLocal.push(...(res.results || []));
    if (!res.pagination || page >= res.pagination.pageCount) break;
    page++;
  }

  const localByUuid = {};
  for (const r of allLocal) if (r.uuid) localByUuid[r.uuid] = r;

  let linked = 0;
  for (const report of reports) {
    const local = localByUuid[report.uuid];
    if (!local) continue;
    if (!report.accounts?.length) continue;
    if (local.accounts?.length > 0) continue;

    const connects = report.accounts
      .filter(a => accountMap[a.documentId])
      .map(a => ({ documentId: accountMap[a.documentId] }));

    if (connects.length === 0) continue;

    await localAdminFetch(
      `/content-manager/collection-types/api::report.report/${local.documentId}`,
      localJWT, 'PUT',
      { accounts: { connect: connects } }
    );
    linked++;
  }

  console.log(`   Linked ${linked} reports to accounts`);
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
