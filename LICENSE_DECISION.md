# License Decision

HQBase OSS uses AGPL-3.0-or-later because it is self-hostable network software and hosted derivatives should keep source changes available to their users.

This choice protects openness, not revenue exclusivity. Commercial use of the OSS core is allowed under the AGPL. Future HQBase Pro code may be distributed separately under a commercial source-available license.

Alternatives considered:

- Apache-2.0 for maximum business adoption.
- MIT for maximum permissiveness.
- AGPL-3.0 for keeping hosted derivatives open.
- BSL/FSL/PolyForm-style source-available licensing for stronger commercial control, rejected for the OSS core because those licenses are not open source in the OSI sense.

Open-core policy:

- HQBase OSS remains a useful self-hosted shared inbox.
- Advanced team operations features may be reserved for HQBase Pro.
- Pull requests that overlap with reserved Pro functionality may be declined from the official OSS repository.

See [docs/open-core-boundary.md](docs/open-core-boundary.md).
