# Генерує PNG-іконки застосунку (192, 512, maskable 512) з того ж малюнка, що й icons/icon.svg.
# Запуск:  powershell -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'icons'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Icon([int]$size, [string]$path, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $k = $size / 512.0

  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml('#7a88ff')), ([System.Drawing.ColorTranslator]::FromHtml('#35d3ee')), 45.0
  if ($maskable) {
    $g.FillRectangle($grad, $rect)
  } else {
    $r = 120 * $k
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
    $gp.AddArc($size - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
    $gp.AddArc($size - 2 * $r, $size - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $gp.AddArc(0, $size - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($grad, $gp)
  }

  # Для maskable значок менший (безпечна зона 80%)
  $s = if ($maskable) { 0.72 } else { 1.0 }
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), (34 * $k * $s)
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  function P($x, $y) { New-Object System.Drawing.PointF ((256 + ($x - 256) * $s) * $k), ((256 + ($y - 256) * $s) * $k) }

  $g.DrawLines($pen, @((P 101 261), (P 234 139), (P 367 261)))
  $g.DrawLines($pen, @((P 144 240), (P 144 373), (P 324 373), (P 324 240)))
  $g.DrawLines($pen, @((P 208 373), (P 208 298), (P 260 298), (P 260 373)))

  # «іскра розуму» — чотирипроменева зірка
  $star = @((P 394 68), (P 402 98), (P 431 109), (P 402 118), (P 394 150), (P 386 118), (P 358 109), (P 386 98))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillPolygon($white, [System.Drawing.PointF[]]$star)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 (Join-Path $out 'icon-192.png') $false
New-Icon 512 (Join-Path $out 'icon-512.png') $false
New-Icon 512 (Join-Path $out 'icon-maskable-512.png') $true
Get-ChildItem $out | Select-Object Name, Length
