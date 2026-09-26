param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath
)

try {
    if (-not (Test-Path $ImagePath)) {
        Write-Output '{"success":false,"error":"Image file not found"}'
        exit 0
    }

    Add-Type -AssemblyName System.Drawing
    Add-Type -Path 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll'

    [Windows.Media.Ocr.OcrEngine, Windows.Foundation.Diagnostics, ContentType = WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Globalization.Language, Windows.Foundation.Diagnostics, ContentType = WindowsRuntime] | Out-Null

    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | 
        Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | 
        Select-Object -First 1

    function Await-Op($asyncOp, [type]$resultType) {
        $method = $asTaskGeneric.MakeGenericMethod($resultType)
        $task = $method.Invoke($null, @($asyncOp))
        return $task.GetAwaiter().GetResult()
    }

    $fullPath = [System.IO.Path]::GetFullPath($ImagePath)
    $storageFile = Await-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($fullPath)) ([Windows.Storage.StorageFile])
    $stream = Await-Op ($storageFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $softwareBmp = Await-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -eq $engine) {
        $lang = [Windows.Globalization.Language]::new("en-US")
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
    }

    $ocrResult = Await-Op ($engine.RecognizeAsync($softwareBmp)) ([Windows.Media.Ocr.OcrResult])

    $linesList = @()
    if ($ocrResult.Lines) {
        foreach ($l in $ocrResult.Lines) {
            $linesList += $l.Text
        }
    }

    $res = @{
        success = $true
        text = $ocrResult.Text
        lines = $linesList
    }

    $json = $res | ConvertTo-Json -Compress
    Write-Output $json
} catch {
    $err = @{
        success = $false
        error = $_.Exception.Message
    }
    Write-Output ($err | ConvertTo-Json -Compress)
}
