console.log('CLIENT SCRIPT -- start');

const endPoint = 'https://webgrpc-vtsi.ondewo.com:443';
const authMetaData = {
	//Authorization: "<--Your authorization token-->",
	Authorization: ''
};

runVTSIClientSample(endPoint, authMetaData);

function runVTSIClientSample(endPoint, authMetaData){

	const startCallInstanceRequest = vtsi.StartCallInstanceRequest;
	startCallInstanceRequest.phoneNumber = '<INSERT PHONE NUMBER>';
	startCallInstanceRequest.callId = '<GENERATE SOME ID>';
	startCallInstanceRequest.sipSimVersion = '1.0.0';
	startCallInstanceRequest.projectId = 'f1daa016-f997-4729-a5e3-0bbf0725b439'; // EXAMPLE
	startCallInstanceRequest.initText = '';
	startCallInstanceRequest.sipPrefix = '';
	startCallInstanceRequest.sipName = '';
	startCallInstanceRequest.initialIntent = 'i.intro.hello';

	const startCallContext = vtsi.Context;
	startCallContext.name = 'projects/f1daa016-f997-4729-a5e3-0bbf0725b439/agent/sessions/8804ddf0-e66e-44b5-a8c7-2891fe1d3f91/contexts/c-parameters';
	startCallContext.lifespanCount = 1000;
	startCallContext.lifespanTime = 600;
	const firstName = vtsi.Context.Parameter;
	firstName.name = '';
	firstName.displayName = 'p.first_name';
	firstName.value = 'Philipp';
	firstName.valueOriginal = 'Philipp';
	startCallContext.parametersMap.push(firstName);
	const lastName = vtsi.Context.Parameter;
	firstName.name = '';
	firstName.displayName = 'p.last_name';
	firstName.value = 'Schweiger';
	firstName.valueOriginal = 'Schweiger';
	startCallContext.parametersMap.push(lastName);
	const phoneNumber = vtsi.Context.Parameter;
	firstName.name = '';
	firstName.displayName = 'p.phone_number';
	firstName.value = '+436605555555';
	firstName.valueOriginal = '+436605555555';
	startCallContext.parametersMap.push(phoneNumber);
	startCallInstanceRequest.context = startCallContext;

	const asteriskConfig = vtsi.ServiceConfig;
	asteriskConfig.host = '<INSERT HOST>';
	asteriskConfig.port = '<INSERT PORT>';
	asteriskConfig.serviceIdentifier = 'asterisk';
	asteriskConfig.languageCode = 'en';
	startCallInstanceRequest.asteriskConfig = asteriskConfig;

	const caiConfig = vtsi.ServiceConfig;
	asteriskConfig.host = '<INSERT HOST>';
	asteriskConfig.port = '<INSERT PORT>';
	asteriskConfig.serviceIdentifier = '';
	asteriskConfig.languageCode = 'en';
	startCallInstanceRequest.caiConfig = caiConfig;

	const sttConfig = vtsi.ServiceConfig;
	asteriskConfig.host = '<INSERT HOST>';
	asteriskConfig.port = '<INSERT PORT>';
	asteriskConfig.serviceIdentifier = 'ONDEWO';
	asteriskConfig.languageCode = 'default_english';
	startCallInstanceRequest.sttConfig = sttConfig;

	const ttsConfig = vtsi.ServiceConfig;
	asteriskConfig.host = '<INSERT HOST>';
	asteriskConfig.port = '<INSERT PORT>';
	asteriskConfig.serviceIdentifier = 'ONDEWO';
	asteriskConfig.languageCode = 'changyee';
	startCallInstanceRequest.ttsConfig = ttsConfig;

	const vtsiClient = createVTSIClient(host);
	vtsiClient.startCallInstance(startCallInstanceRequest, authMetaData)
		.then(response => {
			if (response.success) {
				console.log(`Starting a call was successful`);
			} else {
				console.log(`Starting a call was not successful`);
			}
		})
		.catch(error => {
			console.log(`An error occured: ${error}`);
		});

	function createVTSIClient(host) {
		const credentials = {};
		const clientOptions = {
			withCredentials: false,
			suppressCorsPreflight: false
		};

		return new vtsi.VoipSessionsPromiseClient(host, credentials, clientOptions);
	}
}
