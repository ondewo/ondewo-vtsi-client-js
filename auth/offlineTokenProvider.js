// Copyright 2021-2026 ONDEWO GmbH
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// D18 headless-SDK auth helper (keycloak-migration-plan §7.8 + D18).
//
// One-time ROPC login (grant_type=password, scope=offline_access) against the PUBLIC SDK client
// `ondewo-nlu-cai-sdk-public` (no client_secret -- Q1), then a bounded background loop that refreshes
// the short-lived access token from the offline refresh token before it expires. The current access
// token is exposed for an `Authorization: Bearer <token>` gRPC metadata header. The refresh loop stops
// after `tokenExpirationInS` (if given) has elapsed since login.

'use strict';

/**
 * The minimal shape of an HTTP response consumed by {@link postTokenRequest}: a `Fetch`-like result
 * exposing the 2xx flag, the numeric status, and a lazy text-body reader. Deliberately narrower than
 * the DOM `Response` so any `fetch`-compatible implementation (or a test stub) satisfies it.
 *
 * @typedef {object} FetchResponse
 * @property {boolean} ok
 *   `true` when the HTTP status is in the 2xx range.
 * @property {number} status
 *   The numeric HTTP status code.
 * @property {() => Promise<string>} text
 *   Resolves to the raw response body as a string.
 */

/**
 * A `fetch`-compatible function used to talk to the Keycloak token endpoint. Injectable so tests can
 * supply a stub with no network access; defaults to `globalThis.fetch`.
 *
 * @typedef {(url: string, init: object) => Promise<FetchResponse>} FetchImpl
 */

/**
 * The parsed JSON body of a successful Keycloak OIDC token response. Only the fields this helper reads
 * are modelled; Keycloak returns additional fields (e.g. `token_type`, `scope`) that are ignored.
 *
 * @typedef {object} TokenResponse
 * @property {string} access_token
 *   The short-lived bearer access token. Always present (validated by {@link postTokenRequest}).
 * @property {string} [refresh_token]
 *   The offline refresh token. Present on the initial login and whenever Keycloak rotates it.
 * @property {number} [expires_in]
 *   The access token's lifetime in seconds, used to schedule the next background refresh.
 */

/**
 * The options accepted by the {@link OfflineTokenProvider} constructor: the Keycloak coordinates plus
 * optional bounded-lifetime and dependency-injection seams.
 *
 * @typedef {object} OfflineTokenProviderOptions
 * @property {string} keycloakUrl
 *   The Keycloak base URL (a trailing slash and an optional baked-in `/auth` path are tolerated).
 * @property {string} realm
 *   The Keycloak realm whose token endpoint is targeted.
 * @property {string} clientId
 *   The PUBLIC SDK client id (e.g. `ondewo-nlu-cai-sdk-public`); no client secret is sent.
 * @property {number} [tokenExpirationInS]
 *   Optional bound (seconds since login) after which the background refresh loop stops.
 * @property {FetchImpl} [fetchImpl]
 *   Optional `fetch` override; defaults to `globalThis.fetch`.
 * @property {() => number} [nowInMs]
 *   Optional clock returning epoch milliseconds; defaults to `Date.now`. Injectable for tests.
 */

/**
 * The options accepted by {@link login}: every {@link OfflineTokenProviderOptions} field plus the ROPC
 * credentials.
 *
 * @typedef {OfflineTokenProviderOptions & { username: string, password: string }} LoginOptions
 */

/**
 * Seconds of head-room subtracted from a token's `expires_in` so the refresh fires before the access
 * token actually lapses (covers clock skew + the round-trip to Keycloak).
 *
 * @type {number}
 */
const REFRESH_SKEW_IN_S = 30;

/**
 * Lower bound for the scheduled refresh delay so a tiny/zero `expires_in` cannot spin a hot loop.
 *
 * @type {number}
 */
const MIN_REFRESH_DELAY_IN_S = 1;

/** Error raised on any token-endpoint or token-shape failure. */
class TokenError extends Error {
	/**
	 * @param {string} message
	 *   A human-readable description of the token-endpoint or token-shape failure.
	 */
	constructor(message) {
		super(message);
		this.name = 'TokenError';
	}
}

