param(
  [switch]$LocalMachine
)

$ErrorActionPreference = 'Stop'
$CertPath = Join-Path $PSScriptRoot 'rootCA.cer'
if (!(Test-Path $CertPath)) { throw "ملف الشهادة غير موجود: $CertPath" }

if ($LocalMachine) {
  Import-Certificate -FilePath $CertPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
  Write-Host 'تم تثبيت Root CA في Trusted Root Certification Authorities للجهاز.' -ForegroundColor Green
} else {
  Import-Certificate -FilePath $CertPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  Write-Host 'تم تثبيت Root CA في Trusted Root Certification Authorities للمستخدم الحالي.' -ForegroundColor Green
}
