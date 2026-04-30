[CmdletBinding()]
param(
    [string]$CoordinatorPath = "",
    [string]$NodePath = "",
    [switch]$SkipCoordinatorStart,
    [switch]$NoBuild,
    [switch]$BuildEDC,
    [switch]$TeardownOnSuccess,
    [string]$AssetId = "",
    [string]$EDCManagementUrl = "http://localhost:11002/api/management",
    [string]$ConsumerEDCManagementUrl = "http://localhost:11012/api/management",
    [string]$TransferSinkBaseUrl = "http://eitel-node-download-sink-consumer:8082",
    [string]$EDCApiKey = "poc-api-key"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $NodePath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

if ([string]::IsNullOrWhiteSpace($CoordinatorPath)) {
    $CoordinatorPath = (Resolve-Path (Join-Path $NodePath "..\..\EITELCoordinator")).Path
}

function Invoke-WithRetry {
    param(
        [scriptblock]$Action,
        [int]$Retries = 30,
        [int]$DelaySeconds = 2,
        [string]$Description = "operation",
        [int]$TimeoutSeconds = 300
    )

    $startTime = Get-Date
    $timeoutTime = $startTime.AddSeconds($TimeoutSeconds)

    for ($i = 1; $i -le $Retries; $i++) {
        if ((Get-Date) -gt $timeoutTime) {
            throw "Failed ${Description}: timeout after $TimeoutSeconds seconds"
        }
        try {
            return & $Action
        } catch {
            if ($i -eq $Retries) {
                throw "Failed ${Description} after $Retries attempts. Last error: $($_.Exception.Message)"
            }
            Write-Host "  Attempt $i failed, retrying in $DelaySeconds seconds..."
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Invoke-JsonPost {
    param(
        [string]$Url,
        [object]$Body,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 30
    )

    return Invoke-RestMethod `
        -Uri $Url `
        -Method Post `
        -ContentType "application/json" `
        -Headers $Headers `
        -Body ($Body | ConvertTo-Json -Depth 20) `
        -TimeoutSec $TimeoutSec
}

function Invoke-JsonGet {
    param(
        [string]$Url,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 30
    )

    return Invoke-RestMethod `
        -Uri $Url `
        -Method Get `
        -Headers $Headers `
        -TimeoutSec $TimeoutSec
}

function Invoke-JsonDelete {
    param(
        [string]$Url,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 30
    )

    return Invoke-RestMethod `
        -Uri $Url `
        -Method Delete `
        -Headers $Headers `
        -TimeoutSec $TimeoutSec
}

function Get-HttpErrorMessage {
    param(
        [Parameter(Mandatory = $true)]
        $ErrorRecord
    )

    $message = $ErrorRecord.Exception.Message
    try {
        if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
            $details = $ErrorRecord.ErrorDetails.Message
            if ($details.Length -gt 400) {
                $details = $details.Substring(0, 400) + "...(truncated)"
            }
            $message = "$message | Response: $details"
        }
    } catch {
    }

    return $message
}

function Remove-EdcEntityIfExists {
    param(
        [string]$Url,
        [string]$Description,
        [hashtable]$Headers,
        [switch]$ContinueOnConflict
    )

    try {
        Invoke-JsonDelete -Url $Url -Headers $Headers | Out-Null
        Write-Host "  Removed existing $Description."
    } catch {
        $msg = Get-HttpErrorMessage -ErrorRecord $_
        if ($msg -notmatch "404|Not Found|not found") {
            if ($ContinueOnConflict -and $msg -match "409|Conflict|ObjectConflict|cannot be deleted") {
                Write-Warning "Could not remove existing $Description because EDC says it is still referenced. Reusing it."
                return
            }
            throw "Failed to remove existing ${Description}: $msg"
        }
    }
}

function Get-EdcDataplanes {
    param(
        [string]$ManagementUrl,
        [hashtable]$Headers
    )

    $response = Invoke-JsonGet -Url "$ManagementUrl/v3/dataplanes" -Headers $Headers
    $rows = $response.value
    if ($null -eq $rows) { $rows = $response.'edc:value' }
    if ($null -eq $rows -and $response -is [array]) { $rows = $response }
    return @($rows) | Where-Object { $null -ne $_ }
}

function Assert-EdcDataplaneAvailable {
    param(
        [string]$ManagementUrl,
        [string]$Label,
        [hashtable]$Headers
    )

    $dataplanes = Get-EdcDataplanes -ManagementUrl $ManagementUrl -Headers $Headers
    if (-not $dataplanes -or $dataplanes.Count -eq 0) {
        throw "No dataplanes registered yet at $ManagementUrl/v3/dataplanes"
    }

    $firstDataplane = $dataplanes | Select-Object -First 1
    $dataplaneId = $firstDataplane.'@id'
    if ([string]::IsNullOrWhiteSpace($dataplaneId)) { $dataplaneId = $firstDataplane.id }
    $dataplaneState = $firstDataplane.state
    if ([string]::IsNullOrWhiteSpace($dataplaneState)) { $dataplaneState = $firstDataplane.'edc:state' }
    Write-Host "  $Label dataplane available. ID: $dataplaneId, state: $dataplaneState"
    return $dataplanes
}

function ConvertTo-HashtableDeep {
    param(
        [Parameter(ValueFromPipeline = $true)]
        $InputObject
    )

    if ($null -eq $InputObject) { return $null }

    if ($InputObject -is [hashtable]) {
        $result = @{}
        foreach ($key in $InputObject.Keys) {
            $result[$key] = ConvertTo-HashtableDeep $InputObject[$key]
        }
        return $result
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
        $items = @()
        foreach ($item in $InputObject) {
            $items += ,(ConvertTo-HashtableDeep $item)
        }
        return $items
    }

    if ($InputObject -is [pscustomobject]) {
        $result = @{}
        foreach ($property in $InputObject.PSObject.Properties) {
            $result[$property.Name] = ConvertTo-HashtableDeep $property.Value
        }
        return $result
    }

    return $InputObject
}

function Get-EdcCollectionRows {
    param(
        $Response
    )

    if ($null -eq $Response) { return @() }
    if ($Response -is [array]) { return @($Response) }
    if ($null -ne $Response.value) { return @($Response.value) }
    if ($null -ne $Response.'edc:value') { return @($Response.'edc:value') }
    if ($null -ne $Response.data) { return @($Response.data) }
    return @()
}

function New-EdcQuerySpec {
    param(
        [int]$Limit = 100,
        [int]$Offset = 0
    )

    return @{
        "@context" = @{ "edc" = "https://w3id.org/edc/v0.0.1/ns/" }
        "@type"   = "QuerySpec"
        "offset"  = $Offset
        "limit"   = $Limit
    }
}

function Show-DockerDiagnostics {
    Write-Host "---- Docker container status (diagnostic) ----"
    try {
        docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
    } catch {
        Write-Host "Unable to run docker ps for diagnostics."
    }
    Write-Host "---------------------------------------------"
}

function Assert-DockerAvailable {
    try {
        docker info | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "docker info returned exit code $LASTEXITCODE"
        }
    } catch {
        throw "Docker daemon is not available. Start Docker Desktop and verify 'docker info' works before running this script."
    }
}

$edcImageName = "mariwogr/eitel:v1"
$edcDockerfilePath = (Resolve-Path (Join-Path $NodePath "..\deploy")).Path

if ($BuildEDC) {
    Write-Host "`n[PRE] Building EDC image: $edcImageName"
    if (-not (Test-Path $edcDockerfilePath)) {
        throw "EDC Dockerfile not found at: $edcDockerfilePath. Check -NodePath or the deploy/ directory."
    }
    docker build -t $edcImageName $edcDockerfilePath
    if ($LASTEXITCODE -ne 0) {
        throw "EDC image build failed."
    }
    Write-Host "EDC image built successfully: $edcImageName"
}
elseif (-not $NoBuild) {
    $imageExists = docker images -q $edcImageName
    if ([string]::IsNullOrWhiteSpace($imageExists)) {
        Write-Warning "EDC image '$edcImageName' not found locally. Run with -BuildEDC to build it, or pull it manually."
        Write-Warning "Continuing anyway - docker compose will fail if the image is missing."
    }
}

Write-Host "== EITEL PoC Transfer Automation (with EDC Integration) =="
Write-Host "Coordinator path: $CoordinatorPath"
Write-Host "Node path:        $NodePath"
Write-Host "EDC Management URL: $EDCManagementUrl"
Write-Host "Consumer EDC Management URL: $ConsumerEDCManagementUrl"
Write-Host "Transfer sink base URL: $TransferSinkBaseUrl"

$startedCoordinator = $null

try {
    Assert-DockerAvailable

    if (-not $SkipCoordinatorStart) {
        if (-not (Test-Path $CoordinatorPath)) {
            throw "Coordinator path not found: $CoordinatorPath"
        }

        Write-Host "`n[1/12] Starting Coordinator..."
        $startedCoordinator = Start-Process `
            -FilePath "uv" `
            -ArgumentList @("run", "uvicorn", "src.coordinator.main:app", "--host", "0.0.0.0", "--port", "8000") `
            -WorkingDirectory $CoordinatorPath `
            -PassThru
    } else {
        Write-Host "`n[1/12] Skipping Coordinator start (using existing instance)."
    }

    Write-Host "[2/12] Waiting for Coordinator API..."
    Start-Sleep -Seconds 3
    Invoke-WithRetry -Description "Coordinator health check" -Retries 40 -DelaySeconds 3 -Action {
        Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get | Out-Null
    } | Out-Null

    if (-not (Test-Path $NodePath)) {
        throw "Node path not found: $NodePath"
    }

    Push-Location $NodePath
    try {
        Write-Host "[3/12] Creating shared network and starting containers..."

        # Create shared network if it doesn't exist
        $networkExists = docker network ls --filter "name=^eitel-shared$" --quiet
        if ([string]::IsNullOrWhiteSpace($networkExists)) {
            Write-Host "  Creating docker network: eitel-shared"
            docker network create eitel-shared --driver bridge
            if ($LASTEXITCODE -ne 0) { throw "Failed to create shared network." }
        }

        if ($NoBuild) {
            docker compose -f docker-compose.producer.yml up -d
        } else {
            docker compose -f docker-compose.producer.yml up -d --build
        }
        if ($LASTEXITCODE -ne 0) { throw "Failed to start producer compose stack." }

        if ($NoBuild) {
            docker compose -f docker-compose.consumer.yml up -d
        } else {
            docker compose -f docker-compose.consumer.yml up -d --build
        }
        if ($LASTEXITCODE -ne 0) { throw "Failed to start consumer compose stack." }

        Write-Host "[4/12] Waiting for node health endpoints..."
        Start-Sleep -Seconds 5
        $healthP = Invoke-WithRetry -Description "Producer health endpoint" -Retries 45 -DelaySeconds 3 -Action {
            Invoke-RestMethod -Uri "http://localhost:8090/health" -Method Get
        }
        $healthC = Invoke-WithRetry -Description "Consumer health endpoint" -Retries 45 -DelaySeconds 3 -Action {
            Invoke-RestMethod -Uri "http://localhost:8091/health" -Method Get
        }

        $nodePDID = $healthP.node_did
        $nodeCDID = $healthC.node_did
        Write-Host "Producer DID: $nodePDID"
        Write-Host "Consumer DID: $nodeCDID"

        Write-Host "[5/12] Requesting Verifiable Credentials..."
        $vcP = Invoke-JsonPost -Url "http://localhost:8000/credentials" -Body @{
            participantName = "UC3M Producer"
            participantId   = "node-p"
            did             = $nodePDID
            role            = "producer"
        }
        $vcC = Invoke-JsonPost -Url "http://localhost:8000/credentials" -Body @{
            participantName = "UC3M Consumer"
            participantId   = "node-c"
            did             = $nodeCDID
            role            = "consumer"
        }

        Write-Host "[6/12] Seeding test dataset in producer Copyparty..."
        $datasetName = "test-dataset.json"
        $datasetPayload = '{"dataset":"project-star","owner":"producer-node","records":[{"id":1,"value":"alpha"},{"id":2,"value":"beta"}]}'
        $seedCmd = "printf '%s`n' '$datasetPayload' > /data/$datasetName"
        docker exec eitel-node-copyparty-producer sh -c $seedCmd
        if ($LASTEXITCODE -ne 0) { throw "Failed to seed dataset in producer Copyparty." }

        Write-Host "[7/12] Waiting for producer EDC management API..."
        # Use QuerySpec request to check EDC readiness (OPTIONS may not be supported)
        Invoke-WithRetry -Description "EDC management API availability" -Retries 90 -DelaySeconds 3 -Action {
            try {
                Invoke-RestMethod -Uri "$EDCManagementUrl/v3/assets/request" `
                    -Method Post `
                    -Headers @{ "x-api-key" = $EDCApiKey } `
                    -ContentType "application/json" `
                    -Body '{"@context":{"@vocab":"https://w3id.org/edc/v0.0.1/ns/"},"@type":"QuerySpec","limit":1}' `
                    -TimeoutSec 5 `
                    -ErrorAction Stop | Out-Null
            } catch {
                # Connection refused or timeout - EDC not ready yet
                throw "EDC management API not responding: $($_.Exception.Message)"
            }
        } | Out-Null

        # Grace period to allow EDC to fully initialize after port is open
        Write-Host "  Giving EDC 5 seconds to fully initialize..."
        Start-Sleep -Seconds 5

        $edcHeaders = @{ "x-api-key" = $EDCApiKey }

        Write-Host "[7b/12] Waiting for EDC dataplane auto-registration..."
        try {
            Invoke-WithRetry -Description "producer dataplane auto-registration" -Retries 30 -DelaySeconds 2 -Action {
                Assert-EdcDataplaneAvailable -ManagementUrl $EDCManagementUrl -Label "Producer" -Headers $edcHeaders | Out-Null
            } | Out-Null
            Invoke-WithRetry -Description "consumer dataplane auto-registration" -Retries 30 -DelaySeconds 2 -Action {
                Assert-EdcDataplaneAvailable -ManagementUrl $ConsumerEDCManagementUrl -Label "Consumer" -Headers $edcHeaders | Out-Null
            } | Out-Null
        } catch {
            $msg = Get-HttpErrorMessage -ErrorRecord $_
            if ($msg -match "405|Method Not Allowed") {
                throw "Dataplane check failed because this EDC runtime does not support POST registration at /v3/dataplanes. Use GET auto-registration via EDC_DATAPLANE_SELECTOR_DEFAULTPLANE instead. $msg"
            }
            throw "Producer dataplane check failed: $msg"
        }

        Write-Host "[8/12] Pre-registering asset in producer EDC..."
        if ([string]::IsNullOrWhiteSpace($AssetId)) {
            $assetId = "test-dataset-" + (Get-Date -Format "yyyyMMddHHmmss") + ".json"
        } else {
            $assetId = $AssetId
        }
        $safeArtifactId = ($assetId -replace "[^a-zA-Z0-9._-]", "-")
        $policyId = "policy-$safeArtifactId"
        $contractDefId = "contract-$safeArtifactId"
        Write-Host "  EDC asset ID: $assetId (source file: $datasetName)"

        Remove-EdcEntityIfExists `
            -Url "$EDCManagementUrl/v3/contractdefinitions/$contractDefId" `
            -Description "contract definition '$contractDefId'" `
            -Headers $edcHeaders
        Remove-EdcEntityIfExists `
            -Url "$EDCManagementUrl/v3/policydefinitions/$policyId" `
            -Description "policy definition '$policyId'" `
            -Headers $edcHeaders
        Remove-EdcEntityIfExists `
            -Url "$EDCManagementUrl/v3/assets/$assetId" `
            -Description "asset '$assetId'" `
            -Headers $edcHeaders `
            -ContinueOnConflict

        $assetPayload = @{
            "@context"  = @{ "edc" = "https://w3id.org/edc/v0.0.1/ns/" }
            "@id"       = $assetId
            "@type"     = "Asset"
            "properties" = @{
                "name"                     = "Test Dataset"
                "title"                    = "Test Dataset"
                "description"              = "PoC dataset seeded by run-poc-transfer.ps1"
                "keywords"                 = "poc, transfer, eitel"
                "contenttype"              = "application/json"
                "eitel:managedByConnector" = "producer-connector"
                "eitel:authType"           = "none"
                "eitel:sourceMode"         = "local-file"
            }
            "dataAddress" = @{
                "@type"   = "DataAddress"
                "type"    = "HttpData"
                "baseUrl" = "http://copyparty:3923/files/$datasetName`?pw=changeme"
                "method"  = "GET"
                "headers" = @{}
            }
        }

        try {
            $assetRegistration = Invoke-JsonPost `
                -Url "$EDCManagementUrl/v3/assets" `
                -Body $assetPayload `
                -Headers $edcHeaders
        } catch {
            $errorMessage = Get-HttpErrorMessage -ErrorRecord $_
            if ($errorMessage -match "409|Conflict|ObjectConflict|already exists|already exist") {
                Write-Warning "Asset '$assetId' already exists in producer EDC. Reusing the existing asset."
                $assetRegistration = @{ "@id" = $assetId }
            } else {
                Show-DockerDiagnostics
                throw "Asset registration failed at $EDCManagementUrl/v3/assets. $errorMessage"
            }
        }

        $registeredAssetId = $assetRegistration.'@id'
        if ([string]::IsNullOrWhiteSpace($registeredAssetId)) { $registeredAssetId = $assetRegistration.id }
        if ([string]::IsNullOrWhiteSpace($registeredAssetId)) { $registeredAssetId = $assetId }
        Write-Host "Asset registered with ID: $registeredAssetId"

        Write-Host "[8b/12] Registering policy definition..."
        $policyPayload = @{
            "@context" = @{
                "@vocab" = "https://w3id.org/edc/v0.0.1/ns/"
                "odrl" = "http://www.w3.org/ns/odrl/2/"
            }
            "@id"      = $policyId
            "@type"    = "PolicyDefinition"
            "policy"   = @{
                "@context"   = "http://www.w3.org/ns/odrl.jsonld"
                "@id"        = $policyId
                "@type"      = "Set"
                "odrl:permission" = @(@{
                    "odrl:action" = "http://www.w3.org/ns/odrl/2/use"
                    "odrl:target" = $assetId
                })
                "odrl:prohibition" = @()
                "odrl:obligation"  = @()
            }
        }
        try {
            Invoke-JsonPost -Url "$EDCManagementUrl/v3/policydefinitions" `
                -Body $policyPayload -Headers $edcHeaders | Out-Null
            Write-Host "  Policy definition registered."
        } catch {
            $msg = Get-HttpErrorMessage -ErrorRecord $_
            throw "Policy registration failed: $msg"
        }

        Write-Host "[8c/12] Registering contract definition..."
        $contractPayload = @{
            "@context"        = @{ "@vocab" = "https://w3id.org/edc/v0.0.1/ns/" }
            "@id"             = $contractDefId
            "@type"           = "ContractDefinition"
            "accessPolicyId"  = $policyId
            "contractPolicyId"= $policyId
            "assetsSelector"  = @(@(@{
                "@type"       = "Criterion"
                "operandLeft" = "https://w3id.org/edc/v0.0.1/ns/id"
                "operator"    = "="
                "operandRight"= $assetId
            }))
        }
        try {
            Invoke-JsonPost -Url "$EDCManagementUrl/v3/contractdefinitions" `
                -Body $contractPayload -Headers $edcHeaders | Out-Null
            Write-Host "  Contract definition registered."
        } catch {
            $msg = Get-HttpErrorMessage -ErrorRecord $_
            throw "Contract definition failed: $msg"
        }

        Write-Host "[9/12] Executing consumer-to-producer handshake..."
        $resultCtoP = Invoke-JsonPost -Url "http://localhost:8090/handshake/initiate" -Body @{
            did       = $nodeCDID
            eitel_vc  = $vcC
            gaia_x_vp = $null
        }

        if ($resultCtoP.status -ne "ok") {
            throw "C->P handshake failed. Status: $($resultCtoP.status)"
        }

        $tokenCtoP = $resultCtoP.session_token
        if ([string]::IsNullOrWhiteSpace($tokenCtoP)) {
            throw "Producer did not return a session token."
        }

        $peerDspEndpoint = $resultCtoP.dsp_endpoint
        if ([string]::IsNullOrWhiteSpace($peerDspEndpoint)) {
            throw "Producer did not return DSP endpoint in handshake response."
        }

        Write-Host "Handshake successful. DSP endpoint: $peerDspEndpoint"

        Write-Host "[10/12] Consumer requesting EDC contract and transfer..."
        $artifactDir = Join-Path $NodePath ".runbook-artifacts"
        New-Item -Path $artifactDir -ItemType Directory -Force | Out-Null

        Write-Host "  Querying producer catalog from consumer EDC..."
        $catalogRequest = Invoke-JsonPost `
            -Url "$ConsumerEDCManagementUrl/v3/catalog/request" `
            -Headers $edcHeaders `
            -Body @{
                "@context"           = @{ "edc" = "https://w3id.org/edc/v0.0.1/ns/" }
                "@type"              = "CatalogRequest"
                "counterPartyId"     = "producer-connector"
                "counterPartyAddress"= $peerDspEndpoint
                "protocol"           = "dataspace-protocol-http:2025-1"
            }

        $datasetsRaw = $catalogRequest.'dcat:dataset'
        if ($null -eq $datasetsRaw) { $datasetsRaw = $catalogRequest.dataset }
        $datasets = @($datasetsRaw) | Where-Object { $null -ne $_ }
        $matchingDataset = $datasets | Where-Object {
            $candidateId = $_.'@id'
            if ([string]::IsNullOrWhiteSpace($candidateId)) { $candidateId = $_.id }
            $candidateId -eq $assetId
        } | Select-Object -First 1

        if ($null -eq $matchingDataset) {
            throw "Asset '$assetId' not found in producer catalog. Published datasets: $(@($datasets | ForEach-Object { $_.'@id' }) -join ', ')"
        }

        $policyRaw = $matchingDataset.'odrl:hasPolicy'
        if ($null -eq $policyRaw) { $policyRaw = $matchingDataset.hasPolicy }
        if ($policyRaw -is [array]) { $policyRaw = $policyRaw[0] }
        if ($null -eq $policyRaw) {
            throw "Catalog asset '$assetId' does not include odrl:hasPolicy/hasPolicy. Cannot create UI-style ContractRequest."
        }
        $offerId = $null
        if ($null -ne $policyRaw) { $offerId = $policyRaw.'@id' }
        if ([string]::IsNullOrWhiteSpace($offerId)) { $offerId = $assetId }
        $policyAssigner = $null
        if ($null -ne $policyRaw) {
            $policyAssigner = $policyRaw.assigner
            if ([string]::IsNullOrWhiteSpace($policyAssigner)) { $policyAssigner = $policyRaw.'odrl:assigner' }
        }
        if ([string]::IsNullOrWhiteSpace($policyAssigner)) { $policyAssigner = "producer-connector" }

        $contractRequestPolicy = ConvertTo-HashtableDeep $policyRaw
        $contractRequestPolicy["@context"] = "http://www.w3.org/ns/odrl.jsonld"
        $contractRequestPolicy["@type"] = "odrl:Offer"
        if (-not $contractRequestPolicy.ContainsKey("@id") -or [string]::IsNullOrWhiteSpace($contractRequestPolicy["@id"])) {
            $contractRequestPolicy["@id"] = $offerId
        }
        $contractRequestPolicy["assigner"] = $policyAssigner
        $contractRequestPolicy["target"] = $assetId
        $contractRequestPolicy["odrl:target"] = $assetId

        foreach ($ruleKey in @("permission", "prohibition", "obligation")) {
            $rulesRaw = $contractRequestPolicy[$ruleKey]
            if ($null -eq $rulesRaw) { $rulesRaw = $contractRequestPolicy["odrl:$ruleKey"] }
            $rules = if ($null -eq $rulesRaw) { @() } elseif ($rulesRaw -is [array]) { @($rulesRaw) } else { @($rulesRaw) }
            $normalizedRules = @()
            foreach ($rule in $rules) {
                if ($null -eq $rule) { continue }
                $ruleHash = ConvertTo-HashtableDeep $rule
                if ($ruleHash -is [hashtable]) {
                    if (-not $ruleHash.ContainsKey("action") -and $ruleHash.ContainsKey("odrl:action")) {
                        $ruleHash["action"] = $ruleHash["odrl:action"]
                    }
                    if (-not $ruleHash.ContainsKey("odrl:action") -and $ruleHash.ContainsKey("action")) {
                        $ruleHash["odrl:action"] = $ruleHash["action"]
                    }
                    if ([string]$ruleHash["action"] -in @("use", "odrl:use")) {
                        $ruleHash["action"] = "http://www.w3.org/ns/odrl/2/use"
                    }
                    if ([string]$ruleHash["odrl:action"] -in @("use", "odrl:use")) {
                        $ruleHash["odrl:action"] = "http://www.w3.org/ns/odrl/2/use"
                    }
                    $ruleHash["target"] = $assetId
                    $ruleHash["odrl:target"] = $assetId
                }
                $normalizedRules += ,$ruleHash
            }
            if ($ruleKey -eq "permission" -and $normalizedRules.Count -eq 0) {
                $normalizedRules += ,@{
                    "action" = "http://www.w3.org/ns/odrl/2/use"
                    "odrl:action" = "http://www.w3.org/ns/odrl/2/use"
                    "target" = $assetId
                    "odrl:target" = $assetId
                }
            }
            $contractRequestPolicy[$ruleKey] = $normalizedRules
            $contractRequestPolicy.Remove("odrl:$ruleKey")
        }

        $beforeAgreements = Get-EdcCollectionRows (Invoke-JsonPost `
            -Url "$ConsumerEDCManagementUrl/v3/contractagreements/request" `
            -Headers $edcHeaders `
            -Body (New-EdcQuerySpec))
        $beforeAgreementIds = @{}
        foreach ($agreement in $beforeAgreements) {
            $agreementId = $agreement.'@id'
            if ([string]::IsNullOrWhiteSpace($agreementId)) { $agreementId = $agreement.id }
            if (-not [string]::IsNullOrWhiteSpace($agreementId)) { $beforeAgreementIds[$agreementId] = $true }
        }

        Write-Host "  Starting contract negotiation for asset '$assetId'..."
        try {
            $contractRequestBody = @{
                "@context"           = @{ "edc" = "https://w3id.org/edc/v0.0.1/ns/" }
                "@type"              = "ContractRequest"
                "protocol"           = "dataspace-protocol-http:2025-1"
                "counterPartyAddress"= $peerDspEndpoint
                "policy"             = $contractRequestPolicy
            }
            try {
                $contractNegotiation = Invoke-JsonPost `
                    -Url "$ConsumerEDCManagementUrl/v3/contractnegotiations" `
                    -Headers $edcHeaders `
                    -Body $contractRequestBody
            } catch {
                $msg = Get-HttpErrorMessage -ErrorRecord $_
                if ($msg -notmatch "target/@id cannot be null or blank") { throw }

                Write-Host "  ContractRequest UI-style target was rejected; retrying with target @id object required by this EDC image."
                $contractRequestPolicy["target"] = @{ "@id" = $assetId }
                $contractRequestPolicy.Remove("odrl:target")
                foreach ($permission in @($contractRequestPolicy["permission"])) {
                    $permission["target"] = @{ "@id" = $assetId }
                    $permission.Remove("odrl:target")
                }
                $contractNegotiation = Invoke-JsonPost `
                    -Url "$ConsumerEDCManagementUrl/v3/contractnegotiations" `
                    -Headers $edcHeaders `
                    -Body $contractRequestBody
            }
        } catch {
            $errorMessage = Get-HttpErrorMessage -ErrorRecord $_
            Show-DockerDiagnostics
            throw "Contract negotiation request failed at consumer EDC Management API. $errorMessage"
        }

        $negotiationId = $contractNegotiation.'@id'
        if ([string]::IsNullOrWhiteSpace($negotiationId)) { $negotiationId = $contractNegotiation.id }
        if ([string]::IsNullOrWhiteSpace($negotiationId)) {
            throw "Contract negotiation response did not include a negotiation ID."
        }

        Write-Host "  Negotiation initiated. Negotiation ID: $negotiationId"

        $contractAgreementId = $null
        $createdAgreement = $null
        for ($i = 0; $i -lt 6; $i++) {
            Start-Sleep -Milliseconds 1200
            $agreements = Get-EdcCollectionRows (Invoke-JsonPost `
                -Url "$ConsumerEDCManagementUrl/v3/contractagreements/request" `
                -Headers $edcHeaders `
                -Body (New-EdcQuerySpec))
            foreach ($agreement in $agreements) {
                $candidateAgreementId = $agreement.'@id'
                if ([string]::IsNullOrWhiteSpace($candidateAgreementId)) { $candidateAgreementId = $agreement.id }
                if (-not [string]::IsNullOrWhiteSpace($candidateAgreementId) -and -not $beforeAgreementIds.ContainsKey($candidateAgreementId)) {
                    $contractAgreementId = $candidateAgreementId
                    $createdAgreement = $agreement
                    break
                }
            }
            if (-not [string]::IsNullOrWhiteSpace($contractAgreementId)) { break }
        }

        if ([string]::IsNullOrWhiteSpace($contractAgreementId)) {
            $negotiationDetail = Invoke-JsonGet `
                -Url "$ConsumerEDCManagementUrl/v3/contractnegotiations/$negotiationId" `
                -Headers $edcHeaders `
                -TimeoutSec 10
            $detailJson = $negotiationDetail | ConvertTo-Json -Depth 12
            throw "Negotiation '$negotiationId' did not create a contract agreement like the UI expects. Negotiation detail: $detailJson"
        }

        $transferCounterPartyId = $createdAgreement.providerId
        if ([string]::IsNullOrWhiteSpace($transferCounterPartyId)) { $transferCounterPartyId = $createdAgreement.'edc:providerId' }
        if ([string]::IsNullOrWhiteSpace($transferCounterPartyId)) { $transferCounterPartyId = $createdAgreement.provider }
        if ([string]::IsNullOrWhiteSpace($transferCounterPartyId)) { $transferCounterPartyId = $createdAgreement.cp }
        if (-not [string]::IsNullOrWhiteSpace($transferCounterPartyId) -and ($transferCounterPartyId.StartsWith("http://") -or $transferCounterPartyId.StartsWith("https://") -or $transferCounterPartyId.StartsWith("/"))) {
            $transferCounterPartyId = "producer-connector"
        }
        if ([string]::IsNullOrWhiteSpace($transferCounterPartyId)) {
            $transferCounterPartyId = "producer-connector"
        }

        Write-Host "  Starting transfer using contract agreement: $contractAgreementId"
        Write-Host "  Transfer counterPartyId: $transferCounterPartyId"
        $transferSinkUrl = "$($TransferSinkBaseUrl.TrimEnd('/'))/ingest?contractId=$([uri]::EscapeDataString($contractAgreementId))&assetId=$([uri]::EscapeDataString($assetId))"
        $transferBody = @{
            "@context"           = @{ "edc" = "https://w3id.org/edc/v0.0.1/ns/" }
            "@type"              = "TransferRequest"
            "protocol"           = "dataspace-protocol-http:2025-1"
            "counterPartyAddress"= $peerDspEndpoint
            "counterPartyId"     = $transferCounterPartyId
            "contractId"         = $contractAgreementId
            "transferType"       = "HttpData-PUSH"
            "dataDestination"    = @{
                "type"    = "HttpData"
                "baseUrl" = $transferSinkUrl
                "method"  = "POST"
            }
        }

        $transferRequest = Invoke-JsonPost `
            -Url "$ConsumerEDCManagementUrl/v3/transferprocesses" `
            -Headers $edcHeaders `
            -Body $transferBody

        $transferId = $transferRequest.'@id'
        if ([string]::IsNullOrWhiteSpace($transferId)) { $transferId = $transferRequest.id }
        if ([string]::IsNullOrWhiteSpace($transferId)) {
            throw "Transfer response did not include a transfer process ID."
        }

        Write-Host "Transfer initiated. Transfer ID: $transferId, Negotiation ID: $negotiationId"

        Write-Host "[11/12] Polling for transfer completion..."
        $transferComplete = $false
        $pollRetries = 5
        $pollDelay = 2
        $pollStartTime = Get-Date
        $pollTimeoutSeconds = 300

        for ($i = 0; $i -lt $pollRetries; $i++) {
            if ((Get-Date) - $pollStartTime -gt (New-TimeSpan -Seconds $pollTimeoutSeconds)) {
                throw "Transfer polling timeout after $pollTimeoutSeconds seconds"
            }

            Write-Host "  Poll attempt $($i + 1)/$pollRetries..."

            try {
                $transferStatus = Invoke-RestMethod `
                    -Uri "$ConsumerEDCManagementUrl/v3/transferprocesses/$transferId/state" `
                    -Method Get `
                    -Headers @{ "x-api-key" = $EDCApiKey } `
                    -TimeoutSec 10
            } catch {
                $errorMessage = Get-HttpErrorMessage -ErrorRecord $_
                throw "Transfer polling failed for transfer ID '$transferId'. $errorMessage"
            }

            $state = $transferStatus.state
            if ([string]::IsNullOrWhiteSpace($state)) { $state = $transferStatus.'edc:state' }
            $stateMap = @{
                "100" = "INITIAL"
                "200" = "PROVISIONING"
                "300" = "PROVISIONED"
                "400" = "REQUESTED"
                "500" = "STARTED"
                "600" = "SUSPENDED"
                "700" = "COMPLETED"
                "800" = "TERMINATED"
            }
            if ($stateMap.ContainsKey([string]$state)) { $state = $stateMap[[string]$state] }
            Write-Host "    Transfer state: $state"

            if ($state -eq "COMPLETED") {
                $transferComplete = $true
                break
            } elseif ($state -in @("FAILED", "TERMINATED", "ERROR")) {
                $transferDetail = $null
                try {
                    $transferDetail = Invoke-JsonGet `
                        -Url "$ConsumerEDCManagementUrl/v3/transferprocesses/$transferId" `
                        -Headers $edcHeaders `
                        -TimeoutSec 10
                } catch {
                    $errorMessage = Get-HttpErrorMessage -ErrorRecord $_
                    throw "Transfer failed with state: $state. Could not fetch transfer detail. $errorMessage"
                }

                $transferErrorDetail = $transferDetail.errorDetail
                if ([string]::IsNullOrWhiteSpace($transferErrorDetail)) { $transferErrorDetail = $transferDetail.'edc:errorDetail' }
                if ([string]::IsNullOrWhiteSpace($transferErrorDetail)) { $transferErrorDetail = "(sin errorDetail)" }
                $transferDetailJson = $transferDetail | ConvertTo-Json -Depth 12
                throw "Transfer failed with state: $state. Detail: $transferErrorDetail. Transfer detail: $transferDetailJson"
            }

            if ($i -lt $pollRetries - 1) {
                Start-Sleep -Seconds $pollDelay
            }
        }

        if (-not $transferComplete) {
            throw "Transfer did not complete within $($pollRetries * $pollDelay) seconds."
        }

        Write-Host "Transfer completed successfully."

        Write-Host "[12/12] Writing execution artifact..."
        $artifact = [ordered]@{
            timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
            coordinator_started_by_script = [bool](-not $SkipCoordinatorStart)
            producer_did = $nodePDID
            consumer_did = $nodeCDID
            dataset_name = $datasetName
            handshake = @{
                status = $resultCtoP.status
                producer_dsp_endpoint = $peerDspEndpoint
            }
            edc = @{
                asset_id = $assetId
                negotiation_id = $negotiationId
                contract_agreement_id = $contractAgreementId
                transfer_id = $transferId
                transfer_status = "COMPLETED"
            }
        }

        $artifactPath = Join-Path $artifactDir ("transfer-run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
        $artifact | ConvertTo-Json -Depth 10 | Set-Content -Path $artifactPath -Encoding UTF8

        Write-Host ""
        Write-Host "Handshake + EDC negotiation + transfer complete."
        Write-Host "Artifact: $artifactPath"

        if ($TeardownOnSuccess) {
            Write-Host "`nTeardown requested. Stopping containers..."
            docker compose -f docker-compose.producer.yml down
            docker compose -f docker-compose.consumer.yml down
        } else {
            Write-Host "`nContainers are still running. Use docker compose down when finished."
        }
    } finally {
        Pop-Location
    }
} catch {
    Write-Error $_.Exception.Message
    throw
} finally {
    if ($startedCoordinator -and -not $TeardownOnSuccess) {
        Write-Host "Coordinator process started by this script is still running (PID $($startedCoordinator.Id))."
        Write-Host "Stop it with: Stop-Process -Id $($startedCoordinator.Id)"
    } elseif ($startedCoordinator -and $TeardownOnSuccess) {
        try {
            Stop-Process -Id $startedCoordinator.Id -Force -ErrorAction SilentlyContinue
        } catch {
        }
    }
}
