<#
.SYNOPSIS
  Deploy PitchMyWeb's main branch to the production server - one command.

.DESCRIPTION
  From the repository folder on Windows (PowerShell 5.1 or 7):

    powershell -ExecutionPolicy Bypass -File infrastructure\aws\deploy.ps1
    powershell -ExecutionPolicy Bypass -File infrastructure\aws\deploy.ps1 -Resize t3.medium
    powershell -ExecutionPolicy Bypass -File infrastructure\aws\deploy.ps1 -Status

  What a deploy does, in order, and why each step is here:
    1. Refuses to start while another deploy is running on the server, and
       waits for it instead. Two at once share one folder and break each
       other's build.
    2. Packages origin/main (never HEAD: the working copy may be on another
       branch with uncommitted changes) and uploads it to S3.
    3. Starts bootstrap.sh on the server exactly once, then follows it until
       it finishes, printing progress. A failure prints the end of the deploy
       log, so there is nothing else to run to find out why.
    4. Checks https://pitchmyweb.in answers.

  -Resize <type>  after a successful deploy, stops the server, changes its
                  instance type, starts it and waits until the site answers
                  again (2-3 minutes of downtime). Skipped when it is already
                  that type.
  -Status         changes nothing: shows running deploys, the end of the
                  deploy log, memory and the pm2 process list.
  -SkipDeploy     with -Resize, only resizes.

  Needs the AWS CLI configured for the account (aws configure) and git.
#>
param(
  [string]$Resize = "",
  [switch]$Status,
  [switch]$SkipDeploy,
  [string]$Region = "ap-south-1",
  [string]$Bucket = "pitchmyweb-prod-recordings-claxonai",
  [string]$SiteUrl = "https://pitchmyweb.in/",
  [int]$TimeoutMinutes = 60,
  [int]$PollSeconds = 20
)

$ErrorActionPreference = "Stop"
# The AWS CLI prints pm2's table-drawing characters, which the default Windows
# console code page cannot encode ("'charmap' codec can't encode").
$env:PYTHONUTF8 = "1"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$S3Key = "s3://$Bucket/deploy/current.tar.gz"
$AppDir = "/home/ubuntu/PitchMyWeb"

function Say([string]$Message) { Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message) }
function Fail([string]$Message) { Write-Host ""; Write-Host "FAILED: $Message" -ForegroundColor Red; exit 1 }

# Runs the AWS CLI and returns its trimmed text output; stops on a non-zero exit.
# (Not named "Aws": PowerShell names are case-insensitive, so a function called
# Aws would shadow the aws executable and call itself.)
function Invoke-Aws {
  $output = & aws @args --region $Region
  if ($LASTEXITCODE -ne 0) { Fail "aws $($args -join ' ') exited with $LASTEXITCODE" }
  if ($null -eq $output) { return "" }
  return (($output | Out-String).Trim())
}

function Get-InstanceId {
  $id = Invoke-Aws ec2 describe-instances `
    --filters "Name=tag:Name,Values=pitchmyweb-app" "Name=instance-state-name,Values=pending,running,stopping,stopped" `
    --query "Reservations[].Instances[].InstanceId" --output text
  $ids = @($id -split "\s+" | Where-Object { $_ })
  if ($ids.Count -eq 0) { Fail "no EC2 instance tagged Name=pitchmyweb-app in $Region" }
  if ($ids.Count -gt 1) { Fail "more than one instance tagged Name=pitchmyweb-app: $($ids -join ', ')" }
  return $ids[0]
}

# Sends shell commands to the server through SSM Run Command; returns the command id.
function Send-Shell([string]$InstanceId, [string[]]$Commands, [int]$TimeoutSeconds = 600, [string]$Comment = "pitchmyweb") {
  $file = Join-Path $env:TEMP ("pmw-ssm-{0}.json" -f [Guid]::NewGuid().ToString("N"))
  $json = @{ commands = $Commands } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($file, $json)
  try {
    return (Invoke-Aws ssm send-command --instance-ids $InstanceId --document-name AWS-RunShellScript `
      --timeout-seconds $TimeoutSeconds --comment $Comment --parameters "file://$file" `
      --query Command.CommandId --output text)
  } finally {
    Remove-Item $file -ErrorAction SilentlyContinue
  }
}

function Get-CommandStatus([string]$InstanceId, [string]$CommandId) {
  # Windows PowerShell 5.1 turns a native command's redirected stderr into a
  # terminating error under "Stop"; this call expects to fail right after
  # send-command, so it runs under "Continue".
  $ErrorActionPreference = "Continue"
  $status = & aws ssm get-command-invocation --region $Region --instance-id $InstanceId --command-id $CommandId `
    --query Status --output text 2>$null
  if ($LASTEXITCODE -ne 0) { return "Pending" } # not registered yet, right after send-command
  return (($status | Out-String).Trim())
}

function Wait-Command([string]$InstanceId, [string]$CommandId, [int]$Minutes, [string]$What) {
  $deadline = (Get-Date).AddMinutes($Minutes)
  $started = Get-Date
  $last = ""
  while ((Get-Date) -lt $deadline) {
    $state = Get-CommandStatus $InstanceId $CommandId
    if ($state -ne $last) { Write-Host ""; Say "${What}: $state"; $last = $state }
    if (@("Success", "Failed", "Cancelled", "TimedOut", "Cancelling") -contains $state) { return $state }
    Start-Sleep -Seconds $PollSeconds
    Write-Host -NoNewline ("`r    ... {0} min" -f [int]((Get-Date) - $started).TotalMinutes)
  }
  Write-Host ""
  return "TimedOut"
}

