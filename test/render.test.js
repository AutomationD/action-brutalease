import { existsSync, unlinkSync, promises as fs } from 'fs';
import { describe, it, afterEach, before } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, 'results');
const outputFile = join(resultsDir, 'test-release.png');
const logoPath = join(__dirname, 'data', 'logo.png');

// process.env.INPUT_BODY = `
// ## What's Changed
// * Update environment variable handling in render.js by @AutomationD in https://github.com/AutomationD/action-brutalease/pull/9
//
//
// **Full Changelog**: https://github.com/AutomationD/action-brutalease/compare/v0.10.4...v0.10.5
//
// `;

// Global test bodies for all tests
const testBodies = [
  {
    name: "header-li-link",
    content: `## What's Changed
* Update environment variable handling in render.js by @AutomationD in https://github.com/AutomationD/action-brutalease/pull/9


**Full Changelog**: https://github.com/AutomationD/action-brutalease/compare/v0.10.4...v0.10.5`
  },
  {
    name: "simple-li",
    content: `## What's Changed
* Improved UX 
* Improved DX
* Fixed a bug`
  },
  {
    name: "test2-medium",
    content: `## What's Changed
* Update environment variable handling in render.js by @AutomationD in https://github.com/AutomationD/action-brutalease/pull/9
* Update environment variable handling in render.js by @AutomationD in https://github.com/AutomationD/action-brutalease/pull/9
* Update environment variable handling in render.js by @AutomationD in https://github.com/AutomationD/action-brutalease/pull/9


**Full Changelog**: https://github.com/AutomationD/action-brutalease/compare/v0.10.4...v0.10.5`
  },
  {
    name: "test3-minimal",
    content: `# Changes
- Just one change`
  },
];

