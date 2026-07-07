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

// Minimal, framework-free usage example for the ONDEWO VTSI JS client.
//
// It demonstrates the three things every caller needs:
//   1. obtain a bearer token (D18 Keycloak offline-token provider, see ../auth/offlineTokenProvider.js),
//   2. construct the generated `Calls` gRPC-web client, and
//   3. build a request, call a representative RPC, and handle the response.
//
// The generated stub namespace and the gRPC client are INJECTED (not imported) so the example logic
// can be unit-tested with fakes and no live server (see client.spec.js). In the browser the stub
// namespace is the global `ondewo_vtsi_api` exposed by api/ondewo_vtsi_api.min.js; the client class is
// `ondewo_vtsi_api.CallsPromiseClient`.

'use strict';

const { login } = require('../auth/offlineTokenProvider');

/**
 * Build a `StartCallerRequest` for an outbound call using the generated VTSI message classes.
 *
 * @param {any} vtsiApi
 *   The generated stub namespace (browser global `ondewo_vtsi_api`); injected so tests can supply fakes.
 * @param {{
 *   vtsiProjectName: string,
 *   sipSimVersion: string,
 *   calleeId: string,
 *   nluHost: string,
 *   nluPort: number,
 *   agentName: string,
 *   languageCode: string,
 *   initialIntent: string
 * }} params
 *   The call parameters: the VTSI project, the SIP caller coordinates, and the NLU service config.
 * @returns {any}
 *   A populated `StartCallerRequest` ready to pass to {@link startCaller}.
 */
function buildStartCallerRequest(vtsiApi, params) {
	const request = new vtsiApi.StartCallerRequest();
	request.setVtsiProjectName(params.vtsiProjectName);

	const sipBaseConfig = new vtsiApi.SipBaseConfig();
	sipBaseConfig.setSipSimVersion(params.sipSimVersion);

	const sipCallerConfig = new vtsiApi.SipCallerConfig();
	sipCallerConfig.setSipBaseConfig(sipBaseConfig);
	sipCallerConfig.setCalleeId(params.calleeId);
	request.setSipCallerConfig(sipCallerConfig);

	const nluBaseConfig = new vtsiApi.BaseServiceConfig();
	nluBaseConfig.setHost(params.nluHost);
	nluBaseConfig.setPort(params.nluPort);

	const nluVtsiConfig = new vtsiApi.NluVtsiConfig();
	nluVtsiConfig.setNluBaseConfig(nluBaseConfig);
	nluVtsiConfig.setAgentName(params.agentName);
	nluVtsiConfig.setLanguageCode(params.languageCode);
	nluVtsiConfig.setInitialIntent(params.initialIntent);

	const commonServicesConfig = new vtsiApi.CommonServicesConfig();
	commonServicesConfig.setNluVtsiConfig(nluVtsiConfig);
	request.setCommonServicesConfig(commonServicesConfig);

	return request;
}

/**
 * Start an outbound caller and return the created `Caller`, forwarding the bearer token as gRPC metadata.
 *
 * @param {any} client
 *   A `CallsPromiseClient` (or a test fake exposing `startCaller`).
 * @param {any} request
 *   The `StartCallerRequest` produced by {@link buildStartCallerRequest}.
 * @param {string} authorization
 *   The `Authorization` header value (`Bearer <token>`) from the offline-token provider.
 * @returns {Promise<any>}
 *   The started `Caller` from the response.
 * @throws {Error}
 *   When the response carries a non-empty `error_message`.
 */
async function startCaller(client, request, authorization) {
	const response = await client.startCaller(request, { Authorization: authorization });
	const errorMessage = response.getErrorMessage();
	if (errorMessage) {
		throw new Error(`StartCaller failed: ${errorMessage}`);
	}
	return response.getCaller();
}

/**
 * Build a `ListCallsRequest` scoped to a VTSI project.
 *
 * @param {any} vtsiApi
 *   The generated stub namespace (browser global `ondewo_vtsi_api`); injected so tests can supply fakes.
 * @param {{ vtsiProjectName: string }} params
 *   The VTSI project whose calls should be listed.
 * @returns {any}
 *   A populated `ListCallsRequest` ready to pass to {@link listCalls}.
 */
function buildListCallsRequest(vtsiApi, params) {
	const request = new vtsiApi.ListCallsRequest();
	request.setVtsiProjectName(params.vtsiProjectName);
	return request;
}

/**
 * List the calls of a VTSI project, forwarding the bearer token as gRPC metadata.
 *
 * @param {any} client
 *   A `CallsPromiseClient` (or a test fake exposing `listCalls`).
 * @param {any} request
 *   The `ListCallsRequest` produced by {@link buildListCallsRequest}.
 * @param {string} authorization
 *   The `Authorization` header value (`Bearer <token>`) from the offline-token provider.
 * @returns {Promise<any[]>}
 *   The `Call` records returned by the server.
 */
async function listCalls(client, request, authorization) {
	const response = await client.listCalls(request, { Authorization: authorization });
	return response.getCallsList();
}

/**
 * Live wiring for the example: log in to Keycloak, construct the client, start a caller, list the calls.
 *
 * Runnable in a browser where `ondewo_vtsi_api` is a global (loaded from api/ondewo_vtsi_api.min.js). The
 * Keycloak coordinates and call parameters are read from environment variables. This function talks to a
 * real server and is therefore NOT exercised by the unit tests -- those drive the exported helpers above
 * with fakes instead.
 *
 * @returns {Promise<void>}
 *   Resolves once the caller has been started and the calls have been listed.
 */
async function main() {
	const vtsiApi = globalThis.ondewo_vtsi_api;
	if (vtsiApi === undefined) {
		throw new Error('The generated stub namespace `ondewo_vtsi_api` is not available on globalThis');
	}

	const provider = await login({
		keycloakUrl: process.env.ONDEWO_KEYCLOAK_URL,
		realm: process.env.ONDEWO_KEYCLOAK_REALM,
		clientId: process.env.ONDEWO_KEYCLOAK_CLIENT_ID,
		username: process.env.ONDEWO_KEYCLOAK_USERNAME,
		password: process.env.ONDEWO_KEYCLOAK_PASSWORD
	});

	try {
		const authorization = provider.getAuthorizationHeader();
		const endpoint = `${process.env.ONDEWO_VTSI_HOST}:${process.env.ONDEWO_VTSI_PORT}`;
		const client = new vtsiApi.CallsPromiseClient(endpoint, null, { withCredentials: false });

		const vtsiProjectName = process.env.ONDEWO_VTSI_PROJECT_NAME;

		const startRequest = buildStartCallerRequest(vtsiApi, {
			vtsiProjectName,
			sipSimVersion: process.env.ONDEWO_SIP_SIM_VERSION,
			calleeId: process.env.ONDEWO_CALLEE_ID,
			nluHost: process.env.ONDEWO_NLU_HOST,
			nluPort: Number(process.env.ONDEWO_NLU_PORT),
			agentName: process.env.ONDEWO_NLU_AGENT_NAME,
			languageCode: process.env.ONDEWO_NLU_LANGUAGE_CODE,
			initialIntent: process.env.ONDEWO_NLU_INITIAL_INTENT
		});
		const caller = await startCaller(client, startRequest, authorization);
		console.log(`Started caller: ${caller.getName()}`);

		const listRequest = buildListCallsRequest(vtsiApi, { vtsiProjectName });
		const calls = await listCalls(client, listRequest, authorization);
		console.log(`Project has ${calls.length} call(s)`);
	} finally {
		provider.stop();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}

module.exports = { buildStartCallerRequest, startCaller, buildListCallsRequest, listCalls, main };
