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

// Unit tests for the D18 offline-token helper. The token endpoint is mocked via the injectable
// `fetchImpl` option -- there is NO network access.
//   node --test auth/offlineTokenProvider.spec.js

'use strict';

const { test: runTestCase, mock } = require('node:test');
const assert = require('node:assert/strict');

const { Agent } = require('undici');

const { login, OfflineTokenProvider, TokenError } = require('./offlineTokenProvider');

/**
 * The login/provider options shared by every test, mirroring a realistic D18 headless-SDK login.
 *
 * @type {{ keycloakUrl: string, realm: string, clientId: string, username: string, password: string }}
 */
const BASE_OPTIONS = {
	keycloakUrl: 'https://auth.example.com/auth',
	realm: 'ondewo-ccai-platform',
	clientId: 'ondewo-nlu-cai-sdk-public',
	username: 'tech-user@example.com',
	password: 'super-secret'
};

/**
 * The token endpoint the helper must derive from {@link BASE_OPTIONS} (`keycloakUrl` + realm path).
 *
 * @type {string}
 */
const EXPECTED_TOKEN_ENDPOINT =
	'https://auth.example.com/auth/realms/ondewo-ccai-platform/protocol/openid-connect/token';

/**
 * A scripted token-endpoint response for {@link makeFetchStub}: an optional HTTP status (defaults to
 * 200) and a body that is either a pre-serialized string or an object that the stub JSON-stringifies.
 *
 * @typedef {object} StubResponse
 * @property {number} [status]
 *   The HTTP status to report; defaults to 200.
 * @property {string | Record<string, unknown>} body
 *   The response body — a raw string is returned verbatim; an object is `JSON.stringify`-ed.
 */

/**
 * A single request captured by {@link makeFetchStub}, exposing the URL, the raw `fetch` init, and the
 * parsed form body for assertions.
 *
 * @typedef {object} CapturedCall
 * @property {string} url
 *   The endpoint URL the helper called.
 * @property {{ method: string, headers: Record<string, string>, body: string }} init
 *   The `fetch` init object the helper passed (the provider always sets method, headers, and body).
 * @property {URLSearchParams} params
 *   The form-encoded request body parsed for field-level assertions.
 */

/**
 * The fake `fetch` plus its call log produced by {@link makeFetchStub}. The `fetchImpl` signature
 * mirrors the provider's `FetchImpl` typedef (`init` typed as `object`) so it is assignable to the
 * `fetchImpl` login/provider option.
 *
 * @typedef {(url: string, init: object) => Promise<{ ok: boolean, status: number, text: () => Promise<string> }>} StubFetchImpl
 */

/**
 * The fake `fetch` plus its call log produced by {@link makeFetchStub}.
 *
 * @typedef {object} FetchStub
 * @property {StubFetchImpl} fetchImpl
 *   The injectable `fetch` replacement.
 * @property {CapturedCall[]} calls
 *   The ordered log of requests the stub received.
 */

/**
 * Build a fake fetch that returns a sequence of JSON responses (one per call) and records the requests
 * it received, so assertions can inspect the form-encoded body and the URL.
 *
 * @param {StubResponse[]} responses
 *   The scripted responses to return in order; the stub throws if called more times than provided.
 * @returns {FetchStub}
 *   The injectable `fetchImpl` and its mutable `calls` log.
 */
function makeFetchStub(responses) {
	/** @type {CapturedCall[]} */
	const calls = [];
	/** @type {StubFetchImpl} */
	const fetchImpl = (url, init) => {
		const typedInit = /** @type {{ method: string, headers: Record<string, string>, body: string }} */ (init);
		calls.push({ url, init: typedInit, params: new URLSearchParams(typedInit.body) });
		const next = responses.shift();
		if (next === undefined) {
			throw new Error('fetch stub called more times than expected');
		}
		const status = next.status !== undefined ? next.status : 200;
		const bodyText = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
		return Promise.resolve({
			ok: status >= 200 && status < 300,
			status,
			text: () => Promise.resolve(bodyText)
		});
	};
	return { fetchImpl, calls };
}

