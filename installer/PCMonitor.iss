; Inno Setup script. Build: iscc /DAppVersion=2.0.2 installer\PCMonitor.iss  (expects publish\PCMonitor.exe)
#ifndef AppVersion
  #define AppVersion "2.0.6"
#endif

[Setup]
AppId={{6F0B7C0E-5B8A-4F57-9C0D-2B7E6A1D4C11}
AppName=PC Monitor
AppVersion={#AppVersion}
AppPublisher=BrainAlaw
DefaultDirName={autopf}\PCMonitor
DefaultGroupName=PC Monitor
OutputDir=..\release
OutputBaseFilename=PCMonitor-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\PCMonitor.exe
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
Name: "autostart"; Description: "Start PC Monitor with Windows"; Flags: unchecked

[Files]
Source: "..\publish\PCMonitor.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\PC Monitor"; Filename: "{app}\PCMonitor.exe"
Name: "{autodesktop}\PC Monitor"; Filename: "{app}\PCMonitor.exe"; Tasks: desktopicon

[Run]
Filename: "https://pawnio.eu"; Description: "Download PawnIO for CPU and motherboard sensors"; Flags: shellexec postinstall skipifsilent unchecked; Check: PawnIOMissing
Filename: "schtasks.exe"; Parameters: "/Create /TN PCMonitor /SC ONLOGON /RL HIGHEST /TR ""\""{app}\PCMonitor.exe\"" --minimized"" /F"; Flags: runhidden; Tasks: autostart
Filename: "{app}\PCMonitor.exe"; Description: "Launch PC Monitor"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/Delete /TN PCMonitor /F"; Flags: runhidden; RunOnceId: "RemoveAutostartTask"
Filename: "taskkill.exe"; Parameters: "/F /IM PCMonitor.exe"; Flags: runhidden; RunOnceId: "KillApp"

[Code]
function PawnIOMissing: Boolean;
var
  Version: String;
begin
  Result := not RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO', 'DisplayVersion', Version);
end;

// The WebView2 Evergreen runtime ships with Windows 11 and current Edge; warn when it is missing.
function WebView2Installed: Boolean;
var
  Version: String;
begin
  Result :=
    RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) or
    RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version);
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  if PawnIOMissing and not WizardSilent then
    MsgBox('PawnIO was not detected. CPU temperatures and motherboard sensors may be unavailable until you install it from https://pawnio.eu and restart PC Monitor. The dashboard can still run with limited telemetry.', mbInformation, MB_OK);
  if not WebView2Installed then
    MsgBox('The Microsoft WebView2 Runtime was not detected. PC Monitor will fall back to your default browser until it is installed (https://developer.microsoft.com/microsoft-edge/webview2/).', mbInformation, MB_OK);
end;
