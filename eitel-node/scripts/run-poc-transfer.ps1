[CmdletBinding()]
param(
    [string]$CoordinatorPath = "",
    [string]$NodePath = "",
    [switch]$SkipCoordinatorStart,
    [switch]$NoBuild,
    [switch]$BuildEDC,
    [switch]$TeardownOnSuccess,
    [string]$EDCManagementUrl = "http://localhost:11002/api/management",
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
        [hashtable]$Body,
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
        # Use cross-platform HTTP check (works on Windows, Linux, macOS with PowerShell Core)
        Invoke-WithRetry -Description "EDC management API availability" -Retries 90 -DelaySeconds 3 -Action {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:11002/api/management/v3/assets" `
                    -Method Options `
                    -Headers @{ "x-api-key" = $EDCApiKey } `
                    -TimeoutSec 5 `
                    -ErrorAction Stop
            } catch {
                # Connection refused or timeout - EDC not ready yet
                throw "EDC management API not responding: $($_.Exception.Message)"
            }
        } | Out-Null

        # Grace period to allow EDC to fully initialize after port is open
        Write-Host "  Giving EDC 5 seconds to fully initialize..."
        Start-Sleep -Seconds 5

        Write-Host "[7b/12] Registering data plane with producer EDC..."
        $dataplanePayload = @{
            "@context"             = @{ "@vocab" = "https://w3id.org/edc/v0.0.1/ns/" }
            "@type"                = "DataPlaneInstance"
            "id"                   = "producer-dataplane"
            "url"                  = "http://edc-producer-control:11002/api/control/transfer"
            "allowedSourceTypes"   = @("HttpData")
            "allowedDestTypes"     = @("HttpData")
            "allowedTransferTypes" = @("HttpData-PUSH", "HttpData-PULL")
        }
        try {
            Invoke-JsonPost -Url "$EDCManagementUrl/v3/dataplanes" `
                -Body $dataplanePayload -Headers @{ "x-api-key" = $EDCApiKey } | Out-Null
            Write-Host "  Data plane registered."
        } catch {
            $msg = Get-HttpErrorMessage -ErrorRecord $_
            if ($msg -notmatch "already exists|409") {
                Write-Warning "Data plane registration returned: $msg (continuing)"
            } else {
                Write-Host "  Data plane already registered."
            }
        }

        Write-Host "[8/12] Pre-registering asset in producer EDC..."
        $assetId = $datasetName
        $assetPayload = @{
            "@context" = @{
                "@vocab" = "https://w3id.org/edc/v0.0.1/ns/"
            }
            id = $assetId
            properties = @{
                "https://w3id.org/edc/v0.0.1/ns/name" = "Test Dataset"
            }
            dataAddress = @{
                "@type" = "HttpData"
                baseUrl = "http://copyparty:3923/files"
                type = "HttpData"
            }
        }

        try {
            $assetRegistration = Invoke-JsonPost `
                -Url "$EDCManagementUrl/v3/assets" `
                -Body $assetPayload `
                -Headers @{ "x-api-key" = $EDCApiKey }
        } catch {
            $errorMessage = Get-HttpErrorMessage -ErrorRecord $_
            Show-DockerDiagnostics
            throw "Asset registration failed at $EDCManagementUrl/v3/assets. $errorMessage"
        }

        Write-Host "Asset registered with ID: $($assetRegistration.'@id')"

        Write-Host "[8b/12] Registering policy definition..."
        $policyPayload = @{
            "@context" = @{
                "@vocab" = "https://w3id.org/edc/v0.0.1/ns/"
                "odrl" = "http://www.w3.org/ns/odrl/2/"
            }
            "@id"      = "default-policy"
            "policy"   = @{
                "@type"      = "odrl:Set"
                "permission" = @(@{ "action" = "use" })
                "prohibition" = @()
                "obligation"  = @()
            }
        }
        try {
            Invoke-JsonPost -Url "$EDCManagementUrl/v3/policydefinitions" `
                -Body $policyPayload -Headers @{ "x-api-key" = $EDCApiKey } | Out-Null
            Write-Host "  Policy definition registered."
        } catch {
            $msg = Get-HttpErrorMessage -ErrorRecord $_
            if ($msg -notmatch "already exists|409") {
                throw "Policy registration failed: $msg"
            } else {
                Write-Host "  Policy definition already exists."
            }
        }

        Write-Host "[8c/12] Registering contract definition..."
        $contractPayload = @{
            "@context"        = @{ "@vocab" = "https://w3id.org/edc/v0.0.1/ns/" }
            "@id"             = "default-contract"
            "accessPolicyId"  = "default-policy"
            "contractPolicyId"= "default-policy"
            "assetsSelector"  = @()
        }
        try {
            Invoke-JsonPost -Url "$EDCManagementUrl/v3/contractdefinitions" `
                -Body $contractPayload -Headers @{ "x-api-key" = $EDCApiKey } | Out-Null
            Write-Host "  Contract definition registered."
        } catch {
            $msg = Get-HttpErrorMessage -ErrorRecord $_
            if ($msg -notmatch "already exists|409") {
                throw "Contract definition failed: $msg"
            } else {
                Write-Host "  Contract definition already exists."
            }
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

        Write-Host "[10/12] Consumer requesting EDC transfer negotiation..."
        $artifactDir = Join-Path $NodePath ".runbook-artifacts"
        New-Item -Path $artifactDir -ItemType Directory -Force | Out-Null

        try {
            $negotiationRequest = Invoke-JsonPost `
                -Url "http://localhost:8091/transfer/negotiate" `
                -Headers @{ Authorization = "Bearer $tokenCtoP" } `
                -Body @{
                    peer_dsp_endpoint = $peerDspEndpoint
                    file_path = $datasetName
                }
        } catch {
            $errorMessage = Get-HttpErrorMessage -ErrorRecord $_
            Show-DockerDiagnostics
            throw "Transfer negotiation request failed at consumer handshake API. $errorMessage"
        }

        if ($negotiationRequest.status -ne "ok") {
            throw "Transfer negotiation failed. Status: $($negotiationRequest.status). Error: $($negotiationRequest.error)"
        }

        $transferId = $negotiationRequest.transfer_process_id
        $negotiationId = $negotiationRequest.negotiation_id
        Write-Host "Transfer initiated. Transfer ID: $transferId, Negotiation ID: $negotiationId"

        Write-Host "[11/12] Polling for transfer completion..."
        $transferComplete = $false
        $pollRetries = 120
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
                    -Uri "$EDCManagementUrl/v3/transferprocesses/$transferId" `
                    -Method Get `
                    -Headers @{ "x-api-key" = $EDCApiKey } `
                    -TimeoutSec 10
            } catch {
                $errorMessage = Get-HttpErrorMessage -ErrorRecord $_
                throw "Transfer polling failed for transfer ID '$transferId'. $errorMessage"
            }

            $state = $transferStatus.state
            Write-Host "    Transfer state: $state"

            if ($state -eq "COMPLETED") {
                $transferComplete = $true
                break
            } elseif ($state -in @("FAILED", "TERMINATED", "ERROR")) {
                throw "Transfer failed with state: $state"
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
