### Suggested Fix for Issue #45

#### Verify `openviber` Package
- Ensure that the `openviber` package is published to npm.
- Verify that the command `npx openviber` works without requiring local installation.

#### Update Documentation
If the package isn’t published:
- Update `docs/getting-started/quick-start.md`
- Update `introduction.md`

#### Installation Steps for Users
Provide clear instructions for first-time users to install the package:
- Include both `pnpm install` and `npm install` as options for installing the package.
- Example commands:
  - For npm: `npm install -g openviber`
  - For pnpm: `pnpm add -g openviber`