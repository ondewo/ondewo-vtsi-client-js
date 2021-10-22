console.log('CLIENT SCRIPT -- start');

const endPoint = 'https://webgrpc-vtsi.ondewo.com:443';
const authMetaData = {
	//Authorization: "<--Your authorization token-->",
	Authorization: ''
};

function loadConfig(url){
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
			const config = JSON.parse(this.responseText);
			console.log(config)
			runVTSIClientSample(endPoint, authMetaData, config);
		}
	};
	resourceUrl = url + "/config.json"
	xmlhttp.open("GET", resourceUrl, true);
	xmlhttp.send();
}

const serverUrl = "http://127.0.0.1:8080"
loadConfig(serverUrl)


function runVTSIClientSample(endPoint, authMetaData, config){
	authMetaData.Authorization = config.authorizationToken;

	const firstName = config.sampleFirstName;
	const lastName = config.sampleLastName;
	const phoneNumber = config.samplePhoneNumber
	const callId = uuidv4();
	console.log("Generated call Id: " + callId);
	const projectId = config.sampleProjectId;

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

	const parameter1 = new vtsi.Context.Parameter();

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
	startCallContext.parameters['p.phone_number'] = phoneNumberContextParameter;*/
	startCallInstanceRequest.setContextsList([startCallContext])
	//startCallInstanceRequest.setContext(startCallContext);

	const asteriskConfig = new vtsi.ServiceConfig();
	asteriskConfig.setHost(config.asteriskHost);
	asteriskConfig.setPort(config.asteriskPort);
	asteriskConfig.setServiceIdentifier('asterisk');
	asteriskConfig.setLanguageCode('de');
	startCallInstanceRequest.setAsteriskConfig(asteriskConfig);

	const caiConfig = new vtsi.ServiceConfig();
	caiConfig.setHost(config.nluHost);
	caiConfig.setPort(config.nluPort);
	caiConfig.setServiceIdentifier('');
	caiConfig.setLanguageCode('de');
	startCallInstanceRequest.setCaiConfig(caiConfig);

	const sttConfig = new vtsi.ServiceConfig();
	sttConfig.setHost(config.s2tHost);
	sttConfig.setPort(config.s2tPort);
	sttConfig.setServiceIdentifier('ONDEWO');
	sttConfig.setLanguageCode('default_german');
	startCallInstanceRequest.setSttConfig(sttConfig);

	const ttsConfig = new vtsi.ServiceConfig();
	ttsConfig.setHost(config.t2sHost);
	ttsConfig.setPort(config.t2sPort);
	ttsConfig.setServiceIdentifier('ONDEWO');
	ttsConfig.setLanguageCode('moritz');
	startCallInstanceRequest.setTtsConfig(ttsConfig);

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