/**
 * Yield to the microtask queue so an awaited refresh inside a fired timer can settle.
 *
 * @returns {Promise<void>}
 *   Resolves on the next tick, after pending microtasks have run.
 */
function flushMicrotasks() {
	return new Promise((resolve) => {
		process.nextTick(resolve);
	});
}

/**
 * Asserts the initial login issues a `grant_type=password`, `scope=offline_access` POST to the realm
 * token endpoint with the public client id and, critically, no `client_secret` on the wire (Q1).
 *
 * @returns {Promise<void>}
 */
runTestCase(
	'login posts ROPC + offline_access to the realm token endpoint with the public client (no secret)',
	async () => {
		const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 300 } }]);

		const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });

		assert.equal(stub.calls.length, 1);
		assert.equal(stub.calls[0].url, EXPECTED_TOKEN_ENDPOINT);
		assert.equal(stub.calls[0].init.method, 'POST');
		assert.equal(stub.calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
		assert.equal(stub.calls[0].init.headers.Accept, 'application/json');

		const params = stub.calls[0].params;
		assert.equal(params.get('grant_type'), 'password');
		assert.equal(params.get('client_id'), 'ondewo-nlu-cai-sdk-public');
		assert.equal(params.get('username'), 'tech-user@example.com');
		assert.equal(params.get('password'), 'super-secret');
		assert.equal(params.get('scope'), 'offline_access');
		// Q1: PUBLIC client -- there must be NO client_secret on the wire.
		assert.equal(params.get('client_secret'), null);

		assert.equal(provider.getAccessToken(), 'access-1');
		assert.equal(provider.getAuthorizationHeader(), 'Bearer access-1');
		provider.stop();
	}
);

/**
 * Asserts trailing slashes on `keycloakUrl` are stripped so the derived token endpoint is canonical.
 *
 * @returns {Promise<void>}
 */
runTestCase('login tolerates a trailing slash on keycloakUrl when building the token endpoint', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 300 } }]);

	const provider = await login({
		...BASE_OPTIONS,
		keycloakUrl: 'https://auth.example.com/auth///',
		fetchImpl: stub.fetchImpl
	});

	assert.equal(stub.calls[0].url, EXPECTED_TOKEN_ENDPOINT);
	provider.stop();
});

/**
 * Asserts the background timer fires a `grant_type=refresh_token` exchange before expiry and swaps in
 * the fresh access token, driven deterministically via mocked timers.
 *
 * @returns {Promise<void>}
 */
runTestCase('auto-refresh exchanges the offline refresh_token for a fresh access token before expiry', async () => {
	const stub = makeFetchStub([
		{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } },
		{ body: { access_token: 'access-2', refresh_token: 'offline-2', expires_in: 31 } }
	]);

	// expires_in 31 - 30 skew = 1s scheduled delay; drive it deterministically via fake timers.
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });
		assert.equal(provider.getAccessToken(), 'access-1');

		mock.timers.tick(1000);
		await flushMicrotasks();

		assert.equal(stub.calls.length, 2);
		const refreshParams = stub.calls[1].params;
		assert.equal(refreshParams.get('grant_type'), 'refresh_token');
		assert.equal(refreshParams.get('refresh_token'), 'offline-1');
		assert.equal(refreshParams.get('client_id'), 'ondewo-nlu-cai-sdk-public');
		assert.equal(refreshParams.get('client_secret'), null);

		assert.equal(provider.getAccessToken(), 'access-2');
		assert.equal(provider.getAuthorizationHeader(), 'Bearer access-2');
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts the loop does not renew once the wall clock passes the bounded `tokenExpirationInS` deadline,
 * even when the timer fires afterwards.
 *
 * @returns {Promise<void>}
 */
