# Imports rounds from the customer's spreadsheet (.xlsx or .csv) into a table, REPLACING that table's
# data. Checks the file first, asks to confirm, backs up the database, then imports.
#   Drag the file onto import-rounds.bat, or:
#   .\import-rounds.ps1 -File D:\data\012022.xlsx [-Table dt-1] [-Sheet "DAI LY"] [-Force]
# Layout: column A = game number, then S1..S60 coded 1 red, 2 blue, 3 yellow, 4 black, 5 green.
param(
    [string]$File = '',
    [string]$Table = 'dt-1',
    [string]$Sheet = '',
    [switch]$Force
)

. "$PSScriptRoot\common.ps1"

if (-not $File) { $File = (Read-Host 'Path of the .xlsx / .csv file (you can drag the file into this window)').Trim().Trim('"') }
if (-not (Test-Path $File)) { throw "File not found: $File" }
$File = (Resolve-Path $File).Path

$python = Get-VenvPython
$cliArgs = @('-m', 'app.cli.import_rounds', $File, '--table', $Table)
if ($Sheet) { $cliArgs += @('--sheet', $Sheet) }
$env:PYTHONIOENCODING = 'utf-8'

function Invoke-Import([string[]]$Extra) {
    Push-Location $BackendDir
    try {
        # Out-Host: otherwise the tool's output would become part of this function's return value.
        & $python @cliArgs @Extra | Out-Host
        return $LASTEXITCODE
    } finally { Pop-Location }
}

Write-Step "Checking $File"
$code = Invoke-Import @()
if ($code -ne 0) { throw "The file cannot be imported (see the messages above). Nothing was changed." }

if (-not $Force) {
    Write-Host ''
    Write-Host "This DELETES all current data of table '$Table' and replaces it with the rounds above." -ForegroundColor Yellow
    $answer = Read-Host 'Type IMPORT to continue'
    if ($answer -ne 'IMPORT') { Write-Host 'Cancelled. Nothing was changed.'; exit 1 }
}

Write-Step 'Backup before import'
& (Join-Path $PSScriptRoot 'backup.ps1')

Write-Step 'Importing'
$code = Invoke-Import @('--replace')
if ($code -ne 0) { throw "Import failed (exit code $code). The database is unchanged; the backup above is available." }
Write-Ok 'done - iPads showing this table reload the new data within a few seconds'
