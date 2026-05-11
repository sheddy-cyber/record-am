$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$assetRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets'))

function New-HtmlColor([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

$bgColor = New-HtmlColor '#071018'
$panelColor = New-HtmlColor '#111C2B'
$accentColor = New-HtmlColor '#00D4FF'
$recordColor = New-HtmlColor '#FF375F'
$limeColor = New-HtmlColor '#B8FF3D'
$lightColor = New-HtmlColor '#F8FCFF'
$mutedColor = New-HtmlColor '#9EB2C3'

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-BrandMark {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Size
  )

  $stroke = [Math]::Max(8.0, [Math]::Round($Size * 0.055, 0))
  $radius = [Math]::Max(20.0, [Math]::Round($Size * 0.13, 0))
  $innerLeft = $X + ($Size * 0.16)
  $innerTop = $Y + ($Size * 0.16)
  $innerSize = $Size * 0.68
  $recordSize = $Size * 0.16

  $panelBrush = New-Object System.Drawing.SolidBrush($panelColor)
  $recordBrush = New-Object System.Drawing.SolidBrush($recordColor)
  $innerBrush = New-Object System.Drawing.SolidBrush((New-HtmlColor '#0B1420'))
  $accentBrush = New-Object System.Drawing.SolidBrush($accentColor)
  $lightBrush = New-Object System.Drawing.SolidBrush($lightColor)
  $framePen = New-Object System.Drawing.Pen((New-HtmlColor '#1E3A4C'), [Math]::Max(3.0, $stroke * 0.32))
  $innerPen = New-Object System.Drawing.Pen((New-HtmlColor '#164458'), [Math]::Max(2.0, $stroke * 0.18))
  $recordRingPen = New-Object System.Drawing.Pen((New-HtmlColor '#7C2A43'), [Math]::Max(3.0, $stroke * 0.42))
  $accentPen = New-Object System.Drawing.Pen($accentColor, $stroke)
  $lightPen = New-Object System.Drawing.Pen($lightColor, $stroke)
  $mutedPen = New-Object System.Drawing.Pen((New-HtmlColor '#8DA1B3'), $stroke * 0.82)
  $limePen = New-Object System.Drawing.Pen($limeColor, $stroke)

  try {
    $outerPath = New-RoundedRectPath -X $X -Y $Y -Width $Size -Height $Size -Radius $radius
    $innerPath = New-RoundedRectPath -X $innerLeft -Y $innerTop -Width $innerSize -Height $innerSize -Radius ($radius * 0.58)

    $Graphics.FillPath($panelBrush, $outerPath)
    $Graphics.DrawPath($framePen, $outerPath)
    $Graphics.FillPath($innerBrush, $innerPath)
    $Graphics.DrawPath($innerPen, $innerPath)

    $recordX = $innerLeft + ($innerSize * 0.16)
    $recordY = $innerTop + ($innerSize * 0.16)
    $Graphics.DrawEllipse($recordRingPen, $recordX - ($recordSize * 0.35), $recordY - ($recordSize * 0.35), $recordSize * 1.7, $recordSize * 1.7)
    $Graphics.FillEllipse($recordBrush, $recordX, $recordY, $recordSize, $recordSize)

    $lightPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $lightPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mutedPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mutedPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $limePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $limePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $Graphics.DrawLine($lightPen, $innerLeft + ($innerSize * 0.55), $innerTop + ($innerSize * 0.2), $innerLeft + ($innerSize * 0.84), $innerTop + ($innerSize * 0.2))
    $Graphics.DrawLine($mutedPen, $innerLeft + ($innerSize * 0.55), $innerTop + ($innerSize * 0.35), $innerLeft + ($innerSize * 0.78), $innerTop + ($innerSize * 0.35))
    $Graphics.DrawLine($accentPen, $innerLeft + ($innerSize * 0.14), $innerTop + ($innerSize * 0.66), $innerLeft + ($innerSize * 0.84), $innerTop + ($innerSize * 0.66))
    $Graphics.DrawLine($mutedPen, $innerLeft + ($innerSize * 0.14), $innerTop + ($innerSize * 0.84), $innerLeft + ($innerSize * 0.5), $innerTop + ($innerSize * 0.84))
    $checkPoints = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new($innerLeft + ($innerSize * 0.66), $innerTop + ($innerSize * 0.8)),
      [System.Drawing.PointF]::new($innerLeft + ($innerSize * 0.76), $innerTop + ($innerSize * 0.9)),
      [System.Drawing.PointF]::new($innerLeft + ($innerSize * 0.94), $innerTop + ($innerSize * 0.66))
    )
    $Graphics.DrawLines($limePen, $checkPoints)

    $outerPath.Dispose()
    $innerPath.Dispose()
  } finally {
    $panelBrush.Dispose()
    $recordBrush.Dispose()
    $innerBrush.Dispose()
    $accentBrush.Dispose()
    $lightBrush.Dispose()
    $framePen.Dispose()
    $innerPen.Dispose()
    $recordRingPen.Dispose()
    $accentPen.Dispose()
    $lightPen.Dispose()
    $mutedPen.Dispose()
    $limePen.Dispose()
  }
}

