# fleet-input.ps1 — ratón y teclado en un Windows de la flota (misión 0052, 4-sep-2026).
# Mismo CONTRATO que fleet-input.py: JSON por argumento (-Json) o por stdin; --displays.
# Usa SendInput (user32) vía Add-Type. Coordenadas normalizadas (0..1) de `display`.
param([string]$Json = "", [switch]$Displays)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class FI {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  public static void Mouse(uint flags, int data) { var i = new INPUT(); i.type = 0; i.u.mi.dwFlags = flags; i.u.mi.mouseData = (uint)data; SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))); }
  public static void Key(ushort vk, bool up) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.dwFlags = up ? 2u : 0u; SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))); }
  public static void Unicode(char c, bool up) { var i = new INPUT(); i.type = 1; i.u.ki.wScan = c; i.u.ki.dwFlags = (up ? 2u : 0u) | 4u; SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))); }
}
"@
function Displays {
  $i = 0
  [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
    $b = $_.Bounds
    [pscustomobject]@{ id=$_.DeviceName; principal=$_.Primary; x=$b.X; y=$b.Y; w=$b.Width; h=$b.Height; indice=$i; nombre=(($(if($_.Primary){"Principal"}else{"Pantalla $($i+1)"})) + " · $($b.Width)x$($b.Height)") }
    $i++
  }
}
if ($Displays -or $args -contains "--displays") { @{ok=$true; displays=@(Displays)} | ConvertTo-Json -Compress -Depth 4; exit 0 }
if (-not $Json) { $Json = [Console]::In.ReadToEnd() }
try { $a = $Json | ConvertFrom-Json } catch { @{ok=$false; error="json inválido"} | ConvertTo-Json -Compress; exit 1 }
$ds = @(Displays); $idx = [int]($a.display); if ($idx -lt 0 -or $idx -ge $ds.Count) { $idx = 0 }; $p = $ds[$idx]
$nx = [Math]::Min(1,[Math]::Max(0,[double]$a.x)); $ny = [Math]::Min(1,[Math]::Max(0,[double]$a.y))
$X = [int]($p.x + $nx*$p.w); $Y = [int]($p.y + $ny*$p.h)
# kVK (macOS) → Virtual-Key (Windows)
$KVK = @{0=0x41;1=0x53;2=0x44;3=0x46;4=0x48;5=0x47;6=0x5A;7=0x58;8=0x43;9=0x56;11=0x42;12=0x51;13=0x57;14=0x45;15=0x52;16=0x59;17=0x54;18=0x31;19=0x32;20=0x33;21=0x34;22=0x36;23=0x35;24=0xBB;25=0x39;26=0x37;27=0xBD;28=0x38;29=0x30;30=0xDD;31=0x4F;32=0x55;33=0xDB;34=0x49;35=0x50;36=0x0D;37=0x4C;38=0x4A;39=0xDE;40=0x4B;41=0xBA;42=0xDC;43=0xBC;44=0xBF;45=0x4E;46=0x4D;47=0xBE;48=0x09;49=0x20;50=0xC0;51=0x08;53=0x1B;96=0x74;97=0x75;98=0x76;99=0x72;100=0x77;101=0x78;103=0x7A;109=0x79;111=0x7B;118=0x73;120=0x71;122=0x70;115=0x24;116=0x21;117=0x2E;119=0x23;121=0x22;123=0x25;124=0x27;125=0x28;126=0x26}
$MODVK = @{cmd=0x5B; shift=0x10; alt=0x12; ctrl=0x11}
switch ([string]$a.type) {
  "move"  { [FI]::SetCursorPos($X,$Y) | Out-Null; @{ok=$true;x=$X;y=$Y} | ConvertTo-Json -Compress }
  "down"  { [FI]::SetCursorPos($X,$Y) | Out-Null; $right = ([string]$a.button -eq "right"); $n = [Math]::Max(1,[int]$a.clicks)
            for ($k=0; $k -lt $n; $k++) { [FI]::Mouse($(if($right){0x0008}else{0x0002}),0); if ($k -lt $n-1) { [FI]::Mouse($(if($right){0x0010}else{0x0004}),0); Start-Sleep -Milliseconds 60 } }
            @{ok=$true;x=$X;y=$Y;clicks=$n} | ConvertTo-Json -Compress }
  "up"    { [FI]::SetCursorPos($X,$Y) | Out-Null; [FI]::Mouse($(if([string]$a.button -eq "right"){0x0010}else{0x0004}),0); @{ok=$true;x=$X;y=$Y} | ConvertTo-Json -Compress }
  "scroll"{ [FI]::Mouse(0x0800, -[int]$a.dy); if ([int]$a.dx) { [FI]::Mouse(0x1000, [int]$a.dx) }; @{ok=$true} | ConvertTo-Json -Compress }
  "text"  { $t=[string]$a.text; foreach ($c in $t.ToCharArray()) { [FI]::Unicode($c,$false); [FI]::Unicode($c,$true); Start-Sleep -Milliseconds 4 }; @{ok=$true;n=$t.Length} | ConvertTo-Json -Compress }
  "key"   { $vk = $KVK[[int]$a.code]; if (-not $vk) { @{ok=$false;error="keycode macOS sin traducción: $($a.code)"} | ConvertTo-Json -Compress; exit 1 }
            $mods = @(); foreach ($m in @($a.mods)) { if ($MODVK[[string]$m]) { $mods += $MODVK[[string]$m] } }
            foreach ($m in $mods) { [FI]::Key([uint16]$m,$false) }; [FI]::Key([uint16]$vk,$false); [FI]::Key([uint16]$vk,$true); foreach ($m in $mods) { [FI]::Key([uint16]$m,$true) }
            @{ok=$true;code=[int]$a.code;vk=$vk} | ConvertTo-Json -Compress }
  default { @{ok=$false;error="tipo desconocido: $($a.type)"} | ConvertTo-Json -Compress; exit 1 }
}
