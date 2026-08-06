# Security policy

## Supported version

Security fixes are applied to the latest release.

## Reporting

Do not open a public issue containing credentials, resume contents, or personal application data. Report security concerns privately to the repository maintainer.

## Credential handling

CareerTracker stores provider and S3 credentials in the operating system credential manager through the Rust keyring library. Credentials are never returned to the React interface after storage.

## AI data boundary

Only data assembled for an explicit AI action is sent to the selected provider. Review provider retention and privacy settings before use.

## S3 permissions

Use a dedicated access key with only the bucket and object permissions required by CareerTracker. Do not use an administrator credential.

## LaTeX

Review generated LaTeX before compiling it. CareerTracker invokes the configured Tectonic executable directly without shell interpolation, but LaTeX itself is a programmable document format.
