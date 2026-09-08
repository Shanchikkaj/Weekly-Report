import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ReportContent } from '../models/ReportContent';
import { ReportVersion } from '../models/ReportVersion';

dotenv.config();

const mongoUri = process.env.MONGO_URL || 'mongodb://localhost:27017/weekly_report';

async function runVerification() {
  console.log('--- STEP 3: MongoDB Schema & Validator Verification ---');
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  const testReportId = '11111111-2222-3333-4444-555555555555';

  // Cleanup any leftover test records
  await ReportContent.deleteOne({ report_id: testReportId });
  await ReportVersion.deleteMany({ report_id: testReportId });

  // TEST 1: Insert Valid Document (1 key blocker, 1 key achievement)
  console.log('\n[TEST 1] Testing Valid ReportContent insert...');
  const validReport = new ReportContent({
    report_id: testReportId,
    tasks_completed: [
      {
        task_name: 'Implement Docker & DB connections',
        priority: 'high',
        planned_percent: 100,
        actual_percent: 100,
        status: 'done',
        time_planned_hours: 4,
        time_spent_hours: 3.5,
        output_deliverable: 'docker-compose.yml and connection modules',
      },
    ],
    tasks_planned_next_week: ['Complete Auth API', 'Implement RBAC'],
    blockers: [
      { text: 'Awaiting API keys', is_key_issue: true },
      { text: 'Minor lint warning', is_key_issue: false },
    ],
    achievements: [
      { text: 'All 5 containers running healthy', is_key_achievement: true },
      { text: 'Zero downtime scaffold setup', is_key_achievement: false },
    ],
    hours_by_type: {
      development: 12,
      testing: 3,
      meetings: 2,
      documentation: 1,
    },
    notes: 'On track for sprint milestone.',
  });

  const savedValid = await validReport.save();
  console.log('✓ Valid document saved successfully! ID:', savedValid._id.toString());
  console.log('  Tasks count:', savedValid.tasks_completed.length);
  console.log('  Key blocker text:', savedValid.blockers.find(b => b.is_key_issue)?.text);
  console.log('  Key achievement text:', savedValid.achievements.find(a => a.is_key_achievement)?.text);

  // TEST 2: Reject Two Key Blockers (Violate Single-Key Constraint)
  console.log('\n[TEST 2] Testing Invalid ReportContent with 2 key blockers (expect rejection)...');
  const invalidBlockersReport = new ReportContent({
    report_id: '99999999-9999-9999-9999-999999999999',
    tasks_completed: [],
    blockers: [
      { text: 'Critical DB issue', is_key_issue: true },
      { text: 'Network outage', is_key_issue: true }, // Illegal second key issue!
    ],
    achievements: [],
  });

  try {
    await invalidBlockersReport.validate();
    console.error('✗ ERROR: Validation should have failed for multiple key blockers!');
    process.exit(1);
  } catch (err: any) {
    console.log('✓ Successfully caught expected validation error:');
    console.log('  Error message:', err.errors['blockers']?.message || err.message);
  }

  // TEST 3: Reject Two Key Achievements (Violate Single-Key Constraint)
  console.log('\n[TEST 3] Testing Invalid ReportContent with 2 key achievements (expect rejection)...');
  const invalidAchievementsReport = new ReportContent({
    report_id: '88888888-8888-8888-8888-888888888888',
    tasks_completed: [],
    blockers: [],
    achievements: [
      { text: 'Shipped v1.0', is_key_achievement: true },
      { text: '100% test coverage', is_key_achievement: true }, // Illegal second key achievement!
    ],
  });

  try {
    await invalidAchievementsReport.validate();
    console.error('✗ ERROR: Validation should have failed for multiple key achievements!');
    process.exit(1);
  } catch (err: any) {
    console.log('✓ Successfully caught expected validation error:');
    console.log('  Error message:', err.errors['achievements']?.message || err.message);
  }

  // TEST 4: Create Valid ReportVersion with Content Snapshot
  console.log('\n[TEST 4] Testing Valid ReportVersion creation with content_snapshot...');
  const reportVersion = new ReportVersion({
    report_id: testReportId,
    version_number: 1,
    content_snapshot: {
      tasks_completed: savedValid.tasks_completed,
      tasks_planned_next_week: savedValid.tasks_planned_next_week,
      blockers: savedValid.blockers,
      achievements: savedValid.achievements,
      hours_by_type: savedValid.hours_by_type,
      notes: savedValid.notes,
    },
    submitted_at: new Date(),
  });

  const savedVersion = await reportVersion.save();
  console.log('✓ ReportVersion snapshot saved successfully! Version:', savedVersion.version_number);
  console.log('  Snapshot tasks count:', savedVersion.content_snapshot.tasks_completed.length);
  console.log('  Snapshot key blocker:', savedVersion.content_snapshot.blockers.find(b => b.is_key_issue)?.text);

  // Clean up test data
  await ReportContent.deleteOne({ report_id: testReportId });
  await ReportVersion.deleteMany({ report_id: testReportId });
  console.log('\n✓ Test data cleaned up.');

  await mongoose.disconnect();
  console.log('✓ All Step 3 MongoDB schema checks passed successfully!\n');
}

runVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
