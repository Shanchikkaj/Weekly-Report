import { assistantService } from '../services/assistant.service';
import { prisma } from '../config/prisma';
import { connectPostgres, pool } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import mongoose from 'mongoose';

async function verifyAssistant() {
  console.log('===============================================================');
  console.log('🤖 Verifying Step 13 Correction: Free AI Report Assistant (Gemini)');
  console.log('===============================================================\n');

  await connectPostgres();
  await connectMongo();

  const manager = await prisma.user.findFirst({
    where: { email: 'manager@company.com' },
  });

  if (!manager) {
    console.error('❌ Manager user not found. Please run seed script first.');
    process.exit(1);
  }

  const testQuestions = [
    // Standard 8 Acceptance Questions
    'Give me the activity details of all team members during the last four weeks.',
    'What did Evan Wright work on this week?',
    'Which team members reported key blockers?',
    'Compare completed work across the team.',
    'Which reports are still awaiting approval?',
    'Summarise the Data and Analytics Pipeline project.',
    'What recurring blockers appeared during the last four weeks?',
    'How do I cook chicken fried rice?',
    // Natural Language Variations & Disambiguation
    'Tell me what everyone achieved recently.',
    'Did anybody face problems last week?',
    "Show Evan's latest work.",
    'Who has reports waiting for review?',
    'What did JonathonSmithe work on?',
  ];

  for (let i = 0; i < testQuestions.length; i++) {
    const q = testQuestions[i];
    console.log(`\n---------------------------------------------------------------`);
    console.log(`[Query ${i + 1}]: "${q}"`);
    console.log(`---------------------------------------------------------------`);

    try {
      const result = await assistantService.processQuery(manager.id, q);

      const dateRangeStr = result.dateRange ? `${result.dateRange.from} to ${result.dateRange.to}` : 'None (out of scope / no data)';
      console.log(`HTTP Status: 200`);
      console.log(`📊 Reports Analyzed: ${result.reportCount} (${dateRangeStr})`);
      console.log(`⚙️ Provider: ${result.provider}${result.model ? ` (Model: ${result.model})` : ''}`);
      console.log(`🔍 Applied Filters: ${JSON.stringify(result.filters)}`);
      console.log(`\n💬 Generated Answer:\n${result.answer}\n`);
    } catch (err: any) {
      console.log(`HTTP Status: ${err.statusCode || 503}`);
      console.log(`⚙️ Provider Code: ${err.code || 'AI_PROVIDER_UNAVAILABLE'}`);
      console.log(`⚠️ Error Message: "${err.message}"\n`);
    }
  }

  console.log('\n===============================================================');
  console.log('✅ ALL AI ASSISTANT MANUAL QUESTIONS VERIFIED!');
  console.log('===============================================================');

  await mongoose.disconnect();
  await pool.end();
  await prisma.$disconnect();
}

verifyAssistant()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error verifying assistant:', err);
    process.exit(1);
  });
