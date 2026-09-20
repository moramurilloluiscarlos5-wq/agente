#define AppVersion GetEnv("DEVICE_AGENT_VERSION")
#ifndef BuildDir
  #error BuildDir must point to the verified build staging directory.
#endif

[Setup]
AppId={{B53A0D6A-41E6-4F90-A9AC-22D4C2C2B1D0}
AppName=CarlosTech Device Agent
AppVersion={#AppVersion}
AppPublisher=CARLOSTECH AI
DefaultDirName={localappdata}\CarlosTech\DeviceAgent
DefaultGroupName=CarlosTech Device Agent
OutputDir={#BuildDir}
OutputBaseFilename=CarlosTechDeviceAgentSetup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
VersionInfoCompany=CARLOSTECH AI
VersionInfoProductName=CarlosTech Device Agent

[Tasks]
Name: "startup"; Description: "Iniciar CarlosTech Device Agent con Windows"; GroupDescription: "Opciones de inicio:"; Flags: checkedonce

[Files]
Source: "{#BuildDir}\CarlosTechDeviceAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\platform-tools\*"; DestDir: "{app}\platform-tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\.env.example"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\CarlosTech Device Agent"; Filename: "{app}\CarlosTechDeviceAgent.exe"
Name: "{userstartup}\CarlosTech Device Agent"; Filename: "{app}\CarlosTechDeviceAgent.exe"; Tasks: startup

[Run]
Filename: "{app}\CarlosTechDeviceAgent.exe"; Description: "Ejecutar CarlosTech Device Agent ahora"; Flags: nowait postinstall skipifsilent