runTestCase('the refresh loop stops after tokenExpirationInS elapses (no further renewal)', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } }]);

	let fakeNowInMs = 1_000_000;
	const nowInMs = () => fakeNowInMs;

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		// Bound the loop to 2s; the first refresh is armed at ~1s but the deadline passes before it fires.
		const provider = await login({
			...BASE_OPTIONS,
			fetchImpl: stub.fetchImpl,
			nowInMs,
			tokenExpirationInS: 2
		});

		// Advance the wall clock past the deadline before the timer fires.
		fakeNowInMs += 3000;
		mock.timers.tick(1000);
		await flushMicrotasks();

		// Deadline already passed -> refresh must NOT have fired; only the initial login call happened.
		assert.equal(stub.calls.length, 1);
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts that when the bounded deadline is far away the skew-based delay wins the `Math.min` clamp, so
 * the loop keeps renewing within the window.
 *
 * @returns {Promise<void>}
 */
runTestCase('a long deadline clamps the next refresh delay to the remaining window', async () => {
	const stub = makeFetchStub([
		{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } },
		{ body: { access_token: 'access-2', refresh_token: 'offline-2', expires_in: 31 } }
	]);

	const fakeNowInMs = 2_000_000;
	const nowInMs = () => fakeNowInMs;

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		// Deadline 1000s away -> remaining window dwarfs the 1s skew delay, so the skew delay wins (Math.min).
		const provider = await login({
			...BASE_OPTIONS,
			fetchImpl: stub.fetchImpl,
			nowInMs,
			tokenExpirationInS: 1000
		});

		mock.timers.tick(1000);
		await flushMicrotasks();

		// Refresh fired within the deadline; the loop kept renewing.
		assert.equal(stub.calls.length, 2);
		assert.equal(provider.getAccessToken(), 'access-2');
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts a non-2xx token endpoint response surfaces as a {@link TokenError}.
 *
 * @returns {Promise<void>}
 */
runTestCase('login rejects a non-2xx token response with TokenError', async () => {
	const stub = makeFetchStub([{ status: 401, body: { error: 'invalid_grant' } }]);
	await assert.rejects(() => login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl }), TokenError);
});

/**
 * Asserts a login response without a `refresh_token` (the `offline_access` scope was not granted) is
 * rejected with a {@link TokenError} rather than yielding a non-refreshable provider.
 *
 * @returns {Promise<void>}
 */
runTestCase('login rejects when the token response carries no refresh_token (missing offline_access)', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', expires_in: 300 } }]);
	await assert.rejects(() => login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl }), TokenError);
});

/**
 * Asserts an empty required option (here `clientId`) is rejected with a {@link TokenError} before any
 * network call is attempted.
 *
 * @returns {Promise<void>}
 */
runTestCase('login validates required options', async () => {
	const stub = makeFetchStub([]);
	await assert.rejects(() => login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl, clientId: '' }), TokenError);
});

/**
 * Asserts reading the authorization header before bootstrap throws a {@link TokenError} and the access
 * token reads as `null`.
 *
 * @returns {void}
 */
runTestCase('getAuthorizationHeader throws before bootstrap when no token is available', () => {
	const stub = makeFetchStub([]);
	const provider = new OfflineTokenProvider({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });
	assert.throws(() => provider.getAuthorizationHeader(), TokenError);
	assert.equal(provider.getAccessToken(), null);
});

/**
 * Asserts a 2xx response with an unparseable body is rejected with a {@link TokenError}.
 *
 * @returns {Promise<void>}
 */
runTestCase('login rejects a 2xx token response whose body is not valid JSON', async () => {
	const stub = makeFetchStub([{ body: '<<<not-json>>>' }]);
	await assert.rejects(() => login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl }), TokenError);
});

/**
 * Asserts a JSON body lacking an `access_token` is rejected with a {@link TokenError}.
 *
 * @returns {Promise<void>}
 */
runTestCase('login rejects a parseable token response that carries no access_token', async () => {
	const stub = makeFetchStub([{ body: { refresh_token: 'offline-1', expires_in: 300 } }]);
	await assert.rejects(() => login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl }), TokenError);
});

/**
 * Asserts both `null` and `undefined` options objects are rejected with a {@link TokenError}.
 *
 * @returns {Promise<void>}
 */
