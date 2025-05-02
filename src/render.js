import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import Handlebars from "handlebars";
import { marked } from 'marked';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure marked to sanitize output and not add unnecessary paragraphs
marked.setOptions({
  headerIds: false,
  mangle: false
});

// Define default theme values directly
const defaultTheme = {
  bgOne: '#009DFF',
  bgTwo: '#ffffff',
  bgThree: '#f5f5f5',
  accentOne: '#ffac00',
  accentTwo: '#FFE3D3',
  accentThree: '#888',
  text: '#000000',
  shadowColor: '#000000', // Solid black default shadow
  borderColor: '#000000', // Solid black default border
  fontFamily: 'Roboto'
};

// Refactor generateImage to accept individual parameters directly
async function generateImage(version, body, repoUrl, outputPath, logo = null, debug = false, themeInput = '', projectName = '', projectDescription = '', strictStyle = false) {
  let browser = null;
  try {
    // Parse theme input and merge with defaults using the new function
    const theme = parseAndMergeTheme(themeInput);

    browser = await chromium.launch({ headless: true });

    // Log the arguments directly
    console.log('Starting generateImage with arguments:', { version, body, repoUrl, outputPath, logo, debug, themeInput, projectName, projectDescription, strictStyle });

    // Ensure body is a string before attempting replace
    const bodyString = typeof body === 'string' ? body : '';
    console.log('Release body content including newline characters:');
    console.log(bodyString.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));

    // Process markdown to shorten links before rendering and line estimation
    const processedBody = shortenMarkdownLinks(bodyString);

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1000, height: 500 });

    const templatePath = join(__dirname, 'templates', 'default.html.hbs');
    console.log('Template path:', templatePath);

    const templateSource = await fs.readFile(templatePath, 'utf8');
    console.log('Template content length:', templateSource.length);
    console.log('Template first 100 chars:', templateSource.substring(0, 100));
    console.log('Template includes new structure:', templateSource.includes('data-line-count="{{lineCount}}"'));
    console.log('Template includes content class:', templateSource.includes('class="content-box {{contentClass}}"'));
    const template = Handlebars.compile(templateSource);

    // Calculate line count before rendering
    const lineInfo = estimateLineCount(processedBody);
    console.log('Estimated line count:', lineInfo);

    // Calculate font sizes based on content density
    const fontSizes = calculateFontSizes(lineInfo.count);
    console.log('Calculated font sizes:', fontSizes);

    let description = marked(processedBody);
    description = insertLineBreaksForSubItems(description);
    const logoBase64 = logo ? await getBase64Logo(logo) : null;
    const repoName = getRepoName(repoUrl);

    // Determine Project Name
    const finalProjectName = projectName || getRepoName(repoUrl);

    // Get the theme configuration
    const themeConfig = theme;

    // Calculate contrast text color for the tag
    const tagTextColor = getContrastTextColor(themeConfig.accentOne);

    const templateData = {
      version,
      description,
      repoUrl,
      repoName,
      projectName: finalProjectName, // Use determined project name
      projectDescription,
      logo: logoBase64,
      theme: themeConfig, // Pass the theme object directly
      isImage: Boolean(outputPath),
      // Add line count and content class to template data
      lineCount: lineInfo.count,
      contentClass: lineInfo.contentClass,
      // Add font size variables
      fontSizes: fontSizes,
      tagTextColor: tagTextColor // Pass calculated tag text color
    };

    console.log('Template data:', templateData);
    const html = template(templateData);
    await page.setContent(html);
    console.log('Template rendered');

    // Check if the specified font is available
    const fontAvailable = await checkFontAvailability(page, themeConfig.fontFamily);
    if (!fontAvailable) {
      const errorMessage = `Error: The specified font '${themeConfig.fontFamily}' is not available.`;
      console.error(errorMessage);

      // If strict style is enabled, throw an error
      if (strictStyle === true || String(strictStyle).toLowerCase() === 'true') { // Handle boolean or string 'true'
        await browser.close();
        throw new Error(errorMessage);
      } else {
        console.warn(`Warning: Continuing with fallback fonts because STRICT_STYLE is not enabled.`);
      }
    } else {
      console.log(`Font '${themeConfig.fontFamily}' is available and will be used.`);
    }

    if (debug === true || String(debug).toLowerCase() === 'true') {
      const htmlPath = outputPath.replace(/\.[^.]+$/, '.html');
      await fs.writeFile(htmlPath, html);
      console.log('Debug HTML saved to:', htmlPath);
    }

    // Ensure outputPath is provided before taking screenshot
    if (outputPath) {
      console.log('Taking screenshot to:', outputPath);
      await page.screenshot({ path: outputPath });
      console.log('Screenshot taken');
    } else {
      console.warn('Warning: No outputPath provided, skipping screenshot.')
    }

    await browser.close();
    console.log('Browser closed');
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('Error generating image:', error);
    process.exit(1);
  }
}