/**
 * Build the OIDC token endpoint URL for a realm, tolerating a trailing slash on `keycloakUrl` and an
 * optional `/auth` relative path already baked into it.
 *
 * @param {string} keycloakUrl
 *   The Keycloak base URL (any trailing slashes are stripped before composing the path).
 * @param {string} realm
 *   The realm name; URL-encoded into the endpoint path.
 * @returns {string}
 *   The fully-qualified `…/realms/<realm>/protocol/openid-connect/token` URL.
 */
function buildTokenEndpoint(keycloakUrl, realm) {
	const base = keycloakUrl.replace(/\/+$/, '');
	return `${base}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`;
}

/**
 * POST an `application/x-www-form-urlencoded` body to the token endpoint and return the parsed JSON.
 * Raises TokenError on a non-2xx response or unparseable / access_token-less body.
 *
 * @param {string} tokenEndpoint
 *   The realm token endpoint URL produced by {@link buildTokenEndpoint}.
 * @param {Record<string, string>} params
 *   The form fields (e.g. `grant_type`, `client_id`, credentials) to URL-encode into the body.
 * @param {FetchImpl} fetchImpl
 *   The `fetch`-compatible function used to perform the request.
 * @returns {Promise<TokenResponse>}
 *   The parsed token response, guaranteed to carry a non-empty `access_token`.
 * @throws {TokenError}
 *   On a non-2xx status, a non-JSON body, or a body missing a string `access_token`.
 */
async function postTokenRequest(tokenEndpoint, params, fetchImpl) {
	const body = new URLSearchParams(params).toString();
	const response = await fetchImpl(tokenEndpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body
	});
	const text = await response.text();
	if (!response.ok) {
		throw new TokenError(`Keycloak token endpoint returned HTTP ${response.status}: ${text}`);
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new TokenError(`Keycloak token endpoint returned a non-JSON body: ${text}`);
	}
	if (typeof parsed.access_token !== 'string' || parsed.access_token.length === 0) {
		throw new TokenError('Keycloak token response did not contain an access_token');
	}
	return parsed;
}

/**
 * A live access-token holder backed by a bounded auto-refresh loop. Obtain one from {@link login};
 * read {@link OfflineTokenProvider#getAuthorizationHeader} for the gRPC `Authorization` metadata and
 * call {@link OfflineTokenProvider#stop} when done.
 */
class OfflineTokenProvider {
	/**
	 * @param {OfflineTokenProviderOptions} options
	 *   The Keycloak coordinates plus optional bounded-lifetime and dependency-injection seams.
	 */
	constructor(options) {
		/**
		 * The realm token endpoint URL, composed once at construction.
		 *
		 * @type {string}
		 */
		this.tokenEndpoint = buildTokenEndpoint(options.keycloakUrl, options.realm);
		/**
		 * The PUBLIC SDK client id sent on every token request.
		 *
		 * @type {string}
		 */
		this.clientId = options.clientId;
		/**
		 * Optional bound (seconds since login) after which the refresh loop stops; `undefined` = unbounded.
		 *
		 * @type {number | undefined}
		 */
		this.tokenExpirationInS = options.tokenExpirationInS;
		/**
		 * The `fetch`-compatible function used for token requests.
		 *
		 * @type {FetchImpl}
		 */
		this.fetchImpl = options.fetchImpl !== undefined ? options.fetchImpl : globalThis.fetch;
		/**
		 * The clock returning epoch milliseconds, used to evaluate the bounded deadline.
		 *
		 * @type {() => number}
		 */
		this.nowInMs = options.nowInMs !== undefined ? options.nowInMs : Date.now;
		/**
		 * The current access token, or `null` before bootstrap / after the bounded loop lapses.
		 *
		 * @type {string | null}
		 */
		this.accessToken = null;
		/**
		 * The current offline refresh token, or `null` before bootstrap.
		 *
		 * @type {string | null}
		 */
		this.refreshToken = null;
		/**
		 * The armed refresh timer, or `null` when none is pending.
		 *
		 * @type {ReturnType<typeof setTimeout> | null}
		 */
		this.timer = null;
		/**
		 * Whether {@link OfflineTokenProvider#stop} has been called; gates all further refreshes.
		 *
		 * @type {boolean}
		 */
		this.stopped = false;
		/**
		 * The epoch-millisecond instant at which the bounded loop must stop, or `null` when unbounded.
		 *
		 * @type {number | null}
		 */
		this.deadlineInMs = null;
		/**
		 * The optional background-refresh error callback registered via {@link OfflineTokenProvider#onRefreshError}.
		 *
		 * @type {((error: unknown) => void) | null}
		 */
		this.onRefreshErrorHandler = null;
	}

