console.log('CLIENT SCRIPT -- start');

//console.log('survey namespace:');
//console.log(survey);
//console.log('proto namespace:');
//console.log(proto);

const endPoint = 'https://webgrpc-survey-develop.ondewo.com:443';
const authMetaData = {
	//Authorization: "<--Your authorization token-->",
	Authorization: ''
};

runDefaultSurveyClientSample(endPoint, authMetaData);
//runFHIRSurveyClientSample(endPoint, authMetaData);

function runDefaultSurveyClientSample(endPoint, authMetaData){

	//Define types to use
	const CreateSurveyRequest = survey.CreateSurveyRequest;
	const GetSurveyRequest = survey.GetSurveyRequest;

	const Survey = survey.Survey;
	const Question = survey.Question;
	const SurveyInfo = survey.SurveyInfo;
	//const OpenQuestion = survey.OpenQuestion
	const SingleParameterQuestion = survey.SingleParameterQuestion

	const SurveysPromiseClient = survey.SurveysPromiseClient;

	//Helper functions
	console.log("runDefaultSurveyClientSample");

	function createSampleSurvey(client, requestMetaData) {
		let newSurvey = new Survey();
		newSurvey.setLanguageCode('de');
		//newSurvey.setSurveyId("projects/ddde0272-1d70-4927-a3b9-9837bfa66143/agent");
		newSurvey.setDisplayName('JS Client - This is a sample survey');
		const questions = [];
	
		/*const question1 = new OpenQuestion();
		question1.setQuestionText("Open question questions question question?")
		questions.push(question1);*/
		
		const question2 = new SingleParameterQuestion();
		//const question2 = new Question();
		question2.setQuestionText("Single parameter question?")
		question2.setParameterType("sys.date_time")
	
		const question = new Question();
		question.setSingleParameterQuestion(question2);
	
		questions.push(question);
	
		newSurvey.setQuestionsList(questions);
	
		const surveyInfo = new SurveyInfo();
		surveyInfo.setEmailAddress('markus.peitl@ondewo.com');
		surveyInfo.setPhoneNumber('+436602094000');
		surveyInfo.setPurpose('This is a sample survey to test creating with js api');
		surveyInfo.setTopic('testing');
		newSurvey.setSurveyInfo(surveyInfo);
	
		var request = new CreateSurveyRequest();
		request.setSurvey(newSurvey);
	
		console.log(request);
		return client.createSurvey(request, requestMetaData);
	}
	
	function getSurvey(client, requestMetaData, surveyId) {
		var request = new GetSurveyRequest();
		console.log(request);
		request.setSurveyId(surveyId);
	
		return client.getSurvey(request, requestMetaData);
	}
	
	function createSurveyClient(host) {
		//const hostName = "https://webgrpc-survey-develop.ondewo.com:443"
		const credentials = {};
		// ClientOptions
		// suppressCorsPreflight: boolean, withCredentials: boolean, this.unaryInterceptors; this.streamInterceptors; this.format; this.workerScope; this.useFetchDownloadStreams;
		//
		const clientOptions = {
			withCredentials: false,
			suppressCorsPreflight: false
		};
	
		//var client = new SurveysClient(host, credentials, clientOptions)
		var client = new SurveysPromiseClient(host, credentials, clientOptions);
		return client;
	}

	//Create client and dispatch requests
	const client = createSurveyClient(endPoint);
	getSurvey(client, authMetaData, 'projects/ddde0272-1d70-4927-a3b9-9837bfa66143/agent')
	.then((survey) => {
		console.log('Fetched survey from server: ');
		console.log(survey);
	})
	.catch((err) => {
		console.log('Error occured, while create fetching survey: ');
		console.log(err);
	});

	createSampleSurvey(client, authMetaData)
	.then((survey) => {
		console.log('Created survey: ');
		console.log(survey);

		return getSurvey(client, authMetaData, survey.getSurveyId());
	})
	.then((survey) => {
		console.log('Fetched survey from server: ');
		console.log(survey);
	})
	.catch((err) => {
		console.log('Error occured, while create fetching survey: ');
		console.log(err);
	});
}