runTestCase('login rejects a missing options object', async () => {
	// Intentionally invalid arguments exercise the runtime guard; cast past the typed `login` signature.
	await assert.rejects(() => login(/** @type {any} */ (null)), TokenError);
	await assert.rejects(() => login(/** @type {any} */ (undefined)), TokenError);
});

/**
 * Asserts a failing background refresh invokes the registered `onRefreshError` handler with the error
 * yet leaves the still-valid access token untouched.
 *
 * @returns {Promise<void>}
 */
runTestCase('a failed background refresh is surfaced to onRefreshError and keeps the stale token', async () => {
	const stub = makeFetchStub([
		{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } },
		{ status: 500, body: 'boom' }
	]);

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });
		/** @type {unknown} */
		let captured = null;
		provider.onRefreshError((error) => {
			captured = error;
		});

		mock.timers.tick(1000);
		await flushMicrotasks();
		await flushMicrotasks();

		assert.ok(captured instanceof TokenError);
		assert.match(captured.message, /500/);
		// The transient failure must NOT clobber the still-valid access token.
		assert.equal(provider.getAccessToken(), 'access-1');
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts a failing background refresh with no handler registered is swallowed silently, leaving the
 * stale token in place and throwing nothing.
 *
 * @returns {Promise<void>}
 */
runTestCase('a failed background refresh without a registered handler is swallowed silently', async () => {
	const stub = makeFetchStub([
		{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } },
		{ status: 503, body: 'down' }
	]);

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });

		mock.timers.tick(1000);
		await flushMicrotasks();
		await flushMicrotasks();

		// No handler -> the rejection is swallowed; the stale token survives and nothing throws.
		assert.equal(provider.getAccessToken(), 'access-1');
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts that when a refresh response omits a rotated `refresh_token` the provider keeps reusing the
 * previous offline token on subsequent refreshes.
 *
 * @returns {Promise<void>}
 */
runTestCase('a refresh response without a rotated refresh_token keeps reusing the previous one', async () => {
	const stub = makeFetchStub([
		{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } },
		// First refresh succeeds but Keycloak does NOT rotate the offline token.
		{ body: { access_token: 'access-2', expires_in: 31 } },
		{ body: { access_token: 'access-3', refresh_token: 'offline-3', expires_in: 31 } }
	]);

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });

		mock.timers.tick(1000);
		await flushMicrotasks();
		assert.equal(provider.getAccessToken(), 'access-2');

		mock.timers.tick(1000);
		await flushMicrotasks();
		// The second refresh must still send the original offline-1 token (it was never rotated).
		assert.equal(stub.calls[2].params.get('refresh_token'), 'offline-1');
		assert.equal(provider.getAccessToken(), 'access-3');
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts an absent/zero `expires_in` clamps the scheduled delay to the 1s minimum (no hot loop) and
 * still refreshes at that minimum.
 *
 * @returns {Promise<void>}
 */
runTestCase('an absent/zero expires_in falls back to the minimum refresh delay', async () => {
	const stub = makeFetchStub([
		// No expires_in -> the scheduler must clamp to MIN_REFRESH_DELAY_IN_S (1s), not spin a hot loop.
		{ body: { access_token: 'access-1', refresh_token: 'offline-1' } },
		{ body: { access_token: 'access-2', refresh_token: 'offline-2', expires_in: 31 } }
	]);

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });
		assert.equal(provider.getAccessToken(), 'access-1');

		// The refresh must fire exactly at the 1s minimum delay.
		mock.timers.tick(1000);
		await flushMicrotasks();

		assert.equal(stub.calls.length, 2);
		assert.equal(provider.getAccessToken(), 'access-2');
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts `tokenExpirationInS=0` makes the deadline equal `now` at bootstrap so `scheduleRefresh` stops
 * the loop immediately and never arms a timer.
 *
 * @returns {Promise<void>}
 */
