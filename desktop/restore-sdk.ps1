$ErrorActionPreference = 'Stop'
$version = '1.0.2903.40'
$url = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg"
$destination = Join-Path $PSScriptRoot 'webview2'
$manifest = [ordered]@{
    'lib/net462/Microsoft.Web.WebView2.Core.dll' = '88A3B62F45225A811CDB85DF6DFD95C2BFF9A0E43E3B04F813B125EACA56CC9F'
    'lib/net462/Microsoft.Web.WebView2.WinForms.dll' = '29FC954C3FDE1749817D158F3DD5EBE9EFD3B3CE9708D86092FB1E9F023A1CB0'
    'runtimes/win-x64/native/WebView2Loader.dll' = '462B36FD1BE6CA9F7563466A89E57C41EF4A4DEF3E0A84FA885D203AEA4A3AAF'
}

function Test-SdkFile($path, $expectedHash) {
    return ([IO.File]::Exists($path) -and (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $expectedHash)
}

$missing = @(
    foreach ($asset in $manifest.GetEnumerator()) {
        $path = Join-Path $destination ([IO.Path]::GetFileName($asset.Key))
        if (-not (Test-SdkFile $path $asset.Value)) { $asset }
    }
)
if ($missing.Count -eq 0) {
    Write-Host "Verified WebView2 SDK $version (x64)."
    return
}

# Stage the whole requested set before publishing any replacement. Keeping the
# temporary files on the destination volume permits an atomic rename per DLL.
[IO.Directory]::CreateDirectory($destination) | Out-Null
$stage = Join-Path $destination ('.restore-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
$oldProtocol = [Net.ServicePointManager]::SecurityProtocol
try {
    [Net.ServicePointManager]::SecurityProtocol = $oldProtocol -bor [Net.SecurityProtocolType]::Tls12
    $package = Join-Path $stage 'sdk.nupkg'
    Invoke-WebRequest -Uri $url -OutFile $package -UseBasicParsing
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($package)
    try {
        foreach ($asset in $missing) {
            $entry = $zip.GetEntry($asset.Key)
            if ($null -eq $entry) { throw "Missing entry in WebView2 SDK package: $($asset.Key)" }
            $staged = Join-Path $stage $entry.Name
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $staged)
            if (-not (Test-SdkFile $staged $asset.Value)) { throw "SHA-256 mismatch for $($asset.Key)" }
        }
    } finally {
        $zip.Dispose()
    }

    foreach ($asset in $missing) {
        $name = [IO.Path]::GetFileName($asset.Key)
        $staged = Join-Path $stage $name
        $path = Join-Path $destination $name
        try {
            if ([IO.File]::Exists($path)) {
                [IO.File]::Replace($staged, $path, (Join-Path $stage ($name + '.bak')))
            } else {
                [IO.File]::Move($staged, $path)
            }
        } catch [IO.IOException] {
            # A concurrent restore may have just installed the same verified DLL.
            if (-not (Test-SdkFile $path $asset.Value)) { throw }
        }
    }
    Write-Host "Restored WebView2 SDK $version (x64)."
} finally {
    [Net.ServicePointManager]::SecurityProtocol = $oldProtocol
    foreach ($file in [IO.Directory]::GetFiles($stage)) { [IO.File]::Delete($file) }
    [IO.Directory]::Delete($stage)
}
