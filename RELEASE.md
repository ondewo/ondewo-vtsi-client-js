# Release History

*****************

## Release ONDEWO VTSI Js Client 8.7.2

### Improvements

* [[OND211-2443]](https://ondewo.atlassian.net/browse/OND211-2443) TLS: new `auth/grpcWebEndpoint.js`
  (`buildGrpcWebEndpoint`) builds the gRPC-web endpoint URL for the generated clients per the ONDEWO TLS contract:
  `https://` by default, plaintext `http://` only with `useSecureChannel: false`, which logs a `console.warn` naming
  `host:port`. A bare IPv6 host is bracketed (`::1` becomes `https://[::1]:8443`), a `[...]` host is kept as given, and
  a host carrying a scheme, a path or a port, a port outside 1..65535 or a non-boolean `useSecureChannel` is refused.
* [[OND211-2443]](https://ondewo.atlassian.net/browse/OND211-2443) `grpcCert`, `grpcClientCert` and `grpcClientKey`
  are refused with an error naming the option, never its value: a browser verifies the server against its own trust
  store and presents a client certificate only from its own certificate store, and a private key must never be shipped
  to a browser. Mutual TLS from a browser works with a client certificate installed in the browser / OS certificate
  store, or with the gRPC-web proxy (Envoy) terminating TLS and using mutual TLS upstream.
* [[OND211-2443]](https://ondewo.atlassian.net/browse/OND211-2443) `OfflineTokenProvider` gains `toJSON()` and a Node
  `util.inspect` hook that render the access and refresh tokens as `***REDACTED***` (a token not yet set stays `null`),
  so `JSON.stringify`, `console.log` and `util.inspect` of a provider never print a token.
* [[OND211-2443]](https://ondewo.atlassian.net/browse/OND211-2443) README: new section "TLS, mutual TLS and
  certificates" (modes, the Envoy mutual-TLS setup, why gRPC-web has no keepalive / backoff channel options, and the
  Node.js SDK for mutual TLS from code with PEM files).
* [[OND211-2443]](https://ondewo.atlassian.net/browse/OND211-2443) The published package now contains `auth/` (the
  Keycloak `OfflineTokenProvider` and the new `grpcWebEndpoint`, without their specs): `create_npm_package` did not
  copy it before, so earlier versions shipped no auth helper at all. Import it as
  `require('@ondewo/ondewo-vtsi-client-js/auth/offlineTokenProvider')`; it is Node-only (it uses `undici`).

### Build

* Rebuilt with [ondewo-proto-compiler 5.15.2](https://github.com/ondewo/ondewo-proto-compiler/releases/tag/5.15.2)
  (previous release: 5.14.0) against the unchanged API tag
  [8.7.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.7.0). No message or service changed; the embedded
  `google-protobuf` 4.x runtime is refreshed.

### Tests and release notes

* `auth/grpcWebEndpoint.spec.js` and new `auth/offlineTokenProvider.spec.js` cases cover the endpoint builder and the
  token redaction under the 100% coverage gate.
* `tests/releaseNotes.spec.js` pins the Makefile's release-notes slice, every heading's spelling, one `*****`
  separator per section and a non-empty slice for the released version.
* RELEASE.md: added the 1.0.0 section (a tag without a release) from the tag's git history.

*****************

## Release ONDEWO VTSI Js Client 8.7.1

### Bug Fixes

* **The 8.7.0 bundle could not deserialize a single string field.** `api/ondewo_vtsi_api.js` is a
  self-contained browser bundle: it embeds the `google-protobuf` runtime that was installed when it
  was built. The proto compiler now emits `reader.readStringRequireUtf8()` (2142 call sites, zero in
  8.6.0), and that method does not exist in `google-protobuf` 3.21.4 -- which `src/package.json`
  pinned as `^3.21.4`, a range that can never resolve to the 4.x line where it was added. Any
  `deserializeBinary` on a message with a string field threw
  `TypeError: reader.readStringRequireUtf8 is not a function`.
* The runtime pin is `^4.0.2` now and the bundle is rebuilt against it. Nothing else changed: the
  generated message code is the same, and 8.7.0's proto content is unaffected.
* **What made this shippable is that the defect lives only in the ARTEFACT.** The `.proto` sources,
  the generated `_pb.js` and every source-level check were correct; only the bundle's embedded
  runtime was wrong. `tests/asteriskVersion.spec.js` evaluates the shipped bundle in a `vm` and
  round-trips a real message, which is the only check in this repository that could see it.

*****************

## Release ONDEWO VTSI Js Client 8.7.0

### Improvements

* Built against [ondewo-vtsi-api 8.7.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.7.0),
  which re-vendors [ondewo-nlu-api 7.1.0](https://github.com/ondewo/ondewo-nlu-api/releases/tag/7.1.0)
  (was 7.0.0) and [ondewo-s2t-api 7.5.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/7.5.0)
  (was 7.4.0). `ondewo/vtsi/**` is unchanged in that API release, so the VTSI service surface is
  identical and this client stays wire-compatible with 8.6.0.
* What the re-exported surface gains: `speech-to-text.proto` adds the `VadMethod` and `TsdMethod`
  enums and the `Silero` and `WespeakerTsd` messages (voice-activity and turn-shift detection
  configuration); `rag.proto` adds `RagCrawlerIncrementalConfig`.
* `RagCrawlerFilters` re-declares four fields as `[deprecated = true]` -- `allow_internal_links`,
  `allow_social_media_links`, `allowed_paths` and `disallowed_paths`. Every field number, name and
  type is preserved and no number is reused, so nothing on the wire changes; the two path lists are
  superseded by `allowed_regex` / `disallowed_regex`.

*****************

## Release ONDEWO VTSI Js Client 8.6.0

### Improvements

* Tracking API Version [8.6.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.6.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )

*****************

## Release ONDEWO VTSI Js Client 8.5.0

### Improvements

* Tracking API Version [8.5.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.5.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )

*****************

## Release ONDEWO VTSI Js Client 8.4.0

### Improvements

* Tracking API Version [8.4.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.4.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )

*****************

## Release ONDEWO VTSI Js Client 8.3.0

### Improvements

* Tracking API Version [8.3.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.3.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )
* Added the generated client for `ondewo/vtsi/logs.proto` (container log capture and streaming)
* Added the optional field `asterisk_version` to `AsteriskConfigs`. It carries the docker image tag of the
  ONDEWO Asterisk image a VTSI project should start (e.g. `alpine-3.18-18.20.2`), so the Asterisk version is a
  per-project setting instead of a server-wide one. Leaving it unset keeps the server default
  (`ONDEWO_VTSI_ASTERISK_IMAGE_TAG`); an empty string is rejected
* The field has **explicit presence**: use `hasAsteriskVersion()` / `clearAsteriskVersion()`, because
  `getAsteriskVersion()` returns `''` both for "unset" and for "explicitly empty" and cannot tell them apart

*****************

## Release ONDEWO VTSI Js Client 8.2.0

### Improvements

* Tracking API Version [8.2.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.2.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )

*****************

## Release ONDEWO VTSI Js Client 8.1.0

### Improvements

* Tracking API Version [8.1.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.1.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )

*****************

## Release ONDEWO VTSI Js Client 8.0.0

### Improvements

* Tracking API Version [8.0.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/8.0.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )

*****************

## Release ONDEWO VTSI Js Client 5.0.0

### Improvements

* Tracking API Version [5.0.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/5.0.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )

*****************

## Release ONDEWO VTSI Js Client 4.0.0

### Improvements

* Tracking API Version [4.0.0](https://github.com/ondewo/ondewo-vtsi-api/releases/tag/4.0.0) ( [Documentation](https://ondewo.github.io/ondewo-vtsi-api/) )
* Track version 4.0.0 of [ONDEWO VTSI API](https://github.com/ondewo/ondewo-vtsi-api/releases/4.0.0)
* [[OND211-2039]](https://ondewo.atlassian.net/browse/OND211-2039) - Implemented automated release for GitHub and NPM
* [[OND211-2039]](https://ondewo.atlassian.net/browse/OND211-2039) - Added pre-commit hooks and adjusted files to them

*****************

## Release ONDEWO VTSI Js Client 1.0.0

### Improvements

* Initial VTSI Js client, built on ONDEWO VTSI API 1.0.0
* Browser example adapted to the gRPC-web setter style; call ids are generated on the client (uuid)
* Example settings and URLs loaded from a config file requested from a configurable server (template provided)

*****************