runTestCase('a non-positive tokenExpirationInS lapses the loop immediately at schedule time', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } }]);

	let fakeNowInMs = 5_000_000;
	const nowInMs = () => fakeNowInMs;

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		// tokenExpirationInS=0 -> deadline == now at bootstrap -> scheduleRefresh sees remaining <= 0 and stops.
		const provider = await login({
			...BASE_OPTIONS,
			fetchImpl: stub.fetchImpl,
			nowInMs,
			tokenExpirationInS: 0
		});
		assert.equal(provider.getAccessToken(), 'access-1');

		// No timer was armed; advancing the clock must not trigger a refresh.
		fakeNowInMs += 100_000;
		mock.timers.tick(100_000);
		await flushMicrotasks();

		assert.equal(stub.calls.length, 1);
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts that omitting `fetchImpl` exercises the `globalThis.fetch` default branch (the global is
 * temporarily overridden so no real network call occurs).
 *
 * @returns {Promise<void>}
 */
runTestCase('login falls back to the global fetch when no fetchImpl is provided', async () => {
	/** @type {string[]} */
	const calls = [];
	const originalFetch = globalThis.fetch;
	// Override the global fetch so the default-branch (`globalThis.fetch`) is exercised without network.
	// The minimal stub Response is intentionally narrower than the DOM `Response`, hence the cast.
	globalThis.fetch = /** @type {typeof globalThis.fetch} */ (
		(url) => {
			calls.push(/** @type {string} */ (url));
			return Promise.resolve({
				ok: true,
				status: 200,
				text: () =>
					Promise.resolve(JSON.stringify({ access_token: 'global-1', refresh_token: 'offline-1', expires_in: 31 }))
			});
		}
	);

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS });
		assert.equal(calls.length, 1);
		assert.equal(calls[0], EXPECTED_TOKEN_ENDPOINT);
		assert.equal(provider.getAccessToken(), 'global-1');
		provider.stop();
	} finally {
		globalThis.fetch = originalFetch;
		mock.timers.reset();
	}
});

/**
 * Asserts (with real, unmocked timers) that the armed refresh timer is `unref`-ed so it does not block
 * process exit, and that {@link OfflineTokenProvider#stop} is idempotent.
 *
 * @returns {Promise<void>}
 */
runTestCase('the refresh timer arms on the real event loop and is unref-ed (does not block exit)', async () => {
	// No mocked timers here: this exercises the real setTimeout path so the Timeout.unref() call line runs.
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 300 } }]);
	const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });
	assert.equal(provider.getAccessToken(), 'access-1');
	// Stop immediately so the armed real timer is cleared and the test does not wait ~270s.
	provider.stop();
	// stop() is idempotent: a second call with the timer already cleared takes the `timer === null` branch.
	provider.stop();
});

/**
 * Asserts that calling {@link OfflineTokenProvider#stop} while a refresh is in flight lets that refresh
 * update the token but suppresses re-arming the next one (the `stopped` guard in `scheduleRefresh`).
 *
 * @returns {Promise<void>}
 */
runTestCase('stop() during an in-flight refresh suppresses re-arming the next refresh', async () => {
	/** @type {URLSearchParams[]} */
	const calls = [];
	/**
	 * Resolves the parked in-flight refresh response on demand; reassigned by the second `fetchImpl` call.
	 *
	 * @type {() => void}
	 */
	let releaseRefresh = () => {};
	/** @type {StubFetchImpl} */
	const fetchImpl = (_url, init) => {
		const typedInit = /** @type {{ body: string }} */ (init);
		calls.push(new URLSearchParams(typedInit.body));
		if (calls.length === 1) {
			return Promise.resolve({
				ok: true,
				status: 200,
				text: () =>
					Promise.resolve(JSON.stringify({ access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 }))
			});
		}
		// Hold the refresh response open until the test releases it, after calling stop().
		return new Promise((resolve) => {
			releaseRefresh = () => {
				resolve({
					ok: true,
					status: 200,
					text: () =>
						Promise.resolve(JSON.stringify({ access_token: 'access-2', refresh_token: 'offline-2', expires_in: 31 }))
				});
			};
		});
	};

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS, fetchImpl });

		// Fire the timer so refresh() starts and is parked awaiting the (pending) refresh response.
		mock.timers.tick(1000);
		await flushMicrotasks();
		assert.equal(calls.length, 2);

		// Stop while the refresh is in flight, then let it complete.
		provider.stop();
		releaseRefresh();
		await flushMicrotasks();
		await flushMicrotasks();

		// The completed refresh still updated the token, but scheduleRefresh saw `stopped` and armed nothing.
		assert.equal(provider.getAccessToken(), 'access-2');
		mock.timers.tick(100_000);
		await flushMicrotasks();
		assert.equal(calls.length, 2);
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts directly invoking {@link OfflineTokenProvider#refresh} after stop hits the `stopped` guard and
 * performs no token request.
 *
 * @returns {Promise<void>}
 */
runTestCase('refresh() returns early when the provider is already stopped', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } }]);
	const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });
	provider.stop();
	// Directly invoking refresh() after stop() hits the `stopped` guard and performs no fetch.
	await provider.refresh();
	assert.equal(stub.calls.length, 1);
});