function runFHIRSurveyClientSample(endPoint, authMetaData){

	const FHIRPromiseClient = survey.FHIRPromiseClient;
	const CreateFHIRSurveyRequest = survey.CreateFHIRSurveyRequest;
	const structFromJavascript = proto.google.protobuf.Struct.fromJavaScript;
	const Struct = proto.google.protobuf.Struct;

	function createFHIRClient(host) {
		const credentials = {};
		const clientOptions = {
			withCredentials: false,
			suppressCorsPreflight: false
		};
		var client = new FHIRPromiseClient(host, credentials, clientOptions);
		return client;
	}
	
	function getSampleFHIRSurveyJson() {
		return {
			resourceType: 'Questionnaire',
			id: '69724-3',
			meta: {
				versionId: '2',
				lastUpdated: '2021-08-23T12:23:31.053+00:00',
				source: '#GCNaqRgPOfzKzXeq'
			},
			url: 'http://loinc.org/q/69724-3',
			name: 'Patient_health_questionnaire_item',
			title: 'Patient health questionnaire 4 item',
			status: 'draft',
			publisher: 'Regenstrief Institute, Inc.',
			contact: [
				{
					name: 'Regenstrief Institute, Inc.',
					telecom: [
						{
							system: 'url',
							value: 'http://loinc.org'
						}
					]
				}
			],
			copyright:
				'This content from LOINC® is copyright © 1995-2021 Regenstrief Institute, Inc. and the LOINC Committee, and available at no cost under the license at https://loinc.org/license/\r\nCopyright © Pfizer Inc. All rights reserved. Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.',
			code: [
				{
					system: 'http://loinc.org',
					code: '69724-3',
					display: 'Patient health questionnaire 4 item'
				}
			],
			item: [
				{
					linkId: '57491',
					code: [
						{
							system: 'http://loinc.org',
							code: '69725-0',
							display: 'Feeling nervous, anxious or on edge'
						}
					],
					prefix: 'PHQ4_01',
					text: 'Feeling nervous, anxious or on edge',
					type: 'choice',
					repeats: false,
					answerOption: [
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6568-5',
								display: 'Not at all'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6569-3',
								display: 'Several days'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6570-1',
								display: 'More than half the days'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6571-9',
								display: 'Nearly every day'
							}
						}
					]
				},
				{
					linkId: '57490',
					code: [
						{
							system: 'http://loinc.org',
							code: '68509-9',
							display: 'Over the past 2 weeks have you not been able to stop or control worrying'
						}
					],
					prefix: 'PHQ4_02',
					text: 'Over the past 2 weeks have you not been able to stop or control worrying',
					type: 'choice',
					repeats: false,
					answerOption: [
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6568-5',
								display: 'Not at all'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6569-3',
								display: 'Several days'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA18938-3',
								display: 'More days than not'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6571-9',
								display: 'Nearly every day'
							}
						}
					]
				},
				{
					linkId: '57489',
					code: [
						{
							system: 'http://loinc.org',
							code: '44250-9',
							display: 'Little interest or pleasure in doing things'
						}
					],
					prefix: 'PHQ4_03',
					text: 'Little interest or pleasure in doing things',
					type: 'choice',
					repeats: false,
					answerOption: [
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6568-5',
								display: 'Not at all'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6569-3',
								display: 'Several days'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6570-1',
								display: 'More than half the days'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6571-9',
								display: 'Nearly every day'
							}
						}
					]
				},
				{
					linkId: '57488',
					code: [
						{
							system: 'http://loinc.org',
							code: '44255-8',
							display: 'Feeling down, depressed, or hopeless'
						}
					],
					prefix: 'PHQ4_04',
					text: 'Feeling down, depressed, or hopeless',
					type: 'choice',
					repeats: false,
					answerOption: [
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6568-5',
								display: 'Not at all'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6569-3',
								display: 'Several days'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6570-1',
								display: 'More than half the days'
							}
						},
						{
							valueCoding: {
								system: 'http://loinc.org',
								code: 'LA6571-9',
								display: 'Nearly every day'
							}
						}
					]
				},
				{
					linkId: '58625',
					text: 'Patient health questionnaire 4 item total score',
					type: 'decimal'
				}
			]
		};
	}
	
	function createFhirSurvey(client, requestMetaData, jsonData) {
	
		const dataStruct = structFromJavascript(jsonData);
		//console.log(dataStruct)
		var request = new CreateFHIRSurveyRequest();
		//var request = new CreateFHIRSurveyRequest({ fhirQuestionnaire: jsonData });
		//var request = new CreateFHIRSurveyRequest({ 1: jsonData });
		request.setFhirQuestionnaire(dataStruct);
		
		console.log("CreateFHIRSurveyRequest:")
		console.log(request);
		return client.createFHIRSurvey(request, requestMetaData);
	}
	
	const fhirClient = createFHIRClient(endPoint);
	const data = getSampleFHIRSurveyJson();
	
	createFhirSurvey(fhirClient, authMetaData, data)
	.then((survey) => {
	  console.log('Created FHIR survey: ');
	  console.log(survey);
	
	  return getSurvey(fhirClient, authMetaData, survey.getSurveyId());
	})
	.then((survey) => {
	  console.log('Fetched survey from server: ');
	  console.log(survey);
	})
	.catch((err) => {
	  console.log('Error occured, while create fetching survey: ');
	  console.log(err);
	});
}

