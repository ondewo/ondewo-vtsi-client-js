console.log('CLIENT SCRIPT -- start');

const authMetaData = {
    // Authorization: "<--Your authorization token-->",
    Authorization: ''
};

function loadConfig(url) {
    const xmlhttp = new XMLHttpRequest(); // Use const for XMLHttpRequest
    xmlhttp.onreadystatechange = function () {
        if (this.readyState === 4 && this.status === 200) { // Use strict equality
            const config = JSON.parse(this.responseText);
            console.log(config);
            runVTSIClientSample(authMetaData, config);
        }
    };

    const resourceUrl = `${url}/config.json`; // Use const for resourceUrl
    xmlhttp.open('GET', resourceUrl, true);
    xmlhttp.send();
}

const serverUrl = 'http://127.0.0.1:8080';
loadConfig(serverUrl);

function runVTSIClientSample(authMetaData, config) {
    authMetaData.Authorization = config.authorizationToken;

    const firstName = config.sampleFirstName;
    const lastName = config.sampleLastName;
    const phoneNumber = config.samplePhoneNumber;
    const callId = uuidv4(); // Use the uuidv4 function from the included library
    console.log('Generated call Id: ' + callId);
    const projectId = config.sampleProjectId;

    const startCallInstanceRequest = new vtsi.StartCallInstanceRequest(); // Use the vtsi library
    startCallInstanceRequest.setPhoneNumber(phoneNumber);
    startCallInstanceRequest.setCallId(callId);
    startCallInstanceRequest.setSipSimVersion('1.0.0');
    startCallInstanceRequest.setProjectId(projectId);
    startCallInstanceRequest.setInitText('');
    startCallInstanceRequest.setSipPrefix('');
    startCallInstanceRequest.setSipName('');
    startCallInstanceRequest.setInitialIntent('i.intro.hello');

    const startCallContext = new vtsi.Context(); // Use the vtsi library
    startCallContext.setName(`projects/${projectId}/agent/sessions/${callId}/contexts/c-parameters`);
    startCallContext.setLifespanCount(1000);
    startCallContext.setLifespanTime(600);

    const parametersMap = startCallContext.getParametersMap();

    const parameter1 = new vtsi.Context.Parameter(); // Use the vtsi library
    parameter1.setName('');
    parameter1.setDisplayName('p.first_name');
    parameter1.setValue(firstName);
    parameter1.setValueOriginal(firstName);
    parametersMap.set(parameter1.getDisplayName(), parameter1);

    const parameter2 = new vtsi.Context.Parameter(); // Use the vtsi library
    parameter2.setName('');
    parameter2.setDisplayName('p.last_name');
    parameter2.setValue(lastName);
    parameter2.setValueOriginal(lastName);
    parametersMap.set(parameter2.getDisplayName(), parameter2);

    const parameter3 = new vtsi.Context.Parameter(); // Use the vtsi library
    parameter3.setName('');
    parameter3.setDisplayName('p.phone_number');
    parameter3.setValue(phoneNumber);
    parameter3.setValueOriginal(phoneNumber);
    parametersMap.set(parameter3.getDisplayName(), parameter3);

    const contextsList = [];
    contextsList.push(startCallContext);

    console.log('contextsList:');
    console.log(contextsList);

    startCallInstanceRequest.setContextsList(contextsList);

    const asteriskConfig = new vtsi.ServiceConfig(); // Use the vtsi library
    asteriskConfig.setHost(config.asteriskHost);
    asteriskConfig.setPort(config.asteriskPort);
    asteriskConfig.setServiceIdentifier('asterisk');
    asteriskConfig.setLanguageCode('en');
    startCallInstanceRequest.setAsteriskConfig(asteriskConfig);

    const caiConfig = new vtsi.ServiceConfig(); // Use the vtsi library
    caiConfig.setHost(config.nluHost);
    caiConfig.setPort(config.nluPort);
    caiConfig.setServiceIdentifier('');
    caiConfig.setLanguageCode('en');
    startCallInstanceRequest.setCaiConfig(caiConfig);

    const sttConfig = new vtsi.ServiceConfig(); // Use the vtsi library
    sttConfig.setHost(config.s2tHost);
    sttConfig.setPort(config.s2tPort);
    sttConfig.setServiceIdentifier('ONDEWO');
    sttConfig.setLanguageCode('general_english');
    startCallInstanceRequest.setSttConfig(sttConfig);

    const ttsConfig = new vtsi.ServiceConfig(); // Use the vtsi library
    ttsConfig.setHost(config.t2sHost);
    ttsConfig.setPort(config.t2sPort);
    ttsConfig.setServiceIdentifier('ONDEWO');
    ttsConfig.setLanguageCode('eric');
    startCallInstanceRequest.setTtsConfig(ttsConfig);

    console.log(startCallInstanceRequest);

    const endPoint = `${config.vtsiHost}:${config.vtsiPort}`;
    const vtsiClient = createVTSIClient(endPoint);
    testCall(startCallInstanceRequest, authMetaData);

    function testCall(startCallInstanceRequest, authMetaData) {
        console.log(startCallInstanceRequest);

        vtsiClient
            .startCallInstance(startCallInstanceRequest, authMetaData)
            .then((response) => {
                console.log(response);
                if (response.getSuccess()) {
                    console.log(`Starting a call was successful`);
                } else {
                    console.log(`Starting a call was not successful`);
                }
            })
            .catch((error) => {
                console.log(`An error occurred: ${error}`);
            });
    }

    function createVTSIClient(host) {
        const credentials = {};
        const clientOptions = {
            withCredentials: false,
            suppressCorsPreflight: false
        };

        return new vtsi.VoipSessionsPromiseClient(host, credentials, clientOptions); // Use the vtsi library
    }
}
