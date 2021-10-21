console.log('CLIENT SCRIPT -- start');

const endPoint = 'https://webgrpc-vtsi.ondewo.com:443';
const authMetaData = {
	//Authorization: "<--Your authorization token-->",
	Authorization: ''
};

runVTSIClientSample(endPoint, authMetaData);

function runVTSIClientSample(endPoint, authMetaData){
	const firstName = 'Philipp';
	const lastName = 'Schweiger';
	const phoneNumber = '+436605555555';
	const callId = '8804ddf0-e66e-44b5-a8c7-2891fe1d3f94';
	const projectId = 'f1daa016-f997-4729-a5e3-0bbf0725b439';

	const startCallInstanceRequest = new vtsi.StartCallInstanceRequest();
	startCallInstanceRequest.phoneNumber = phoneNumber;
	startCallInstanceRequest.callId = callId;
	startCallInstanceRequest.sipSimVersion = '1.0.0';
	startCallInstanceRequest.projectId = projectId;
	startCallInstanceRequest.initText = '';
	startCallInstanceRequest.sipPrefix = '';
	startCallInstanceRequest.sipName = '';
	startCallInstanceRequest.initialIntent = 'i.intro.hello';

	const startCallContext = new vtsi.Context();
	startCallContext.name = `projects/${projectId}/agent/sessions/${callId}/contexts/c-parameters`;
	startCallContext.lifespanCount = 1000;
	startCallContext.lifespanTime = 600;
	startCallContext.parameters = new Map();

	const firstNameContextParameter = new vtsi.Context.Parameter();
	firstNameContextParameter.name = '';
	firstNameContextParameter.displayName = 'p.first_name';
	firstNameContextParameter.value = firstName;
	firstNameContextParameter.valueOriginal = firstName;
	startCallContext.parameters['p.first_name'] = firstNameContextParameter;
	const lastNameContextParameter = new vtsi.Context.Parameter();
	lastNameContextParameter.name = '';
	lastNameContextParameter.displayName = 'p.last_name';
	lastNameContextParameter.value = lastName;
	lastNameContextParameter.valueOriginal = lastName;
	startCallContext.parameters['p.last_name'] = lastNameContextParameter;
	const phoneNumberContextParameter = new vtsi.Context.Parameter();
	phoneNumberContextParameter.name = '';
	phoneNumberContextParameter.displayName = 'p.phone_number';
	phoneNumberContextParameter.value = phoneNumber;
	phoneNumberContextParameter.valueOriginal = phoneNumber;
	startCallContext.parameters['p.phone_number'] = phoneNumberContextParameter;
	startCallInstanceRequest.context = startCallContext;

	const asteriskConfig = new vtsi.ServiceConfig();
	asteriskConfig.host = '192.168.1.111';
	asteriskConfig.port = '5060';
	asteriskConfig.serviceIdentifier = 'asterisk';
	asteriskConfig.languageCode = 'en';
	startCallInstanceRequest.asteriskConfig = asteriskConfig;

	const caiConfig = new vtsi.ServiceConfig();
	asteriskConfig.host = 'grpc-nlu-develop.ondewo.com';
	asteriskConfig.port = '443';
	asteriskConfig.serviceIdentifier = '';
	asteriskConfig.languageCode = 'en';
	startCallInstanceRequest.caiConfig = caiConfig;

	const sttConfig = new vtsi.ServiceConfig();
	asteriskConfig.host = 'grpc-s2t.ondewo.com';
	asteriskConfig.port = '443';
	asteriskConfig.serviceIdentifier = 'ONDEWO';
	asteriskConfig.languageCode = 'default_english';
	startCallInstanceRequest.sttConfig = sttConfig;

	const ttsConfig = new vtsi.ServiceConfig();
	asteriskConfig.host = 'grpc-t2s.ondewo.com';
	asteriskConfig.port = '443';
	asteriskConfig.serviceIdentifier = 'ONDEWO';
	asteriskConfig.languageCode = 'changyee';
	startCallInstanceRequest.ttsConfig = ttsConfig;

	console.log(startCallInstanceRequest)

	const vtsiClient = createVTSIClient(endPoint);
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
