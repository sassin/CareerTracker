# Inputs needed from the user

## Needed now for resume integration

Upload the complete source set for the resume that should become **Current Resume**:

- Main `.tex` file
- `.cls` file
- Any additional `.tex`, `.sty`, image, font-reference, bibliography, or supporting files used by the resume
- A generated PDF of the same resume, if available, so output can be visually compared

Do not upload proprietary font files. If the LaTeX source refers to a commercial/local font, provide the font name only and the implementation will use an installed or redistributable alternative where needed.

## Needed now for cover-letter standardization

Provide one of the following:

1. Existing cover-letter `.tex` and `.cls` files, plus a sample PDF; or
2. A cover-letter PDF whose layout should be reproduced; or
3. A plain-text example and the resume header/contact style to reuse.

## Needed later for optional AI

- Preferred AI provider
- API key, entered inside the application and stored securely

No AI key is needed for manual operation.

## Needed later for S3

- Bucket name
- Region
- Optional prefix, such as `careertracker/`
- Optional endpoint for an S3-compatible provider
- Restricted access credentials that can only read/write the configured bucket or prefix

Do not place keys in source files or GitHub.

## Product decisions already fixed

- Product name: CareerTracker
- Initial platform: Windows desktop
- Framework: Tauri 2 + React + TypeScript + SQLite
- Storage modes: local folder and Amazon S3-compatible object storage
- AI behavior: optional, explicit, editable, and never autonomous
- Visual direction: calm sage, neutral off-white, low-contrast surfaces, minimal dashboard
