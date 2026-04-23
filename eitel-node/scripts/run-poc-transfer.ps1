[CmdletBinding()]
param(
    [string]$CoordinatorPath = "",
    [string]$NodePath = "",
    [switch]$SkipCoordinatorStart,
    [switch]$NoBuild,
    [switch]$TeardownOnSuccess,
    [string]$EDCManagementUrl = "http://localhost:8182",
    [string]$EDCApiKey = "change-me"
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
        [string]$Description = "operation"
    )

    for ($i = 1; $i -le $Retries; $i++) {
        try {
            return & $Action
        } catch {
            if ($i -eq $Retries) {
                throw "Failed $Description after $Retries attempts. Last error: $($_.Exception.Message)"
            }
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Invoke-JsonPost {
    param(
        [string]$Url,
        [hashtable]$Body,
        [hashtable]$Headers = @{}
    )

    return Invoke-RestMethod `
        -Uri $Url `
        -Method Post `
        -ContentType "application/json" `
        -Headers $Headers `
        -Body ($Body | ConvertTo-Json -Depth 20)
}

Write-Host "== EITEL PoC Transfer Automation (with EDC Integration) =="
Write-Host "Coordinator path: $CoordinatorPath"
Write-Host "Node path:        $NodePath"
Write-Host "EDC Management URL: $EDCManagementUrl"

$startedCoordinator = $null

try {
    if (-not $SkipCoordinatorStart) {
        if (-not (Test-Path $CoordinatorPath)) {
            throw "Coordinator path not found: $CoordinatorPath"
        }

        Write-Host "`n[1/11] Starting Coordinator..."
        $startedCoordinator = Start-Process `
            -FilePath "uv" `
            -ArgumentList @("run", "fastapi", "dev", "src/coordinator/main.py") `
            -WorkingDirectory $CoordinatorPath `
            -PassThru
    } else {
        Write-Host "`n[1/11] Skipping Coordinator start (using existing instance)."
    }

    Write-Host "[2/11] Waiting for Coordinator API..."
    Invoke-WithRetry -Description "Coordinator health check" -Action {
        Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get | Out-Null
    } | Out-Null

    if (-not (Test-Path $NodePath)) {
        throw "Node path not found: $NodePath"
    }

    Push-Location $NodePath
    try {
        Write-Host "[3/11] Starting producer and consumer containers..."
        $buildArg = if ($NoBuild) { "" } else { "--build" }

        docker compose -f docker-compose.producer.yml up -d $buildArg
        if ($LASTEXITCODE -ne 0) { throw "Failed to start producer compose stack." }

        docker compose -f docker-compose.consumer.yml up -d $buildArg
        if ($LASTEXITCODE -ne 0) { throw "Failed to start consumer compose stack." }

        Write-Host "[4/11] Waiting for node health endpoints..."
        $healthP = Invoke-WithRetry -Description "Producer health endpoint" -Action {
            Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get
        }
        $healthC = Invoke-WithRetry -Description "Consumer health endpoint" -Action {
            Invoke-RestMethod -Uri "http://localhost:8081/health" -Method Get
        }

        $nodePDID = $healthP.node_did
        $nodeCDID = $healthC.node_did
        Write-Host "Producer DID: $nodePDID"
        Write-Host "Consumer DID: $nodeCDID"

        Write-Host "[5/11] Requesting Verifiable Credentials..."
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

        Write-Host "[6/11] Seeding test dataset in producer Copyparty..."
        $datasetName = "test-dataset.json"
        $datasetPayload = '{"dataset":"project-star","owner":"producer-node","records":[{"id":1,"value":"alpha"},{"id":2,"value":"beta"}]}'
        $seedCmd = "printf '%s`n' '$datasetPayload' > /data/$datasetName"
        docker exec eitel-node-copyparty-producer sh -c $seedCmd
        if ($LASTEXITCODE -ne 0) { throw "Failed to seed dataset in producer Copyparty." }

        Write-Host "[7/11] Pre-registering asset in producer EDC..."
        $assetId = $datasetName
        $assetPayload = @{
            "@context" = "https://w3id.org/edc/v0.0.1/ns/"
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

        $assetRegistration = Invoke-JsonPost `
            -Url "$EDCManagementUrl/v3/assets" `
            -Body $assetPayload `
            -Headers @{ "x-api-key" = $EDCApiKey }

        Write-Host "Asset registered with ID: $($assetRegistration.id)"

        Write-Host "[8/11] Executing consumer-to-producer handshake..."
        $resultCtoP = Invoke-JsonPost -Url "http://localhost:8080/handshake/initiate" -Body @{
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

        Write-Host "[9/11] Consumer requesting EDC transfer negotiation..."
        $artifactDir = Join-Path $NodePath ".runbook-artifacts"
        New-Item -Path $artifactDir -ItemType Directory -Force | Out-Null

        $negotiationRequest = Invoke-JsonPost `
            -Url "http://localhost:8081/transfer/negotiate" `
            -Headers @{ Authorization = "Bearer $tokenCtoP" } `
            -Body @{
                peer_dsp_endpoint = $peerDspEndpoint
                file_path = $datasetName
            }

        if ($negotiationRequest.status -ne "ok") {
            throw "Transfer negotiation failed. Status: $($negotiationRequest.status). Error: $($negotiationRequest.error)"
        }

        $transferId = $negotiationRequest.transfer_process_id
        $negotiationId = $negotiationRequest.negotiation_id
        Write-Host "Transfer initiated. Transfer ID: $transferId, Negotiation ID: $negotiationId"

        Write-Host "[10/11] Polling for transfer completion..."
        $transferComplete = $false
        $pollRetries = 60
        $pollDelay = 1

        for ($i = 0; $i -lt $pollRetries; $i++) {
            Write-Host "  Poll attempt $($i + 1)/$pollRetries..."

            $transferStatus = Invoke-RestMethod `
                -Uri "$EDCManagementUrl/v3/transferprocesses/$transferId" `
                -Method Get `
                -Headers @{ "x-api-key" = $EDCApiKey }

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

        Write-Host "[11/11] Writing execution artifact..."
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