	/**
	 * Perform the one-time ROPC login and arm the first refresh. Awaited by {@link login}.
	 *
	 * @param {string} username
	 *   The technical-user email for the `grant_type=password` exchange.
	 * @param {string} password
	 *   The technical-user password.
	 * @returns {Promise<void>}
	 *   Resolves once the access/refresh tokens are stored and the first refresh is armed.
	 * @throws {TokenError}
	 *   When the token endpoint fails or the response omits the offline `refresh_token`.
	 */
	async bootstrap(username, password) {
		const tokenResponse = await postTokenRequest(
			this.tokenEndpoint,
			{
				grant_type: 'password',
				client_id: this.clientId,
				username,
				password,
				scope: 'offline_access'
			},
			this.fetchImpl
		);
		this.accessToken = tokenResponse.access_token;
		this.refreshToken = typeof tokenResponse.refresh_token === 'string' ? tokenResponse.refresh_token : null;
		if (this.refreshToken === null) {
			throw new TokenError(
				'Keycloak token response did not contain a refresh_token; the SDK client must have ' +
					'directAccessGrants + the offline_access scope (ondewo-nlu-cai-sdk-public)'
			);
		}
		if (this.tokenExpirationInS !== undefined) {
			const expirationInMs = this.tokenExpirationInS * 1000;
			this.deadlineInMs = this.nowInMs() + expirationInMs;
		}
		this.scheduleRefresh(tokenResponse.expires_in);
	}

	/**
	 * Exchange the offline refresh token for a fresh access token and re-arm the next refresh. A no-op
	 * once stopped or once the bounded deadline has elapsed.
	 *
	 * @returns {Promise<void>}
	 *   Resolves after the access token (and any rotated refresh token) is stored and the next refresh
	 *   is armed; resolves immediately when stopped or past the deadline.
	 * @throws {TokenError}
	 *   When the token endpoint fails or returns a malformed body.
	 */
	async refresh() {
		if (this.stopped) {
			return;
		}
		// Re-check the bounded deadline at fire time (not just at schedule time): once it has elapsed the
		// loop stops with no further renewal -> the access token lapses -> re-login is required.
		if (this.deadlineInMs !== null && this.nowInMs() >= this.deadlineInMs) {
			this.stop();
			return;
		}
		const tokenResponse = await postTokenRequest(
			this.tokenEndpoint,
			{
				grant_type: 'refresh_token',
				client_id: this.clientId,
				// `refresh()` only runs after `bootstrap()` has stored a non-null refresh token.
				refresh_token: /** @type {string} */ (this.refreshToken)
			},
			this.fetchImpl
		);
		this.accessToken = tokenResponse.access_token;
		// Keycloak may rotate the offline refresh token; keep the newest one when present.
		if (typeof tokenResponse.refresh_token === 'string' && tokenResponse.refresh_token.length > 0) {
			this.refreshToken = tokenResponse.refresh_token;
		}
		this.scheduleRefresh(tokenResponse.expires_in);
	}

