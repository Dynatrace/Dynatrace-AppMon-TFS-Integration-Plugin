#################################################################################################################
# Copyright 2017 Realdolmen
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
# Register Dynatrace Testrun via REST
#
#################################################################################################################
[CmdletBinding(DefaultParameterSetName = 'None')]
param(
	[string][Parameter(Mandatory=$true)] $dtserver,
	[string][Parameter(Mandatory=$true)] $profile,
	[string][Parameter(Mandatory=$true)] $category,
	[string][Parameter(Mandatory=$true)] $version,
	[string][Parameter(Mandatory=$false)] $marker,
	[string][Parameter(Mandatory=$true)] $activateDotNetAgent
)
#[bool]$activateDotNetAgentBool = Convert-String $activateDotNetAgent Boolean
[bool]$activateDotNetAgentBool = [bool]::Parse($activateDotNetAgent)

import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal" 

Write-Host "Starting Register Dynatrace Testrun"

[String]$buildUniqueID = $env:BUILD_BUILDID
if ($env:RELEASE_RELEASENAME){
  $buildUniqueID = $buildUniqueID + "_" + $env:RELEASE_RELEASENAME
}
if ($env:RELEASE_ENVIRONMENTNAME){
  $buildUniqueID = $buildUniqueID + "_" + $env:RELEASE_ENVIRONMENTNAME
}

[String]$testRunVersion = $version
if ($version.StartsWith("env:","CurrentCultureIgnoreCase")){
  $testRunVersion=(get-item $version).Value
}

#Compose JSON request

$splitTestRunVersion = $testRunVersion.Split('.')
$requestBody = @{
  "versionMajor" = $splitTestRunVersion[0]
  "versionMinor" = $splitTestRunVersion[1]
  "versionRevision" = $splitTestRunVersion[2]
  "versionBuild" = $buildUniqueID
  "category" = $category
  "additionalMetaData" = @{
    "TFS" = $env:SYSTEM_TEAMFOUNDATIONCOLLECTIONURI
    "project" = $env:SYSTEM_TEAMPROJECT
  }
}
if (-Not [string]::IsNullOrEmpty($marker)){
  $requestBody.marker = $marker
}
if ($splitTestRunVersion.Length -gt 3){
  $requestBody.versionRevision = [system.String]::Join(".", $splitTestRunVersion[2..($splitTestRunVersion.length-1)])
}
if ($env:RELEASE_ENVIRONMENTNAME){
  $requestBody.platform = $env:RELEASE_ENVIRONMENTNAME
}

$env:DT_SERVICE_ENDPOINT_ID = $dtserver
Write-Host "##vso[task.setvariable variable=DT_SERVICE_ENDPOINT_ID;]$dtserver"

$dynatraceEndpoint = Get-ServiceEndpoint -Context $distributedTaskContext -Name $dtserver
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$securePwd = ConvertTo-SecureString $dynatraceEndpoint.Authorization.Parameters['password'] -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential ($dynatraceEndpoint.Authorization.Parameters['username'], $securePwd)

# Invoke the REST call to register out run inside DynaTrace
$uri = "{0}/profiles/{1}/testruns" -f $dynatraceEndpoint.url,[uri]::EscapeDataString($profile)
Write-Host "Invoking: $uri"
$response = Invoke-RestMethod -Uri $uri -Method POST -Body (ConvertTo-Json $requestBody) -ContentType "application/json" -Credential $credential

if ($response)
{
  #set id as ENVIRONMENT VARIABLE for .NET and add it as build parameter (dtTestrunID) for Java, so the it can be used within maven config like this: 
  #<argLine>-agentpath:"${dt_agent_path}"=name=${dt_agent_name},server=${dt_server},optionTestRunIdJava=${dtTestrunID}</argLine>

  $dtTestrunId=$response.id
  Write-Host "Response: $response"
  Write-Host "Creating new DynaTrace variable"

  $env:DT_TESTRUN_ID = $dtTestrunId
  $env:DT_TESTRUN_HREF = $response.href
  Write-Host "##vso[task.setvariable variable=DT_TESTRUN_ID;]$env:DT_TESTRUN_ID"
  Write-Host "##vso[task.setvariable variable=DT_TESTRUN_HREF;]$env:DT_TESTRUN_HREF"

  Write-Host "DynaTrace DT_TESTRUN_ID: $env:DT_TESTRUN_ID"
  
  # Activate the agent
  if ($activateDotNetAgentBool)
  {
    Write-Host "Activated DotNet Agent DT_AGENTACTIVE"
    $env:DT_AGENTACTIVE = $True
    Write-Host ("##vso[task.setvariable variable=DT_AGENTACTIVE;]$True")
  }
}
else
{
  Write-Host "##vso[task.logissue type=error;]Call to Dynatrace endpoint failed!
  Write-Host "##vso[task.logissue type=error;]Make sure the service is correctly configured and the provided credentials have enough rights to perform the REST requests.
  Write-Host "##vso[task.logissue type=error;]CThe configured service should incude the complete baseURI of the REST services. e.g. https://company.dynatracesaas.com:8021/api/v1"
  exit 1
}