describe('render.js', () => {
  // Ensure results directory exists before tests run
  before(async () => {
    // Create results directory if it doesn't exist
    try {
      await fs.mkdir(resultsDir, { recursive: true });
      console.log(`Created results directory: ${resultsDir}`);
    } catch (err) {
      // Directory might already exist, which is fine
      if (err.code !== 'EEXIST') {
        console.error(`Error creating results directory: ${err.message}`);
      }
    }

    // Clean up any existing files in results directory
    try {
      const files = await fs.readdir(resultsDir);
      for (const file of files) {
        await fs.unlink(join(resultsDir, file));
      }
      console.log(`Cleaned up ${files.length} files from results directory`);
    } catch (err) {
      console.error(`Error cleaning up results directory: ${err.message}`);
    }
  });

  afterEach(() => {
    // Cleanup output file after each test
    if (existsSync(outputFile)) {
      unlinkSync(outputFile);
    }
  });

  it('should generate release badge image and text exactly as expected', async () => {
    // Set test environment variables
    process.env.INPUT_VERSION = 'v1.0.0-test';
    process.env.INPUT_BODY = '# Changes\n- Fix Bugs\n- Add Tests 2\n- Vibecode the rest';
    process.env.INPUT_REPO_URL = 'https://github.com/automationd/action-postrelease';
    process.env.INPUT_PROJECT_NAME = 'Brutalease';
    process.env.INPUT_PROJECT_DESCRIPTION = 'A beautiful neo-brutalist style release badge generator';
    process.env.INPUT_THEME = 'default';
    process.env.INPUT_LOGO = logoPath;
    process.env.INPUT_OUTPUT = outputFile;
    process.env.INPUT_DEBUG = 'true';

    // Define expected content items
    const expectedItems = [
      'Test change 1',
      'Test change 2',
      'Added new feature',
      'Fixed critical bug',
      'v1.0.0-test',
      'Post-Release Badge'
    ];

    // Import the main function from render.js and await its completion
    const { main } = await import('../src/render.js');
    await main();

    // Verify the output file was created
    assert.strictEqual(existsSync(outputFile), true, 'Output file should exist');

    // Verify file size is non-zero
    const stats = await fs.stat(outputFile);
    assert.ok(stats.size > 0, 'Output file should not be empty');

    // If OpenAI API key is available, verify the image content
    if (process.env.OPENAI_API_KEY) {
      console.log('Verifying image content with OpenAI Vision API...');
      const contentVerified = await verifyImageContent(outputFile, expectedItems);
      assert.ok(contentVerified, 'All expected content items should be present in the image');
    } else {
      console.log('Skipping image content verification (no OpenAI API key)');
    }
  });

  it('should scale text properly with sufficient bottom spacing', async () => {
    // Import the generateImage function from render.js
    const { generateImage } = await import('../src/render.js');

    // Common parameters for all tests
    const version = 'v1.0.0';
    const projectName = 'Brutalease';
    const projectDescription = 'Make your releases look brutalist';
    const repoUrl = 'https://github.com/AutomationD/action-brutalease';
    const logo = null;
    const debug = 'true';
    const theme = 'default';


    // Test results storage
    const results = [];

    // Test each body
    for (const [index, testBody] of testBodies.entries()) {
      const testNumber = index + 1;
      console.log(`\n=== TESTING TEXT SCALING ${testNumber}: ${testBody.name} ===\n`);

      const outputPath = join(resultsDir, `scaling-test-${testBody.name}.png`);

      // Add test number to the content
      let testContent = testBody.content;
      // Remove the prefix that adds extra lines
      // if (!testContent.includes("TEST")) {
      //   testContent = `TEST ${testNumber}: ${testBody.name}\n\n${testContent}`;
      // }

      // Generate the image (and HTML file due to debug=true)
      await generateImage(
        version,
        testContent,
        repoUrl,
        outputPath,
        logo,
        debug,
        theme,
        projectName,
        projectDescription
      );

      // HTML file path
      const htmlPath = outputPath.replace(/\.[^.]+$/, '.html');
      console.log(`Generated HTML file: ${htmlPath}`);

      // Check the computed styles
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      // Load the generated HTML file
      await page.goto(`file://${htmlPath}`);

      // Get spacing information
      const spacingInfo = await page.evaluate(() => {
        // Helper function to get element details
        function getElementDetails(selector) {
          const element = document.querySelector(selector);
          if (!element) return null;
          return element.getBoundingClientRect();
        }

        // Get list-box and content elements
        const listBox = getElementDetails('.list-box');

        // Find all content elements
        const contentElements = Array.from(document.querySelectorAll('.list-box h1, .list-box h2, .list-box h3, .list-box p, .list-box ul, .list-box ol'));

        // Find the last element by bottom position
        let lastElement = null;
        let lastElementBottom = 0;
        let lastElementType = '';

        for (const element of contentElements) {
          const rect = element.getBoundingClientRect();
          const bottom = rect.top + rect.height;
          if (bottom > lastElementBottom) {
            lastElementBottom = bottom;
            lastElement = rect;
            lastElementType = element.tagName;
          }
        }

        // Find the last link by bottom position
        const links = Array.from(document.querySelectorAll('.list-box a'));
        let lastLink = null;
        let lastLinkBottom = 0;

        for (const link of links) {
          const rect = link.getBoundingClientRect();
          const bottom = rect.top + rect.height;
          if (bottom > lastLinkBottom) {
            lastLinkBottom = bottom;
            lastLink = rect;
          }
        }

        // Calculate spacing
        const bottomSpacing = lastElement ? (listBox.top + listBox.height) - lastElementBottom : null;
        const linkBottomSpacing = lastLink ? (listBox.top + listBox.height) - lastLinkBottom : null;

        return {
          bottomSpacing,
          linkBottomSpacing,
          lastElementType
        };
      });

      console.log(`Bottom spacing: ${spacingInfo.bottomSpacing}px`);
      console.log(`Last element type: ${spacingInfo.lastElementType}`);

      if (spacingInfo.linkBottomSpacing !== null) {
        console.log(`Link bottom spacing: ${spacingInfo.linkBottomSpacing}px`);
      }

      // Store results
      results.push({
        name: testBody.name,
        bottomSpacing: spacingInfo.bottomSpacing,
        linkBottomSpacing: spacingInfo.linkBottomSpacing
      });

      // Save detailed spacing information to JSON file
      const spacingInfoPath = join(resultsDir, `spacing-info-test${testNumber}.json`);
      await fs.writeFile(
        spacingInfoPath,
        JSON.stringify({
          testName: testBody.name,
          spacingInfo,
          timestamp: new Date().toISOString()
        }, null, 2)
      );
      console.log(`Spacing information saved to: ${spacingInfoPath}`);

      // Cleanup
      await browser.close();

      // Assert sufficient spacing (at least 20px)
      assert.ok(
        spacingInfo.bottomSpacing >= 20,
        `Bottom spacing should be at least 20px, but was ${spacingInfo.bottomSpacing}px for ${testBody.name}`
      );
    }

    // Log results summary
    console.log('\n=== TEXT SCALING TEST RESULTS ===\n');
    console.table(results);

    // Save summary results to JSON file
    const summaryPath = join(resultsDir, 'text-scaling-results.json');
    await fs.writeFile(
      summaryPath,
      JSON.stringify({
        results,
        timestamp: new Date().toISOString()
      }, null, 2)
    );
    console.log(`Test results summary saved to: ${summaryPath}`);

    // We don't need to clean up test files as they're now in the results directory
    // and will be cleaned up before the next test run
  });

  async function verifyImageContent(imagePath, expectedItems) {
    try {
      // Check if OpenAI API key is available
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('OpenAI API key not found. Skipping image content verification.');
        return true;
      }

      // Read the image file as base64
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Prepare the API request
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4-turbo',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What text items can you see in this image? Please list all bullet points and text content you can identify.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 300
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error from OpenAI API:', result);
        return false;
      }

      // Extract the text content from the API response
      const textContent = result.choices[0].message.content;
      console.log('OpenAI Vision API detected text:', textContent);

      // Check if all expected items are in the detected text
      let allItemsFound = true;
      for (const item of expectedItems) {
        if (!textContent.includes(item)) {
          console.error(`Expected item not found in image: "${item}"`);
          allItemsFound = false;
        }
      }

      return allItemsFound;
    } catch (error) {
      console.error('Error verifying image content:', error);
      return false;
    }
  }
});
