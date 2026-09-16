# Releasing `@david-sling/wave`

The workflow is `.github/workflows/cli-release.yml`. It runs on a `cli-v*` tag
and on nothing else, so the app and the CLI ship on their own clocks.

## Before the first release, once

None of this can be done by a workflow file, and all of it fails the first
release rather than the setup if it is skipped.

1. **The `@david-sling` scope must exist on npm.** Create it at
   <https://www.npmjs.com/org/create> or by publishing nothing to it — an
   account-level step, under the account that will own the package.
2. **Configure trusted publishing for the package on npm**: the package's
   Settings → Trusted publisher → GitHub Actions, with this repository
   (`david-sling/wave`) and the workflow filename `cli-release.yml`. If you
   set a GitHub *environment* there, add the same `environment:` key to the
   job, or the OIDC exchange is refused.
3. **The first publish must be `--access public`.** A scoped package is
   private by default, and a private publish on a free account is rejected
   outright. The workflow always passes the flag, so this is only a thing to
   know when reading the log.

There is no npm token anywhere in this repository, and there should never be
one. The job proves it is this repository at this tag, and npm issues a
short-lived credential in exchange.

## Each release

1. Bump `version` in `cli/package.json` **and** `VERSION` in
   `cli/src/version.ts`. A test fails if the two disagree — the CLI reads no
   files, not even its own manifest, so the constant is how it knows.
2. Commit, and merge to `main`.
3. Tag the merge commit and push the tag:

   ```
   git tag cli-v0.1.0
   git push origin cli-v0.1.0
   ```

The workflow refuses to go on if the tag and `package.json` disagree, or if
that version is already on npm — both before it builds anything, because a
published version cannot be replaced.

## What ships

`bin/` and `dist/` only, from `files` in `package.json`. No tests, no sources,
no lockfile. The package has no runtime dependencies, so the tarball is this
code and nothing else.