// New function to parse theme input and merge with defaults
function parseAndMergeTheme(themeInput) {
  let userTheme = {};
  if (themeInput && typeof themeInput === 'string' && themeInput.trim() !== '') {
    try {
      const parsedTheme = yaml.load(themeInput);
      if (typeof parsedTheme === 'object' && parsedTheme !== null) {
        userTheme = parsedTheme;
        console.log("Parsed user theme:", userTheme);
      } else {
        console.warn("Theme input was provided but is not valid YAML object. Using default theme.");
      }
    } catch (e) {
      console.warn(`Failed to parse theme YAML: ${e.message}. Using default theme.`);
    }
  } else {
    console.log("No theme input provided or input is empty. Using default theme.");
  }

  // Merge user theme with default theme
  const theme = { ...defaultTheme, ...userTheme };
  console.log("Final merged theme:", theme);
  return theme;
}

// Function to estimate line count from markdown
function estimateLineCount(markdown) {
  console.log('\n========== LINE COUNT DEBUG ==========');
  console.log('Raw markdown input:', JSON.stringify(markdown));
  console.log('Raw markdown input length:', markdown.length);
  console.log('Raw markdown input type:', typeof markdown);

  // Check for null or undefined input
  if (!markdown) {
    console.log('WARNING: Markdown input is null or undefined!');
    return { count: 0, contentClass: 'sparse-content' };
  }

  // Enhanced handling for double-escaped newlines (\\n) that might come from test environment
  let processedMarkdown = markdown;

  // First check: Look for literal '\n' sequences (backslash followed by 'n')
  if (processedMarkdown.includes('\\n')) {
    console.log('Detected escaped newlines (\\n), replacing with actual newlines');
    processedMarkdown = processedMarkdown.replace(/\\n/g, '\n');
  }

  // Second check: Look for escaped backslashes followed by 'n' (\\n becomes \n)
  if (processedMarkdown.includes('\\\\n')) {
    console.log('Detected double-escaped newlines (\\\\n), replacing with actual newlines');
    processedMarkdown = processedMarkdown.replace(/\\\\n/g, '\n');
  }

  // Normalize newlines to \n (handles GitHub Actions event.body format)
  const normalizedMarkdown = processedMarkdown.replace(/\r\n/g, '\n');
  console.log('Normalized markdown:', JSON.stringify(normalizedMarkdown));
  console.log('Normalized markdown length:', normalizedMarkdown.length);

  // Split by newlines to get basic line count
  const lines = normalizedMarkdown.split('\n');
  console.log('Line count calculation - raw lines:', lines.length);

  // Log each line with its index, length and hex representation for detailed debugging
  console.log('\n--- Detailed line analysis ---');
  lines.forEach((line, index) => {
    // Convert to hex to see any hidden characters
    const hexRepresentation = Array.from(line).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
    console.log(`Line ${index}: [${line.length}] "${line}" | HEX: ${hexRepresentation}`);
  });

  // Count headings (they take up more vertical space)
  const headingCount = (normalizedMarkdown.match(/^#{1,6}\s+/gm) || []).length;
  console.log('\n--- Content structure analysis ---');
  console.log('Heading count:', headingCount);

  // Count list items
  const listItemCount = (normalizedMarkdown.match(/^(\s*[-*+]|\s*\d+\.)\s+/gm) || []).length;
  console.log('List item count:', listItemCount);

  // Calculate "effective" line count with weighting
  const baseLineCount = lines.length;
  // Each heading adds 0.5 to effective line count (more vertical space)
  const headingWeight = headingCount * 0.5;
  // Each list item adds 0.3 to effective line count
  const listWeight = listItemCount * 0.3;

  // Calculate final line count with additional padding for rendering
  const estimatedLines = Math.ceil(baseLineCount + headingWeight + listWeight);
  console.log('\n--- Final calculation ---');
  console.log('Base line count:', baseLineCount);
  console.log('Heading weight:', headingWeight);
  console.log('List weight:', listWeight);
  console.log('Final estimated line count:', estimatedLines);
  console.log('========== END LINE COUNT DEBUG ==========\n');

  // Different content density classes based on line count
  let contentClass = 'sparse-content';
  if (estimatedLines > 40) {
    contentClass = 'dense-content';
  } else if (estimatedLines > 20) {
    contentClass = 'medium-content';
  }

  return {
    count: estimatedLines,
    contentClass
  };
}

// New function to calculate font sizes based on content density
function calculateFontSizes(lineCount) {
  // Fixed viewport dimensions (from the browser settings)
  const viewportWidth = 1000;
  const viewportHeight = 500;
  const viewportDimension = Math.min(viewportWidth, viewportHeight);

  // Font size limits
  const maxFontSize = 36;
  const minFontSize = 4;

  // Parameters for the formula approach
  const baseSize = viewportDimension * 0.029;
  const maxMultiplier = 3.2;  // reduced max multiplier
  const minMultiplier = 0.6;  // reduced min multiplier for long content
  const decayRate = 0.12;    // more aggressive scaling for content density

  // Calculate content adjustment factor
  const contentAdjustment = minMultiplier + (maxMultiplier - minMultiplier) * Math.exp(-decayRate * lineCount);

  // Apply scale factor to the base size
  const calculatedSize = baseSize * contentAdjustment;

  // Adapt font size to available space based on line count
  const adaptiveSize = Math.max(
    minFontSize,
    Math.min(maxFontSize, calculatedSize)
  );

  // Final base font size with constraints
  const baseFontSize = Math.max(
    minFontSize,
    Math.min(maxFontSize, adaptiveSize)
  );

  // Helper function for smooth value transitions based on line count
  function scaleValue(min, max, minLines, maxLines) {
    const limitedLineCount = Math.max(minLines, Math.min(maxLines, lineCount));
    const ratio = (limitedLineCount - minLines) / (maxLines - minLines);
    return max - ratio * (max - min);
  }

  // Calculate values for different elements using the same formulas as frontend
  const titleRatio = scaleValue(1.5, 1.7, 5, 30); // reduced title ratio
  const titleFontSize = Math.max(16, baseFontSize * titleRatio); // reduced minimum title size

  const lineHeightValue = scaleValue(1.4, 1.15, 5, 60); // adjusted line height
  const paragraphSpacing = scaleValue(1.0, 0.3, 5, 60); // adjusted paragraph spacing

  const headingFactor = scaleValue(1.6, 1.4, 5, 30); // reduced heading factor
  const headingMargin = scaleValue(0.7, 0.25, 5, 60); // adjusted heading margin

  const subheadingFactor = scaleValue(1.4, 1.2, 5, 30); // reduced subheading factor
  const subheadingMargin = scaleValue(0.6, 0.15, 5, 60); // adjusted subheading margin

  const listItemMargin = scaleValue(0.35, 0.06, 5, 60); // adjusted list item margin
  const listMargin = scaleValue(0.8, 0.25, 5, 60); // adjusted list margin
  const listPadding = scaleValue(1.5, 0.7, 5, 60); // adjusted list padding

  // Return an object with all calculated values
  return {
    baseFontSize,
    contentAdjustment,
    titleFontSize,
    lineHeight: lineHeightValue.toFixed(2), // ensure lineHeight is formatted properly
    paragraphSpacing,
    headingFontSize: baseFontSize * headingFactor,
    headingMargin,
    subheadingFontSize: baseFontSize * subheadingFactor,
    subheadingMargin,
    listItemFontSize: baseFontSize * 0.95, // slightly smaller list items
    listItemMargin,
    listMargin,
    listPadding
  };
}

async function getBase64Logo(logoPath) {
  try {
    if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
      const response = await fetch(logoPath);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || 'image/png';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } else {
      const buffer = await fs.readFile(logoPath);
      const mimeType = logoPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
  } catch (error) {
    console.error('Error loading logo:', error);
    return null;
  }
}

function getRepoName(repoUrl) {
  try {
    // Handle both HTTPS and SSH URLs
    const url = repoUrl.trim();
    if (url.startsWith('https://github.com/')) {
      const parts = url.replace('https://github.com/', '').split('/');
      return `${parts[0]}/${parts[1]}`;
    } else if (url.startsWith('git@github.com:')) {
      const parts = url.replace('git@github.com:', '').split('/');
      return `${parts[0]}/${parts[1].replace('.git', '')}`;
    }
    return repoUrl; // Return original if format not recognized
  } catch (error) {
    console.error('Error parsing repo URL:', error);
    return repoUrl;
  }
}

// Insert this helper after your markdown-to-HTML conversion
function insertLineBreaksForSubItems(html) {
  // Add <br> before lines like "1.1. ..." or "1.2. ..." inside <li>...</li>
  return html.replace(/(<li>[^<]*)\n\s*(\d+\.\d+\..*)/g, '$1<br>$2');
}

// Function to shorten links in markdown content
function shortenMarkdownLinks(markdown) {
  if (!markdown) return markdown;

  let processedMarkdown = markdown;

  // Case 1: Replace markdown links where the link text is a URL with [...]
  // [http://example.com](http://example.com) -> [...](http://example.com)
  processedMarkdown = processedMarkdown.replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g, '[...]($2)');

  // Case 2: Replace plain URLs that are not in markdown format
  // http://example.com -> [...](http://example.com)
  processedMarkdown = processedMarkdown.replace(/(^|\s)(https?:\/\/[^\s]+)(\s|$)/g, '$1[...]($2)$3');

  // Case 3: Replace markdown links where the link text is very long (>30 chars)
  // [Very long link text that takes up too much space](http://example.com) -> [...](http://example.com)
  processedMarkdown = processedMarkdown.replace(/\[([^\]]{30,})\]\((https?:\/\/[^)]+)\)/g, '[...]($2)');

  // Case 4: Replace links that have the same text as URL but without http/https prefix
  // [example.com](https://example.com) -> [...](https://example.com)
  processedMarkdown = processedMarkdown.replace(/\[([^\/:\]]+\.[^\/:\]]+[^\]]*)\]\((https?:\/\/\1[^)]*)\)/g, '[...]($2)');

  return processedMarkdown;
}

