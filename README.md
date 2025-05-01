# NEO-BRUTALIST RELEASE BANNER GENERATOR

![Tests](https://github.com/automationd/action-brutalese/actions/workflows/test.yml/badge.svg)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/automationd/action-brutalese)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**MAKE YOUR RELEASES BOLD. UNAPOLOGETIC. MEMORABLE.**

Transform your GitHub releases with striking Neo-Brutalist banners that command attention. This action automatically generates visually powerful, design-forward release banners that showcase your changelog in a distinctive aesthetic.

![Example Banner](./example.png)
## WHY NEO-BRUTALISM?

Neo-Brutalism is characterized by:
- **Bold, high-contrast colors** that demand attention
- **Strong borders and shadows** that create depth and visual interest
- **Raw, honest presentation** that values function and clarity
- **Distinctive visual language** that stands out in a sea of minimalist design

## WHY THIS ACTION?

- **STAND OUT**: Break through the noise with bold, distinctive release banners
- **COMMUNICATE CLEARLY**: Present your changes with uncompromising clarity
- **AUTOMATE DESIGN**: No design skills needed - the action handles everything
- **CONSISTENT BRANDING**: Maintain a cohesive visual identity across all releases
- **CUSTOMIZABLE**: Adapt colors, logos, and styling to match your project's personality

## USAGE

Add this action to your release workflow to automatically generate a Neo-Brutalist banner whenever you publish a new release.

### BASIC EXAMPLE

```yaml
# ...
- name: Generate Banner
  uses: automationd/action-brutalease@v1
  with:
    version: ${{ github.event.release.tag_name }}
    body: ${{ github.event.release.body }}
    repo_url: ${{ github.repository }}
    output: release-banner.png
    project_name: Brutalease
    project_description: Neo-brutalist release banner
    logo: ${{ github.workspace }}/test/data/logo.png
# ...
```

### DOCKER IMAGE

This action uses a pre-built Docker image from GitHub Container Registry (GHCR) for faster execution. The image is automatically built and pushed during the release process, ensuring that each version of the action uses its corresponding Docker image.

- Image: `ghcr.io/automationd/action-brutalease:v1.0.0` (version-specific)
- Each release has its own tag (e.g., `v1.0.0`, `v1.1.0`, etc.)
- The action.yml file is automatically updated during the release process to use the correct version

You can also use the Docker image directly:

```bash
# Replace v1.0.0 with the specific version you want to use
docker pull ghcr.io/automationd/action-brutalease:v1.0.0
```

### VERSION PINNING

When using this action in your workflows, you can pin to a specific version:

```yaml
- name: Generate Banner
  uses: automationd/action-brutalease@v1.0.0  # Pin to specific version
  with:
    # inputs...
```

Or use a major version to automatically get updates within that major version:

```yaml
- name: Generate Banner
  uses: automationd/action-brutalease@v1  # Use latest v1.x.x
  with:
    # inputs...
```

## INPUTS

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `version` | Release version | Yes | - |
| `body` | Release body text (changelog) | Yes | - |
| `repo_url` | Repository URL | Yes | - |
| `project_name` | Project name | No | Repository name |
| `project_description` | Short description of the project | No | - |
| `logo` | Logo URL or path to display in the banner | No | - |
| `theme` | Theme name to use for styling | No | `default` |
| `output` | Output file path | No | `release.png` |
| `debug` | Enable debug mode to save HTML output | No | `false` |
| `strict_style` | If true, will throw an error when fonts or styles are not available | No | `true` |

## OUTPUTS

The action generates a PNG image at the specified output path (defaults to `release.png`).

## ADVANCED USAGE

### EMBEDDING IN RELEASE NOTES

For maximum impact, embed the banner directly in your release notes:

```yaml
  - name: Update release description with image
    env:
      RELEASE_TAG: ${{ github.event.release.tag_name }}
      IMAGE_URL: https://github.com/${{ github.repository }}/releases/download/${{ github.event.release.tag_name }}/release-banner.png
      GH_TOKEN: ${{ github.token }}
    run: |
      # Get current release body
      RELEASE_BODY=$(gh release view "$RELEASE_TAG" --json body -q .body)

      # Create a temporary file with the new release body
      echo -e "![Release Banner]($IMAGE_URL)\n\n$RELEASE_BODY" > new_body.md

      # Update the release with the new body
      gh release edit "$RELEASE_TAG" --notes-file new_body.md
```

### USING IN DOCUMENTATION

Reference your Neo-Brutalist banner in documentation or social media:

```markdown
![Latest Release](https://github.com/your-username/your-repo/releases/download/latest/release-banner.png)
```

### SOCIAL MEDIA SHARING

The generated banners are perfectly sized for sharing on platforms like Twitter, LinkedIn, and Discord to announce your releases.

## CONTRIBUTING

Contributions are welcome! Please feel free to submit a Pull Request.

## LICENSE

This project is licensed under the MIT License - see the LICENSE file for details.

> ![!NOTE]
> This README was written by AI that seems to like Neo Brutalism
