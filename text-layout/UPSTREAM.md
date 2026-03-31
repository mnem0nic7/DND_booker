# Upstream

This workspace vendors the published source for `@chenglou/pretext@0.0.3`.

Vendored files live under `src/vendor/pretext/` and were copied from the npm
tarball on 2026-03-31 to keep the local fork pinned to the exact published
package version instead of an arbitrary GitHub branch tip.

Local changes in this fork:

- Added measurement backend registration so Node can supply a canvas context.
- Added a styled-run adapter so DND Booker can measure mixed inline marks.
- Wrapped the fork behind a stable `@dnd-booker/text-layout` API.

When syncing upstream, update the vendored files, keep the upstream license and
changelog copies in this workspace, and re-apply the local patches above.
