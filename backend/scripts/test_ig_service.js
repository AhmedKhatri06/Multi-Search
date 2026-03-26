import instagramService from '../services/instagramService.js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

/**
 * Test script to verify Instagram Discovery Logic.
 */
async function test() {
  const testName = "Ahmed Khatri";
  const testEmail = "ahmed@example.com";
  const testPhone = "9876543210";

  console.log('--- Testing Instagram Handle Scraping ---');
  const handles = await instagramService.searchHandles(testName);
  console.log('Found handles:', handles.slice(0, 5));

  if (handles.length === 0) {
    console.warn('⚠️ No handles found. This might be due to scraper blocking.');
  }

  console.log('\n--- Testing Mask Matching Logic ---');
  const testCases = [
    { input: "dhruvil@gmail.com", mask: "d***l@g***.com", expected: true },
    { input: "ahmed@dj.com", mask: "a***d@d***.com", expected: true },
    { input: "wrong@test.com", mask: "a***d@d***.com", expected: false },
    { input: "9876543210", mask: "******10", expected: true },
    { input: "1234567890", mask: "******10", expected: false },
  ];

  testCases.forEach(({ input, mask, expected }) => {
    const result = instagramService.isMaskMatch(input, mask);
    console.log(`[${result === expected ? 'PASS' : 'FAIL'}] Input: ${input} | Mask: ${mask} | Match: ${result}`);
  });

  console.log('\n--- Testing API Integrity (No Session Case) ---');
  const info = await instagramService.getMaskedInfo('cristiano', null);
  console.log('Info with null session (Expected null):', info);

  console.log('\n--- Testing Full Identification Flow ---');
  console.log('Running identify (will warn about missing session id)...');
  const results = await instagramService.identify(testName, testEmail, testPhone);
  console.log('Identified Results:', results.length);
  if (results.length > 0) {
    console.log('Top Match:', results[0]);
  }

  console.log('\nVerification Complete.');
}

test();