function Save-Png {
  param(
    [string]$Path,
    [int]$Width,
    [int]$Height,
    [scriptblock]$Painter
  )

  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    & $Painter $graphics $Width $Height
    $tempPath = "$Path.tmp"
    if (Test-Path $tempPath) {
      Remove-Item -LiteralPath $tempPath -Force
    }
    $bitmap.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Move-Item -LiteralPath $tempPath -Destination $Path -Force
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

Save-Png -Path (Join-Path $assetRoot 'icon.png') -Width 1024 -Height 1024 -Painter {
  param($graphics, $width, $height)
  $graphics.Clear($bgColor)
  $size = 620
  $left = ($width - $size) / 2
  $top = ($height - $size) / 2
  Draw-BrandMark -Graphics $graphics -X $left -Y $top -Size $size
}

Save-Png -Path (Join-Path $assetRoot 'adaptive-icon.png') -Width 1024 -Height 1024 -Painter {
  param($graphics, $width, $height)
  $graphics.Clear($bgColor)
  $size = 580
  $left = ($width - $size) / 2
  $top = ($height - $size) / 2
  Draw-BrandMark -Graphics $graphics -X $left -Y $top -Size $size
}

Save-Png -Path (Join-Path $assetRoot 'favicon.png') -Width 256 -Height 256 -Painter {
  param($graphics, $width, $height)
  $graphics.Clear($bgColor)
  $size = 156
  $left = ($width - $size) / 2
  $top = ($height - $size) / 2
  Draw-BrandMark -Graphics $graphics -X $left -Y $top -Size $size
}

Save-Png -Path (Join-Path $assetRoot 'splash.png') -Width 1242 -Height 2436 -Painter {
  param($graphics, $width, $height)
  $graphics.Clear($bgColor)

  $markSize = 280
  $markLeft = ($width - $markSize) / 2
  $markTop = 690
  Draw-BrandMark -Graphics $graphics -X $markLeft -Y $markTop -Size $markSize

  $titleBrush = New-Object System.Drawing.SolidBrush($lightColor)
  $subtitleBrush = New-Object System.Drawing.SolidBrush($mutedColor)
  $titleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 54, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subtitleFont = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center

  try {
    $graphics.DrawString('record am', $titleFont, $titleBrush, ($width / 2), 1020, $center)
    $graphics.DrawString('Record sales, stock, cash, and credit.', $subtitleFont, $subtitleBrush, ($width / 2), 1110, $center)
  } finally {
    $titleBrush.Dispose()
    $subtitleBrush.Dispose()
    $titleFont.Dispose()
    $subtitleFont.Dispose()
    $center.Dispose()
  }
}

Write-Host "Brand assets generated in $assetRoot"
