const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://renowned-connection-c3889a992a.strapiapp.com';
const API_TOKEN = 'c6bd46ecd767e56584444dea91978a2207c2a40567ef230618d6ba940bdb54f6a9402f23f2df17d19d9ae9fc7d6ad637ada329602438d218841431dcb303911f93205a80e66a7a11d3a65279793572e281086b2864f3664c6763c0147ef44ad297fc6a7a086bf1fefeeed539762db0e0904efdf23e3152509380ccf45493d097';

const OUTPUT_DIR = path.join(__dirname, '..', '.tmp', 'remote-data');

async function fetchJSON(urlPath) {
  const url = `${BASE_URL}${urlPath}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
  });
}

async function fetchAllPages(endpoint, populate = '') {
  const allData = [];
  let page = 1;
  const pageSize = 25;

  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${sep}pagination[page]=${page}&pagination[pageSize]=${pageSize}${populate ? '&' + populate : ''}`;
    console.log(`  Fetching page ${page}: ${url}`);

    const result = await fetchJSON(url);

    if (!result.data || !Array.isArray(result.data)) {
      console.log('  No data array in response');
      break;
    }

    allData.push(...result.data);
    console.log(`  Got ${result.data.length} items (total: ${allData.length})`);

    const pagination = result.meta?.pagination;
    if (!pagination || page >= pagination.pageCount) break;
    page++;
  }

  return allData;
}

async function downloadFile(urlPath, outputPath) {
  const url = urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      const ws = fs.createWriteStream(outputPath);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(); });
      ws.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'uploads'), { recursive: true });

  console.log('=== Downloading remote Strapi data ===\n');

  // 1. Fetch reports with deep populate
  console.log('1. Fetching reports...');
  const reports = await fetchAllPages(
    '/api/reports',
    'populate[content_blocks][populate]=*&populate[model][populate]=*&populate[accounts][populate]=*'
  );
  console.log(`   Total reports: ${reports.length}\n`);

  // 2. Fetch models
  console.log('2. Fetching models...');
  const models = await fetchAllPages('/api/models', 'populate=*');
  console.log(`   Total models: ${models.length}\n`);

  // 3. Fetch accounts
  console.log('3. Fetching accounts...');
  const accounts = await fetchAllPages('/api/accounts', 'populate=*');
  console.log(`   Total accounts: ${accounts.length}\n`);

  // 4. Fetch globals
  console.log('4. Fetching globals...');
  let globals = null;
  try {
    const globalsResult = await fetchJSON('/api/global?populate=*');
    globals = globalsResult.data;
    console.log(`   Globals fetched\n`);
  } catch (e) {
    console.log(`   No globals: ${e.message}\n`);
  }

  // 5. Fetch files/media
  console.log('5. Fetching media files list...');
  const filesResult = await fetchAllPages('/api/upload/files');
  console.log(`   Total files: ${filesResult.length}\n`);

  // Save JSON data
  console.log('6. Saving JSON data...');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'reports.json'), JSON.stringify(reports, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'models.json'), JSON.stringify(models, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'accounts.json'), JSON.stringify(accounts, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'files.json'), JSON.stringify(filesResult, null, 2));
  if (globals) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'globals.json'), JSON.stringify(globals, null, 2));
  }
  console.log('   JSON saved\n');

  // 7. Download media files
  console.log('7. Downloading media files...');
  let downloaded = 0;
  let skipped = 0;

  for (const file of filesResult) {
    const fileUrl = file.url;
    if (!fileUrl) { skipped++; continue; }

    const fileName = path.basename(fileUrl);
    const outputPath = path.join(OUTPUT_DIR, 'uploads', fileName);

    if (fs.existsSync(outputPath)) {
      skipped++;
      continue;
    }

    try {
      await downloadFile(fileUrl, outputPath);
      downloaded++;
      if (downloaded % 50 === 0) {
        console.log(`   Downloaded ${downloaded} files...`);
      }
    } catch (e) {
      console.error(`   Failed to download ${fileUrl}: ${e.message}`);
    }
  }
  console.log(`   Downloaded: ${downloaded}, Skipped: ${skipped}\n`);

  console.log('=== Download complete! ===');
  console.log(`Data saved to: ${OUTPUT_DIR}`);
  console.log(`\nFiles:`);
  console.log(`  reports.json  - ${reports.length} reports`);
  console.log(`  models.json   - ${models.length} models`);
  console.log(`  accounts.json - ${accounts.length} accounts`);
  console.log(`  files.json    - ${filesResult.length} file records`);
  console.log(`  uploads/      - ${downloaded + skipped} media files`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
