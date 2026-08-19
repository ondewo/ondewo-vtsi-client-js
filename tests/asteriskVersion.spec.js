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

// `AsteriskConfigs.asteriskVersion` must carry EXPLICIT PRESENCE.
//
// The field selects the docker image tag of the Asterisk image a VTSI project starts. The server
// falls back to its own `ONDEWO_VTSI_ASTERISK_IMAGE_TAG` default when the caller says nothing, so
// "the caller said nothing" and "the caller sent the empty string" have to stay distinguishable on
// the wire -- the first is a fallback, the second is a caller error. A plain proto3 scalar cannot
// express that difference.
//
// This drives the SHIPPED ARTIFACT (`api/ondewo_vtsi_api.js`), not the proto source: that bundle is
// what an npm consumer loads, so a regeneration that never reached it would pass a source-level
// check and fail here. The bundle is a browser build that assigns a global rather than exporting a
// module, so it is evaluated inside a `vm` context and the global is read back out.
//   node --test tests/asteriskVersion.spec.js

'use strict';

const { test: runTestCase } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** A real ONDEWO Asterisk image tag, so the value is representative rather than a placeholder. */
const ASTERISK_VERSION = 'alpine-3.18-18.20.2';

/** The generated, webpack-bundled API surface this package publishes. */
const BUNDLE_PATH = path.join(__dirname, '..', 'api', 'ondewo_vtsi_api.js');

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

/** Build an otherwise-valid AsteriskConfigs -- the oneof is set, as the server requires. */
function makeConfigs(api) {
	const configs = new api.AsteriskConfigs();
	configs.setAsteriskConfigsTargetDirectoryName('asterisk_configs_dir');
	configs.setAsteriskPort(5060);
	return configs;
}

runTestCase('AsteriskConfigs exposes the asteriskVersion accessors', () => {
	const api = loadApiBundle();
	const configs = makeConfigs(api);
	for (const accessor of ['getAsteriskVersion', 'setAsteriskVersion', 'hasAsteriskVersion', 'clearAsteriskVersion']) {
		assert.equal(typeof configs[accessor], 'function', `missing accessor ${accessor}`);
	}
});

runTestCase('an unset asteriskVersion is reported as absent', () => {
	const api = loadApiBundle();
	const configs = makeConfigs(api);
	assert.equal(configs.hasAsteriskVersion(), false);
	// The read still yields the scalar default, which is exactly why `has` is the question a caller
	// has to ask.
	assert.equal(configs.getAsteriskVersion(), '');
});

runTestCase('a set asteriskVersion is reported as present', () => {
	const api = loadApiBundle();
	const configs = makeConfigs(api);
	configs.setAsteriskVersion(ASTERISK_VERSION);
	assert.equal(configs.hasAsteriskVersion(), true);
	assert.equal(configs.getAsteriskVersion(), ASTERISK_VERSION);
});

runTestCase('an explicitly empty asteriskVersion is present and not the same as unset', () => {
	const api = loadApiBundle();
	const configs = makeConfigs(api);
	configs.setAsteriskVersion('');
	assert.equal(configs.hasAsteriskVersion(), true);
	assert.equal(configs.getAsteriskVersion(), '');
	// Both read back '' -- the distinction survives only in the presence bit and on the wire.
	assert.notDeepEqual(configs.serializeBinary(), makeConfigs(api).serializeBinary());
});

runTestCase('clearing asteriskVersion restores absence', () => {
	const api = loadApiBundle();
	const configs = makeConfigs(api);
	configs.setAsteriskVersion(ASTERISK_VERSION);
	configs.clearAsteriskVersion();
	assert.equal(configs.hasAsteriskVersion(), false);
});

runTestCase('presence and absence both survive a binary round trip', () => {
	const api = loadApiBundle();
	for (const value of [ASTERISK_VERSION, '']) {
		const sent = makeConfigs(api);
		sent.setAsteriskVersion(value);
		const received = api.AsteriskConfigs.deserializeBinary(sent.serializeBinary());
		assert.equal(received.hasAsteriskVersion(), true, `presence lost for ${JSON.stringify(value)}`);
		assert.equal(received.getAsteriskVersion(), value);
	}
	const unset = api.AsteriskConfigs.deserializeBinary(makeConfigs(api).serializeBinary());
	assert.equal(unset.hasAsteriskVersion(), false);
});

runTestCase('asteriskVersion does not participate in the asterisk_configs oneof', () => {
	// `optional` compiles to a SYNTHETIC oneof. The server reads its configuration variant with
	// `WhichOneof("asterisk_configs_oneof")` and rejects an unset one as a caller error, so a
	// synthetic oneof sitting next to the real one must not change that answer in either direction.
	const api = loadApiBundle();
	const versionOnly = new api.AsteriskConfigs();
	versionOnly.setAsteriskVersion(ASTERISK_VERSION);
	assert.equal(
		versionOnly.getAsteriskConfigsOneofCase(),
		api.AsteriskConfigs.AsteriskConfigsOneofCase.ASTERISK_CONFIGS_ONEOF_NOT_SET
	);

	const configs = makeConfigs(api);
	configs.setAsteriskVersion(ASTERISK_VERSION);
	assert.equal(
		configs.getAsteriskConfigsOneofCase(),
		api.AsteriskConfigs.AsteriskConfigsOneofCase.ASTERISK_CONFIGS_TARGET_DIRECTORY_NAME
	);
});

runTestCase('the presence assertions are falsifiable', () => {
	// A premise test. `asteriskPort` is the plain proto3 scalar sitting one field number below and
	// is the control: the generator emits NO `has`/`clear` pair for it. Dropping `optional` from the
	// .proto moves asteriskVersion into that column and every test above fails on a missing method.
	const api = loadApiBundle();
	const configs = makeConfigs(api);
	assert.equal(typeof configs.hasAsteriskPort, 'undefined');
	assert.equal(typeof configs.clearAsteriskPort, 'undefined');
});
