# Build and push both production images to GHCR.
#
#   .\build-push.ps1                       # tag is today, first deploy
#   .\build-push.ps1 -Tag 2026-10-10-02    # second deploy of the day
#
# One command, all three apps: the API gets an image, and the public site and
# the admin are built into one nginx image together. Tag format is
# YYYY-MM-DD-XX, where XX counts the deploys that day.
#
# Needs: docker logged in to ghcr.io
#   echo $env:GITHUB_TOKEN | docker login ghcr.io -u <you> --password-stdin

param(
    [string]$Tag = (Get-Date -Format 'yyyy-MM-dd-01'),
    [string]$Registry = 'ghcr.io/kimkundad',
    # Public by design — it names the site to Google and is readable in the
    # page source. Taken from frontend/.env when not given.
    [string]$RecaptchaSiteKey = $env:VITE_RECAPTCHA_SITE_KEY,
    [string]$AdminUrl = 'https://minna-admin.learnsbuy.com',
    # Builds without pushing, for checking that the images come out at all.
    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if ($Tag -notmatch '^\d{4}-\d{2}-\d{2}-\d{2}$') {
    Write-Error "Tag must look like 2026-10-10-01, got '$Tag'."
    exit 1
}

# Falling back to frontend/.env keeps the key in one place rather than in a
# command somebody has to remember to type the same way every time.
if (-not $RecaptchaSiteKey -and (Test-Path 'frontend/.env')) {
    $line = Get-Content 'frontend/.env' | Where-Object { $_ -match '^VITE_RECAPTCHA_SITE_KEY=' }
    if ($line) { $RecaptchaSiteKey = ($line -replace '^VITE_RECAPTCHA_SITE_KEY=', '').Trim() }
}
if (-not $RecaptchaSiteKey) {
    # Not fatal here, but it would be at boot: the API refuses to start in
    # production without the matching secret, and a site built without the key
    # sends no token, so every guarded form would be refused.
    Write-Warning 'No VITE_RECAPTCHA_SITE_KEY. Forms that need a token will be refused in production.'
}

$apiImage = "$Registry/minna-api:$Tag"
$webImage = "$Registry/minna-web:$Tag"

# Stamped onto both images so that, months later, `docker image inspect` can
# say which commit is running rather than only which day it was built.
$revision = (git rev-parse HEAD).Trim()
$dirty = (git status --porcelain)
if ($dirty) {
    Write-Warning 'Working tree has uncommitted changes — the recorded commit will not match what is in the image.'
}

Write-Host "Building $Tag  (commit $($revision.Substring(0,7)))" -ForegroundColor Cyan

# Docker Hub's token endpoint fails often enough — 500s and 504s, several times
# in an afternoon — that a single attempt is not a fair test of whether the
# build works. Only the fetch is retried; a real build error fails the same way
# on every attempt and still stops after the last one.
function Invoke-WithRetry {
    param([string]$What, [scriptblock]$Run, [int]$Attempts = 4)

    for ($i = 1; $i -le $Attempts; $i++) {
        & $Run
        if ($LASTEXITCODE -eq 0) { return }
        if ($i -lt $Attempts) {
            Write-Warning "$What failed (attempt $i of $Attempts). Retrying in $($i * 5)s..."
            Start-Sleep -Seconds ($i * 5)
        }
    }
    Write-Error "$What failed after $Attempts attempts."
    exit 1
}

Invoke-WithRetry 'API image build' {
    docker build -f Dockerfile.prod --target api-runtime `
        --label "org.opencontainers.image.revision=$revision" `
        -t $apiImage .
}

Invoke-WithRetry 'Web image build' {
    docker build -f Dockerfile.prod --target web-runtime `
        --build-arg "VITE_ADMIN_URL=$AdminUrl" `
        --build-arg "VITE_RECAPTCHA_SITE_KEY=$RecaptchaSiteKey" `
        --label "org.opencontainers.image.revision=$revision" `
        -t $webImage .
}

if ($NoPush) {
    Write-Host ''
    Write-Host "Built, not pushed:" -ForegroundColor Green
    Write-Host "  $apiImage"
    Write-Host "  $webImage"
    exit 0
}

Write-Host 'Pushing...' -ForegroundColor Cyan
# Retried for the same reason as the builds, and more so: a push is a long
# upload, and losing it to one bad response near the end is expensive. A push
# that resumes re-sends only the layers that did not land.
Invoke-WithRetry 'API image push' { docker push $apiImage }
Invoke-WithRetry 'Web image push' { docker push $webImage }

Write-Host ''
Write-Host 'Done. On the server:' -ForegroundColor Green
Write-Host "  cd /srv/minna && bash deploy.sh $Tag"
