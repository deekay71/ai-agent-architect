# Inert local catalog fixture

These files test Phase 1 catalog loading. They are authored local samples, not
installed execution skills. `recipe.md` is plain test data; there is no
`SKILL.md`, downloaded tool, executable script, Unity bridge, or release here.
`LicenseRef-Local-Inert-Fixture` is synthetic provenance metadata for this test
package, not evidence of a third-party license.

`catalog.json` pins canonical descriptor digests. `catalog.pin.json` contains the
reviewed manifest digest for this checked-in example. In a real deployment the
expected pin must come from a protected reviewed source; reading a new pin from
an untrusted package does not establish trust.

Hash conventions:

- Manifest and descriptor identity: `digest(parsedJson)` from the contracts module.
- `SkillDescriptor.contentDigest`: `digest(descriptor.resources)`, preserving list order.
- Each resource `contentHash`: SHA-256 of raw file bytes, prefixed with `sha256:`.
- `source.revision`: immutable Git commit SHA or `sha256:` content pin; a moving
  branch name is rejected.

Every resource path is relative to the catalog root, including resources used
by a descriptor stored in a subdirectory. Paths must be portable, without
traversal, absolute forms, URL schemes, backslashes, or symlink components. The
loader checks all declared resource bytes; only explicitly requested resource
text is returned to the caller and recorded as loaded. Script-kind resource
text is never executed.

`discoverSkills` returns metadata only. `resolveSkill` requires an exact skill
ID/version, observed project profile, and available required capabilities bound
to that project's ID. Nonempty compatibility lists require exact matches;
empty lists impose no constraint. Required package versions are exact, with an
observed package-lock digest. Missing observations produce `unknown`; known
incompatibility produces `unavailable`. Candidate, revoked, and superseded
skills cannot be selected. `eligible` means metadata-compatible; it does not
mean certified, PASS, or authorized to dispatch.

Resource loading and binding creation require the current resolution context.
They recheck manifest, descriptor, every resource, and the selected profile,
environment, task class, and required capability identities. Unrelated
capability changes do not invalidate the selection. A binding records only
actually loaded resources and requires its body to have been loaded. A null
`policyReleaseId` is an unreleased provenance draft; this module does not verify
release/evidence refs or create an active policy.

The reader is local foundation code. File checks detect static path attacks and
ordinary drift; they are not the later runtime's OS sandbox against a process
concurrently replacing directories. Production activation still needs a
protected package store and the runtime ownership/permission boundary.
