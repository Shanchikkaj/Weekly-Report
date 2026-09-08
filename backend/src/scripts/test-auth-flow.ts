import http from 'http';

function request(options: http.RequestOptions, postData?: any): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runAuthTests() {
  console.log('=== STEP 4: Authentication & Rate Limiting Test Suite ===\n');

  // TEST 1: Registration Validation
  console.log('[TEST 1] Register invalid email format');
  const regBadEmail = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'not-an-email', password: 'ValidPassword123!' }
  );
  console.log(`Status: ${regBadEmail.status} | Response:`, regBadEmail.body);
  if (regBadEmail.status !== 400) throw new Error('Expected 400 for bad email');

  // TEST 2: Registration Short Password
  console.log('\n[TEST 2] Register short password (< 8 chars)');
  const regShortPass = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'user1@example.com', password: '123' }
  );
  console.log(`Status: ${regShortPass.status} | Response:`, regShortPass.body);
  if (regShortPass.status !== 400) throw new Error('Expected 400 for short password');

  // TEST 3: Successful Registration
  console.log('\n[TEST 3] Successful User Registration (manager role)');
  const testEmail = `manager_${Date.now()}@example.com`;
  const regSuccess = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: testEmail, password: 'SecurePassword123!', role: 'manager' }
  );
  console.log(`Status: ${regSuccess.status} | User:`, regSuccess.body.user);
  if (regSuccess.status !== 201) throw new Error('Expected 201 for valid registration');

  // TEST 4: Successful Login & Cookie Verification
  console.log('\n[TEST 4] Successful Login');
  const loginSuccess = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: testEmail, password: 'SecurePassword123!' }
  );
  console.log(`Status: ${loginSuccess.status}`);
  console.log(`Has accessToken:`, !!loginSuccess.body.accessToken);
  const setCookie = loginSuccess.headers['set-cookie'];
  console.log(`Set-Cookie header:`, setCookie);
  if (loginSuccess.status !== 200 || !loginSuccess.body.accessToken || !setCookie) {
    throw new Error('Expected 200 and Set-Cookie for successful login');
  }

  const cookieHeader = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : (setCookie as string).split(';')[0];

  // TEST 5: Refresh Access Token
  console.log('\n[TEST 5] Token Refresh Flow via httpOnly Cookie');
  const refreshRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/refresh',
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
    },
  });
  console.log(`Status: ${refreshRes.status} | New Access Token issued:`, !!refreshRes.body.accessToken);
  if (refreshRes.status !== 200 || !refreshRes.body.accessToken) {
    throw new Error('Expected 200 with new accessToken');
  }

  // TEST 6: Logout
  console.log('\n[TEST 6] Logout and Session Invalidation');
  const logoutRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/logout',
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
    },
  });
  console.log(`Status: ${logoutRes.status} | Response:`, logoutRes.body);

  // Attempt refresh with logged out cookie -> should fail 401
  const postLogoutRefresh = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/refresh',
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
    },
  });
  console.log(`Post-logout refresh status: ${postLogoutRefresh.status} (expect 401) | Response:`, postLogoutRefresh.body);
  if (postLogoutRefresh.status !== 401) {
    throw new Error('Expected 401 when refreshing with invalidated token');
  }

  // TEST 7: Redis Login Rate Limiting (5 allowed attempts, 6th triggers 429)
  console.log('\n[TEST 7] Testing Redis Rate Limiting (Max 5 attempts / 15 min)');
  const bruteEmail = `brute_${Date.now()}@example.com`;
  for (let i = 1; i <= 6; i++) {
    const attempt = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: bruteEmail, password: 'WrongPassword999!' }
    );
    console.log(`Attempt ${i}: Status ${attempt.status} | Error: ${attempt.body.error}`);
    if (i <= 5 && attempt.status !== 401) {
      throw new Error(`Expected 401 for attempt ${i}, got ${attempt.status}`);
    }
    if (i === 6) {
      if (attempt.status !== 429) {
        throw new Error(`Expected 429 for attempt 6, got ${attempt.status}`);
      }
      console.log('✓ Rate limiting kicked in on attempt 6 as expected!');
    }
  }

  console.log('\n=== ALL STEP 4 AUTH TESTS PASSED SUCCESSFULLY! ===\n');
}

runAuthTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
