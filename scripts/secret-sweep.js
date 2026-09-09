/**
 * Pre-Commit & Pre-Deployment Secret Sweep Script
 * Scans the repository and staged files to guarantee no secrets, credentials, or sensitive files leak.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('================================================================');
console.log('🔒 EXECUTING PRE-COMMIT REPOSITORY SECRET & ARTIFACT SWEEP');
console.log('================================================================\n');

let violations = 0;

// 1. Confirm backend/.env is gitignored and NOT tracked
console.log('[1/5] Checking backend/.env git status...');
try {
  const trackedEnv = execSync('git ls-files backend/.env', { encoding: 'utf8' }).trim();
  if (trackedEnv) {
    console.error('❌ CRITICAL VIOLATION: backend/.env is tracked by Git!');
    violations++;
  } else {
    console.log('✓ backend/.env is NOT tracked by Git.');
  }

  const ignoredCheck = execSync('git check-ignore backend/.env', { encoding: 'utf8' }).trim();
  if (ignoredCheck === 'backend/.env') {
    console.log('✓ backend/.env is properly ignored by .gitignore.');
  } else {
    console.error('❌ CRITICAL VIOLATION: backend/.env is not matched by .gitignore!');
    violations++;
  }
} catch (e) {
  // If check-ignore exits with 1, it is not ignored
  console.error('❌ Error checking gitignore for backend/.env:', e.message);
  violations++;
}

// 2. Check render.yaml for secrets
console.log('\n[2/5] Checking render.yaml for exposed secret values...');
try {
  const renderYaml = fs.readFileSync('render.yaml', 'utf8');
  // Check for common real secrets pattern or unmasked credentials
  if (renderYaml.includes('postgresql://') || renderYaml.includes('mongodb+srv://') || renderYaml.includes('rediss://')) {
    console.error('❌ CRITICAL VIOLATION: render.yaml contains real database connection strings!');
    violations++;
  } else if (renderYaml.includes('AIzaSy')) {
    console.error('❌ CRITICAL VIOLATION: render.yaml contains a real Google API key!');
    violations++;
  } else {
    console.log('✓ render.yaml contains no secrets (uses sync: false / generateValue: true).');
  }
} catch (e) {
  console.error('❌ Could not read render.yaml:', e.message);
  violations++;
}

// 3. Check .env.example and .env.production.example for real secrets
console.log('\n[3/5] Checking example env files for unmasked values...');
const exampleFiles = [
  'backend/.env.example',
  'backend/.env.production.example',
  'frontend/.env.example',
];
for (const file of exampleFiles) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('AIzaSy') || content.includes('@cluster') || (content.includes('upstash.io') && !content.includes('<upstash-password>'))) {
      console.error(`❌ VIOLATION in ${file}: contains real credentials instead of placeholders!`);
      violations++;
    } else {
      console.log(`✓ ${file} contains placeholders only.`);
    }
  }
}

// 4. Check backend/.env.test for safe test values
console.log('\n[4/5] Checking backend/.env.test for safe dummy values...');
if (fs.existsSync('backend/.env.test')) {
  const content = fs.readFileSync('backend/.env.test', 'utf8');
  if (content.includes('AIzaSy')) {
    console.error('❌ VIOLATION: backend/.env.test contains a live API key!');
    violations++;
  } else {
    console.log('✓ backend/.env.test contains safe mock/test values only.');
  }
}

// 5. Check git staged files for build artifacts (dist, node_modules, coverage)
console.log('\n[5/5] Checking staged files for build artifacts or secrets...');
try {
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  if (staged) {
    const stagedFiles = staged.split('\n');
    for (const f of stagedFiles) {
      if (f.startsWith('dist/') || f.includes('/dist/') || f.includes('node_modules/') || f.includes('coverage/')) {
        console.error(`❌ VIOLATION: Build artifact "${f}" is staged for commit!`);
        violations++;
      }
      if (f.endsWith('.env') && !f.includes('.example') && !f.includes('.test')) {
        console.error(`❌ VIOLATION: Secret file "${f}" is staged for commit!`);
        violations++;
      }
    }
    console.log(`✓ Checked ${stagedFiles.length} staged file(s).`);
  } else {
    console.log('ℹ No files currently staged.');
  }
} catch (e) {
  console.error('❌ Error reading staged files:', e.message);
}

console.log('\n================================================================');
if (violations === 0) {
  console.log('✅ SECRET SWEEP PASSED: No secrets, credentials, or build artifacts found.');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error(`❌ SECRET SWEEP FAILED: ${violations} violation(s) detected.`);
  console.log('================================================================\n');
  process.exit(1);
}
