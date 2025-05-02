import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { generateImage } from './render.js'; // Adjust path if needed

// Resolve paths relative to the script location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..'); // Project root
const themesFilePath = path.join(rootDir, 'src', 'themes.yml'); // Updated path
const themesOutputDir = path.join(rootDir, 'themes');
const themesReadmePath = path.join(themesOutputDir, 'README.md'); // Target themes/README.md
const defaultLogoPath = path.join(rootDir, 'test', 'data', 'logo.png'); // Optional default logo

// Placeholder markers for the themes/README.md
const START_MARKER = '<!-- THEME-GALLERY-START -->';
const END_MARKER = '<!-- THEME-GALLERY-END -->';

// Sample data for banner generation
const sampleData = {
    version: 'v1.2.3', // Or use a dynamic version if preferred
    body: `### Example Features ✨\n*   Generated theme previews.\n*   Updated the Readme.\n\n### Bug Fixes 🐛\n*   Adjusted sample text.`, // Generic body for previews
    repoUrl: 'https://github.com/user/repo', // Generic repo URL
    projectName: 'Theme Preview', // Adjust as needed
    projectDescription: 'Banner Example', // Adjust as needed
    logo: fs.existsSync(defaultLogoPath) ? defaultLogoPath : null, // Use logo if it exists
    debug: false, // Set to true for debug HTML output
    strictStyle: false
};

// Helper function to format theme ID into a title
function formatThemeName(id) {
    if (!id) return '';
    return id.split('_')
             .map(word => word.charAt(0).toUpperCase() + word.slice(1))
             .join(' ');
}

// Function to ensure the themes/README.md exists and has placeholders
function ensureThemesReadme() {
    let content = '';
    if (fs.existsSync(themesReadmePath)) {
        content = fs.readFileSync(themesReadmePath, 'utf8');
    } else {
        console.log(`Creating ${themesReadmePath}...`);
        // Initialize with header and markers
        content = `# Theme Previews\n\n${START_MARKER}\n<!-- Theme previews are generated automatically below -->\n${END_MARKER}\n`;
        fs.writeFileSync(themesReadmePath, content, 'utf8');
        return; // Placeholders are definitely there
    }

    // If file exists, check for markers
    if (!content.includes(START_MARKER) || !content.includes(END_MARKER)) {
        console.log(`Adding placeholder markers to ${themesReadmePath}...`);
        // Add markers at the end if they don't exist or are incomplete
        content += `\n\n${START_MARKER}\n<!-- Theme previews are generated automatically below -->\n${END_MARKER}\n`;
        fs.writeFileSync(themesReadmePath, content, 'utf8');
    }
}

async function generateThemePreviews() { // Renamed function
    try {
        console.log('Ensuring themes/README.md exists and has markers...');
        ensureThemesReadme();

        console.log('Reading themes from:', themesFilePath);
        const themesFileContent = fs.readFileSync(themesFilePath, 'utf8');
        // Filter out the initial comment before parsing YAML
        const themesYaml = themesFileContent.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
        const themes = yaml.load(themesYaml);

        if (!themes || typeof themes !== 'object') {
            throw new Error('Failed to load or parse themes.yml');
        }

        console.log(`Found ${Object.keys(themes).length} themes.`);

        // Ensure output directory exists
        if (!fs.existsSync(themesOutputDir)) {
            console.log('Creating themes output directory:', themesOutputDir);
            fs.mkdirSync(themesOutputDir, { recursive: true });
        } else {
            console.log('Themes output directory already exists:', themesOutputDir)
        }

        const readmeSnippets = [];

        for (const themeName in themes) {
            if (Object.hasOwnProperty.call(themes, themeName)) { // Ensure it's an own property
                console.log(`--- Generating preview for theme: ${themeName} ---`);
                const themeConfig = themes[themeName];
                // Convert theme object back to YAML string for input
                // Ensure keys with null values are handled correctly if necessary
                const themeYamlString = yaml.dump(themeConfig, { skipInvalid: true });
                const outputPath = path.join(themesOutputDir, `${themeName}.png`);

                // Format theme name for display
                const formattedName = formatThemeName(themeName);

                const params = {
                    ...sampleData,
                    themeInput: themeYamlString,
                    outputPath: outputPath,
                    projectName: formattedName
                };

                try {
                    await generateImage(params);
                    console.log(`✅ Successfully generated image for: ${themeName}`);


                    // Generate Markdown snippet using path relative to themes/README.md
                    const relativeImagePath = `./${themeName}.png`; // Keep filename as the ID

                    // Get original theme definition and format as YAML
                    const themeDefinition = themes[themeName];
                    const themeYaml = yaml.dump(themeDefinition);

                    // Combine heading, image, and YAML code block
                    readmeSnippets.push(
                        `## ${formattedName}\n\n` +
                        `![${formattedName} preview](${relativeImagePath})\n\n` +
                        '```yaml\n' +
                        `${themeYaml}` +
                        '```'
                    );
                    console.log(`   Markdown snippet generated for ${formattedName}.`);

                } catch (error) {
                    console.error(`❌ Error generating image for theme "${themeName}":`, error.message); // Log only error message
                    // Optionally skip adding snippet if generation fails
                }
            }
        }

        // Update themes/README.md
        if (readmeSnippets.length > 0) {
            console.log(`\nUpdating ${themesReadmePath}...`);
            let readmeContent = fs.readFileSync(themesReadmePath, 'utf8');
            const galleryContent = readmeSnippets.join('\n\n'); // Add double newline between themes

            const startIndex = readmeContent.indexOf(START_MARKER);
            const endIndex = readmeContent.indexOf(END_MARKER);

            if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
                const contentBefore = readmeContent.substring(0, startIndex + START_MARKER.length);
                const contentAfter = readmeContent.substring(endIndex);

                // Insert the new gallery content between the markers
                readmeContent = `${contentBefore}\n\n${galleryContent}\n\n${contentAfter}`;
                fs.writeFileSync(themesReadmePath, readmeContent, 'utf8');
                console.log(`✅ ${themesReadmePath} updated successfully.`);
            } else {
                console.error(`❌ Could not find theme gallery markers (${START_MARKER} and ${END_MARKER}) in ${themesReadmePath}. Check the file manually.`);
            }
        } else {
            console.log('No theme previews were successfully generated, themes/README.md not updated.');
        }

        console.log('\nTheme preview generation complete.');

    } catch (error) {
        console.error('An error occurred during theme preview generation:', error);
        process.exit(1); // Exit with error code
    }
}

generateThemePreviews(); // Call the renamed function