// Function to check if a font is available in the browser
async function checkFontAvailability(page, fontFamily) {
  console.log(`Checking availability of font: ${fontFamily}`);

  // Wait for fonts to load
  await page.waitForFunction(() => document.fonts.ready);

  // Execute script in the browser context to check if the font is available
  const isFontAvailable = await page.evaluate(async (font) => {
    // Use the FontFace API to check if the font is available
    try {
      // Check if the font is loaded using the document.fonts API
      const fontLoaded = await document.fonts.check(`1em '${font}'`);

      if (fontLoaded) {
        return {
          isAvailable: true,
          method: 'document.fonts.check'
        };
      }

      // Fallback method: Create a test element
      const testElement = document.createElement('span');
      testElement.style.fontFamily = `'${font}', 'invalid-font-name'`;
      testElement.style.fontSize = '72px';
      testElement.innerHTML = 'Test Font';

      // Add the element to the DOM
      document.body.appendChild(testElement);

      // Get the width with the test font
      const testWidth = testElement.offsetWidth;

      // Change to a known fallback font
      testElement.style.fontFamily = 'invalid-font-name';

      // Get the width with the fallback font
      const fallbackWidth = testElement.offsetWidth;

      // Clean up
      document.body.removeChild(testElement);

      // If widths are different, the font is likely available
      const isAvailable = testWidth !== fallbackWidth;

      return {
        isAvailable,
        method: 'width comparison',
        testWidth,
        fallbackWidth
      };
    } catch (error) {
      return {
        isAvailable: false,
        error: error.message
      };
    }
  }, fontFamily);

  console.log('Font availability check result:', isFontAvailable);

  return isFontAvailable.isAvailable;
}

