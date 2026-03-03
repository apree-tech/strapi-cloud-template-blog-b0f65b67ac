const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '.tmp', 'remote-data');
const LOCAL_API = 'http://localhost:3005';

async function fetchLocal(endpoint, method = 'GET', body = null) {
  const url = `${LOCAL_API}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function getAdminJWT() {
  const res = await fetch(`${LOCAL_API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: '12345678aA'
    })
  });

  if (res.ok) {
    const data = await res.json();
    return data.data?.token;
  }

  console.error('Login failed:', res.status, await res.text());
  return null;
}

async function importWithAdmin(jwt) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt}`
  };

  // Load data
  const reports = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'reports.json'), 'utf-8'));
  const models = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'models.json'), 'utf-8'));
  const accounts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'accounts.json'), 'utf-8'));

  console.log(`Loaded: ${reports.length} reports, ${models.length} models, ${accounts.length} accounts\n`);

  // Import models first
  console.log('=== Importing models ===');
  const modelMap = {};
  for (const model of models) {
    const payload = {
      name: model.name,
      telegram: model.telegram || null,
    };

    // Check if exists
    const checkRes = await fetch(`${LOCAL_API}/content-manager/collection-types/api::model.model?filters[name][$eq]=${encodeURIComponent(model.name)}&page=1&pageSize=1`, { headers });
    const checkData = await checkRes.json();

    if (checkData.results?.length > 0) {
      console.log(`  Model "${model.name}" already exists (id: ${checkData.results[0].documentId})`);
      modelMap[model.documentId] = checkData.results[0].documentId;
    } else {
      const createRes = await fetch(`${LOCAL_API}/content-manager/collection-types/api::model.model`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const created = await createRes.json();
      if (created.documentId) {
        console.log(`  Created model "${model.name}" (id: ${created.documentId})`);
        modelMap[model.documentId] = created.documentId;
      } else {
        console.error(`  Failed to create model "${model.name}":`, JSON.stringify(created).substring(0, 200));
      }
    }
  }

  // Import accounts
  console.log('\n=== Importing accounts ===');
  const accountMap = {};
  for (const account of accounts) {
    const payload = {
      name: account.name,
    };

    const checkRes = await fetch(`${LOCAL_API}/content-manager/collection-types/api::account.account?filters[name][$eq]=${encodeURIComponent(account.name)}&page=1&pageSize=1`, { headers });
    const checkData = await checkRes.json();

    if (checkData.results?.length > 0) {
      console.log(`  Account "${account.name}" already exists (id: ${checkData.results[0].documentId})`);
      accountMap[account.documentId] = checkData.results[0].documentId;
    } else {
      const createRes = await fetch(`${LOCAL_API}/content-manager/collection-types/api::account.account`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const created = await createRes.json();
      if (created.documentId) {
        console.log(`  Created account "${account.name}" (id: ${created.documentId})`);
        accountMap[account.documentId] = created.documentId;
      } else {
        console.error(`  Failed to create account "${account.name}":`, JSON.stringify(created).substring(0, 200));
      }
    }
  }

  // Import reports
  console.log('\n=== Importing reports ===');
  let imported = 0;
  let updated = 0;
  let failed = 0;

  for (const report of reports) {
    // Build content_blocks - strip IDs but keep structure
    const contentBlocks = (report.content_blocks || []).map(block => {
      const { id, ...rest } = block;
      // Clean nested objects too
      const clean = { ...rest };
      if (clean.items) {
        clean.items = clean.items.map(item => {
          const { id: iid, ...irest } = item;
          return irest;
        });
      }
      if (clean.metrics) {
        clean.metrics = clean.metrics.map(m => {
          const { id: mid, ...mrest } = m;
          return mrest;
        });
      }
      return clean;
    });

    const payload = {
      title: report.title,
      dateFrom: report.dateFrom,
      dateTo: report.dateTo,
      uuid: report.uuid,
      content_blocks: contentBlocks,
    };

    // Map model relation
    if (report.model?.documentId && modelMap[report.model.documentId]) {
      payload.model = { connect: [{ documentId: modelMap[report.model.documentId] }] };
    }

    // Map accounts relation
    if (report.accounts?.length > 0) {
      const accountConnects = report.accounts
        .filter(a => accountMap[a.documentId])
        .map(a => ({ documentId: accountMap[a.documentId] }));
      if (accountConnects.length > 0) {
        payload.accounts = { connect: accountConnects };
      }
    }

    // Check if report exists by uuid
    const checkRes = await fetch(`${LOCAL_API}/content-manager/collection-types/api::report.report?filters[uuid][$eq]=${encodeURIComponent(report.uuid || '')}&page=1&pageSize=1`, { headers });
    const checkData = await checkRes.json();

    try {
      if (checkData.results?.length > 0) {
        // Update existing
        const docId = checkData.results[0].documentId;
        const updateRes = await fetch(`${LOCAL_API}/content-manager/collection-types/api::report.report/${docId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });
        const result = await updateRes.json();
        if (result.documentId) {
          updated++;
        } else {
          console.error(`  Failed to update "${report.title}":`, JSON.stringify(result).substring(0, 300));
          failed++;
        }
      } else {
        // Create new
        const createRes = await fetch(`${LOCAL_API}/content-manager/collection-types/api::report.report`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const result = await createRes.json();
        if (result.documentId) {
          imported++;
        } else {
          console.error(`  Failed to create "${report.title}":`, JSON.stringify(result).substring(0, 300));
          failed++;
        }
      }

      if ((imported + updated) % 10 === 0 && (imported + updated) > 0) {
        console.log(`  Progress: ${imported} created, ${updated} updated, ${failed} failed`);
      }
    } catch (err) {
      console.error(`  Error with "${report.title}": ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== Import complete ===`);
  console.log(`Reports: ${imported} created, ${updated} updated, ${failed} failed`);
  console.log(`Models: ${Object.keys(modelMap).length} mapped`);
  console.log(`Accounts: ${Object.keys(accountMap).length} mapped`);
}

async function main() {
  console.log('=== Importing remote data to local Strapi ===\n');

  // Check if local Strapi is running
  try {
    await fetch(`${LOCAL_API}/admin/init`);
  } catch {
    console.error('Local Strapi is not running on port 3005! Start it first with: npm run develop');
    process.exit(1);
  }

  // Get admin JWT
  console.log('Getting admin JWT...');
  const jwt = await getAdminJWT();
  if (!jwt) {
    console.error('Could not get admin JWT. Check admin credentials.');
    console.log('Trying to list admin users...');
    process.exit(1);
  }
  console.log('Got JWT token\n');

  await importWithAdmin(jwt);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
