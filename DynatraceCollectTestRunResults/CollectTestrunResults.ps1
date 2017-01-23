#################################################################################################################
# Copyright 2016 Realdolmen
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#################################################################################################################
#
# @author: Bert Van der Heyden (Realdolmen)
#
# Collect Dynatrace Testrun Result via REST
#
#################################################################################################################
[CmdletBinding(DefaultParameterSetName = 'None')]
param(
	[string][Parameter(Mandatory=$true)] $markBuildOnDegraded,
	[string][Parameter(Mandatory=$true)] $markBuildOnVolatile
)

import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal" 

$logIssueMapping = @{ "FAILED" = "error"; "WARNING" = "warning"}
$completeTaskMapping = @{ "FAILED" = "Failed"; "WARNING" = "SucceededWithIssues"}
function markBuild ($As, $Cause, $HowMany) {
    $lit=$logIssueMapping.Item($As)
    $ctr=$completeTaskMapping.Item($As)
    Write-Host "##vso[task.logissue type=$lit;]Dynatrace - There are $HowMany tests marked as $Cause!"
    Write-Host "##vso[task.complete result=$ctr;]Dynatrace - There are $HowMany tests marked as $Cause!"
    exit 1
}

function countTestRunEntries ($Data) {
	if ($Data.testresults) {$Data.testresults.Length} else {0}
}

Write-Host "Starting Collection of Dynatrace Testrun Results"

if (-not $env:DT_SERVICE_ENDPOINT_ID){
    Write-Host "##vso[task.logissue type=error;]This task can only be used in combination with the -Dynatrace Register Testrun- task which should be executed first!"
    exit 1
}

$dynatraceEndpoint = Get-ServiceEndpoint -Context $distributedTaskContext -Name $env:DT_SERVICE_ENDPOINT_ID
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
$securePwd = ConvertTo-SecureString $dynatraceEndpoint.Authorization.Parameters['password'] -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential ($dynatraceEndpoint.Authorization.Parameters['username'], $securePwd)

$endpoint = $env:DT_TESTRUN_HREF
Write-Host "Invoking: $endpoint"

$WebClient = New-Object System.Net.WebClient
$WebClient.Credentials = $credential

#Try getting the data but wait until it is stable. Dynatrace might take a while to get everything processed
$testRunData = $WebClient.DownloadString($endpoint) | ConvertTo-Json
$testRunCount = countTestRunEntries($testRunData)
$prevTestRunCount = 0
$retries = 10
while (($testRunCount -eq 0 -or $testRunCount -gt $prevTestRunCount) -and $retries -gt 0)
{
  Start-Sleep -s 20
  $prevTestRunCount = $testRunCount
  $testRunData = $WebClient.DownloadString($endpoint) | ConvertTo-Json
  $testRunCount = countTestRunEntries($testRunData)
  $retries--
  if ($retries -lt 7 -and $testRunCount -eq 0) {
    $retries = 0
  }
}

$Path = [io.path]::GetTempFileName()
$WebClient.DownloadFile( $endpoint, $path ) 

Write-Host "##vso[task.addattachment type=dynatraceTestRun;name=dynatraceTestRunResult;]$Path"

$testRunContent = (Get-Content $Path) -Join "`n" | ConvertFrom-Json
$testRunNumDegraded = $testRunContent.numdegraded
$testRunNumVolatile = $testRunContent.numvolatile

#Failed takes precedence
if($markBuildOnDegraded -eq "FAILED" -or $markBuildOnVolatile -eq "FAILED") {
    if($testRunNumDegraded -gt 0 -and $markBuildOnDegraded -eq "FAILED") {
       markBuild -As markBuildOnDegraded -Cause "degraded" -HowMany $testRunNumDegraded
    }
    if($testRunNumVolatile -gt 0 -and $markBuildOnVolatile -eq "FAILED") {
       markBuild -As $markBuildOnVolatile -Cause "volatile" -HowMany $testRunNumVolatile
    }
}

if($testRunNumDegraded -gt 0 -and $markBuildOnDegraded -eq "WARNING") {
    markBuild -As $markBuildOnDegraded -Cause "degraded" -HowMany $testRunNumDegraded
}
if($testRunNumVolatile -gt 0 -and $markBuildOnVolatile -eq "WARNING") {
    markBuild -As $markBuildOnVolatile -Cause "volatile" -HowMany $testRunNumVolatile
}

