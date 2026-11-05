# Runs in a hidden, short-lived Windows PowerShell process. Input/output are JSON on pipes.
# GetSystemWebProxy reads current-user Windows Internet settings, including PAC/WPAD.
# This script never changes those settings or disables TLS verification.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::SystemDefault
$response = $null
$request = $null
$route = 'unknown'
try {
    $packet = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $uri = [Uri]$packet.url
    # Loopback HTTP is only for isolated transport tests; the JS entry point restricts production URLs.
    if (!(($uri.Scheme -eq 'https' -and $uri.Host -eq 'api.openai.com' -and $uri.AbsolutePath -match '^/v1/images/(generations|edits)$') -or ($uri.IsLoopback -and $uri.Scheme -eq 'http'))) {
        throw 'Unsupported endpoint'
    }
    if ($packet.proxyUrl) {
        $proxy = New-Object Net.WebProxy([Uri]$packet.proxyUrl, $false)
    } else {
        $proxy = [Net.WebRequest]::GetSystemWebProxy()
    }
    # Resolve PAC for this exact destination; bind the chosen route to this one request.
    $destination = $proxy.GetProxy($uri)
    if ($null -eq $destination -or $destination.Equals($uri)) {
        $selectedProxy = $null
        $route = 'direct'
    } else {
        $selectedProxy = New-Object Net.WebProxy($destination, $false)
        $route = 'proxy'
        if ($packet.proxyUseDefaultCredentials -eq $true) {
            $selectedProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials
        }
    }
    $request = [Net.HttpWebRequest]::Create($uri)
    $request.Proxy = $selectedProxy
    $request.Method = [string]$packet.method
    $request.AllowAutoRedirect = $false
    $request.KeepAlive = $false
    $request.Timeout = [int]$packet.timeoutMs
    $request.ReadWriteTimeout = [int]$packet.timeoutMs
    $request.ServicePoint.Expect100Continue = $false
    $request.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
    foreach ($header in $packet.headers.PSObject.Properties) {
        if ($header.Name -ieq 'content-type') { $request.ContentType = [string]$header.Value }
        elseif ($header.Name -ieq 'user-agent') { $request.UserAgent = [string]$header.Value }
        elseif ($header.Name -ieq 'accept') { $request.Accept = [string]$header.Value }
        else { $request.Headers[$header.Name] = [string]$header.Value }
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$packet.body)
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    try { $response = $request.GetResponse() }
    catch [Net.WebException] {
        if ($null -eq $_.Exception.Response) { throw }
        $response = $_.Exception.Response
    }
    $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
    try {
        $body = New-Object Text.StringBuilder
        $buffer = New-Object char[] 8192
        while (($count = $reader.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if ($body.Length + $count -gt 50MB) { throw 'RESPONSE_TOO_LARGE' }
            [void]$body.Append($buffer, 0, $count)
        }
        @{ status = [int]$response.StatusCode; body = $body.ToString() } | ConvertTo-Json -Compress
    } finally { $reader.Dispose() }
} catch {
    $errorCode = 'TRANSPORT'
    $status = 0
    $cause = $_.Exception
    while ($null -ne $cause) {
        if ($cause.Message -eq 'RESPONSE_TOO_LARGE') { $errorCode = 'TOO_LARGE' }
        if ($cause -is [Net.WebException]) {
            if ($null -ne $cause.Response) { $status = [int]$cause.Response.StatusCode }
            switch ([string]$cause.Status) {
                'Timeout' { $errorCode = 'TIMEOUT' }
                'TrustFailure' { $errorCode = 'TLS' }
                'SecureChannelFailure' { $errorCode = 'TLS' }
                'NameResolutionFailure' { $errorCode = 'DNS' }
                'ProxyNameResolutionFailure' { $errorCode = 'DNS' }
                'ConnectFailure' { $errorCode = 'CONNECT' }
            }
        }
        $cause = $cause.InnerException
    }
    if ($status -eq 407) { $errorCode = 'PROXY_AUTH' }
    if ($status -eq 403 -and $route -eq 'proxy') { $errorCode = 'PROXY_DENIED' }
    # Do not print exception text: framework errors can echo URLs or headers.
    @{ error = $errorCode; status = $status; route = $route } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $response) { $response.Dispose() }
    if ($null -ne $request) { $request.Abort() }
}
