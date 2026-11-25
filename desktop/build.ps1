$ErrorActionPreference = 'Stop'
$tableRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $tableRoot '.build'
$outputRoot = Join-Path $tableRoot 'dist'
New-Item -ItemType Directory -Force $buildRoot, $outputRoot | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$bundle = Join-Path $buildRoot 'table.zip'
$stream = [IO.File]::Open($bundle, [IO.FileMode]::Create)
$zip = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
    $sources = @('index.html','table.css','main.mjs','media.mjs','state.mjs','scene.mjs','photo-camera.mjs','painted.mjs','studio-scene.mjs','layouts.mjs','move-session.mjs','movement.mjs','charge-session.mjs','charge.mjs','assets','data','rules','vendor','reconstruction')
    $localPhotos = Test-Path -LiteralPath (Join-Path $tableRoot 'reference/starter-set.jpg')
    if ($localPhotos) { $sources += 'reference' }
    $sources += @('fight-session.mjs','fight-sequence.mjs')
    foreach ($source in $sources) {
        foreach ($file in (Get-ChildItem -Recurse -File -LiteralPath (Join-Path $tableRoot $source))) {
            if ($file.Name -match '\.test\.mjs$|\.pyc?$|^browser-.*\.mjs$') {continue}
            $entry = $file.FullName.Substring($tableRoot.Length+1).Replace('\','/')
            if ($entry -eq 'index.html' -and $localPhotos) {
                $html = [IO.File]::ReadAllText($file.FullName).Replace('<head>', '<head><meta name="local-studio-photos" content="installed">')
                $writer = [IO.StreamWriter]::new($zip.CreateEntry($entry).Open(),[Text.UTF8Encoding]::new($false))
                try { $writer.Write($html) } finally { $writer.Dispose() }
            } else {
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$entry) | Out-Null
            }
        }
    }
} finally {$zip.Dispose();$stream.Dispose()}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output = Join-Path $outputRoot 'ArmageddonTable.exe'
$sdk = Join-Path $PSScriptRoot 'webview2'
& (Join-Path $PSScriptRoot 'restore-sdk.ps1')
$managed = @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')
$embed = @($managed + @('WebView2Loader.dll','LICENSE.txt') | ForEach-Object { '/resource:'+(Join-Path $sdk $_)+','+$_ })
$refs = @($managed | ForEach-Object { '/reference:'+(Join-Path $sdk $_) })
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output "/out:$output" "/resource:$bundle,table.zip" @embed @refs /reference:System.IO.Compression.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'Launcher.cs') (Join-Path $PSScriptRoot 'GameWindow.cs')
if ($LASTEXITCODE -ne 0) {throw 'Windows executable build failed.'}
Get-Item -LiteralPath $output | Select-Object FullName, Length
