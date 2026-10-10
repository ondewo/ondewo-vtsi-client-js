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

// The SHIPPED BUNDLE must carry the ONDEWO VTSI API 9.0.0 surface.
//
// `api/ondewo_vtsi_api.js` is what an npm consumer loads, so the new services, the breaking rename
// and the new presence bits are checked there, not in the .proto source: a regeneration that never
// reached the bundle passes a source-level check and fails here. The bundle is a browser build that
// assigns a global, so it is evaluated inside a `vm` context and the global is read back out. The
// context provides no `require`: the embedded google-protobuf runtime has to decode a string by itself.
//   node --test tests/vtsiApi9.spec.js

'use strict';

const { test: runTestCase } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** The generated, webpack-bundled API surface this package publishes. */
const BUNDLE_PATH = path.join(__dirname, '..', 'api', 'ondewo_vtsi_api.js');

/** A representative gRPC-web endpoint; constructing a client opens no connection. */
const ENDPOINT = 'https://vtsi.example.com:443';

/**
 * The RPCs of the services new in 9.0.0, as gRPC-web client method names. Each service is
 * unary or server streaming only, so gRPC-web generates every one of them.
 */
const NEW_SERVICES = {
	Softphones: [
		'createSoftphoneAccount',
		'getSoftphoneAccount',
		'updateSoftphoneAccount',
		'deleteSoftphoneAccount',
		'listSoftphoneAccounts',
		'rotateSoftphoneCredentials',
		'listSoftphoneCertificates',
		'getSoftphoneCertificate',
		'revokeSoftphoneCertificate',
		'getSoftphoneProvisioning'
	],
	Campaigns: [
		'createCampaign',
		'getCampaign',
		'updateCampaign',
		'deleteCampaign',
		'listCampaigns',
		'getCampaignStatistics',
		'listCampaignCalls',
		'startCampaign',
		'stopCampaign',
		'hardStopCampaign',
		'resumeCampaign',
		'streamCampaignStatus'
	],
	Events: [
		'createVtsiEventSubscription',
		'getVtsiEventSubscription',
		'updateVtsiEventSubscription',
		'deleteVtsiEventSubscription',
		'listVtsiEventSubscriptions',
		'createWebhook',
		'getWebhook',
		'updateWebhook',
		'deleteWebhook',
		'listWebhooks',
		'testWebhook',
		'subscribeVtsiEvents'
	]
};

/** The `Calls` RPCs new in 9.0.0 that gRPC-web can generate (all but the bidirectional StreamCallAudio). */
const NEW_CALLS_RPCS = [
	'addCallersToCampaign',
	'addScheduledCallersToCampaign',
	'streamCallerStatus',
	'streamListenerStatus',
	'streamScheduledCallerStatus',
	'inviteToCall',
	'removeCallParticipant',
	'setCallMediaControl',
	'listenCallAudio'
];

/**
 * Evaluate the browser bundle in an isolated context and hand back the global it defines.
 *
 * @returns {any} the `ondewo_vtsi_api` namespace object.
 */
function loadApiBundle() {
	const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
	const context = { window: {}, global: {}, self: {} };
	context.globalThis = context;
	vm.createContext(context);
	vm.runInContext(source, context);
	assert.ok(context.ondewo_vtsi_api, 'the bundle did not define the ondewo_vtsi_api global');
	return context.ondewo_vtsi_api;
}

for (const [service, methods] of Object.entries(NEW_SERVICES)) {
	runTestCase(`the ${service} service has a callback and a promise client exposing every RPC`, () => {
		const api = loadApiBundle();
		for (const flavour of ['Client', 'PromiseClient']) {
			const client = new api[`${service}${flavour}`](ENDPOINT, null, null);
			for (const method of methods) {
				assert.equal(typeof client[method], 'function', `${service}${flavour} lacks ${method}`);
			}
		}
	});
}

runTestCase('the Calls client exposes the RPCs new in 9.0.0, but not the bidirectional StreamCallAudio', () => {
	const api = loadApiBundle();
	const client = new api.CallsPromiseClient(ENDPOINT, null, null);
	for (const method of NEW_CALLS_RPCS) {
		assert.equal(typeof client[method], 'function', `CallsPromiseClient lacks ${method}`);
	}
	// gRPC-web supports unary and server streaming only; ListenCallAudio is the browser-safe variant.
	assert.equal(typeof client.streamCallAudio, 'undefined');
});

runTestCase('AsteriskConfigsFiles.sip_conf_file_string is renamed to pjsip_conf_file_string', () => {
	const api = loadApiBundle();
	const files = new api.AsteriskConfigsFiles();
	assert.equal(typeof files.setSipConfFileString, 'undefined');
	assert.equal(typeof files.getSipConfFileString, 'undefined');
	files.setPjsipConfFileString('[transport-tls]');
	assert.equal(files.getPjsipConfFileString(), '[transport-tls]');
	assert.equal(files.toObject().pjsipConfFileString, '[transport-tls]');
	assert.equal('sipConfFileString' in files.toObject(), false);
});

runTestCase('a scalar that gained `optional` tells an explicit default from unset', () => {
	const api = loadApiBundle();
	const config = new api.MessageBrokerConfig();
	assert.equal(config.hasActivateMessageBroker(), false);
	config.setActivateMessageBroker(false);
	assert.equal(config.hasActivateMessageBroker(), true);
	assert.notDeepEqual(config.serializeBinary(), new api.MessageBrokerConfig().serializeBinary());
});

runTestCase('a multi-byte string survives a binary round trip through a new message', () => {
	const api = loadApiBundle();
	const account = new api.SoftphoneAccount();
	account.setDisplayName('Zoë Müller ☎ 电话');
	const decoded = api.SoftphoneAccount.deserializeBinary(account.serializeBinary());
	assert.equal(decoded.getDisplayName(), 'Zoë Müller ☎ 电话');
});
