import Controls = require("VSS/Controls");
import VSS_Service = require("VSS/Service");
import TFS_Build_Contracts = require("TFS/Build/Contracts");
import TFS_Build_Extension_Contracts = require("TFS/Build/ExtensionContracts");
import TFS_Release_Extension_Contracts = require("ReleaseManagement/Core/ExtensionContracts");
import TFS_Release_Contracts = require("ReleaseManagement/Core/Contracts");
import DT_Client = require("TFS/DistributedTask/TaskRestClient");
import RM_Client = require("ReleaseManagement/Core/RestClient");

export class DynatraceBuildControl extends Controls.BaseControl {
	constructor() {
		super();
	}
		
	public initialize(): void {
		super.initialize();
		// Get configuration that's shared between extension and the extension host
		var sharedConfig: TFS_Build_Extension_Contracts.IBuildResultsViewExtensionConfig = VSS.getConfiguration();
		var vsoContext = VSS.getWebContext();
		if(sharedConfig) {
			// register your extension with host through callback
			sharedConfig.onBuildChanged((build: TFS_Build_Contracts.Build) => {
				// get the dynatraceTestRun attachment from the build
				var taskClient = DT_Client.getClient();
				
				taskClient.getPlanAttachments(vsoContext.project.id, "build", build.orchestrationPlan.planId, this.getAttachmentType()).then((taskAttachments)=> {							
					if (taskAttachments.length === 1) {
						var recId = taskAttachments[0].recordId;
						var timelineId = taskAttachments[0].timelineId;
	
						taskClient.getAttachmentContent(vsoContext.project.id, "build", build.orchestrationPlan.planId,timelineId,recId,this.getAttachmentType(),"dynatraceTestRunResult").then((attachmentContent)=> {														
							function arrayBufferToString(buffer){
										var arr = new Uint8Array(buffer);
										var str = String.fromCharCode.apply(String, arr);
										if(/[\u0080-\uffff]/.test(str)){
											throw new Error("this string seems to contain (still encoded) multibytes");
										}
										return str;
									}
							
							var dynatraceTestRunData = arrayBufferToString(attachmentContent);
							this.displayDynatraceTestRunData(JSON.parse(dynatraceTestRunData));
						});
					}
				});
			});
			
			sharedConfig.onViewDisplayed(() => {
				VSS.resize();
			});
		}
	}
	
	protected displayDynatraceTestRunData(testRunData) {}
	
	protected getAttachmentType() {
		return "dynatraceTestRun";
	}
	
	public hasTests(testRunData) {
		if (!testRunData.testresults) return false;
		if (testRunData.testresults.length==0) return false;
		return true;
	}
	
}

export class DynatraceReleaseControl extends Controls.BaseControl {
	
	constructor() {
		super();
	}
		
	public initialize(): void {
		super.initialize();
		// Get configuration that's shared between extension and the extension host
		var sharedConfig: TFS_Release_Extension_Contracts.IReleaseViewExtensionConfig = VSS.getConfiguration();
		if(sharedConfig) {
			// register your extension with host through callback
			sharedConfig.onReleaseChanged((release: TFS_Release_Contracts.Release) => {
				// get the dynatraceTestRun attachment from the build
				var rmClient = RM_Client.getClient();
				var LOOKFOR_TASK = "Collect Dynatrace Testrun Results";
				var LOOKFOR_TESTRUNDATA = "\"testRunData\":";
				
				var drcScope = this;
				
				release.environments.forEach(function (env) {
					var _env = env;
					//project: string, releaseId: number, environmentId: number, taskId: number
					rmClient.getTasks(VSS.getWebContext().project.id, release.id, env.id).then(function(tasks){
						tasks.forEach(function(task){
							if (task.name == LOOKFOR_TASK){
								rmClient.getLog(VSS.getWebContext().project.id, release.id, env.id, task.id).then(function(log){
									var iTRD = log.indexOf(LOOKFOR_TESTRUNDATA);
									if (iTRD > 0){
										var testRunData = JSON.parse(log.substring(iTRD + LOOKFOR_TESTRUNDATA.length, log.indexOf('}',iTRD)+1));
										
										drcScope.displayDynatraceTestRunData.bind(drcScope);
										drcScope.displayDynatraceTestRunData(_env.name, testRunData);
									}
								});
							}
						});
					});
				});
			});
			
			sharedConfig.onViewDisplayed(() => {
				VSS.resize();
			});
			
		}
	}
	
	protected displayDynatraceTestRunData(env, testRunData) {}
	
}

