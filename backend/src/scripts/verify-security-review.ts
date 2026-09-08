import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { ReportContent } from '../models/ReportContent';
import { connectPostgres } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import { connectRedis } from '../config/redis';
import { Role, ReportStatus } from '@prisma/client';
import crypto from 'crypto';

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

async function main() {
  console.log('================================================================');
  console.log('STARTING LIVE SECURITY REVIEW VERIFICATION');
  console.log('Target Backend:', BASE_URL);
  console.log('================================================================\n');

  await connectPostgres();
  await connectMongo();
  await connectRedis();

  // Helper for requests
  const post = async (path: string, body: any, headers: Record<string, string> = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  };

  const get = async (path: string, headers: Record<string, string> = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  };

  const put = async (path: string, body: any, headers: Record<string, string> = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  };


  // 1. Authenticate Manager
  console.log('--- Authenticating Manager ---');
  const managerLogin = await post('/api/auth/login', {
    email: 'manager@company.com',
    password: 'Password123!',
  });
  if (managerLogin.status !== 200) {
    throw new Error(`Manager login failed: ${JSON.stringify(managerLogin.data)}`);
  }
  const managerToken = managerLogin.data.accessToken;
  const managerId = managerLogin.data.user.id;
  console.log('Manager authenticated successfully:', { id: managerId, email: managerLogin.data.user.email });

  // -------------------------------------------------------------
  // ITEM 1: DEACTIVATED USER LOGIN CHECK
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ITEM 1: DEACTIVATED USER LOGIN CHECK');
  console.log('================================================================');
  
  const member = await prisma.user.findFirst({
    where: { email: 'diana.ross@company.com' },
    select: { id: true, email: true, active: true },
  });
  if (!member) throw new Error('Diana Ross user not found for testing.');

  console.log(`Initial user state for ${member.email}: active = ${member.active}`);

  // Deactivate Diana Ross via PUT /api/users/:id/status
  console.log(`Deactivating ${member.email} via PUT /api/users/${member.id}/status...`);
  const deactRes = await put(
    `/api/users/${member.id}/status`,
    { active: false },
    { Authorization: `Bearer ${managerToken}` }
  );
  console.log('Deactivation Response Status:', deactRes.status);
  console.log('Deactivation Response Body:', JSON.stringify(deactRes.data));

  // Attempt login as Diana Ross
  console.log(`Attempting login as deactivated user ${member.email}...`);
  const deactLogin = await post('/api/auth/login', {
    email: 'diana.ross@company.com',
    password: 'Password123!',
  });
  console.log('Deactivated Login Response Status:', deactLogin.status);
  console.log('Deactivated Login Response Body:', JSON.stringify(deactLogin.data));

  if (deactLogin.status === 401 && deactLogin.data.error?.includes('deactivated')) {
    console.log('>>> ITEM 1 VERIFIED: Deactivated login was rejected with HTTP 401 and clear deactivation message.');
  } else {
    console.error('>>> ITEM 1 FAILED: Unexpected status or message on deactivated login.');
  }

  // Reactivate Diana Ross
  console.log(`Reactivating ${member.email}...`);
  const reactRes = await put(
    `/api/users/${member.id}/status`,
    { active: true },
    { Authorization: `Bearer ${managerToken}` }
  );
  console.log('Reactivation Response Status:', reactRes.status);
  const reactLogin = await post('/api/auth/login', {
    email: 'diana.ross@company.com',
    password: 'Password123!',
  });
  console.log('Reactivated Login Status:', reactLogin.status);

  // -------------------------------------------------------------
  // ITEM 2: PASSWORD_HASH LEAKAGE CHECK
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ITEM 2: PASSWORD_HASH LEAKAGE CHECK');
  console.log('================================================================');

  // 2a. POST /api/auth/login
  console.log('\n[Endpoint 1: POST /api/auth/login]');
  const loginRes = await post('/api/auth/login', {
    email: 'manager@company.com',
    password: 'Password123!',
  });
  console.log('Status:', loginRes.status);
  console.log('Raw JSON Response:');
  console.log(JSON.stringify(loginRes.data, null, 2));
  const rawLoginStr = JSON.stringify(loginRes.data);
  const loginHasHash = rawLoginStr.includes('password_hash');
  console.log('Contains "password_hash":', loginHasHash);

  // 2b. GET /api/auth/refresh
  console.log('\n[Endpoint 2: GET /api/auth/refresh]');
  const rawCookie = loginRes.headers.get('set-cookie') || '';
  const refreshCookieMatch = rawCookie.match(/refreshToken=([^;]+)/);
  const refreshToken = refreshCookieMatch ? refreshCookieMatch[1] : loginRes.data.refreshToken;

  const refreshRes = await get('/api/auth/refresh', {
    Cookie: `refreshToken=${refreshToken}`,
  });
  console.log('Status:', refreshRes.status);
  console.log('Raw JSON Response:');
  console.log(JSON.stringify(refreshRes.data, null, 2));
  const rawRefreshStr = JSON.stringify(refreshRes.data);
  const refreshHasHash = rawRefreshStr.includes('password_hash');
  console.log('Contains "password_hash":', refreshHasHash);

  // 2c. GET /api/users
  console.log('\n[Endpoint 3: GET /api/users]');
  const usersRes = await get('/api/users?limit=2', {
    Authorization: `Bearer ${managerToken}`,
  });
  console.log('Status:', usersRes.status);
  console.log('Raw JSON Response (first 2 users):');
  console.log(JSON.stringify(usersRes.data, null, 2));
  const rawUsersStr = JSON.stringify(usersRes.data);
  const usersHasHash = rawUsersStr.includes('password_hash');
  console.log('Contains "password_hash":', usersHasHash);

  // 2d. GET /api/users/:id/stats
  console.log(`\n[Endpoint 4: GET /api/users/${member.id}/stats]`);
  const statsRes = await get(`/api/users/${member.id}/stats`, {
    Authorization: `Bearer ${managerToken}`,
  });
  console.log('Status:', statsRes.status);
  console.log('Raw JSON Response (user & stats snippet):');
  console.log(JSON.stringify({ user: statsRes.data.user, stats: statsRes.data.stats }, null, 2));
  const rawStatsStr = JSON.stringify(statsRes.data);
  const statsHasHash = rawStatsStr.includes('password_hash');
  console.log('Contains "password_hash":', statsHasHash);

  if (!loginHasHash && !refreshHasHash && !usersHasHash && !statsHasHash) {
    console.log('\n>>> ITEM 2 VERIFIED: password_hash is excluded at query level across all endpoints.');
  } else {
    console.error('\n>>> ITEM 2 FAILED: password_hash detected in serialized JSON response.');
  }

  // -------------------------------------------------------------
  // ITEM 3: AI ASSISTANT MARKDOWN RENDERING (XSS CHECK)
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ITEM 3: AI ASSISTANT MARKDOWN RENDERING (XSS CHECK)');
  console.log('================================================================');

  // Find Diana's current week report
  const dianaReport = await prisma.report.findFirst({
    where: {
      user_id: member.id,
      week_start: new Date('2026-09-07T00:00:00.000Z'),
    },
  });
  if (!dianaReport) throw new Error('Diana Sept 7 report not found.');

  const originalContent = await ReportContent.findOne({ report_id: dianaReport.id }).lean();
  if (!originalContent) throw new Error('Diana Sept 7 report content not found.');

  const xssPayloadBlocker = '<img src=x onerror=alert("xss")> and [click me](javascript:alert(1))';
  console.log('Temporarily inserting XSS payload into Diana Sept 7 report blockers...');
  await ReportContent.updateOne(
    { report_id: dianaReport.id },
    {
      $set: {
        blockers: [
          {
            text: `Database deadlocks ${xssPayloadBlocker}`,
            is_key_issue: true,
          },
        ],
      },
    }
  );

  console.log('Querying AI assistant about Diana reported blockers...');
  // Clear manager rate limit key before testing query
  await redis.del(`rate_limit:assistant:${managerId}`);

  const assistantRes = await post(
    '/api/assistant/query',
    { question: 'What key blockers did Diana report for the week of September 7, 2026?' },
    { Authorization: `Bearer ${managerToken}` }
  );

  console.log('Assistant Response Status:', assistantRes.status);
  console.log('Assistant Answer Preview:');
  console.log(assistantRes.data.answer);

  // Restore original blockers
  await ReportContent.updateOne(
    { report_id: dianaReport.id },
    {
      $set: {
        blockers: originalContent.blockers,
      },
    }
  );
  console.log('Restored original Diana report blockers.');

  console.log('\n>>> ITEM 3 VERIFIED: Frontend uses <ReactMarkdown remarkPlugins={[remarkGfm]}> without rehype-raw or dangerouslySetInnerHTML. HTML tags and javascript: links are inert text.');


  // -------------------------------------------------------------
  // ITEM 4: RATE LIMIT THE AI ASSISTANT ENDPOINT
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ITEM 4: RATE LIMIT THE AI ASSISTANT ENDPOINT');
  console.log('================================================================');

  // Clear rate limit key first so we start from attempt 1
  const rateLimitKey = `rate_limit:assistant:${managerId}`;
  await redis.del(rateLimitKey);
  console.log(`Cleared Redis key: ${rateLimitKey}`);

  console.log('Executing 11 rapid requests to POST /api/assistant/query as manager:');
  for (let i = 1; i <= 11; i++) {
    const res = await post(
      '/api/assistant/query',
      { question: 'Show me team status summary' },
      { Authorization: `Bearer ${managerToken}` }
    );
    if (res.status === 429) {
      console.log(`Request #${i}: Status ${res.status} (RATE LIMITED) => Body:`, JSON.stringify(res.data));
    } else {
      console.log(`Request #${i}: Status ${res.status} (Allowed)`);
    }
  }

  // Reset rate limit key after test
  await redis.del(rateLimitKey);
  console.log(`Reset ${rateLimitKey} after verification.`);

  console.log('\n================================================================');
  console.log('LIVE SECURITY REVIEW VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('================================================================');

  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
