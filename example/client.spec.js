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

// Unit tests for the VTSI client usage example. The generated stub namespace and the gRPC client are
// replaced by in-memory fakes, and the Keycloak token endpoint is stubbed via the offline-token
// provider's injectable `fetchImpl` -- there is NO network access and NO live gRPC server.
//   node --test example/client.spec.js

'use strict';

const { test: runTestCase } = require('node:test');
const assert = require('node:assert/strict');

const { login } = require('../auth/offlineTokenProvider');
const { buildStartCallerRequest, startCaller, buildListCallsRequest, listCalls } = require('./client');

/**
 * A recording fake standing in for a generated protobuf message: every `setX(value)` stores `value`
 * under `X`, and every `getX()` reads it back, so the example's builder logic can be asserted without
 * the real (browser-only) generated stubs.
 *
 * @returns {() => any}
 *   A constructor whose instances proxy `set*`/`get*` accessors onto an internal record.
 */
function makeFakeMessageClass() {
	return function FakeMessage() {
		const record = {};
		return new Proxy(
			{ record },
			{
				get(target, prop) {
					if (prop === 'record') {
						return target.record;
					}
					if (typeof prop === 'string' && prop.startsWith('set')) {
						return (value) => {
							target.record[prop.slice(3)] = value;
						};
					}
					if (typeof prop === 'string' && prop.startsWith('get')) {
						return () => target.record[prop.slice(3)];
					}
					return undefined;
				}
			}
		);
	};
}

/**
 * A fake generated stub namespace: `new fakeVtsiApi.AnyMessage()` yields a fresh recording fake message.
 *
 * @returns {any}
 *   A stand-in for the `ondewo_vtsi_api` global that manufactures recording fakes on demand.
 */
function makeFakeVtsiApi() {
	return new Proxy(
		{},
		{
			get() {
				return makeFakeMessageClass();
			}
		}
	);
}

/**
 * A fake `CallsPromiseClient` that records each RPC invocation and returns a scripted response.
 *
 * @param {{ startCaller?: any, listCalls?: any }} responses
 *   The response object each RPC should resolve with.
 * @returns {{ calls: any[], startCaller: Function, listCalls: Function }}
 *   The fake client plus its ordered invocation log.
 */
function makeFakeClient(responses) {
	const calls = [];
	return {
		calls,
		startCaller(request, metadata) {
			calls.push({ method: 'startCaller', request, metadata });
			return Promise.resolve(responses.startCaller);
		},
		listCalls(request, metadata) {
			calls.push({ method: 'listCalls', request, metadata });
			return Promise.resolve(responses.listCalls);
		}
	};
}

const BEARER = 'Bearer access-token-123';

/**
 * Asserts the builder populates the project, the SIP caller coordinates, and the nested NLU config.
 *
 * @returns {void}
 */
runTestCase('buildStartCallerRequest populates the project, SIP caller and NLU service config', () => {
	const vtsiApi = makeFakeVtsiApi();
	const params = {
		vtsiProjectName: 'projects/proj-uuid/project',
		sipSimVersion: '1.0.0',
		calleeId: '+43650123456',
		nluHost: 'nlu.example.com',
		nluPort: 50055,
		agentName: 'projects/agent-uuid/agent',
		languageCode: 'en',
		initialIntent: 'i.intro.hello'
	};

	const request = buildStartCallerRequest(vtsiApi, params);

	assert.equal(request.getVtsiProjectName(), params.vtsiProjectName);
	const sipCallerConfig = request.getSipCallerConfig();
	assert.equal(sipCallerConfig.getCalleeId(), params.calleeId);
	assert.equal(sipCallerConfig.getSipBaseConfig().getSipSimVersion(), params.sipSimVersion);
	const nluVtsiConfig = request.getCommonServicesConfig().getNluVtsiConfig();
	assert.equal(nluVtsiConfig.getAgentName(), params.agentName);
	assert.equal(nluVtsiConfig.getLanguageCode(), params.languageCode);
	assert.equal(nluVtsiConfig.getInitialIntent(), params.initialIntent);
	assert.equal(nluVtsiConfig.getNluBaseConfig().getHost(), params.nluHost);
	assert.equal(nluVtsiConfig.getNluBaseConfig().getPort(), params.nluPort);
});

