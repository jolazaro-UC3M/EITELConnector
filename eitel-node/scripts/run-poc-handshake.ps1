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
        [hashtable]$Body
    )

    return Invoke-RestMethod `
        -Uri $Url `
        -Method Post `
        -ContentType "application/json" `
        -Body ($Body | ConvertTo-Json -Depth 20)
}

Write-Host "== EITEL PoC Handshake Automation =="
Write-Host "Coordinator path: $CoordinatorPath"
Write-Host "Node path:        $NodePath"

$startedCoordinator = $null

try {
    if (-not $SkipCoordinatorStart) {
        if (-not (Test-Path $CoordinatorPath)) {
            throw "Coordinator path not found: $CoordinatorPath"
        }

        Write-Host "`n[1/8] Starting Coordinator..."
        $startedCoordinator = Start-Process `
            -FilePath "uv" `
            -ArgumentList @("run", "fastapi", "dev", "src/coordinator/main.py") `
            -WorkingDirectory $CoordinatorPath `
            -PassThru
    } else {
        Write-Host "`n[1/8] Skipping Coordinator start (using existing instance)."
    }

    Write-Host "[2/8] Waiting for Coordinator API..."
    Invoke-WithRetry -Description "Coordinator health check" -Action {
        Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get | Out-Null
    } | Out-Null

    if (-not (Test-Path $NodePath)) {
        throw "Node path not found: $NodePath"
    }

    Push-Location $NodePath
    try {
        Write-Host "[3/8] Starting producer and consumer containers..."
        $buildArg = if ($NoBuild) { "" } else { "--build" }

        docker compose -f docker-compose.producer.yml up -d $buildArg
        if ($LASTEXITCODE -ne 0) { throw "Failed to start producer compose stack." }

        docker compose -f docker-compose.consumer.yml up -d $buildArg
        if ($LASTEXITCODE -ne 0) { throw "Failed to start consumer compose stack." }

        Write-Host "[4/8] Waiting for node health endpoints..."
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

        Write-Host "[5/8] Requesting Verifiable Credentials..."
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

        Write-Host "[6/8] Running bidirectional handshakes..."
        $resultPtoC = Invoke-JsonPost -Url "http://localhost:8081/handshake/initiate" -Body @{
            did       = $nodePDID
            eitel_vc  = $vcP
            gaia_x_vp = $null
        }
        $resultCtoP = Invoke-JsonPost -Url "http://localhost:8080/handshake/initiate" -Body @{
            did       = $nodeCDID
            eitel_vc  = $vcC
            gaia_x_vp = $null
        }

        if ($resultPtoC.status -ne "ok") { throw "P->C handshake failed. Status: $($resultPtoC.status)" }
        if ($resultCtoP.status -ne "ok") { throw "C->P handshake failed. Status: $($resultCtoP.status)" }

        Write-Host "[7/8] Verifying peer registries with session tokens..."
        $statusFromC = Invoke-RestMethod `
            -Uri "http://localhost:8081/status" `
            -Method Get `
            -Headers @{ Authorization = "Bearer $($resultPtoC.session_token)" }

        $statusFromP = Invoke-RestMethod `
            -Uri "http://localhost:8080/status" `
            -Method Get `
            -Headers @{ Authorization = "Bearer $($resultCtoP.session_token)" }

        $peerPInC = $statusFromC.registered_peers | Where-Object { $_.did -eq $nodePDID }
        $peerCInP = $statusFromP.registered_peers | Where-Object { $_.did -eq $nodeCDID }

        if (-not $peerPInC -or $peerPInC.status -ne "active") {
            throw "Producer DID not active in consumer registry."
        }
        if (-not $peerCInP -or $peerCInP.status -ne "active") {
            throw "Consumer DID not active in producer registry."
        }

        Write-Host "[8/8] Writing execution artifact..."
        $artifactDir = Join-Path $NodePath ".runbook-artifacts"
        New-Item -Path $artifactDir -ItemType Directory -Force | Out-Null

        $artifact = [ordered]@{
            timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
            coordinator_started_by_script = [bool](-not $SkipCoordinatorStart)
            producer_did = $nodePDID
            consumer_did = $nodeCDID
            p_to_c_status = $resultPtoC.status
            c_to_p_status = $resultCtoP.status
            verification = @{
                producer_seen_in_consumer = $peerPInC.status
                consumer_seen_in_producer = $peerCInP.status
            }
        }

        $artifactPath = Join-Path $artifactDir ("handshake-run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
        $artifact | ConvertTo-Json -Depth 10 | Set-Content -Path $artifactPath -Encoding UTF8

        Write-Host ""
        Write-Host "Mutual authentication complete."
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
