param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("read", "write", "delete")]
  [string]$Action,

  [Parameter(Mandatory = $true, Position = 1)]
  [string]$Target,

  [Parameter(Position = 2)]
  [string]$UserName = "default"
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = New-Object Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CredentialNative
{
    public const UInt32 CRED_TYPE_GENERIC = 1;
    public const UInt32 CRED_PERSIST_LOCAL_MACHINE = 2;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public UInt32 Flags;
        public UInt32 Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredWrite(ref CREDENTIAL userCredential, UInt32 flags);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);
}
"@

function Read-CredentialPayload {
  $credentialPtr = [IntPtr]::Zero
  $ok = [CredentialNative]::CredRead($Target, [CredentialNative]::CRED_TYPE_GENERIC, 0, [ref]$credentialPtr)
  if (-not $ok) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($errorCode -eq 1168) {
      exit 3
    }
    throw "CredRead failed: $errorCode"
  }

  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
      $credentialPtr,
      [type][CredentialNative+CREDENTIAL]
    )
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))
  } finally {
    if ($credentialPtr -ne [IntPtr]::Zero) {
      [CredentialNative]::CredFree($credentialPtr)
    }
  }
}

function Write-CredentialPayload {
  $payload = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrEmpty($payload)) {
    throw "Credential payload is empty."
  }

  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  try {
    [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)

    $credential = New-Object CredentialNative+CREDENTIAL
    $credential.Flags = 0
    $credential.Type = [CredentialNative]::CRED_TYPE_GENERIC
    $credential.TargetName = $Target
    $credential.CredentialBlobSize = $bytes.Length
    $credential.CredentialBlob = $blob
    $credential.Persist = [CredentialNative]::CRED_PERSIST_LOCAL_MACHINE
    $credential.AttributeCount = 0
    $credential.Attributes = [IntPtr]::Zero
    $credential.TargetAlias = $null
    $credential.UserName = $UserName

    $ok = [CredentialNative]::CredWrite([ref]$credential, 0)
    if (-not $ok) {
      $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      throw "CredWrite failed: $errorCode"
    }
  } finally {
    if ($blob -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::FreeHGlobal($blob)
    }
  }
}

function Delete-CredentialPayload {
  $ok = [CredentialNative]::CredDelete($Target, [CredentialNative]::CRED_TYPE_GENERIC, 0)
  if (-not $ok) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($errorCode -eq 1168) {
      exit 3
    }
    throw "CredDelete failed: $errorCode"
  }
}

if ($Action -eq "read") {
  Read-CredentialPayload
} elseif ($Action -eq "write") {
  Write-CredentialPayload
} elseif ($Action -eq "delete") {
  Delete-CredentialPayload
}
