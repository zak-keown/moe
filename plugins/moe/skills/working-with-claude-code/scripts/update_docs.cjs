#!/usr/bin/env node

/**
 * update_docs.cjs
 *
 * Fetches the latest Claude Code documentation from docs.claude.com
 * and saves it to the references/ directory.
 *
 * Usage: node scripts/update_docs.cjs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LLMS_TXT_URL = 'https://docs.claude.com/llms.txt';
const CLAUDE_CODE_PATTERN = /https:\/\/docs\.claude\.com\/en\/docs\/claude-code\/[^\s)]+\.md/g;
const REFERENCES_DIR = path.join(__dirname, '..', 'references');
fs.mkdirSync(REFERENCES_DIR, { recursive: true });

/**
 * Fetch content from a URL using https module
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Extract Claude Code doc URLs from llms.txt
 */
async function getClaudeCodeUrls() {
  console.log('📥 Fetching llms.txt...');
  const content = await fetchUrl(LLMS_TXT_URL);

  const urls = new Set();
  const matches = content.matchAll(CLAUDE_CODE_PATTERN);

  for (const match of matches) {
    urls.add(match[0]);
  }

  return Array.from(urls).sort();
}

/**
 * Fetch and save a single documentation page
 */
async function fetchAndSaveDoc(url) {
  const filename = path.basename(url);
  // The filename comes from remote content (a URL matched out of the fetched
  // llms.txt), so constrain it before it becomes a write target.
  if (!/^[a-z0-9][a-z0-9._-]*\.md$/i.test(filename)) {
    console.error(`  Refusing suspicious filename from ${url}`);
    return { url, filename, success: false, error: 'rejected filename' };
  }
  const filepath = path.join(REFERENCES_DIR, filename);
  if (path.dirname(path.resolve(filepath)) !== path.resolve(REFERENCES_DIR)) {
    console.error(`  Refusing path escape from ${url}`);
    return { url, filename, success: false, error: 'rejected path' };
  }

  try {
    console.log(`  Fetching ${filename}...`);
    const content = await fetchUrl(url);
    fs.writeFileSync(filepath, content, 'utf8');
    return { url, filename, success: true };
  } catch (error) {
    console.error(`  ❌ Failed to fetch ${filename}: ${error.message}`);
    return { url, filename, success: false, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Claude Code Documentation Updater\n');

  // Ensure references directory exists
  if (!fs.existsSync(REFERENCES_DIR)) {
    fs.mkdirSync(REFERENCES_DIR, { recursive: true });
  }

  // Get all Claude Code documentation URLs
  const urls = await getClaudeCodeUrls();
  console.log(`✅ Found ${urls.length} Claude Code documentation pages\n`);

  // Fetch all documentation pages
  console.log('📥 Downloading documentation...');
  const results = [];
  for (const url of urls) {
    const result = await fetchAndSaveDoc(url);
    results.push(result);
    // Small delay to be nice to the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Documentation update complete!`);
  console.log(`   ${successful} files downloaded successfully`);
  if (failed > 0) {
    console.log(`   ${failed} files failed to download`);
  }
  console.log(`\n📁 Documentation saved to: ${REFERENCES_DIR}`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = { getClaudeCodeUrls, fetchAndSaveDoc };