// Main function to run when the script is executed directly
async function main() {
  try {
    // Get environment variables from GitHub Actions
    const version = process.env.INPUT_VERSION;
    const body = process.env.INPUT_BODY;
    const repoUrl = process.env.INPUT_REPO_URL;
    const outputPath = process.env.INPUT_OUTPUT;
    const logo = process.env.INPUT_LOGO || null;
    const debug = process.env.INPUT_DEBUG;
    const themeInput = process.env.INPUT_THEME;
    const projectName = process.env.INPUT_PROJECT_NAME || getRepoName(repoUrl);
    const projectDescription = process.env.INPUT_PROJECT_DESCRIPTION;
    const strictStyle = process.env.INPUT_STRICT_STYLE;

    console.log('Starting with parameters:', {
      version,
      body: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
      repoUrl,
      outputPath,
      logo,
      debug,
      themeInput,
      projectName,
      projectDescription,
      strictStyle
    });

    // Generate the image
    await generateImage(
      version,
      body,
      repoUrl,
      outputPath,
      logo,
      debug,
      themeInput,
      projectName,
      projectDescription,
      strictStyle
    );

    console.log('Image generation complete!');
  } catch (error) {
    console.error('Error generating image:', error);
    process.exit(1);
  }
}

// Export the new function and the main generation function
export { parseAndMergeTheme, generateImage };

