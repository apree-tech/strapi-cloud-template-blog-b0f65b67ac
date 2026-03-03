const LOCAL_API = 'http://localhost:3005';

async function main() {
  const jwt = await fetch(`${LOCAL_API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: '12345678aA' }),
  }).then(r => r.json()).then(d => d.data.token);

  const h = { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  // Fetch all reports
  let allReports = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${LOCAL_API}/content-manager/collection-types/api::report.report?page=${page}&pageSize=100`, { headers: h }).then(r => r.json());
    allReports.push(...(res.results || []));
    if (!res.pagination || page >= res.pagination.pageCount) break;
    page++;
  }

  console.log(`Total reports: ${allReports.length}`);
  const drafts = allReports.filter(r => r.status === 'draft');
  console.log(`Drafts: ${drafts.length}`);

  let published = 0;
  let failed = 0;

  for (const r of drafts) {
    const res = await fetch(`${LOCAL_API}/content-manager/collection-types/api::report.report/${r.documentId}/actions/publish`, {
      method: 'POST',
      headers: h,
    });
    const result = await res.json();
    if (result.documentId || result.data?.documentId) {
      published++;
    } else {
      console.log(`Failed: ${r.title} - ${JSON.stringify(result).substring(0, 200)}`);
      failed++;
    }
  }

  console.log(`\nPublished: ${published}, Failed: ${failed}`);
}

main().catch(console.error);