/**
 * Asserts the SECURE default (keycloakVerifySsl omitted): the token POST carries NO insecure undici
 * dispatcher, so the default global fetch performs TLS certificate verification -- unchanged behaviour.
 */
runTestCase('keycloakVerifySsl defaults to TLS verification ON (no insecure dispatcher on the request)', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 300 } }]);
	const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl });
	assert.equal(stub.calls[0].init.dispatcher, undefined);
	provider.stop();
});

/**
 * Asserts that an EXPLICIT `keycloakVerifySsl: true` behaves exactly like the default: no insecure
 * dispatcher is attached (TLS verification stays ON).
 */
runTestCase('keycloakVerifySsl=true keeps TLS verification ON (no insecure dispatcher on the request)', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 300 } }]);
	const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl, keycloakVerifySsl: true });
	assert.equal(stub.calls[0].init.dispatcher, undefined);
	provider.stop();
});

/**
 * Asserts that `keycloakVerifySsl: false` wires an insecure undici `Agent` dispatcher (rejectUnauthorized
 * off) onto the token POST init, disabling TLS certificate verification for that request only.
 */
runTestCase('keycloakVerifySsl=false attaches an insecure undici dispatcher to the token request', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 300 } }]);
	const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl, keycloakVerifySsl: false });
	assert.notEqual(stub.calls[0].init.dispatcher, undefined);
	assert.ok(stub.calls[0].init.dispatcher instanceof Agent);
	provider.stop();
});

/**
 * Asserts that the verify-off flag also applies to the background refresh: the re-armed refresh POST
 * carries the same insecure undici dispatcher as the initial login POST.
 */
runTestCase('keycloakVerifySsl=false also disables TLS verification on the background refresh', async () => {
	const stub = makeFetchStub([
		{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 31 } },
		{ body: { access_token: 'access-2', refresh_token: 'offline-2', expires_in: 31 } }
	]);

	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl, keycloakVerifySsl: false });

		mock.timers.tick(1000);
		await flushMicrotasks();

		assert.equal(stub.calls.length, 2);
		assert.ok(stub.calls[1].init.dispatcher instanceof Agent);
		provider.stop();
	} finally {
		mock.timers.reset();
	}
});

/**
 * Asserts Python-parity "flag ignored when a custom transport is injected": even with
 * `keycloakVerifySsl: false`, the injected `fetchImpl` still receives the call and yields a token. The
 * dispatcher lands on the init (a no-op for the fake fetch, which does not honour it), and login succeeds.
 */
runTestCase('keycloakVerifySsl=false still logs in through an injected fetchImpl (flag is a no-op there)', async () => {
	const stub = makeFetchStub([{ body: { access_token: 'access-1', refresh_token: 'offline-1', expires_in: 300 } }]);
	const provider = await login({ ...BASE_OPTIONS, fetchImpl: stub.fetchImpl, keycloakVerifySsl: false });
	assert.equal(stub.calls.length, 1);
	assert.equal(provider.getAccessToken(), 'access-1');
	provider.stop();
});