function Get-Output([string]$InstanceId, [string]$CommandId) {
  return (& aws ssm get-command-invocation --region $Region --instance-id $InstanceId --command-id $CommandId `
    --query StandardOutputContent --output text | Out-String)
}

function Show-ServerState([string]$InstanceId, [int]$LogLines = 80) {
  $id = Send-Shell $InstanceId @(
    "echo '--- deploy log (last $LogLines lines) ---'",
    "tail -n $LogLines /var/log/pitchmyweb-bootstrap.log 2>/dev/null || echo 'no deploy log yet'",
    "echo; echo '--- memory ---'; free -m; swapon --show",
    "echo; echo '--- processes ---'; sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 HOME=/home/ubuntu pm2 list --no-color 2>/dev/null || echo 'pm2 not running'"
  ) 120 "pitchmyweb status"
  [void](Wait-Command $InstanceId $id 3 "reading server state")
  Write-Host ""
  Write-Host (Get-Output $InstanceId $id)
}

# Deploys running on the server right now (this script's and hand-sent ones).
function Get-RunningDeploys([string]$InstanceId) {
  $ids = Invoke-Aws ssm list-commands --instance-id $InstanceId --filters "key=Status,value=InProgress" `
    --query "Commands[?DocumentName=='AWS-RunShellScript'].CommandId" --output text
  return @($ids -split "\s+" | Where-Object { $_ })
}

function Test-Site([int]$Minutes) {
  $deadline = (Get-Date).AddMinutes($Minutes)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $SiteUrl -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 5
      if ($response.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds ([Math]::Min(15, $PollSeconds))
  }
  return $false
}

# --------------------------------------------------------------------------

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { Fail "the AWS CLI is not installed (https://aws.amazon.com/cli/)" }
$instance = Get-InstanceId
Say "server: $instance"

if ($Status) {
  $running = Get-RunningDeploys $instance
  if ($running.Count -gt 0) { Say "commands still running on the server: $($running -join ', ')" } else { Say "nothing running on the server" }
  Show-ServerState $instance 60
  exit 0
}

if (-not $SkipDeploy) {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "git is not installed" }

  # 1. Never overlap a deploy that is already running.
  foreach ($running in (Get-RunningDeploys $instance)) {
    Say "another command ($running) is still running on the server; waiting for it first"
    [void](Wait-Command $instance $running $TimeoutMinutes "earlier command")
  }

  # 2. Package origin/main.
  Say "fetching origin/main"
  & git -C $RepoRoot fetch origin main
  if ($LASTEXITCODE -ne 0) { Fail "git fetch origin main" }
  $commit = (& git -C $RepoRoot log -1 --format="%h %s" origin/main | Out-String).Trim()
  Say "deploying: $commit"
  $tarball = Join-Path $env:TEMP "pmw-deploy.tar.gz"
  & git -C $RepoRoot archive --format=tar.gz -o $tarball origin/main
  if ($LASTEXITCODE -ne 0) { Fail "git archive origin/main" }
  Say ("uploading {0:N1} MB to {1}" -f ((Get-Item $tarball).Length / 1MB), $S3Key)
  [void](Invoke-Aws s3 cp $tarball $S3Key --only-show-errors)

  # 3. Run it once and follow it.
  $deployId = Send-Shell $instance @("cd $AppDir && sudo SOURCE_S3=$S3Key bash infrastructure/aws/bootstrap.sh") ($TimeoutMinutes * 60) "pitchmyweb deploy"
  Say "deploy started ($deployId); a full deploy takes about 10-15 minutes"
  $result = Wait-Command $instance $deployId $TimeoutMinutes "deploy"
  Write-Host ""
  if ($result -ne "Success") {
    Say "deploy ended as $result; the end of the deploy log:"
    Show-ServerState $instance 120
    Fail "deploy $result. The site keeps serving the previous build (a failed build is never swapped in). Fix the error above, or re-run this script once."
  }
  Say "deploy finished"

  # 4. Is the site up?
  if (Test-Site 3) { Say "$SiteUrl answers 200" } else { Say "WARNING: $SiteUrl did not answer 200 within 3 minutes"; Show-ServerState $instance 40 }
}

if ($Resize) {
  $current = Invoke-Aws ec2 describe-instances --instance-ids $instance --query "Reservations[].Instances[].InstanceType" --output text
  if ($current -eq $Resize) {
    Say "already a $Resize; nothing to resize"
  } else {
    Say "resizing $current -> $Resize (the site is down for 2-3 minutes)"
    [void](Invoke-Aws ec2 stop-instances --instance-ids $instance)
    & aws ec2 wait instance-stopped --region $Region --instance-ids $instance
    if ($LASTEXITCODE -ne 0) { Fail "the server did not stop" }
    [void](Invoke-Aws ec2 modify-instance-attribute --instance-id $instance --instance-type "Value=$Resize")
    [void](Invoke-Aws ec2 start-instances --instance-ids $instance)
    & aws ec2 wait instance-running --region $Region --instance-ids $instance
    if ($LASTEXITCODE -ne 0) { Fail "the server did not start again; check the EC2 console" }
    $now = Invoke-Aws ec2 describe-instances --instance-ids $instance --query "Reservations[].Instances[].InstanceType" --output text
    Say "server is running as $now; waiting for the site"
    if (Test-Site 8) { Say "$SiteUrl answers 200" } else {
      Say "WARNING: the site is not answering yet"
      Show-ServerState $instance 40
      Fail "the site did not come back after the resize. To undo: re-run with -SkipDeploy -Resize $current"
    }
  }
}

Say "done"