/**
 * Asserts startCaller forwards the bearer token as `Authorization` metadata and returns the caller.
 *
 * @returns {Promise<void>}
 */
runTestCase('startCaller forwards the bearer metadata and returns the started caller', async () => {
	const caller = { getName: () => 'projects/proj-uuid/callers/caller-uuid' };
	const client = makeFakeClient({
		startCaller: { getErrorMessage: () => '', getCaller: () => caller }
	});
	const request = { marker: 'start-request' };

	const started = await startCaller(client, request, BEARER);

	assert.equal(client.calls.length, 1);
	assert.equal(client.calls[0].method, 'startCaller');
	assert.equal(client.calls[0].request, request);
	assert.deepEqual(client.calls[0].metadata, { Authorization: BEARER });
	assert.equal(started, caller);
});

/**
 * Asserts startCaller surfaces a non-empty `error_message` as a thrown Error.
 *
 * @returns {Promise<void>}
 */
runTestCase('startCaller throws when the response carries an error_message', async () => {
	const client = makeFakeClient({
		startCaller: { getErrorMessage: () => 'no sip account free', getCaller: () => undefined }
	});

	await assert.rejects(() => startCaller(client, {}, BEARER), /StartCaller failed: no sip account free/);
});

/**
 * Asserts buildListCallsRequest scopes the request to the given VTSI project.
 *
 * @returns {void}
 */
runTestCase('buildListCallsRequest sets the VTSI project name', () => {
	const vtsiApi = makeFakeVtsiApi();
	const vtsiProjectName = 'projects/proj-uuid/project';

	const request = buildListCallsRequest(vtsiApi, { vtsiProjectName });

	assert.equal(request.getVtsiProjectName(), vtsiProjectName);
});

/**
 * Asserts listCalls forwards the bearer metadata and returns the response's call list.
 *
 * @returns {Promise<void>}
 */
runTestCase('listCalls forwards the bearer metadata and returns the calls list', async () => {
	const returnedCalls = [{ getName: () => 'call-a' }, { getName: () => 'call-b' }];
	const client = makeFakeClient({
		listCalls: { getCallsList: () => returnedCalls }
	});
	const request = { marker: 'list-request' };

	const result = await listCalls(client, request, BEARER);

	assert.equal(client.calls.length, 1);
	assert.equal(client.calls[0].method, 'listCalls');
	assert.deepEqual(client.calls[0].metadata, { Authorization: BEARER });
	assert.deepEqual(result, returnedCalls);
});

/**
 * End-to-end auth wiring: a mocked Keycloak token endpoint yields a provider whose `Bearer` header the
 * example forwards to the mocked gRPC client -- proving the full auth path with no live server.
 *
 * @returns {Promise<void>}
 */
runTestCase('the offline-token provider yields a Bearer header the example forwards to the client', async () => {
	const fetchImpl = () =>
		Promise.resolve({
			ok: true,
			status: 200,
			text: () => Promise.resolve(JSON.stringify({ access_token: 'kc-access', refresh_token: 'kc-offline', expires_in: 300 }))
		});
	const provider = await login({
		keycloakUrl: 'https://auth.example.com/auth',
		realm: 'ondewo-ccai-platform',
		clientId: 'ondewo-nlu-cai-sdk-public',
		username: 'tech-user@example.com',
		password: 'super-secret',
		fetchImpl
	});

	try {
		const caller = { getName: () => 'projects/proj-uuid/callers/caller-uuid' };
		const client = makeFakeClient({
			startCaller: { getErrorMessage: () => '', getCaller: () => caller }
		});

		const started = await startCaller(client, { marker: 'req' }, provider.getAuthorizationHeader());

		assert.deepEqual(client.calls[0].metadata, { Authorization: 'Bearer kc-access' });
		assert.equal(started, caller);
	} finally {
		provider.stop();
	}
});
