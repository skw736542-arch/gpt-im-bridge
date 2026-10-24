$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$stream = New-Object System.IO.MemoryStream
try {
  $synth.SelectVoice([string]$request.voice)
  $synth.Rate = 1
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $synth.SetOutputToAudioStream($stream, $format)
  $synth.Speak([string]$request.text)
  $synth.SetOutputToNull()
  [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} finally { $synth.Dispose(); $stream.Dispose() }
