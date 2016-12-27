import Controls = require("VSS/Controls");
import VSS_Service = require("VSS/Service");
import TFS_Build_Contracts = require("TFS/Build/Contracts");
import TFS_Build_Extension_Contracts = require("TFS/Build/ExtensionContracts");
import DT_Client = require("TFS/DistributedTask/TaskRestClient");

export class DynatraceControl extends Controls.BaseControl {
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
				taskClient.getPlanAttachments(vsoContext.project.id, "build", build.orchestrationPlan.planId, "dynatraceTestRun").then((taskAttachments)=> {							
					if (taskAttachments.length === 1) {
						var recId = taskAttachments[0].recordId;
						var timelineId = taskAttachments[0].timelineId;
	
						taskClient.getAttachmentContent(vsoContext.project.id, "build", build.orchestrationPlan.planId,timelineId,recId,"dynatraceTestRun","dynatraceTestRunResult").then((attachmentContent)=> {														
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
	
	public hasTests(testRunData) {
		if (!testRunData.testresults) return false;
		if (testRunData.testresults.length==0) return false;
		return true;
	}
	
}

export class DynatraceSummarySection extends DynatraceControl {	
	constructor() {
		super();
	}
	
	protected displayDynatraceTestRunData(testRunData) {
		var hasTests = this.hasTests(testRunData);
		if (hasTests){
			this._element.find("table").show();
			
			var elementRow = $("<tr/>");
			elementRow.append($("<td/>").text(testRunData.numpassed));
			elementRow.append($("<td/>").text(testRunData.numimproved));
			elementRow.append($("<td/>").text(testRunData.numvolatile));
			elementRow.append($("<td/>").text(testRunData.numdegraded));
			elementRow.append($("<td/>").text(testRunData.numfailed));
			this._element.find("table").append(elementRow);
		}
		else{
			this._element.append($("<span/>").addClass("message").text(testRunData.message));
		}
	}
}

export class DynatraceResultsTab extends DynatraceControl {	
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

DynatraceSummarySection.enhance(DynatraceSummarySection, $(".dynatrace-testautomation-summary"), {});
DynatraceResultsTab.enhance(DynatraceResultsTab, $(".dynatrace-testautomation-results"), {});

// Notify the parent frame that the host has been loaded
VSS.notifyLoadSucceeded();

	