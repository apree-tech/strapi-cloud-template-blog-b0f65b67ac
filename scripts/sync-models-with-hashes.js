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

// ---- Helpers ----

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
        } catch (e) {
          reject(new Error('Failed to parse login response'));
        }
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
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse: ${data.substring(0, 200)}`));
        }
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
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${LOCAL_API}${urlPath}`, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---- Main ----

async function main() {
  console.log('=== Sync Models with Password Hashes ===\n');

  // 1. Login to remote admin
  console.log('1. Logging into remote admin...');
  const remoteJWT = await remoteAdminLogin();
  if (!remoteJWT) {
    console.error('Failed to login to remote admin');
    process.exit(1);
  }
  console.log('   Remote admin JWT obtained\n');

  // 2. Fetch models via Content Manager API (includes private fields)
  console.log('2. Fetching models from remote Content Manager API...');
  const modelsPage1 = await remoteAdminFetch(
    '/content-manager/collection-types/api::model.model?page=1&pageSize=100',
    remoteJWT
  );

  const remoteModels = modelsPage1.results || [];
  console.log(`   Found ${remoteModels.length} models\n`);

  // Print what we got
  for (const m of remoteModels) {
    const hasHash = m.password && m.password.startsWith('$2');
    console.log(`   - ${m.name}: password=${hasHash ? 'HASH_FOUND' : (m.password ? 'PLAIN' : 'MISSING')}, telegram=${m.telegram || 'none'}`);
  }

  // Save models with hashes
  fs.writeFileSync(
    path.join(DATA_DIR, 'models-with-hashes.json'),
    JSON.stringify(remoteModels, null, 2)
  );
  console.log('\n   Saved to models-with-hashes.json\n');

  // 3. Login to local admin
  console.log('3. Logging into local admin...');
  const localJWT = await localAdminLogin();
  if (!localJWT) {
    console.error('Failed to login to local admin');
    process.exit(1);
  }
  console.log('   Local admin JWT obtained\n');

  // 4. Get existing local models
  console.log('4. Checking existing local models...');
  const localModelsRes = await localAdminFetch(
    '/content-manager/collection-types/api::model.model?page=1&pageSize=100',
    localJWT
  );
  const localModels = localModelsRes.results || [];
  console.log(`   Found ${localModels.length} local models\n`);

  const localModelsByName = {};
  for (const m of localModels) {
    localModelsByName[m.name] = m;
  }

  // 5. Create/update models with password hashes
  console.log('5. Creating/updating models...');
  const modelMap = {}; // remoteDocId -> localDocId

  for (const rm of remoteModels) {
    const existing = localModelsByName[rm.name];

    if (existing) {
      console.log(`   "${rm.name}" already exists locally (${existing.documentId})`);
      modelMap[rm.documentId] = existing.documentId;

      // Update password hash if we have one
      if (rm.password) {
        const updateRes = await localAdminFetch(
          `/content-manager/collection-types/api::model.model/${existing.documentId}`,
          localJWT,
          'PUT',
          {
            name: rm.name,
            password: rm.password,
            telegram: rm.telegram || null,
          }
        );
        const updated = updateRes.data || updateRes;
        if (updated.documentId || updated.id) {
          console.log(`     -> Updated password hash`);
        } else {
          console.log(`     -> Update failed: ${JSON.stringify(updateRes).substring(0, 200)}`);
        }
      }
    } else {
      // Create new model
      const payload = {
        name: rm.name,
        password: rm.password || `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        telegram: rm.telegram || null,
      };

      const createRes = await localAdminFetch(
        '/content-manager/collection-types/api::model.model',
        localJWT,
        'POST',
        payload
      );

      const created = createRes.data || createRes;
      if (created.documentId) {
        console.log(`   Created "${rm.name}" (${created.documentId})`);
        modelMap[rm.documentId] = created.documentId;
      } else {
        console.log(`   Failed to create "${rm.name}": ${JSON.stringify(createRes).substring(0, 300)}`);
      }
    }
  }

  console.log(`\n   Model mapping: ${Object.keys(modelMap).length} mapped\n`);

  // 6. Check/create accounts
  console.log('6. Syncing accounts...');
  const accounts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'accounts.json'), 'utf-8'));

  const localAccountsRes = await localAdminFetch(
    '/content-manager/collection-types/api::account.account?page=1&pageSize=100',
    localJWT
  );
  const localAccounts = localAccountsRes.results || [];
  const localAccountsByName = {};
  for (const a of localAccounts) {
    localAccountsByName[a.name] = a;
  }

  const accountMap = {}; // remoteDocId -> localDocId

  for (const ra of accounts) {
    const existing = localAccountsByName[ra.name];
    if (existing) {
      console.log(`   Account "${ra.name}" already exists (${existing.documentId})`);
      accountMap[ra.documentId] = existing.documentId;
    } else {
      const createRes = await localAdminFetch(
        '/content-manager/collection-types/api::account.account',
        localJWT,
        'POST',
        { name: ra.name }
      );
      const created = createRes.data || createRes;
      if (created.documentId) {
        console.log(`   Created account "${ra.name}" (${created.documentId})`);
        accountMap[ra.documentId] = created.documentId;
      } else {
        console.log(`   Failed: ${JSON.stringify(createRes).substring(0, 200)}`);
      }
    }
  }

  console.log(`\n   Account mapping: ${Object.keys(accountMap).length} mapped\n`);

  // 7. Update reports with correct model/account relations
  console.log('7. Linking reports to models and accounts...');
  const reports = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'reports.json'), 'utf-8'));

  // Get all local reports
  let allLocalReports = [];
  let page = 1;
  while (true) {
    const res = await localAdminFetch(
      `/content-manager/collection-types/api::report.report?page=${page}&pageSize=100&populate=model,accounts`,
      localJWT
    );
    const results = res.results || [];
    allLocalReports.push(...results);
    if (!res.pagination || page >= res.pagination.pageCount) break;
    page++;
  }
  console.log(`   Found ${allLocalReports.length} local reports\n`);

  // Build UUID -> localDocId map
  const localReportsByUuid = {};
  for (const r of allLocalReports) {
    if (r.uuid) {
      localReportsByUuid[r.uuid] = r;
    }
  }

  let linked = 0;
  let skipped = 0;
  let failed = 0;

  for (const report of reports) {
    const localReport = localReportsByUuid[report.uuid];
    if (!localReport) {
      skipped++;
      continue;
    }

    // Check if needs linking
    const needsModel = report.model?.documentId && modelMap[report.model.documentId] && !localReport.model;
    const needsAccounts = report.accounts?.length > 0 && (!localReport.accounts || localReport.accounts.length === 0);

    if (!needsModel && !needsAccounts) {
      skipped++;
      continue;
    }

    const payload = {};
    if (needsModel) {
      payload.model = { connect: [{ documentId: modelMap[report.model.documentId] }] };
    }
    if (needsAccounts) {
      const connects = report.accounts
        .filter(a => accountMap[a.documentId])
        .map(a => ({ documentId: accountMap[a.documentId] }));
      if (connects.length > 0) {
        payload.accounts = { connect: connects };
      }
    }

    if (Object.keys(payload).length === 0) {
      skipped++;
      continue;
    }

    try {
      const updateRes = await localAdminFetch(
        `/content-manager/collection-types/api::report.report/${localReport.documentId}`,
        localJWT,
        'PUT',
        payload
      );
      const result = updateRes.data || updateRes;
      if (result.documentId || result.id) {
        linked++;
      } else {
        console.log(`   Failed to link "${report.title}": ${JSON.stringify(updateRes).substring(0, 200)}`);
        failed++;
      }
    } catch (err) {
      console.log(`   Error linking "${report.title}": ${err.message}`);
      failed++;
    }

    if (linked % 10 === 0 && linked > 0) {
      console.log(`   Progress: ${linked} linked, ${skipped} skipped, ${failed} failed`);
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Models: ${Object.keys(modelMap).length} mapped`);
  console.log(`Accounts: ${Object.keys(accountMap).length} mapped`);
  console.log(`Reports: ${linked} linked, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
