<#
.SYNOPSIS
  One-time setup so GitHub Actions can deploy PitchMyWeb (no keys stored).

.DESCRIPTION
  From the repository folder on Windows (PowerShell 5.1 or 7), with the AWS
  CLI configured for the account (aws configure):

    powershell -ExecutionPolicy Bypass -File infrastructure\aws\setup-github-deploy.ps1

  Creates, or updates when run again:
    - GitHub's OIDC identity provider in the AWS account, so a workflow can
      sign in with a short-lived token instead of a stored access key.
    - The role pitchmyweb-github-deploy, which only the main branch of
      ClaxonAI/PitchMyWeb may assume, allowed to do exactly what a deploy
      does: find the app server, upload the package under deploy/ in the
      bucket, run the deploy on that one server and read its progress.

  Prints the role ARN at the end: that goes in the GitHub repository
  variable AWS_DEPLOY_ROLE_ARN (or send it to whoever maintains the
  workflow). Changes nothing else.
#>
param(
  [string]$Region = "ap-south-1",
  [string]$Bucket = "pitchmyweb-prod-recordings-claxonai",
  [string]$Repo = "ClaxonAI/PitchMyWeb",
  [string]$RoleName = "pitchmyweb-github-deploy"
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

function Say([string]$Message) { Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message) }
function Fail([string]$Message) { Write-Host ""; Write-Host "FAILED: $Message" -ForegroundColor Red; exit 1 }

function Invoke-Aws {
  $output = & aws @args
  if ($LASTEXITCODE -ne 0) { Fail "aws $($args -join ' ') exited with $LASTEXITCODE" }
  if ($null -eq $output) { return "" }
  return (($output | Out-String).Trim())
}

# Runs an aws command that is expected to fail when something does not exist yet.
function Test-Aws {
  $ErrorActionPreference = "Continue"
  & aws @args 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Write-JsonFile([string]$Json) {
  $file = Join-Path $env:TEMP ("pmw-{0}.json" -f [Guid]::NewGuid().ToString("N"))
  [IO.File]::WriteAllText($file, $Json)
  return $file
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { Fail "the AWS CLI is not installed" }

$account = Invoke-Aws sts get-caller-identity --query Account --output text
Say "AWS account: $account"

$instances = Invoke-Aws ec2 describe-instances --region $Region `
  --filters "Name=tag:Name,Values=pitchmyweb-app" "Name=instance-state-name,Values=pending,running,stopping,stopped" `
  --query "Reservations[].Instances[].InstanceId" --output text
$ids = @($instances -split "\s+" | Where-Object { $_ })
if ($ids.Count -ne 1) { Fail "expected one instance tagged Name=pitchmyweb-app, found: $instances" }
$instance = $ids[0]
Say "app server: $instance"

# 1. GitHub's OIDC provider (one per account; shared with any other repo).
$provider = "arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com"
if (Test-Aws iam get-open-id-connect-provider --open-id-connect-provider-arn $provider) {
  Say "GitHub OIDC provider already exists"
} else {
  [void](Invoke-Aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com `
    --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1)
  Say "created the GitHub OIDC provider"
}

# 2. The role, assumable only from this repository's main branch.
$trust = @'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "__PROVIDER__" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:__REPO__:ref:refs/heads/main"
      }
    }
  }]
}
'@ -replace "__PROVIDER__", $provider -replace "__REPO__", $Repo
$trustFile = Write-JsonFile $trust
try {
  if (Test-Aws iam get-role --role-name $RoleName) {
    [void](Invoke-Aws iam update-assume-role-policy --role-name $RoleName --policy-document "file://$trustFile")
    Say "role $RoleName exists; trust policy updated"
  } else {
    [void](Invoke-Aws iam create-role --role-name $RoleName --assume-role-policy-document "file://$trustFile" `
      --description "GitHub Actions deploys of $Repo (main only)" --max-session-duration 7200)
    Say "created role $RoleName"
  }
} finally { Remove-Item $trustFile -ErrorAction SilentlyContinue }

# 3. What a deploy does, and nothing more.
$policy = @'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "FindServer", "Effect": "Allow", "Action": "ec2:DescribeInstances", "Resource": "*" },
    { "Sid": "UploadPackage", "Effect": "Allow", "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::__BUCKET__/deploy/*" },
    { "Sid": "RunDeploy", "Effect": "Allow", "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:__REGION__:__ACCOUNT__:instance/__INSTANCE__",
        "arn:aws:ssm:__REGION__::document/AWS-RunShellScript"
      ] },
    { "Sid": "FollowDeploy", "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation", "ssm:ListCommands", "ssm:ListCommandInvocations"],
      "Resource": "*" }
  ]
}
'@ -replace "__BUCKET__", $Bucket -replace "__REGION__", $Region -replace "__ACCOUNT__", $account -replace "__INSTANCE__", $instance
$policyFile = Write-JsonFile $policy
try {
  [void](Invoke-Aws iam put-role-policy --role-name $RoleName --policy-name deploy --policy-document "file://$policyFile")
  Say "deploy permissions set"
} finally { Remove-Item $policyFile -ErrorAction SilentlyContinue }

$arn = Invoke-Aws iam get-role --role-name $RoleName --query Role.Arn --output text
Write-Host ""
Write-Host "Done. Role ARN:" -ForegroundColor Green
Write-Host "  $arn"
Write-Host ""
Write-Host "Put it in GitHub: repository Settings > Secrets and variables > Actions >"
Write-Host "Variables > New repository variable, name AWS_DEPLOY_ROLE_ARN, value above."
Write-Host "(Or send the ARN to whoever maintains the workflow.)"