	/**
	 * Arm a single timer for the next refresh, clamped to the bounded deadline. Stops silently once
	 * `tokenExpirationInS` has elapsed (no further renewal -> access lapses -> re-login required).
	 *
	 * @param {number | undefined} expiresInRaw
	 *   The access token's lifetime in seconds as reported by Keycloak; a non-positive or absent value
	 *   falls back to {@link MIN_REFRESH_DELAY_IN_S}.
	 * @returns {void}
	 */
	scheduleRefresh(expiresInRaw) {
		if (this.stopped) {
			return;
		}
		const expiresInS = typeof expiresInRaw === 'number' && expiresInRaw > 0 ? expiresInRaw : MIN_REFRESH_DELAY_IN_S;
		let delayInS = Math.max(expiresInS - REFRESH_SKEW_IN_S, MIN_REFRESH_DELAY_IN_S);
		if (this.deadlineInMs !== null) {
			const remainingInMs = this.deadlineInMs - this.nowInMs();
			if (remainingInMs <= 0) {
				this.stop();
				return;
			}
			delayInS = Math.min(delayInS, remainingInMs / 1000);
		}
		this.timer = setTimeout(() => {
			this.refresh().catch((refreshError) => {
				// Swallow a transient refresh failure but surface it so the caller can react; the next
				// gRPC call gets the stale (possibly expired) token and re-logs in on UNAUTHENTICATED.
				if (this.onRefreshErrorHandler !== null) {
					this.onRefreshErrorHandler(refreshError);
				}
			});
		}, delayInS * 1000);
		// Do not keep the event loop alive solely for the refresh timer.
		// c8 ignore next -- defensive: Node's real setTimeout always returns a Timeout exposing unref(); the
		// non-function branch is unreachable here and only guards against exotic non-Node shims.
		if (typeof this.timer.unref === 'function') {
			this.timer.unref();
		}
	}

	/**
	 * Register a callback invoked with the error of a failed background refresh (optional diagnostics).
	 *
	 * @param {(error: unknown) => void} handler
	 *   The callback to invoke with the rejection of a failed background refresh.
	 * @returns {void}
	 */
	onRefreshError(handler) {
		this.onRefreshErrorHandler = handler;
	}

	/**
	 * The current access token, or null before bootstrap / after the bounded loop has lapsed.
	 *
	 * @returns {string | null}
	 */
	getAccessToken() {
		return this.accessToken;
	}

	/**
	 * The value for an `Authorization` gRPC metadata header: `Bearer <access_token>`.
	 *
	 * @returns {string}
	 *   The `Bearer <access_token>` header value.
	 * @throws {TokenError}
	 *   When no access token is available (login has not completed or the bounded loop has lapsed).
	 */
	getAuthorizationHeader() {
		if (this.accessToken === null) {
			throw new TokenError('No access token available; login() has not completed or has lapsed');
		}
		return `Bearer ${this.accessToken}`;
	}

	/**
	 * Stop the auto-refresh loop. Idempotent; safe to call from any state.
	 *
	 * @returns {void}
	 */
	stop() {
		this.stopped = true;
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}

/**
 * One-time ROPC + offline_access login against the PUBLIC SDK client, returning a live token provider
 * whose access token is auto-refreshed in the background until `tokenExpirationInS` elapses.
 *
 * @param {LoginOptions} options
 *   The Keycloak coordinates, ROPC credentials, and optional bounded-lifetime / injection seams.
 * @returns {Promise<OfflineTokenProvider>}
 *   A bootstrapped provider whose access token is being auto-refreshed in the background.
 * @throws {TokenError}
 *   When `options` is missing, a required string option is absent/empty, or the login exchange fails.
 */
async function login(options) {
	if (options === undefined || options === null) {
		throw new TokenError('login() requires an options object');
	}
	/** @type {(keyof LoginOptions)[]} */
	const requiredKeys = ['keycloakUrl', 'realm', 'clientId', 'username', 'password'];
	for (const key of requiredKeys) {
		const value = options[key];
		if (typeof value !== 'string' || value.length === 0) {
			throw new TokenError(`login() option "${key}" is required and must be a non-empty string`);
		}
	}
	const provider = new OfflineTokenProvider(options);
	await provider.bootstrap(options.username, options.password);
	return provider;
}

module.exports = { TokenError, OfflineTokenProvider, login };
