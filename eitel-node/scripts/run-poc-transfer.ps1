[CmdletBinding()]
param(
    [string]$CoordinatorPath = "",
    [string]$NodePath = "",
    [switch]$SkipCoordinatorStart,
    [switch]$NoBuild,
    [switch]$TeardownOnSuccess
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

Write-Host "== EITEL PoC Transfer Automation =="
Write-Host "Coordinator path: $CoordinatorPath"
Write-Host "Node path:        $NodePath"

$startedCoordinator = $null

try {
    if (-not $SkipCoordinatorStart) {
        if (-not (Test-Path $CoordinatorPath)) {
            throw "Coordinator path not found: $CoordinatorPath"
        }

        Write-Host "`n[1/10] Starting Coordinator..."
        $startedCoordinator = Start-Process `
            -FilePath "uv" `
            -ArgumentList @("run", "fastapi", "dev", "src/coordinator/main.py") `
            -WorkingDirectory $CoordinatorPath `
            -PassThru
    } else {
        Write-Host "`n[1/10] Skipping Coordinator start (using existing instance)."
    }

    Write-Host "[2/10] Waiting for Coordinator API..."
    Invoke-WithRetry -Description "Coordinator health check" -Action {
        Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get | Out-Null
    } | Out-Null

    if (-not (Test-Path $NodePath)) {
        throw "Node path not found: $NodePath"
    }

    Push-Location $NodePath
    try {
        Write-Host "[3/10] Starting producer and consumer containers..."
        $buildArg = if ($NoBuild) { "" } else { "--build" }

        docker compose -f docker-compose.producer.yml up -d $buildArg
        if ($LASTEXITCODE -ne 0) { throw "Failed to start producer compose stack." }

        docker compose -f docker-compose.consumer.yml up -d $buildArg
        if ($LASTEXITCODE -ne 0) { throw "Failed to start consumer compose stack." }

        Write-Host "[4/10] Waiting for node health endpoints..."
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

        Write-Host "[5/10] Requesting Verifiable Credentials..."
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

        Write-Host "[6/10] Seeding test dataset in producer Copyparty..."
        $datasetName = "test-dataset.json"
        $datasetPayload = '{"dataset":"project-star","owner":"producer-node","records":[{"id":1,"value":"alpha"},{"id":2,"value":"beta"}]}'
        $seedCmd = "printf '%s`n' '$datasetPayload' > /data/$datasetName"
        docker exec eitel-node-copyparty-producer sh -c $seedCmd
        if ($LASTEXITCODE -ne 0) { throw "Failed to seed dataset in producer Copyparty." }

        Write-Host "[7/10] Executing consumer-to-producer handshake..."
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

        Write-Host "[8/10] Consumer requesting file from producer transfer endpoint..."
        $artifactDir = Join-Path $NodePath ".runbook-artifacts"
        New-Item -Path $artifactDir -ItemType Directory -Force | Out-Null

        $downloadedPath = Join-Path $artifactDir "downloaded-$datasetName"
        $response = Invoke-WebRequest `
            -Uri "http://localhost:8080/transfer/download" `
            -Method Post `
            -Headers @{ Authorization = "Bearer $tokenCtoP" } `
            -ContentType "application/json" `
            -Body (@{ file_path = $datasetName } | ConvertTo-Json -Depth 10) `
            -OutFile $downloadedPath

        Write-Host "[9/10] Verifying transferred payload..."
        if (-not (Test-Path $downloadedPath)) {
            throw "Transferred file was not created: $downloadedPath"
        }

        $downloadedBytes = (Get-Item $downloadedPath).Length
        if ($downloadedBytes -le 0) {
            throw "Transferred file is empty: $downloadedPath"
        }

        $downloadedContent = Get-Content -Path $downloadedPath -Raw
        if ($downloadedContent -notmatch "project-star") {
            throw "Transferred content did not match expected marker."
        }

        Write-Host "Transfer OK. Saved file: $downloadedPath ($downloadedBytes bytes)"

        Write-Host "[10/10] Writing execution artifact..."
        $artifact = [ordered]@{
            timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
            coordinator_started_by_script = [bool](-not $SkipCoordinatorStart)
            producer_did = $nodePDID
            consumer_did = $nodeCDID
            dataset_name = $datasetName
            handshake_status = $resultCtoP.status
            transfer = @{
                requested_by = "consumer"
                served_by = "producer"
                download_path = $downloadedPath
                bytes = $downloadedBytes
            }
        }

        $artifactPath = Join-Path $artifactDir ("transfer-run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
        $artifact | ConvertTo-Json -Depth 10 | Set-Content -Path $artifactPath -Encoding UTF8

        Write-Host ""
        Write-Host "Handshake + transfer complete."
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