// Run the main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// --- Contrast Calculation Helpers ---

/**
 * Converts a HEX color value to RGB.
 * Source: https://stackoverflow.com/a/5624139/3299741
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Calculates the relative luminance of an RGB color.
 * Formula: https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getLuminance(rgb) {
  const a = [rgb.r, rgb.g, rgb.b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Calculates the contrast ratio between two luminances.
 * Formula: https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function getContrastRatio(lum1, lum2) {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Determines the best contrast text color (black or white) for a given background color.
 * @param {string} backgroundColorHex - Background color in HEX format (e.g., '#RRGGBB').
 * @returns {string} '#000000' or '#FFFFFF'
 */
function getContrastTextColor(backgroundColorHex) {
  const backgroundRgb = hexToRgb(backgroundColorHex);
  if (!backgroundRgb) {
    console.warn(`Invalid background color format: ${backgroundColorHex}. Defaulting to black text.`);
    return '#000000'; // Fallback for invalid hex
  }
  const backgroundLuminance = getLuminance(backgroundRgb);

  // Luminance of white and black
  const whiteLuminance = 1;
  const blackLuminance = 0;

  // Contrast ratio with white and black
  const contrastWithWhite = getContrastRatio(backgroundLuminance, whiteLuminance);
  const contrastWithBlack = getContrastRatio(backgroundLuminance, blackLuminance);

  // Return the color (black or white) that provides better contrast
  return contrastWithWhite > contrastWithBlack ? '#FFFFFF' : '#000000';
}

// --- End Contrast Calculation Helpers ---