export class DynatraceBuildSummarySection extends DynatraceBuildControl {	
	constructor() {
		super();
	}
	
	protected displayDynatraceTestRunData(testRunData) {
		if (testRunData.hasTests){
			this._element.find("table").show();
			
			var elementRow = $("<tr/>");
			elementRow.append($("<td/>").text(testRunData.numpassed));
			elementRow.append($("<td/>").text(testRunData.numimproved));
			elementRow.append($("<td/>").text(testRunData.numvolatile));
			elementRow.append($("<td/>").text(testRunData.numdegraded));
			elementRow.append($("<td/>").text(testRunData.numfailed));
			this._element.find("table").append(elementRow);
		}
		else if (testRunData.message){
			this._element.append($("<span/>").addClass("message").text(testRunData.message));
		}
	}
	
	protected getAttachmentType() {
		return "dynatraceTestRunSummary";
	}
}

export class DynatraceReleaseSummarySection extends DynatraceReleaseControl {	
	constructor() {
		super();
	}
	
	protected displayDynatraceTestRunData(env, testRunData) {
	    if (testRunData.hasTests){
			var table = this._element.find("table").first().clone();
			
			var elementRow = $("<tr/>");
			elementRow.append($("<td/>").text(testRunData.numpassed));
			elementRow.append($("<td/>").text(testRunData.numimproved));
			elementRow.append($("<td/>").text(testRunData.numvolatile));
			elementRow.append($("<td/>").text(testRunData.numdegraded));
			elementRow.append($("<td/>").text(testRunData.numfailed));
			
			table.append(elementRow)
			table.show();
			
			this._element.append($("<div/>").addClass("env").text(env));
			this._element.append(table);
		}
		else if (testRunData.message){
			this._element.append($("<div/>").addClass("env").text(env));
			this._element.append($("<span/>").addClass("message").text(testRunData.message));
		}
	}
}

export class DynatraceBuildResultsTab extends DynatraceBuildControl {	
	constructor() {
		super();
	}
	
	protected displayDynatraceTestRunData(testRunData) {
		var hasTests = this.hasTests(testRunData);
		if (!hasTests){
			this._element.append($("<span/>").addClass("message").text(testRunData.message));
			return;
		}
		
		this._element.find("#testrunid").text(testRunData.id);
		this._element.find("#category").text(testRunData.category);
		this._element.find("#systemprofile").text(testRunData.systemprofile);
		
		$.each(testRunData.testresults, (index, testResult) => {
			var elementBlock = $("<div/>").addClass("testresult");
			elementBlock.append($("<h4/>").text(testResult.name));
			elementBlock.append($("<label/>").text("Status")).append($("<span/>").text(testResult.status));
			elementBlock.append($("<label/>").text("Timestamp")).append($("<span/>").text(testResult.exectime));
			elementBlock.append($("<label/>").text("Package")).append($("<span/>").text(testResult['package']));
			elementBlock.append($("<label/>").text("Platform")).append($("<span/>").text(testResult.platform));
			
			if (testResult.measures){
				var elementMT = $("<table/>").addClass("measures");
				elementMT.append($("<tr/>")
						.append($("<th/>").text("Measure"))
						.append($("<th/>").text("Value"))
						.append($("<th/>").text("Expected min"))
						.append($("<th/>").text("Expected max"))
						.append($("<th/>").text("Violation %"))
				);
				
			   
				$.each(testResult.measures, (index, measure) => {
					elementMT.append($("<tr/>")
							.append($("<td/>").text(measure.metricgroup + ' - ' + measure.name + ' (' + measure.unit + ')'))
							.append($("<td/>").text(measure.value))
							.append($("<td/>").text(measure.expectedmin))
							.append($("<td/>").text(measure.expectedmax))
							.append($("<td/>").text(measure.violationpercentage))
					);
				});
				elementBlock.append(elementMT);
			}
			
			this._element.append(elementBlock);
		});
	}
}

if (typeof VSS.getConfiguration().onBuildChanged == 'function'){	
	DynatraceBuildSummarySection.enhance(DynatraceBuildSummarySection, $(".dynatrace-testautomation-summary"), {});
	DynatraceBuildResultsTab.enhance(DynatraceBuildResultsTab, $(".dynatrace-testautomation-results"), {});
}
if (typeof VSS.getConfiguration().onReleaseChanged == 'function'){	
	DynatraceReleaseSummarySection.enhance(DynatraceReleaseSummarySection, $(".dynatrace-testautomation-summary"), {});
}

// Notify the parent frame that the host has been loaded
VSS.notifyLoadSucceeded();

	