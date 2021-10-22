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
	const phoneNumber = '+43660209XXXX';
	const callId = uuidv4();
	console.log("Generated call Id: " + callId);
	const projectId = 'f1daa016-f997-4729-a5e3-0bbf0725b439';

	const startCallInstanceRequest = new vtsi.StartCallInstanceRequest();
	startCallInstanceRequest.setPhoneNumber(phoneNumber);
	startCallInstanceRequest.setCallId(callId);
	startCallInstanceRequest.setSipSimVersion('1.0.0');
	startCallInstanceRequest.setProjectId(projectId);
	startCallInstanceRequest.setInitText('');
	startCallInstanceRequest.setSipPrefix('');
	startCallInstanceRequest.setSipName('');
	startCallInstanceRequest.setInitialIntent('i.intro.hello');

	const startCallContext = new vtsi.Context();
	startCallContext.name = `projects/${projectId}/agent/sessions/${callId}/contexts/c-parameters`;
	startCallContext.setLifespanCount(1000);
	startCallContext.setLifespanTime(600);

	//startCallContext.parametersMap = new Map();

	/*const firstNameContextParameter = new vtsi.Context.Parameter();
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
	startCallInstanceRequest.setContext(startCallContext);*/

	const asteriskConfig = new vtsi.ServiceConfig();
	asteriskConfig.setHost('192.168.1.111');
	asteriskConfig.setPort('5060');
	asteriskConfig.setServiceIdentifier('asterisk');
	asteriskConfig.setLanguageCode('de');
	startCallInstanceRequest.setAsteriskConfig(asteriskConfig);

	const caiConfig = new vtsi.ServiceConfig();
	caiConfig.setHost('grpc-nlu-develop.ondewo.com');
	caiConfig.setPort('443');
	caiConfig.setServiceIdentifier('');
	caiConfig.setLanguageCode('de');
	startCallInstanceRequest.setCaiConfig(caiConfig);

	const sttConfig = new vtsi.ServiceConfig();
	sttConfig.setHost('grpc-s2t.ondewo.com');
	sttConfig.setPort('443');
	sttConfig.setServiceIdentifier('ONDEWO');
	sttConfig.setLanguageCode('default_german');
	startCallInstanceRequest.setSttConfig(sttConfig);

	const ttsConfig = new vtsi.ServiceConfig();
	ttsConfig.setHost('grpc-t2s.ondewo.com');
	ttsConfig.setPort('443');
	ttsConfig.setServiceIdentifier('ONDEWO');
	ttsConfig.setLanguageCode('moritz');
	startCallInstanceRequest.ttsConfig = ttsConfig;

	console.log(startCallInstanceRequest)

	const vtsiClient = createVTSIClient(endPoint);
	vtsiClient.startCallInstance(startCallInstanceRequest, authMetaData)
		.then(response => {
			console.log(response);
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
